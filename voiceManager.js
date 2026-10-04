const { ChannelType, Events } = require('discord.js');
const storage = require('./storage');
const { randomEmoji } = require('./emojiPalette');
const { syncNickname, stripEmojiPrefixes, getLeadingEmoji } = require('./nickname');
const { buildPanelEmbed, buildPanelComponents, buildPanelAttachments } = require('./panelView');
const { refreshDashboard } = require('./dashboard');
const { bold } = require('./textStyle');

const pendingDeletions = new Set(); // channelIds with a delete check already queued
const creatingFor = new Set(); // member ids whose temp channel is being created right now

// Fixed (non-temp) voice channels that should still sync their emoji onto
// anyone sitting in them, same as temp channels do.
const STATIC_EMOJI_SYNC_CHANNEL_IDS = new Set([
  '1517940974125318166',
  '1517941337700176003',
  '1543001094781665370',
  '1513904253423587451',
  '1519068432316760286',
  '1543346189276160241',
]);

// The emoji a static channel's own name starts with (renaming the channel
// changes what gets applied). Understands multi-part emoji like 🐈‍⬛.
function getChannelLeadingEmoji(channel) {
  return getLeadingEmoji(channel?.name);
}

// ---------------------------------------------------------------------------
// Emoji sync — ONE source of truth.
//
// Instead of reacting to individual events ("joined X -> add", "left Y ->
// remove") in whatever order they happen to arrive, the emoji a member should
// wear is always worked out from the channel they are in RIGHT NOW:
//   in a temp channel      -> that channel's emoji
//   in a static sync chan  -> that channel's leading emoji
//   anywhere else          -> none
// Whatever order events land in, the last sync always converges on the right
// nickname, so there are no missing or doubled emoji.
// ---------------------------------------------------------------------------

function isSyncedChannelId(channelId) {
  return !!channelId && (STATIC_EMOJI_SYNC_CHANNEL_IDS.has(channelId) || !!storage.getTempChannel(channelId));
}

// string = wear this emoji, null = not a synced channel (no emoji wanted),
// undefined = synced channel but no emoji known (leave the nickname alone).
function desiredEmojiForChannel(channel) {
  if (!channel) return null;
  const temp = storage.getTempChannel(channel.id);
  if (temp) return temp.emoji || undefined;
  if (STATIC_EMOJI_SYNC_CHANNEL_IDS.has(channel.id)) return getChannelLeadingEmoji(channel) || null;
  return null;
}

// allowRemove=false: only ever ADD/fix an emoji, never strip one (used by the
// nickname guard and the startup pass so a random person's own emoji is safe).
function syncMemberEmoji(guild, memberId, { allowRemove = true } = {}) {
  return syncNickname(guild, memberId, () => {
    const channel = guild.voiceStates.cache.get(memberId)?.channel ?? null;
    const wanted = desiredEmojiForChannel(channel);
    console.log(`[emoji] ${memberId} in "${channel?.name ?? 'no voice channel'}" -> ${wanted === null ? 'remove emoji' : wanted === undefined ? 'leave alone' : wanted}`);
    if (wanted === null) return allowRemove ? null : undefined;
    return wanted;
  }).catch((err) => {
    console.warn(`[nickname] sync failed for ${memberId}: ${err.message}`);
    return false;
  });
}

// Re-syncs everyone currently in a channel (used when a channel's emoji changes).
async function syncChannelMembers(channel) {
  await Promise.all(
    [...channel.members.keys()].map((id) => syncMemberEmoji(channel.guild, id, { allowRemove: false }))
  );
}

// Fixes people who joined while the bot was offline/redeploying.
async function syncAllVoiceMembers(client) {
  for (const guild of client.guilds.cache.values()) {
    const ids = [];
    for (const [userId, vs] of guild.voiceStates.cache) {
      if (vs.channelId && isSyncedChannelId(vs.channelId)) ids.push(userId);
    }
    await Promise.all(ids.map((id) => syncMemberEmoji(guild, id, { allowRemove: false })));
  }
}

// Gives the emoji back when someone removes or edits it while sitting in a
// synced channel. Debounced, and idempotent: the bot's own rename fires this
// event too, but by then the nickname is already correct so nothing is sent.
let nicknameGuardRegistered = false;
const guardTimers = new Map();
function registerNicknameGuard(client) {
  if (nicknameGuardRegistered) return;
  nicknameGuardRegistered = true;
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (oldMember.nickname === newMember.nickname) return; // not a nickname change
    if (!isSyncedChannelId(newMember.voice?.channelId)) return;
    const key = `${newMember.guild.id}:${newMember.id}`;
    clearTimeout(guardTimers.get(key));
    guardTimers.set(
      key,
      setTimeout(() => {
        guardTimers.delete(key);
        syncMemberEmoji(newMember.guild, newMember.id, { allowRemove: false });
      }, 1500)
    );
  });
}

// True once no real person is left in the channel — bots (music bots,
// etc.) don't count.
function hasNoHumans(channel) {
  return !channel.members.some((m) => !m.user.bot);
}

// Keeps generated channel names inside Discord's rules (no repeated / outer
// whitespace, 100-character cap).
function sanitizeChannelName(name) {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

// Extra permissions the channel owner gets on their own channel.
const OWNER_CHANNEL_PERMISSIONS = {
  Connect: true,
};

async function updateOwnerPermissions(channel, oldOwnerId, newOwnerId) {
  try {
    if (oldOwnerId && oldOwnerId !== newOwnerId) {
      await channel.permissionOverwrites.delete(oldOwnerId).catch(() => {});
    }
    if (newOwnerId) {
      await channel.permissionOverwrites.edit(newOwnerId, OWNER_CHANNEL_PERMISSIONS);
    }
  } catch (err) {
    console.warn(`[permissions] could not update owner overwrite: ${err.message}`);
  }
}

// Saves the channel's current name/limit/locked/trusted state under its
// owner, so the next channel that owner creates can start off the same way.
function snapshotOwnerSettings(tempData) {
  if (!tempData || !tempData.ownerId) return;
  storage.setUserSettings(tempData.ownerId, {
    customName: tempData.customName || null,
    limit: tempData.limit || 0,
    locked: !!tempData.locked,
    trusted: tempData.trusted || [],
    cleanupIntervalMinutes:
      typeof tempData.cleanupIntervalMinutes === 'number' ? tempData.cleanupIntervalMinutes : 10,
  });
}

// The one place a temp channel actually gets deleted.
async function destroyTempChannel(guild, channel, channelId, tempData) {
  snapshotOwnerSettings(tempData);
  storage.deleteTempChannel(channelId);
  if (channel) {
    await channel.delete().catch(() => {});
  }
  await refreshDashboard(guild).catch(() => {});
}

// Re-renders the panel embed/buttons in place after a setting changes.
async function refreshPanelMessage(channel, tempData) {
  if (!tempData || !tempData.panelMessageId) return;
  try {
    const ownerMember = await channel.guild.members.fetch(tempData.ownerId).catch(() => null);

    // Only treat the panel as gone when Discord says "Unknown Message"
    // (10008). Any other error (rate limit, network blip) used to make the
    // bot think the panel was deleted and post a DUPLICATE panel.
    let message = null;
    let panelGone = false;
    try {
      message = await channel.messages.fetch(tempData.panelMessageId);
    } catch (err) {
      if (err.code === 10008) {
        panelGone = true;
      } else {
        console.warn(`[tempvc] could not fetch panel message in ${channel.name}: ${err.message}`);
        return;
      }
    }

    if (panelGone) {
      console.warn(`[tempvc] panel message missing in ${channel.name} — reposting a new one`);
      try {
        const fresh = await channel.send({
          embeds: [buildPanelEmbed(ownerMember, tempData)],
          components: buildPanelComponents(!!ownerMember, !!tempData.locked),
          files: buildPanelAttachments(),
        });
        tempData.panelMessageId = fresh.id;
        storage.setTempChannel(channel.id, tempData);
      } catch (err) {
        console.warn(`[tempvc] could not repost missing panel in ${channel.name}: ${err.message}`);
      }
      return;
    }

    await message.edit({
      embeds: [buildPanelEmbed(ownerMember, tempData)],
      components: buildPanelComponents(!!ownerMember, !!tempData.locked),
      files: buildPanelAttachments(),
    });
  } catch (err) {
    console.warn(`[tempvc] could not refresh panel message: ${err.message}`);
  }
}

// Wrapper so one person can never create two channels at once (e.g. by
// bouncing in and out of the join-to-create channel).
async function createTempChannel(member, guild, config) {
  if (creatingFor.has(member.id)) return;
  creatingFor.add(member.id);
  try {
    await createTempChannelInner(member, guild, config);
  } finally {
    creatingFor.delete(member.id);
  }
}

async function createTempChannelInner(member, guild, config) {
  const emoji = storage.getUserEmoji(member.id) || randomEmoji();
  const saved = storage.getUserSettings(member.id);
  // Strip any stuck emoji prefix so it can't leak into the channel name.
  const cleanDisplayName = stripEmojiPrefixes(member.displayName);
  const baseName = (saved && saved.customName) || bold(`${cleanDisplayName}'s Channel`);
  const channelName = sanitizeChannelName(`${emoji} ${baseName}`);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: config.categoryId || null,
      userLimit: (saved && saved.limit) || 0,
    });
  } catch (err) {
    console.warn(`[tempvc] rejected name "${channelName}" (${err.message}) — retrying with a plain fallback name`);
    try {
      channel = await guild.channels.create({
        name: `${emoji} ${bold('Channel')}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: config.categoryId || null,
        userLimit: (saved && saved.limit) || 0,
      });
    } catch (err2) {
      console.error(`[tempvc] could not create a temp channel for ${member.user.tag} even with a fallback name: ${err2.message}`);
      return;
    }
  }

  const tempDataRecord = {
    guildId: guild.id,
    ownerId: member.id,
    emoji,
    customName: (saved && saved.customName) || null,
    limit: (saved && saved.limit) || 0,
    locked: !!(saved && saved.locked),
    trusted: (saved && saved.trusted) || [],
    cleanupIntervalMinutes:
      saved && typeof saved.cleanupIntervalMinutes === 'number' ? saved.cleanupIntervalMinutes : 10,
    lastPurgeAt: Date.now(),
    createdAt: Date.now(),
  };
  storage.setTempChannel(channel.id, tempDataRecord);

  // Move the member in RIGHT AWAY; the rest of the setup happens after.
  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    console.warn(`[tempvc] could not move ${member.user.tag} into their new channel: ${err.message}`);
    await channel.delete().catch(() => {});
    storage.deleteTempChannel(channel.id);
    return;
  }

  await updateOwnerPermissions(channel, null, member.id);

  const setupTasks = [];
  if (saved && saved.locked) {
    setupTasks.push(
      channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {})
    );
  }
  if (saved && saved.trusted && saved.trusted.length) {
    setupTasks.push(
      ...saved.trusted.map((userId) =>
        channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {})
      )
    );
  }
  if (setupTasks.length) await Promise.all(setupTasks);

  try {
    const panelMessage = await channel.send({
      embeds: [buildPanelEmbed(member, tempDataRecord)],
      components: buildPanelComponents(true, tempDataRecord.locked),
      files: buildPanelAttachments(),
    });
    tempDataRecord.panelMessageId = panelMessage.id;
    storage.setTempChannel(channel.id, tempDataRecord);
  } catch (err) {
    console.warn(`[tempvc] could not post the panel in ${channel.name}: ${err.message}`);
  }

  await refreshDashboard(guild).catch(() => {});
}

// Checks (and deletes) an empty channel as soon as the current event-loop
// tick clears, so an in-flight voice update gets applied first.
function scheduleEmptyCheck(channelId, guild) {
  if (pendingDeletions.has(channelId)) return;
  pendingDeletions.add(channelId);
  setImmediate(async () => {
    pendingDeletions.delete(channelId);
    const tempData = storage.getTempChannel(channelId);
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      snapshotOwnerSettings(tempData);
      storage.deleteTempChannel(channelId);
      await refreshDashboard(guild).catch(() => {});
      return;
    }
    if (hasNoHumans(channel)) {
      await destroyTempChannel(guild, channel, channelId, tempData);
    }
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!member) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return; // mute/deafen/stream changes etc.

  // Work out, before any await, whether this move involves a channel whose
  // emoji we manage. A channel that no longer exists (just deleted) counts —
  // that's how a bot left behind in a deleted temp channel gets cleaned up.
  const oldTempData = oldChannelId ? storage.getTempChannel(oldChannelId) : null;
  const oldWasSynced =
    !!oldTempData ||
    (!!oldChannelId && (STATIC_EMOJI_SYNC_CHANNEL_IDS.has(oldChannelId) || !guild.channels.cache.has(oldChannelId)));

  const config = storage.getGuildConfig(guild.id);
  const isCreateTrigger = !!config && newChannelId === config.joinToCreateId && !member.user.bot;

  // Start the empty-channel check first so deleting the channel never waits
  // on a nickname API call.
  if (oldTempData) scheduleEmptyCheck(oldChannelId, guild);

  if (isCreateTrigger) {
    await createTempChannel(member, guild, config);
    // If creation succeeded this is a no-op (the move into the new channel
    // has its own event); if it failed, this removes the old channel's emoji.
    if (oldWasSynced) await syncMemberEmoji(guild, member.id);
    return;
  }

  if (oldWasSynced || isSyncedChannelId(newChannelId)) {
    await syncMemberEmoji(guild, member.id);
  }
}

// Deletes any tracked channel that's empty right now.
async function sweepEmptyChannels(client) {
  const all = storage.getAllTempChannels();
  for (const channelId of Object.keys(all)) {
    const data = all[channelId];
    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      snapshotOwnerSettings(data);
      storage.deleteTempChannel(channelId);
      await refreshDashboard(guild).catch(() => {});
      continue;
    }
    // A channel created seconds ago may not have its owner inside yet.
    if (Date.now() - (data.createdAt || 0) < 30_000) continue;
    if (hasNoHumans(channel)) {
      await destroyTempChannel(guild, channel, channelId, data);
    }
  }
}

async function reconcileOnStartup(client) {
  await sweepEmptyChannels(client);
  registerNicknameGuard(client);
  await syncAllVoiceMembers(client).catch((err) => console.warn(`[nickname] startup sync failed: ${err.message}`));
  startPeriodicCleanup(client);
}

// Wipes every message in a temp channel's text chat except the panel itself.
async function purgeChannelMessages(channel, tempData) {
  if (!tempData || !tempData.panelMessageId) {
    console.warn(`[cleanup] skipping ${channel.name} — no known panel message id`);
    return;
  }
  try {
    let totalDeleted = 0;
    while (true) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter((m) => m.id !== tempData.panelMessageId);
      if (toDelete.size === 0) break;

      if (toDelete.size === 1) {
        await toDelete.first().delete().catch(() => {});
        totalDeleted += 1;
      } else {
        const deleted = await channel.bulkDelete(toDelete, true).catch((err) => {
          console.warn(`[cleanup] bulkDelete failed in ${channel.name}: ${err.message}`);
          return null;
        });
        if (!deleted) break;
        totalDeleted += deleted.size;
        if (deleted.size === 0) break;
      }

      if (messages.size < 100) break;
    }
    if (totalDeleted > 0) {
      console.log(`[cleanup] deleted ${totalDeleted} message(s) in ${channel.name}`);
    }
  } catch (err) {
    console.warn(`[cleanup] could not purge messages in ${channel.name}: ${err.message}`);
  }
}

async function purgeAllTempChannels(client) {
  const all = storage.getAllTempChannels();
  const now = Date.now();
  for (const channelId of Object.keys(all)) {
    const data = all[channelId];
    const intervalMinutes = data.cleanupIntervalMinutes;
    if (!intervalMinutes) continue;

    const dueAt = (data.lastPurgeAt || data.createdAt || 0) + intervalMinutes * 60 * 1000;
    if (now < dueAt) continue;

    const guild = client.guilds.cache.get(data.guildId);
    if (!guild) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) continue;

    await purgeChannelMessages(channel, data);
    data.lastPurgeAt = now;
    storage.setTempChannel(channelId, data);
    await refreshPanelMessage(channel, data);
  }
}

const CLEANUP_CHECK_INTERVAL_MS = 60 * 1000;
let cleanupIntervalStarted = false;

function startPeriodicCleanup(client) {
  if (cleanupIntervalStarted) return;
  cleanupIntervalStarted = true;
  setInterval(() => {
    purgeAllTempChannels(client).catch((err) => console.warn(`[cleanup] sweep failed: ${err.message}`));
  }, CLEANUP_CHECK_INTERVAL_MS);
  console.log('[cleanup] Periodic message cleanup started — checking every minute against each channel\'s own timer.');
}

module.exports = {
  handleVoiceStateUpdate,
  sweepEmptyChannels,
  reconcileOnStartup,
  updateOwnerPermissions,
  destroyTempChannel,
  refreshPanelMessage,
  snapshotOwnerSettings,
  syncMemberEmoji,
  syncChannelMembers,
};
  syncChannelMembers,
};

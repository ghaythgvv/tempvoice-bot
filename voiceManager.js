const { ChannelType } = require('discord.js');
const storage = require('./storage');
const { randomEmoji } = require('./emojiPalette');
const { applyEmojiToMember, removeEmojiFromMember, stripEmojiPrefixes } = require('./nickname');
const { buildPanelEmbed, buildPanelComponents, buildPanelAttachments } = require('./panelView');
const { refreshDashboard } = require('./dashboard');

const pendingDeletions = new Set(); // channelIds with a delete check already queued

// Fixed (non-temp) voice channels that should still sync their emoji onto
// anyone sitting in them, same as temp channels do — just for these two
// specific static channels rather than every generated temp channel.
const STATIC_EMOJI_SYNC_CHANNEL_IDS = new Set([
  '1517940974125318166',
  '1517941337700176003',
  '1543001094781665370',
  '1513904253423587451',
  '1519068432316760286',
  '1543346189276160241',
]);

// Grabs whatever emoji the channel's own name starts with, so renaming the
// channel automatically changes what gets applied — no separate config to
// keep in sync. No trailing-space requirement here (channel names often
// don't have one), unlike the nickname-prefix matcher in nickname.js.
const LEADING_EMOJI_RE = /^\p{Extended_Pictographic}\uFE0F?/u;
function getChannelLeadingEmoji(channel) {
  const match = channel?.name?.match(LEADING_EMOJI_RE);
  return match ? match[0] : null;
}

// Discord's channel-name validation rejects a few things that easily slip
// into a name built from someone's raw display name: repeated whitespace,
// leading/trailing whitespace, and it enforces a 100-character cap. This
// keeps the generated name inside those rules instead of finding out via a
// failed API call.
function sanitizeChannelName(name) {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

// Extra permissions the channel owner gets on their own channel, on top of
// whatever the panel buttons already let them do — mainly so they can also
// use Discord's own right-click menu to move/mute/deafen people in it, and
// so locking the channel can never lock the owner out of their own channel.
const OWNER_CHANNEL_PERMISSIONS = {
  ManageChannels: true,
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
// Called right before a temp channel is torn down, wherever that happens.
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

// The one place a temp channel actually gets deleted — snapshots the
// owner's settings first, then clears the live record, then removes the
// Discord channel itself.
async function destroyTempChannel(guild, channel, channelId, tempData) {
  snapshotOwnerSettings(tempData);
  storage.deleteTempChannel(channelId);
  if (channel) {
    await channel.delete().catch(() => {});
  }
  await refreshDashboard(guild).catch(() => {});
}

// Re-renders the panel embed/buttons in place after a setting changes
// (lock state, limit, emoji, owner, etc.) so the status lines shown to the
// owner never go stale. Safe to call even if the panel message was somehow
// deleted — it just quietly does nothing.
async function refreshPanelMessage(channel, tempData) {
  if (!tempData || !tempData.panelMessageId) return;
  try {
    const ownerMember = await channel.guild.members.fetch(tempData.ownerId).catch(() => null);
    let message = await channel.messages.fetch(tempData.panelMessageId).catch(() => null);
    if (!message) {
      // Self-healing: the panel message is gone (deleted by accident, wiped
      // by a bug, whatever) — repost a fresh one instead of leaving the
      // channel without any controls at all.
      console.warn(`[tempvc] panel message missing in ${channel.name} — reposting a new one`);
      try {
        message = await channel.send({
          embeds: [buildPanelEmbed(ownerMember, tempData)],
          components: buildPanelComponents(),
          files: buildPanelAttachments(),
        });
        tempData.panelMessageId = message.id;
        storage.setTempChannel(channel.id, tempData);
      } catch (err) {
        console.warn(`[tempvc] could not repost missing panel in ${channel.name}: ${err.message}`);
      }
      return;
    }
    await message.edit({
      embeds: [buildPanelEmbed(ownerMember, tempData)],
      components: buildPanelComponents(),
      files: buildPanelAttachments(),
    });
  } catch (err) {
    console.warn(`[tempvc] could not refresh panel message: ${err.message}`);
  }
}

async function createTempChannel(member, guild, config) {
  const emoji = storage.getUserEmoji(member.id) || randomEmoji();
  const saved = storage.getUserSettings(member.id);
  // member.displayName can still have a stuck emoji prefix on it if an
  // earlier nickname edit failed (e.g. the bot's role sits below this
  // member's role, so Discord silently rejected the rename). Stripping it
  // here too — not just in nickname.js — is what stops that leftover emoji
  // from also leaking into the new channel's name and showing up doubled.
  const cleanDisplayName = stripEmojiPrefixes(member.displayName);
  const baseName = (saved && saved.customName) || `${cleanDisplayName}'s Channel`;
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
        name: `${emoji} Channel`.slice(0, 100),
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
    // Defaults to 10 minutes unless the owner has changed it before and it
    // got carried over via their saved profile.
    cleanupIntervalMinutes:
      saved && typeof saved.cleanupIntervalMinutes === 'number' ? saved.cleanupIntervalMinutes : 10,
    lastPurgeAt: Date.now(),
    createdAt: Date.now(),
  };
  storage.setTempChannel(channel.id, tempDataRecord);

  await updateOwnerPermissions(channel, null, member.id);

  // Restore the locked state and re-grant anyone who was trusted before —
  // do this before anyone (including the owner) actually joins.
  if (saved && saved.locked) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
  }
  if (saved && saved.trusted && saved.trusted.length) {
    // Grant every trusted user's permission at once instead of waiting on
    // each one sequentially — meaningfully faster for anyone with a long
    // trusted list, with no downside since they don't depend on each other.
    await Promise.all(
      saved.trusted.map((userId) =>
        channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {})
      )
    );
  }

  // Post the control panel right in this channel's own chat, so it's there
  // the moment anyone opens it — no need to go find a shared panel channel.
  // The message id gets saved so later setting changes (lock, limit, emoji,
  // transfer) can refresh this same message's status lines in place.
  try {
    const panelMessage = await channel.send({
      embeds: [buildPanelEmbed(member, tempDataRecord)],
      components: buildPanelComponents(),
      files: buildPanelAttachments(),
    });
    tempDataRecord.panelMessageId = panelMessage.id;
    storage.setTempChannel(channel.id, tempDataRecord);
  } catch (err) {
    console.warn(`[tempvc] could not post the panel in ${channel.name}: ${err.message}`);
  }

  try {
    await member.voice.setChannel(channel);
  } catch (err) {
    console.warn(`[tempvc] could not move ${member.user.tag} into their new channel: ${err.message}`);
    await channel.delete().catch(() => {});
    storage.deleteTempChannel(channel.id);
  }

  await refreshDashboard(guild).catch(() => {});
}

async function onJoinTracked(member, tempData) {
  await applyEmojiToMember(member, tempData.emoji);
}

async function onLeaveTracked(member, channelId, guild) {
  await removeEmojiFromMember(member);
  scheduleEmptyCheck(channelId, guild);
}

// Checks (and deletes) an empty channel as soon as the current event-loop
// tick clears, instead of waiting on a fixed timer. That still lets any
// voice state update that's already in flight (e.g. someone else moving
// into this same channel right as the last person leaves) get applied
// first, so an about-to-be-occupied channel doesn't get deleted out from
// under them — it just doesn't add unnecessary extra delay on top of that.
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
    if (channel.members.size === 0) {
      await destroyTempChannel(guild, channel, channelId, tempData);
    }
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const joinedStaticChannel = newChannelId && STATIC_EMOJI_SYNC_CHANNEL_IDS.has(newChannelId);
  const leftStaticChannel = oldChannelId && STATIC_EMOJI_SYNC_CHANNEL_IDS.has(oldChannelId);

  const config = storage.getGuildConfig(guild.id);
  const oldTempData = oldChannelId ? storage.getTempChannel(oldChannelId) : null;

  // Always resolve any "leaving" cleanup FIRST — whether that's a temp
  // channel's own emoji tracking or a static synced channel — before
  // applying whatever emoji the destination calls for. Doing this in the
  // opposite order let a temp channel's leave-cleanup strip an emoji that
  // had just been applied a moment earlier by joining a static channel.
  if (oldTempData) {
    await onLeaveTracked(member, oldChannelId, guild);
  } else if (leftStaticChannel && !joinedStaticChannel) {
    await removeEmojiFromMember(member);
  }

  if (joinedStaticChannel) {
    const channel = guild.channels.cache.get(newChannelId);
    const emoji = getChannelLeadingEmoji(channel);
    if (emoji) await applyEmojiToMember(member, emoji);
  }

  if (!config) return;

  if (newChannelId === config.joinToCreateId) {
    await createTempChannel(member, guild, config);
    return;
  }

  if (newChannelId) {
    const newTempData = storage.getTempChannel(newChannelId);
    if (newTempData) {
      await onJoinTracked(member, newTempData);
    }
  }
}

// Deletes any tracked channel that's empty right now. Used on a timer and at
// startup so the bot cleans up properly even after a restart or brief outage.
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
    if (channel.members.size === 0) {
      await destroyTempChannel(guild, channel, channelId, data);
    }
  }
}

async function reconcileOnStartup(client) {
  await sweepEmptyChannels(client);
  startPeriodicCleanup(client);
}

// Wipes every message in a temp channel's text chat except the panel itself,
// so the chat doesn't fill up with clutter over time.
async function purgeChannelMessages(channel, tempData) {
  // Without a known panel message id, we can't safely tell the panel apart
  // from anything else — skip this channel rather than risk deleting it.
  // This only affects channels created before panelMessageId existed; any
  // channel created from now on will always have one.
  if (!tempData || !tempData.panelMessageId) {
    console.warn(`[cleanup] skipping ${channel.name} — no known panel message id`);
    return;
  }
  try {
    // fetch({ limit: 100 }) only ever returns one page — a channel with more
    // than 100 messages needs repeated passes to actually get emptied out.
    // Loop until a fetch comes back with nothing left to delete.
    let totalDeleted = 0;
    while (true) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter((m) => m.id !== tempData.panelMessageId);
      if (toDelete.size === 0) break;

      if (toDelete.size === 1) {
        await toDelete.first().delete().catch(() => {});
        totalDeleted += 1;
      } else {
        // Discord's bulk delete refuses messages older than 14 days; passing
        // `true` here tells discord.js to silently skip those instead of
        // throwing and aborting the whole batch.
        const deleted = await channel.bulkDelete(toDelete, true).catch((err) => {
          console.warn(`[cleanup] bulkDelete failed in ${channel.name}: ${err.message}`);
          return null;
        });
        if (!deleted) break; // avoid looping forever on a repeated failure
        totalDeleted += deleted.size;
        // bulkDelete silently skips messages older than 14 days rather than
        // deleting them — if none of this batch was actually removable,
        // stop instead of re-fetching the same stuck messages forever.
        if (deleted.size === 0) break;
      }

      // If this fetch returned fewer than the full page, there's nothing
      // more to page through.
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
    // 0 (or missing, for very old records) means auto-delete is off for
    // this channel — skip it entirely rather than defaulting it on.
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
    await refreshPanelMessage(channel, data); // updates the countdown to the next run
  }
}

// Checked every minute rather than run on a single fixed timer, so each
// channel's own interval (5 min, 30 min, 1 hour, etc.) is respected
// independently instead of everyone sharing one global schedule.
const CLEANUP_CHECK_INTERVAL_MS = 60 * 1000;
let cleanupIntervalStarted = false;

function startPeriodicCleanup(client) {
  if (cleanupIntervalStarted) return; // guard against double-registration on reconnect
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
};

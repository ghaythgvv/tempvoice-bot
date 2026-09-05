const { ChannelType } = require('discord.js');
const storage = require('./storage');
const { randomEmoji } = require('./emojiPalette');
const { applyEmojiToMember, removeEmojiFromMember } = require('./nickname');
const { buildPanelEmbed, buildPanelComponents } = require('./panelView');
const { refreshDashboard } = require('./dashboard');

const pendingDeletions = new Set(); // channelIds with a delete check already queued

// Extra permissions the channel owner gets on their own channel, on top of
// whatever the panel buttons already let them do — mainly so they can also
// use Discord's own right-click menu to move/mute/deafen people in it, and
// so locking the channel can never lock the owner out of their own channel.
const OWNER_CHANNEL_PERMISSIONS = {
  ManageChannels: true,
  MoveMembers: true,
  MuteMembers: true,
  DeafenMembers: true,
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

async function createTempChannel(member, guild, config) {
  const emoji = storage.getUserEmoji(member.id) || randomEmoji();
  const saved = storage.getUserSettings(member.id);
  const baseName = (saved && saved.customName) || `${member.user.username}'s Channel`;
  const channelName = `${emoji} ${baseName}`.slice(0, 100);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildVoice,
    parent: config.categoryId || null,
    userLimit: (saved && saved.limit) || 0,
  });

  storage.setTempChannel(channel.id, {
    guildId: guild.id,
    ownerId: member.id,
    emoji,
    customName: (saved && saved.customName) || null,
    limit: (saved && saved.limit) || 0,
    locked: !!(saved && saved.locked),
    trusted: (saved && saved.trusted) || [],
    createdAt: Date.now(),
  });

  await updateOwnerPermissions(channel, null, member.id);

  // Restore the locked state and re-grant anyone who was trusted before —
  // do this before anyone (including the owner) actually joins.
  if (saved && saved.locked) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { Connect: false }).catch(() => {});
  }
  if (saved && saved.trusted && saved.trusted.length) {
    for (const userId of saved.trusted) {
      await channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {});
    }
  }

  // Post the control panel right in this channel's own chat, so it's there
  // the moment anyone opens it — no need to go find a shared panel channel.
  try {
    await channel.send({ embeds: [buildPanelEmbed()], components: buildPanelComponents() });
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
  const config = storage.getGuildConfig(guild.id);
  if (!config) return;

  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  // Leave is handled BEFORE join on purpose: moving directly from one temp
  // channel to another fires a single event with both an old and a new
  // channel, and stripping the old emoji first is what stops the new one
  // from getting stacked on top of it.
  if (oldChannelId) {
    const oldTempData = storage.getTempChannel(oldChannelId);
    if (oldTempData) {
      await onLeaveTracked(member, oldChannelId, guild);
    }
  }

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
}

module.exports = {
  handleVoiceStateUpdate,
  sweepEmptyChannels,
  reconcileOnStartup,
  updateOwnerPermissions,
  destroyTempChannel,
};

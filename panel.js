const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const storage = require('./storage');
const { EMOJI_PALETTE } = require('./emojiPalette');
const { CLEANUP_INTERVAL_OPTIONS } = require('./panelView');
const { iconForText } = require('./customIcons');
const { bold } = require('./textStyle');
const { stripEmojiPrefixes } = require('./nickname');
const {
  updateOwnerPermissions,
  destroyTempChannel,
  refreshPanelMessage,
  snapshotOwnerSettings,
  syncChannelMembers,
} = require('./voiceManager');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

// One short line per setting instead of a single generic "Saved!" reused
// everywhere — the owner sees exactly what carries over next time.
function savedReply(summary) {
  return `${iconForText('check', '✅')} ${bold('Saved')} — ${summary}, ${bold("and it'll carry over next time your channel gets recreated.")}`;
}

// Looks up the temp channel the invoking member is currently sitting in, if any.
function getOwnedTempChannel(interaction) {
  const member = interaction.member;
  const voiceChannelId = member.voice?.channelId;
  if (!voiceChannelId) return { error: bold("You need to be in a temp voice channel to do that.") };
  const tempData = storage.getTempChannel(voiceChannelId);
  if (!tempData) return { error: bold("That voice channel isn't a temp channel.") };
  return { voiceChannelId, tempData, channel: member.voice.channel };
}

function requireOwner(interaction, tempData) {
  if (tempData.ownerId !== interaction.user.id) {
    return bold('Only the channel owner can do that.');
  }
  return null;
}

// True once the recorded owner is no longer sitting in the channel.
function isOwnerless(channel, tempData) {
  return !channel.members.has(tempData.ownerId);
}

// Builds a select menu listing everyone currently in the channel except the owner.
function buildMemberSelect(customId, placeholder, channel, excludeId) {
  const others = channel.members.filter((m) => m.id !== excludeId && !m.user.bot);
  if (others.size === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(bold(placeholder))
    .addOptions(others.map((m) => ({ label: m.displayName, value: m.id })).slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

async function handlePanelInteraction(interaction) {
  try {
    await routeInteraction(interaction);
  } catch (err) {
    console.error(`[panel] unhandled error on ${interaction.customId}: ${err.stack || err.message}`);
    const payload = { content: `⚠️ ${bold('Something went wrong handling that — please try again.')}`, components: [], ...EPHEMERAL };
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    } catch {
      // Nothing more we can do — the interaction token likely expired.
    }
  }
}

async function routeInteraction(interaction) {
  if (interaction.isButton()) {
    const [, action] = interaction.customId.split(':');
    if (action === 'lock') return handleLock(interaction);
    if (action === 'rename') return handleRenameOpen(interaction);
    if (action === 'limit') return handleLimitOpen(interaction);
    if (action === 'emoji') return handleEmojiOpen(interaction);
    if (action === 'kick') return handleKickOpen(interaction);
    if (action === 'trust') return handleTrustOpen(interaction);
    if (action === 'untrust') return handleUntrustOpen(interaction);
    if (action === 'transfer') return handleTransferOpen(interaction);
    if (action === 'claim') return handleClaim(interaction);
    if (action === 'timer') return handleTimerOpen(interaction);
    if (action === 'delete') return handleDelete(interaction);
    if (action === 'delete-confirm') return handleDeleteConfirm(interaction);
    if (action === 'delete-cancel') return handleDeleteCancel(interaction);
    return;
  }
  if (interaction.isUserSelectMenu() && interaction.customId === 'tempvc:trust-select') {
    return handleTrustSelect(interaction);
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('tempvc:emoji-select')) return handleEmojiChange(interaction);
    if (interaction.customId === 'tempvc:kick-select') return handleKickSelect(interaction);
    if (interaction.customId === 'tempvc:untrust-select') return handleUntrustSelect(interaction);
    if (interaction.customId === 'tempvc:transfer-select') return handleTransferSelect(interaction);
    if (interaction.customId === 'tempvc:timer-select') return handleTimerSelect(interaction);
    return;
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'tempvc:rename-modal') return handleRenameSubmit(interaction);
    if (interaction.customId === 'tempvc:limit-modal') return handleLimitSubmit(interaction);
  }
}

async function handleLock(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const everyone = channel.guild.roles.everyone;
  const current = channel.permissionOverwrites.cache.get(everyone.id);
  const isLocked = current?.deny.has(PermissionFlagsBits.Connect) ?? false;
  await channel.permissionOverwrites.edit(everyone, { Connect: isLocked ? null : false });
  tempData.locked = !isLocked;
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);
  await refreshPanelMessage(channel, tempData);
  const summary = tempData.locked
    ? `${iconForText('lock', '🔒')} ${bold('channel locked')}`
    : `${iconForText('unlock', '🔓')} ${bold('channel unlocked')}`;
  await interaction.reply({ content: savedReply(summary), ...EPHEMERAL });
}

async function handleRenameOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const modal = new ModalBuilder().setCustomId('tempvc:rename-modal').setTitle(bold('Rename channel'));
  const input = new TextInputBuilder()
    .setCustomId('name')
    .setLabel(bold('New channel name'))
    .setStyle(TextInputStyle.Short)
    .setMaxLength(90)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

// FIXED: answers Discord right away (setName is rate-limited by Discord and
// used to make the interaction fail), strips an emoji the user typed (it
// showed up as a 2nd emoji in the channel name), and re-checks ownership.
async function handleRenameSubmit(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  await interaction.deferReply(EPHEMERAL);

  const typed = interaction.fields.getTextInputValue('name').trim();
  const newName = stripEmojiPrefixes(typed) || typed; // the emoji comes from the emoji picker
  const styledName = bold(newName);
  const finalName = `${tempData.emoji} ${styledName}`.slice(0, 100);

  tempData.customName = styledName;
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);

  // Not awaited: if Discord's rename rate limit is hit, the reply must not wait for it.
  channel.setName(finalName).catch((err) => console.warn(`[panel] rename failed: ${err.message}`));

  await interaction.editReply({
    content: `${iconForText('rename', '✏️')} ${bold(`Renamed to ${finalName}`)}.`,
  });
}

async function handleLimitOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const modal = new ModalBuilder().setCustomId('tempvc:limit-modal').setTitle(bold('Set member limit'));
  const input = new TextInputBuilder()
    .setCustomId('limit')
    .setLabel(bold('Max members (0 = no limit, up to 99)'))
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleLimitSubmit(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });
  const raw = interaction.fields.getTextInputValue('limit');
  const limit = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
  await channel.setUserLimit(limit);
  tempData.limit = limit;
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);
  await refreshPanelMessage(channel, tempData);
  const summary = limit ? bold(`limit set to ${limit}`) : bold('limit removed');
  await interaction.reply({ content: savedReply(summary), ...EPHEMERAL });
}

async function handleEmojiOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  // Discord caps a select menu at 25 options, so the palette is split across
  // several menus (max 5 action rows per message).
  const CHUNK_SIZE = 25;
  const chunks = [];
  for (let i = 0; i < EMOJI_PALETTE.length; i += CHUNK_SIZE) {
    chunks.push(EMOJI_PALETTE.slice(i, i + CHUNK_SIZE));
  }

  const rows = chunks.map((chunk, i) => {
    const options = chunk.map((e) => ({
      label: e.label,
      value: e.emoji,
      emoji: e.emoji,
    }));
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`tempvc:emoji-select-${i}`)
      .setPlaceholder(bold(chunks.length > 1 ? `Emoji Set ${i + 1}` : 'Choose an emoji'))
      .addOptions(options);
    return new ActionRowBuilder().addComponents(menu);
  });

  await interaction.reply({
    content: bold("Choose a new emoji — it'll update the channel and everyone in it:"),
    components: rows,
    ...EPHEMERAL,
  });
}

// FIXED: answers Discord right away (renaming the channel and every nickname
// used to take longer than the 3 seconds Discord allows), saves the new emoji
// BEFORE syncing so every member is updated from the same source of truth,
// updates everyone in parallel, and swaps the emoji in the channel name safely
// even if the owner renamed the channel from Discord's own menu.
async function handleEmojiChange(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const newEmoji = interaction.values[0];
  if (newEmoji === tempData.emoji) {
    return interaction.update({ content: `${bold('Already using')} ${newEmoji}.`, components: [] });
  }

  await interaction.deferUpdate();

  tempData.emoji = newEmoji;
  storage.setTempChannel(voiceChannelId, tempData);
  storage.setUserEmoji(tempData.ownerId, newEmoji); // remembered for next time they create a channel

  const rest = stripEmojiPrefixes(channel.name) || bold('Channel');
  channel.setName(`${newEmoji} ${rest}`.slice(0, 100)).catch((err) =>
    console.warn(`[panel] channel emoji rename failed: ${err.message}`)
  );

  await syncChannelMembers(channel);
  await refreshPanelMessage(channel, tempData);

  await interaction.editReply({ content: savedReply(`${bold('emoji set to')} ${newEmoji}`), components: [] });
}

async function handleKickOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const row = buildMemberSelect('tempvc:kick-select', 'Choose who to disconnect', channel, tempData.ownerId);
  if (!row) return interaction.reply({ content: bold("There's no one else in the channel to kick."), ...EPHEMERAL });
  await interaction.reply({ content: bold('Choose who to disconnect from the channel:'), components: [row], ...EPHEMERAL });
}

async function handleKickSelect(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const target = channel.members.get(interaction.values[0]);
  if (!target) return interaction.update({ content: bold('They already left.'), components: [] });
  await target.voice.disconnect().catch(() => {});
  await interaction.update({ content: `✖️ ${bold('Disconnected')} **${target.displayName}**.`, components: [] });
}

async function handleTrustOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const menu = new UserSelectMenuBuilder()
    .setCustomId('tempvc:trust-select')
    .setPlaceholder(bold('Choose who to trust'))
    .setMinValues(1)
    .setMaxValues(25);
  await interaction.reply({
    content: bold('Choose who can join even while the channel is locked:'),
    components: [new ActionRowBuilder().addComponents(menu)],
    ...EPHEMERAL,
  });
}

async function handleTrustSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const trusted = new Set(tempData.trusted || []);
  for (const userId of interaction.values) trusted.add(userId);
  await Promise.all(
    interaction.values.map((userId) =>
      channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {})
    )
  );
  tempData.trusted = [...trusted];
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);
  await refreshPanelMessage(channel, tempData);
  const count = interaction.values.length;
  const summary = count === 1 ? bold('1 member trusted') : bold(`${count} members trusted`);
  await interaction.update({ content: savedReply(summary), components: [] });
}

async function handleUntrustOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const trustedIds = tempData.trusted || [];
  if (trustedIds.length === 0) {
    return interaction.reply({ content: bold("No one's trusted right now."), ...EPHEMERAL });
  }
  const options = trustedIds.slice(0, 25).map((id) => {
    const m = channel.guild.members.cache.get(id);
    return { label: m ? m.displayName : `User ${id}`, value: id };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('tempvc:untrust-select')
    .setPlaceholder(bold('Choose who to untrust'))
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options);
  await interaction.reply({
    content: bold('Choose who to remove from the trusted list:'),
    components: [new ActionRowBuilder().addComponents(menu)],
    ...EPHEMERAL,
  });
}

async function handleUntrustSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const targetIds = new Set(interaction.values);
  tempData.trusted = (tempData.trusted || []).filter((id) => !targetIds.has(id));
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);
  await Promise.all(
    [...targetIds].map((targetId) => channel.permissionOverwrites.delete(targetId).catch(() => {}))
  );
  await refreshPanelMessage(channel, tempData);
  const count = targetIds.size;
  const summary = count === 1 ? bold('1 member untrusted') : bold(`${count} members untrusted`);
  await interaction.update({ content: savedReply(summary), components: [] });
}

async function handleTransferOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const row = buildMemberSelect('tempvc:transfer-select', 'Choose the new owner', channel, tempData.ownerId);
  if (!row) return interaction.reply({ content: bold("There's no one else in the channel to hand it to."), ...EPHEMERAL });
  await interaction.reply({ content: bold('Choose who to hand ownership to:'), components: [row], ...EPHEMERAL });
}

async function handleTransferSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const newOwner = channel.members.get(interaction.values[0]);
  if (!newOwner) return interaction.update({ content: bold('They already left.'), components: [] });

  const oldOwnerId = tempData.ownerId;
  tempData.ownerId = newOwner.id;
  storage.setTempChannel(voiceChannelId, tempData);
  await updateOwnerPermissions(channel, oldOwnerId, newOwner.id);
  await refreshPanelMessage(channel, tempData);

  await interaction.update({ content: `♣️ **${newOwner.displayName}** ${bold('is now the channel owner.')}`, components: [] });
}

// Lets anyone still in the channel take ownership once the recorded owner
// has left. Deliberately does NOT go through requireOwner() — that's the point.
async function handleClaim(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });

  if (!isOwnerless(channel, tempData)) {
    return interaction.reply({ content: bold('The owner is still in the channel.'), ...EPHEMERAL });
  }

  const oldOwnerId = tempData.ownerId;
  tempData.ownerId = interaction.user.id;
  storage.setTempChannel(voiceChannelId, tempData);
  await updateOwnerPermissions(channel, oldOwnerId, interaction.user.id);
  await refreshPanelMessage(channel, tempData);

  await interaction.reply({ content: `👑 ${bold('You are now the channel owner.')}`, ...EPHEMERAL });
}

async function handleTimerOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const currentMinutes = typeof tempData.cleanupIntervalMinutes === 'number' ? tempData.cleanupIntervalMinutes : 10;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('tempvc:timer-select')
    .setPlaceholder(bold('Choose how often to auto-delete messages'))
    .addOptions(
      CLEANUP_INTERVAL_OPTIONS.map((opt) => ({
        label: opt.label,
        value: String(opt.minutes),
        default: opt.minutes === currentMinutes,
      }))
    );
  await interaction.reply({
    content: bold("Automatically clear this channel's chat on a schedule (the panel is never deleted):"),
    components: [new ActionRowBuilder().addComponents(menu)],
    ...EPHEMERAL,
  });
}

async function handleTimerSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const minutes = parseInt(interaction.values[0], 10) || 0;
  tempData.cleanupIntervalMinutes = minutes;
  tempData.lastPurgeAt = Date.now();
  storage.setTempChannel(voiceChannelId, tempData);
  snapshotOwnerSettings(tempData);
  await refreshPanelMessage(channel, tempData);

  const summary = minutes ? bold(`auto-delete set to every ${minutes}m`) : bold('auto-delete turned off');
  await interaction.update({ content: savedReply(summary), components: [] });
}

// Delete opens a confirm/cancel prompt so a stray click can't remove the channel.
async function handleDelete(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:delete-confirm').setLabel(bold('Yes, delete it')).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tempvc:delete-cancel').setLabel(bold('Cancel')).setStyle(ButtonStyle.Secondary)
  );
  await interaction.reply({
    content: `⚠️ ${bold('This will permanently delete the channel. Are you sure?')}`,
    components: [row],
    ...EPHEMERAL,
  });
}

async function handleDeleteConfirm(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  await interaction.update({ content: `➖ ${bold('Channel deleted.')}`, components: [] });
  await destroyTempChannel(channel.guild, channel, voiceChannelId, tempData);
}

async function handleDeleteCancel(interaction) {
  await interaction.update({ content: bold('Delete cancelled.'), components: [] });
}

module.exports = { handlePanelInteraction };

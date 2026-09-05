const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');

const storage = require('./storage');
const { EMOJI_SET_A, EMOJI_SET_B } = require('./emojiPalette');
const { applyEmojiToMember, removeEmojiFromMember } = require('./nickname');
const { updateOwnerPermissions, destroyTempChannel } = require('./voiceManager');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

// Sent after Lock/Unlock, Limit, Trust, or Untrust — the settings that get
// snapshotted to the owner's saved profile and restored on their next
// channel (see snapshotOwnerSettings / createTempChannel in voiceManager.js).
const SAVE_CONFIRMATION =
  '✅ Settings Saved Successfully\n' +
  '`Lock • Unlock • Limit • Trust • Untrust`\n' +
  'Your settings have been saved and will automatically be restored to the recreated temporary voice channel.';

// Looks up the temp channel the invoking member is currently sitting in, if any.
function getOwnedTempChannel(interaction) {
  const member = interaction.member;
  const voiceChannelId = member.voice?.channelId;
  if (!voiceChannelId) return { error: "You need to be in a temp voice channel to do that." };
  const tempData = storage.getTempChannel(voiceChannelId);
  if (!tempData) return { error: "That voice channel isn't a temp channel." };
  return { voiceChannelId, tempData, channel: member.voice.channel };
}

function requireOwner(interaction, tempData) {
  if (tempData.ownerId !== interaction.user.id) {
    return 'Only the channel owner can do that.';
  }
  return null;
}

// Builds a select menu listing everyone currently in the channel except the owner.
function buildMemberSelect(customId, placeholder, channel, excludeId) {
  const others = channel.members.filter((m) => m.id !== excludeId && !m.user.bot);
  if (others.size === 0) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .addOptions(others.map((m) => ({ label: m.displayName, value: m.id })).slice(0, 25));
  return new ActionRowBuilder().addComponents(menu);
}

async function handlePanelInteraction(interaction) {
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
    if (action === 'delete') return handleDelete(interaction);
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
  await interaction.reply({ content: SAVE_CONFIRMATION, ...EPHEMERAL });
}

async function handleRenameOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const modal = new ModalBuilder().setCustomId('tempvc:rename-modal').setTitle('Rename channel');
  const input = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('New channel name')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(90)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleRenameSubmit(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const newName = interaction.fields.getTextInputValue('name');
  const finalName = `${tempData.emoji} ${newName}`.slice(0, 100);
  await channel.setName(finalName);
  tempData.customName = newName;
  storage.setTempChannel(voiceChannelId, tempData);
  await interaction.reply({ content: `✏️ Renamed to **${finalName}**.`, ...EPHEMERAL });
}

async function handleLimitOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const modal = new ModalBuilder().setCustomId('tempvc:limit-modal').setTitle('Set member limit');
  const input = new TextInputBuilder()
    .setCustomId('limit')
    .setLabel('Max members (0 = no limit, up to 99)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function handleLimitSubmit(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const raw = interaction.fields.getTextInputValue('limit');
  const limit = Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
  await channel.setUserLimit(limit);
  tempData.limit = limit;
  storage.setTempChannel(voiceChannelId, tempData);
  await interaction.reply({ content: SAVE_CONFIRMATION, ...EPHEMERAL });
}

async function handleEmojiOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const menuA = new StringSelectMenuBuilder()
    .setCustomId('tempvc:emoji-select-a')
    .setPlaceholder('Emoji set 1')
    .addOptions(EMOJI_SET_A.map((e) => ({ label: e.label, value: e.emoji, emoji: e.emoji })));
  const menuB = new StringSelectMenuBuilder()
    .setCustomId('tempvc:emoji-select-b')
    .setPlaceholder('Emoji set 2')
    .addOptions(EMOJI_SET_B.map((e) => ({ label: e.label, value: e.emoji, emoji: e.emoji })));

  await interaction.reply({
    content: "Choose a new emoji — it'll update the channel and everyone in it:",
    components: [new ActionRowBuilder().addComponents(menuA), new ActionRowBuilder().addComponents(menuB)],
    ...EPHEMERAL,
  });
}

async function handleEmojiChange(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const newEmoji = interaction.values[0];
  if (newEmoji === tempData.emoji) {
    return interaction.update({ content: `Already using ${newEmoji}.`, components: [] });
  }

  const nameParts = channel.name.split(' ');
  nameParts[0] = newEmoji;
  await channel.setName(nameParts.join(' ').slice(0, 100));

  // applyEmojiToMember strips whatever's already there before adding the new
  // one, so this can't stack even if someone's mid-switch between channels.
  for (const [, member] of channel.members) {
    await applyEmojiToMember(member, newEmoji);
  }

  tempData.emoji = newEmoji;
  storage.setTempChannel(voiceChannelId, tempData);
  storage.setUserEmoji(tempData.ownerId, newEmoji); // remembered for next time they create a channel

  await interaction.update({ content: `${newEmoji} Channel emoji updated for everyone.`, components: [] });
}

async function handleKickOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const row = buildMemberSelect('tempvc:kick-select', 'Choose who to disconnect', channel, tempData.ownerId);
  if (!row) return interaction.reply({ content: "There's no one else in the channel to kick.", ...EPHEMERAL });
  await interaction.reply({ content: 'Choose who to disconnect from the channel:', components: [row], ...EPHEMERAL });
}

async function handleKickSelect(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const target = channel.members.get(interaction.values[0]);
  if (!target) return interaction.update({ content: 'They already left.', components: [] });
  await target.voice.disconnect().catch(() => {});
  await interaction.update({ content: `✖️ Disconnected **${target.displayName}**.`, components: [] });
}

async function handleTrustOpen(interaction) {
  const { error, tempData } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const menu = new UserSelectMenuBuilder()
    .setCustomId('tempvc:trust-select')
    .setPlaceholder('Choose who to trust')
    .setMinValues(1)
    .setMaxValues(25);
  await interaction.reply({
    content: 'Choose who can join even while the channel is locked:',
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
  for (const userId of interaction.values) {
    trusted.add(userId);
    await channel.permissionOverwrites.edit(userId, { Connect: true }).catch(() => {});
  }
  tempData.trusted = [...trusted];
  storage.setTempChannel(voiceChannelId, tempData);
  await interaction.update({ content: SAVE_CONFIRMATION, components: [] });
}

async function handleUntrustOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const trustedIds = tempData.trusted || [];
  if (trustedIds.length === 0) {
    return interaction.reply({ content: "No one's trusted right now.", ...EPHEMERAL });
  }
  const options = trustedIds.slice(0, 25).map((id) => {
    const m = channel.guild.members.cache.get(id);
    return { label: m ? m.displayName : `User ${id}`, value: id };
  });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('tempvc:untrust-select')
    .setPlaceholder('Choose who to untrust')
    .addOptions(options);
  await interaction.reply({
    content: 'Choose who to remove from the trusted list:',
    components: [new ActionRowBuilder().addComponents(menu)],
    ...EPHEMERAL,
  });
}

async function handleUntrustSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const targetId = interaction.values[0];
  tempData.trusted = (tempData.trusted || []).filter((id) => id !== targetId);
  storage.setTempChannel(voiceChannelId, tempData);
  await channel.permissionOverwrites.delete(targetId).catch(() => {});
  await interaction.update({ content: SAVE_CONFIRMATION, components: [] });
}

async function handleTransferOpen(interaction) {
  const { error, tempData, channel } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  const row = buildMemberSelect('tempvc:transfer-select', 'Choose the new owner', channel, tempData.ownerId);
  if (!row) return interaction.reply({ content: "There's no one else in the channel to hand it to.", ...EPHEMERAL });
  await interaction.reply({ content: 'Choose who to hand ownership to:', components: [row], ...EPHEMERAL });
}

async function handleTransferSelect(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.update({ content: error, components: [] });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.update({ content: ownerErr, components: [] });

  const newOwner = channel.members.get(interaction.values[0]);
  if (!newOwner) return interaction.update({ content: 'They already left.', components: [] });

  const oldOwnerId = tempData.ownerId;
  tempData.ownerId = newOwner.id;
  storage.setTempChannel(voiceChannelId, tempData);
  await updateOwnerPermissions(channel, oldOwnerId, newOwner.id);

  await interaction.update({ content: `♣️ **${newOwner.displayName}** is now the channel owner.`, components: [] });
}

async function handleDelete(interaction) {
  const { error, tempData, channel, voiceChannelId } = getOwnedTempChannel(interaction);
  if (error) return interaction.reply({ content: error, ...EPHEMERAL });
  const ownerErr = requireOwner(interaction, tempData);
  if (ownerErr) return interaction.reply({ content: ownerErr, ...EPHEMERAL });

  await interaction.reply({ content: '➖ Channel deleted.', ...EPHEMERAL });
  await destroyTempChannel(channel.guild, channel, voiceChannelId, tempData);
}

module.exports = { handlePanelInteraction };

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iconForComponent, iconForText } = require('./customIcons');

// Each entry: [lookup name for a custom app emoji, Unicode fallback]
// Fallbacks were swapped from the flat grayscale-square set to icons that
// still read semantically on their own if the custom app emoji ever fails
// to load (e.g. lock -> 🔒 instead of a plain 🔳 square).
const ICONS = {
  lock: ['lock_unlock', '🔒'],
  rename: ['rename', '✏️'],
  limit: ['limit', '👥'],
  kick: ['kick', '🥾'],
  emoji: ['change_emoji', '😀'],
  trust: ['trust', '✅'],
  untrust: ['untrust', '🚫'],
  transfer: ['transfer', '👑'],
  claim: ['claim', '👑'],
  delete: ['delete', '🗑️'],
  timer: ['timer', '⏱️'],
};

// Options shown in the auto-delete timer picker. minutes: 0 means "off".
const CLEANUP_INTERVAL_OPTIONS = [
  { minutes: 0, label: 'Off' },
  { minutes: 3, label: 'Every 3 minutes' },
  { minutes: 5, label: 'Every 5 minutes' },
  { minutes: 10, label: 'Every 10 minutes' },
  { minutes: 30, label: 'Every 30 minutes' },
  { minutes: 60, label: 'Every 1 hour' },
];

// Purple theme for the panel embed.
const PANEL_COLOR = 0x9b59b6;

// One compact status line instead of four separate rows — lock state,
// limit, emoji, and the auto-delete timer, separated by middle dots.
function buildStatusLine(tempData) {
  const i = (key) => iconForText(...ICONS[key]);
  const lockPart = tempData.locked ? `${i('lock')} Locked` : `${i('lock')} Unlocked`;
  const limitPart = tempData.limit ? `Limit **${tempData.limit}**` : 'No limit';
  const emojiPart = `Emoji ${tempData.emoji || 'none'}`;

  const interval = tempData.cleanupIntervalMinutes;
  let timerPart;
  if (!interval) {
    timerPart = 'Auto-delete off';
  } else {
    const nextPurgeAt = (tempData.lastPurgeAt || tempData.createdAt || Date.now()) + interval * 60 * 1000;
    const nextPurgeUnix = Math.floor(nextPurgeAt / 1000);
    // <t:...:R> is Discord's own relative-timestamp format — it renders as
    // a live "in 3 minutes" that keeps counting down on its own in every
    // viewer's client, with no need for the bot to keep editing the message.
    timerPart = `Auto-delete every **${interval}m** (next <t:${nextPurgeUnix}:R>)`;
  }

  return [lockPart, limitPart, emojiPart, timerPart].join('  •  ');
}

// ownerMember is a discord.js GuildMember, used for the avatar thumbnail and
// footer. tempData is the same record stored in storage.js (locked, limit,
// emoji, etc.) — both are optional so this still works if called with
// nothing, though in practice voiceManager.js and panel.js always pass both.
//
// If ownerMember is missing but tempData still has an ownerId, the embed
// says so explicitly instead of silently dropping the footer/thumbnail —
// that's the "owner left, channel is claimable" state.
function buildPanelEmbed(ownerMember, tempData = {}) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🎛️ Channel panel')
    .setDescription([buildStatusLine(tempData), '', 'Owner-only controls below.'].join('\n'));

  if (ownerMember) {
    embed.setThumbnail(ownerMember.displayAvatarURL({ size: 256 }));
    embed.setFooter({ text: `Owner: ${ownerMember.displayName}` });
  } else if (tempData.ownerId) {
    embed.setFooter({ text: 'Owner has left — use Claim Ownership to take over.' });
  }

  return embed;
}

// No banner image right now — kept as a function (returning nothing) so any
// `files: buildPanelAttachments()` calls elsewhere keep working unchanged if
// an image gets added back later.
function buildPanelAttachments() {
  return [];
}

// Grouped into Access / Settings / Danger zone, matching the panel embed's
// simplified layout. Delete stays the only ButtonStyle.Danger so it still
// stands out even within the danger-zone row.
//
// ownerPresent (default true, for callers that don't pass it) swaps
// "Transfer Ownership" for "Claim Ownership" once the recorded owner has
// left the channel, so there's always a way to un-stick an ownerless
// channel instead of every owner-only control going dead.
function buildPanelComponents(ownerPresent = true) {
  const i = (key) => iconForComponent(...ICONS[key]);

  // Access
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:lock').setLabel('Lock / Unlock').setEmoji(i('lock')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:trust').setLabel('Trust').setEmoji(i('trust')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:untrust').setLabel('Untrust').setEmoji(i('untrust')).setStyle(ButtonStyle.Secondary)
  );

  // Settings
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:rename').setLabel('Rename').setEmoji(i('rename')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:limit').setLabel('Limit').setEmoji(i('limit')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:emoji').setLabel('Change Emoji').setEmoji(i('emoji')).setStyle(ButtonStyle.Secondary)
  );

  // Danger zone
  const ownershipButton = ownerPresent
    ? new ButtonBuilder().setCustomId('tempvc:transfer').setLabel('Transfer Ownership').setEmoji(i('transfer')).setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId('tempvc:claim').setLabel('Claim Ownership').setEmoji(i('claim')).setStyle(ButtonStyle.Primary);

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:kick').setLabel('Kick').setEmoji(i('kick')).setStyle(ButtonStyle.Secondary),
    ownershipButton
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:timer').setLabel('Auto-Delete Timer').setEmoji(i('timer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:delete').setLabel('Delete').setEmoji(i('delete')).setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, row3, row4];
}

module.exports = { buildPanelEmbed, buildPanelComponents, buildPanelAttachments, CLEANUP_INTERVAL_OPTIONS };

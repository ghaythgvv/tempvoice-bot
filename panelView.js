const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iconForComponent, iconForText } = require('./customIcons');

// Each entry: [lookup name for a custom app emoji, Unicode fallback]
const ICONS = {
  lock: ['lock', '🔒'],
  unlock: ['unlock', '🔓'],
  rename: ['rename', '▫️'],
  limit: ['limit', '🔘'],
  kick: ['kick', '✖️'],
  emoji: ['change_emoji', '⚪'],
  trust: ['trust', '🤍'],
  untrust: ['untrust', '🖤'],
  transfer: ['transfer', '♣️'],
  delete: ['delete', '⬛'],
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
  // Two distinct icons (not one icon relabeled) so the state reads correctly
  // at a glance instead of always showing a closed-lock glyph.
  const lockPart = tempData.locked ? `${i('lock')} Locked` : `${i('unlock')} Unlocked`;
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
function buildPanelEmbed(ownerMember, tempData = {}) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🎛️ Channel panel')
    .setDescription([buildStatusLine(tempData), '', 'Owner-only controls below.'].join('\n'));

  if (ownerMember) {
    embed.setThumbnail(ownerMember.displayAvatarURL({ size: 256 }));
    embed.setFooter({ text: `Owner: ${ownerMember.displayName}` });
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
function buildPanelComponents() {
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
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:kick').setLabel('Kick').setEmoji(i('kick')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:transfer').setLabel('Transfer Ownership').setEmoji(i('transfer')).setStyle(ButtonStyle.Secondary)
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:timer').setLabel('Auto-Delete Timer').setEmoji(i('timer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:delete').setLabel('Delete').setEmoji(i('delete')).setStyle(ButtonStyle.Danger)
  );

  return [row1, row2, row3, row4];
}

module.exports = { buildPanelEmbed, buildPanelComponents, buildPanelAttachments, CLEANUP_INTERVAL_OPTIONS };

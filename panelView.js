const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iconForComponent, iconForText } = require('./customIcons');
const { bold } = require('./textStyle');

// Each entry: [lookup name for a custom app emoji, Unicode fallback]
// Fallbacks were swapped from the flat grayscale-square set to icons that
// still read semantically on their own if the custom app emoji ever fails
// to load (e.g. lock -> 🔒 instead of a plain 🔳 square).
const ICONS = {
  lock: ['lock', '🔒'],
  unlock: ['unlock', '🔓'],
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
// Labels run through bold() since select menu options can't use markdown.
const CLEANUP_INTERVAL_OPTIONS = [
  { minutes: 0, label: bold('Off') },
  { minutes: 3, label: bold('Every 3 minutes') },
  { minutes: 5, label: bold('Every 5 minutes') },
  { minutes: 10, label: bold('Every 10 minutes') },
  { minutes: 30, label: bold('Every 30 minutes') },
  { minutes: 60, label: bold('Every 1 hour') },
];

// Purple theme for the panel embed.
const PANEL_COLOR = 0x9b59b6;

// Banner shown at the bottom of the panel embed. It's the banner.gif from the
// repo, loaded through GitHub's raw link so it also survives panel edits
// (no attachment re-upload needed). Set to '' to hide the banner.
const PANEL_BANNER_URL = 'https://raw.githubusercontent.com/ghaythgvv/tempvoice-bot/main/banner.gif';

// The panel's custom title emoji + text. Kept as its own constant (rather
// than inlined in buildPanelEmbed) so it's easy to swap the emoji again
// later without hunting through the embed-building logic. The emoji tag is
// deliberately concatenated OUTSIDE bold() — see textStyle.js's warning
// about bold() corrupting the digits inside a <:name:id> tag.
const PANEL_TITLE_EMOJI = '<a:156218darkpurplesparklybutterfly:1553826933890879518>';
const OWNER_LINE_EMOJI = '<:owner:1554186011809021953>';

// One compact status line instead of four separate rows — lock state,
// limit, emoji, and the auto-delete timer, separated by middle dots.
//
// The auto-delete timer's <t:...:R> relative timestamp is deliberately kept
// OUTSIDE any bold() call — bold() rewrites the digits inside it, which
// would corrupt the Unix timestamp Discord needs to render the countdown.
function buildStatusLine(tempData) {
  const i = (key) => iconForText(...ICONS[key]);
  const lockPart = tempData.locked
    ? `${i('lock')} ${bold('Locked')}`
    : `${i('unlock')} ${bold('Unlocked')}`;
  const limitPart = tempData.limit ? bold(`Limit ${tempData.limit}`) : bold('No limit');
  const emojiPart = `${bold('Emoji')} ${tempData.emoji || bold('none')}`;

  const interval = tempData.cleanupIntervalMinutes;
  let timerPart;
  if (!interval) {
    timerPart = bold('Auto-delete off');
  } else {
    const nextPurgeAt = (tempData.lastPurgeAt || tempData.createdAt || Date.now()) + interval * 60 * 1000;
    const nextPurgeUnix = Math.floor(nextPurgeAt / 1000);
    // <t:...:R> is Discord's own relative-timestamp format — it renders as
    // a live "in 3 minutes" that keeps counting down on its own in every
    // viewer's client, with no need for the bot to keep editing the message.
    timerPart = `${bold(`Auto-delete every ${interval}m (next`)} <t:${nextPurgeUnix}:R>)`;
  }

  return [lockPart, limitPart, emojiPart, timerPart].join('  •  ');
}

// ownerMember is a discord.js GuildMember, used for the avatar thumbnail.
// tempData is the same record stored in storage.js (locked, limit, emoji,
// ownerId, etc.) — both are optional so this still works if called with
// nothing, though in practice voiceManager.js and panel.js always pass both.
//
// The owner is shown as a real <@id> mention in the embed body rather than
// plain text in the footer — Discord doesn't render footer text as a
// clickable mention, but it does render mentions inside the embed
// description, and mentions inside embeds never trigger a ping
// notification, so this is safe to re-render on every settings change.
// The mention tag itself is kept outside bold() for the same ID-corruption
// reason as the timestamp above.
//
// If ownerMember is missing but tempData still has an ownerId, the embed
// says so explicitly instead of silently dropping the thumbnail — that's
// the "owner left, channel is claimable" state.
function buildPanelEmbed(ownerMember, tempData = {}) {
  const ownerLine = tempData.ownerId
    ? `${OWNER_LINE_EMOJI} ${bold('Owner:')} <@${tempData.ownerId}>`
    : `${OWNER_LINE_EMOJI} ${bold('Owner: unknown')}`;

  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setDescription(
      [
        // Custom (server) emoji only render as images inside an embed's
        // description/field values — embed TITLES can't display them, they
        // just show the raw <:name:id> text. So the heading lives here
        // instead of in .setTitle(), even though it reads like a title.
        `${PANEL_TITLE_EMOJI} ${bold('ELT CONTROL PANEL')}`,
        '',
        buildStatusLine(tempData),
        '',
        ownerLine,
        '',
        bold('Owner-only controls below.'),
      ].join('\n')
    );

  if (PANEL_BANNER_URL) embed.setImage(PANEL_BANNER_URL);

  if (ownerMember) {
    embed.setThumbnail(ownerMember.displayAvatarURL({ size: 256 }));
  } else if (tempData.ownerId) {
    embed.setFooter({ text: bold('Owner has left — use Claim Ownership to take over.') });
  }

  return embed;
}

// The banner now comes from PANEL_BANNER_URL, so no file attachment is needed — kept as a function (returning nothing) so any
// `files: buildPanelAttachments()` calls elsewhere keep working unchanged if
// an image gets added back later.
function buildPanelAttachments() {
  return [];
}

// Grouped into Access / Settings / Danger zone, matching the panel embed's
// simplified layout. Delete uses ButtonStyle.Secondary (grey) like the other buttons.
// Every label runs through bold() since button labels are plain text — Discord doesn't apply ** **
// markdown to them.
//
// ownerPresent (default true, for callers that don't pass it) swaps
// "Transfer Ownership" for "Claim Ownership" once the recorded owner has
// left the channel, so there's always a way to un-stick an ownerless
// channel instead of every owner-only control going dead.
//
// locked (default false) picks which of the two distinct lock/unlock icons
// shows on the Lock/Unlock button itself, matching whatever the status
// line above already says.
function buildPanelComponents(ownerPresent = true, locked = false) {
  const i = (key) => iconForComponent(...ICONS[key]);
  const lockIcon = locked ? i('lock') : i('unlock');

  // Access
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:lock').setLabel(bold('Lock / Unlock')).setEmoji(lockIcon).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:trust').setLabel(bold('Trust')).setEmoji(i('trust')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:untrust').setLabel(bold('Untrust')).setEmoji(i('untrust')).setStyle(ButtonStyle.Secondary)
  );

  // Settings
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:rename').setLabel(bold('Rename')).setEmoji(i('rename')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:limit').setLabel(bold('Limit')).setEmoji(i('limit')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:emoji').setLabel(bold('Change Emoji')).setEmoji(i('emoji')).setStyle(ButtonStyle.Secondary)
  );

  // Danger zone
  const ownershipButton = ownerPresent
    ? new ButtonBuilder().setCustomId('tempvc:transfer').setLabel(bold('Transfer Ownership')).setEmoji(i('transfer')).setStyle(ButtonStyle.Secondary)
    : new ButtonBuilder().setCustomId('tempvc:claim').setLabel(bold('Claim Ownership')).setEmoji(i('claim')).setStyle(ButtonStyle.Primary);

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:kick').setLabel(bold('Kick')).setEmoji(i('kick')).setStyle(ButtonStyle.Secondary),
    ownershipButton
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:timer').setLabel(bold('Auto-Delete Timer')).setEmoji(i('timer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:delete').setLabel(bold('Delete')).setEmoji(i('delete')).setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2, row3, row4];
}

module.exports = { buildPanelEmbed, buildPanelComponents, buildPanelAttachments, CLEANUP_INTERVAL_OPTIONS };

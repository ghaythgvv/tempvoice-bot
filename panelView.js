const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { iconForComponent, iconForText } = require('./customIcons');
 
// Each entry: [lookup name for a custom app emoji, Unicode fallback]
const ICONS = {
  lock: ['lock_unlock', '🔳'],
  rename: ['rename', '▫️'],
  limit: ['limit', '🔘'],
  kick: ['kick', '✖️'],
  emoji: ['change_emoji', '⚪'],
  trust: ['trust', '🤍'],
  untrust: ['untrust', '🖤'],
  transfer: ['transfer', '♣️'],
  delete: ['delete', '⬛'],
};
 
// Purple theme for the panel embed.
const PANEL_COLOR = 0x9b59b6;
 
// Plain-language status lines shown above the button descriptions, so the
// owner can see the channel's current state at a glance without having to
// remember what they last set.
function buildStatusLines(tempData) {
  const i = (key) => iconForText(...ICONS[key]);
  const lockLine = tempData.locked
    ? `${i('lock')} This channel is **locked** 🔒`
    : `${i('lock')} This channel is **unlocked** 🔓`;
  const limitLine = tempData.limit
    ? `${i('limit')} Limit: **${tempData.limit} members**`
    : `${i('limit')} Limit: **No limit**`;
  const emojiLine = `${i('emoji')} Emoji: **${tempData.emoji || 'None'}**`;
  return [lockLine, limitLine, emojiLine];
}
 
// ownerMember is a discord.js GuildMember, used for the avatar thumbnail and
// footer. tempData is the same record stored in storage.js (locked, limit,
// emoji, etc.) — both are optional so this still works if called with
// nothing, though in practice voiceManager.js and panel.js always pass both.
function buildPanelEmbed(ownerMember, tempData = {}) {
  const i = (key) => iconForText(...ICONS[key]);
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle('🎛️ Channel Panel')
    .setDescription(
      [
        ...buildStatusLines(tempData),
        '',
        'Manage this channel with the buttons below (owner only):',
        `${i('lock')} **Lock / Unlock** — control who can join`,
        `${i('rename')} **Rename** — change the channel name`,
        `${i('limit')} **Limit** — set a max number of members`,
        `${i('kick')} **Kick** — disconnect someone from the channel`,
        `${i('emoji')} **Change Emoji** — pick a new emoji for the channel and everyone in it`,
        `${i('trust')} **Trust** — let someone join even while the channel is locked`,
        `${i('untrust')} **Untrust** — remove someone from the trusted list`,
        `${i('transfer')} **Transfer Ownership** — hand the channel to someone else in it`,
        `${i('delete')} **Delete** — remove the channel right away`,
      ].join('\n')
    );
 
  if (ownerMember) {
    embed.setThumbnail(ownerMember.displayAvatarURL({ size: 256 }));
    embed.setFooter({ text: `Owner: ${ownerMember.displayName}` });
  }
 
  return embed;
}
 
function buildPanelComponents() {
  const i = (key) => iconForComponent(...ICONS[key]);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:lock').setLabel('Lock / Unlock').setEmoji(i('lock')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:rename').setLabel('Rename').setEmoji(i('rename')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:limit').setLabel('Limit').setEmoji(i('limit')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:kick').setLabel('Kick').setEmoji(i('kick')).setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tempvc:emoji').setLabel('Change Emoji').setEmoji(i('emoji')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:trust').setLabel('Trust').setEmoji(i('trust')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:untrust').setLabel('Untrust').setEmoji(i('untrust')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:transfer').setLabel('Transfer Ownership').setEmoji(i('transfer')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tempvc:delete').setLabel('Delete').setEmoji(i('delete')).setStyle(ButtonStyle.Danger)
  );
  return [row1, row2];
}
 
module.exports = { buildPanelEmbed, buildPanelComponents };
 

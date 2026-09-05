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

function buildPanelEmbed() {
  const i = (key) => iconForText(...ICONS[key]);
  return new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('🎛️ Channel Panel')
    .setDescription(
      [
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

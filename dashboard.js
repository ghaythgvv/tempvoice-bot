// dashboard.js
// Keeps one overview message (if configured) up to date with a live list of
// every active temp/game voice channel in the guild. Looks for
// `dashboardChannelId` (and optionally a saved `dashboardMessageId`) on the
// guild's config record in storage — set those via whatever setup/config
// command your bot uses. If nothing is configured, this quietly no-ops so
// guilds that don't use a dashboard aren't affected.

const { EmbedBuilder } = require('discord.js');
const storage = require('./storage');
const { toFancyBold } = require('./utils');

// Same violet accent used across the rest of the bot's panels.
const DASHBOARD_COLOR = 0x8b5cf6;

// Discord caps embeds at 25 fields — plenty for a live "who's online"
// board, but if you ever get more channels than that at once the extras
// just won't have their own field (nothing breaks, they're just left off).
const MAX_FIELDS = 25;

function buildChannelField(guild, channelId, data) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return null; // it got deleted since the last refresh — just skip it

  const memberCount = channel.members.size;
  const ownerTag = data.ownerId ? `<@${data.ownerId}>` : 'Unknown';

  const lines = [`👤 **Owner:** ${ownerTag}`, `👥 **Members:** ${memberCount}`];

  if (data.type === 'game') {
    if (data.partyCode) lines.push(`🔑 **Party Code:** \`${data.partyCode}\``);
    if (data.gameNameExtra) lines.push(`📝 **Game Name:** \`${data.gameNameExtra}\``);
  } else {
    lines.push(data.locked ? '🔒 **Status:** Locked' : '🔓 **Status:** Open');
    if (data.limit) lines.push(`🎚️ **Limit:** ${data.limit}`);
  }

  lines.push(`🔗 Jump in: <#${channelId}>`);

  return {
    name: channel.name,
    value: lines.join('\n'),
    inline: true,
  };
}

function buildDashboardEmbed(guild, channels) {
  const embed = new EmbedBuilder()
    .setColor(DASHBOARD_COLOR)
    .setTitle(`🎙️ ${toFancyBold(guild.name.toUpperCase())} — ${toFancyBold('ACTIVE VOICE CHANNELS')}`)
    .setTimestamp();

  if (guild.iconURL()) embed.setThumbnail(guild.iconURL());

  if (channels.length === 0) {
    embed
      .setDescription('😴 Nothing going on right now — be the first to jump in a **Join to Create** channel!')
      .setFooter({ text: 'Last updated' });
    return embed;
  }

  const totalMembers = channels.reduce((sum, { channelId }) => {
    const channel = guild.channels.cache.get(channelId);
    return sum + (channel ? channel.members.size : 0);
  }, 0);

  embed.setDescription(
    `📡 **${channels.length}** channel${channels.length === 1 ? '' : 's'} live right now • **${totalMembers}** ${totalMembers === 1 ? 'person' : 'people'} connected`
  );

  const fields = channels
    .map(({ channelId, data }) => buildChannelField(guild, channelId, data))
    .filter(Boolean)
    .slice(0, MAX_FIELDS);

  embed.addFields(fields);
  embed.setFooter({ text: 'Last updated' });
  return embed;
}

async function refreshDashboard(guild) {
  if (!guild) return;
  const config = storage.getGuildConfig(guild.id);
  if (!config || !config.dashboardChannelId) return; // no dashboard configured for this guild

  const dashboardChannel = guild.channels.cache.get(config.dashboardChannelId);
  if (!dashboardChannel) {
    console.warn(`[dashboard] configured dashboardChannelId ${config.dashboardChannelId} not found in ${guild.name}`);
    return;
  }

  const all = storage.getAllTempChannels();
  const channels = Object.entries(all)
    .filter(([, data]) => data.guildId === guild.id)
    .map(([channelId, data]) => ({ channelId, data }));

  const embed = buildDashboardEmbed(guild, channels);

  try {
    let message = config.dashboardMessageId
      ? await dashboardChannel.messages.fetch(config.dashboardMessageId).catch(() => null)
      : null;

    if (message) {
      await message.edit({ embeds: [embed] });
    } else {
      message = await dashboardChannel.send({ embeds: [embed] });
      storage.setGuildConfig(guild.id, { dashboardMessageId: message.id });
    }
  } catch (err) {
    console.warn(`[dashboard] could not refresh dashboard in ${guild.name}: ${err.message}`);
  }
}

module.exports = { refreshDashboard };

// A server-wide "how busy is the temp-vc system right now" view — separate
// from the per-channel control panel, which stays inside each individual
// channel. This one lives in its own channel and refreshes itself.

const { EmbedBuilder } = require('discord.js');
const storage = require('./storage');

function buildDashboardEmbed(guild) {
  const all = storage.getAllTempChannels();
  const rooms = Object.entries(all)
    .filter(([, data]) => data.guildId === guild.id)
    .map(([channelId, data]) => {
      const channel = guild.channels.cache.get(channelId);
      return channel ? { channel, data } : null;
    })
    .filter(Boolean);

  const activeRooms = rooms.length;
  const connectedUsers = rooms.reduce((sum, r) => sum + r.channel.members.size, 0);
  const sorted = [...rooms].sort((a, b) => b.channel.members.size - a.channel.members.size);
  const mostActive = sorted[0];
  const topThree = sorted.slice(0, 3);

  const embed = new EmbedBuilder()
    .setColor(0xffffff)
    .setTitle('📊 Temp Voice Stats')
    .setDescription(`**Server:** ${guild.name}\nUpdated <t:${Math.floor(Date.now() / 1000)}:R>`)
    .addFields({
      name: 'Voice Activity Snapshot',
      value: `**Active Rooms:** ${activeRooms}  |  **Connected Users:** ${connectedUsers}`,
    });

  embed.addFields({
    name: 'Most Active',
    value: mostActive
      ? `${mostActive.data.locked ? '🔒 ' : ''}${mostActive.channel.name} (${mostActive.channel.members.size} members)`
      : 'No active channels right now.',
  });

  embed.addFields({
    name: 'Top Voice Channels',
    value:
      topThree.length > 0
        ? topThree.map((r, i) => `**${i + 1}.** ${r.channel.name} — ${r.channel.members.size} online`).join('\n')
        : 'No active channels right now.',
  });

  embed.setFooter({ text: 'Auto-refreshes every 20s' });

  return embed;
}

// Guild-scoped: looks up its own config, so callers don't need to pass one.
async function refreshDashboard(guild) {
  const config = storage.getGuildConfig(guild.id);
  if (!config || !config.statsChannelId || !config.statsMessageId) return;
  const channel = guild.channels.cache.get(config.statsChannelId);
  if (!channel) return;
  const message = await channel.messages.fetch(config.statsMessageId).catch(() => null);
  if (!message) return;
  await message.edit({ embeds: [buildDashboardEmbed(guild)] }).catch(() => {});
}

async function refreshAllDashboards(client) {
  for (const [, guild] of client.guilds.cache) {
    await refreshDashboard(guild);
  }
}

module.exports = { buildDashboardEmbed, refreshDashboard, refreshAllDashboards };

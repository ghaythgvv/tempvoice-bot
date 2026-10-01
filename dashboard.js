// dashboard.js — ELITE Temp Voice Stats (Components V2)
// Server-wide "how busy is the temp-vc system" view. Lives in its own channel
// and refreshes itself. Requires discord.js >= 14.19.
//
// NOTE: a Components V2 message can't have `content` or `embeds`.

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');
const storage = require('./storage');

const ACCENT = 0x7c3aed;

const text = (md) => new TextDisplayBuilder().setContent(md);
const sep = (big = false) =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

const bar = (value, max, size = 10) => {
  if (max <= 0 || value <= 0) return '▱'.repeat(size);
  const filled = Math.max(1, Math.round((value / max) * size));
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
};
const medal = (i) => ['🥇', '🥈', '🥉'][i] ?? `\`${i + 1}\``;

function getRooms(guild) {
  const all = storage.getAllTempChannels();
  return Object.entries(all)
    .filter(([, data]) => data.guildId === guild.id)
    .map(([channelId, data]) => {
      const channel = guild.channels.cache.get(channelId);
      return channel ? { channel, data, count: channel.members.size } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

function buildDashboardPayload(guild) {
  const rooms = getRooms(guild);
  const users = rooms.reduce((s, r) => s + r.count, 0);
  const top = rooms.slice(0, 5);
  const max = top[0]?.count ?? 0;
  const now = Math.floor(Date.now() / 1000);

  const topLines = top.length
    ? top
        .map(
          (r, i) =>
            `${medal(i)} ${r.data.locked ? '🔒 ' : ''}**${r.channel.name}**\n` +
            `-# ${bar(r.count, max)}  \`${r.count}\` online`
        )
        .join('\n')
    : '*No active rooms right now — join the create channel and open the first one.*';

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      text(`# 👑 ELITE VOICE STATS\n-# ${guild.name}  •  *live voice activity*`)
    )
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        `### 📊 Snapshot\n` +
          `> 🔊 **Rooms** \`${rooms.length}\`  ┃  👥 **In voice** \`${users}\`  ┃  🔥 **Hottest** ${
            top[0] ? `**${top[0].channel.name}**` : '`—`'
          }`
      )
    )
    .addSeparatorComponents(sep(true))
    .addTextDisplayComponents(text(`### 🏆 Top Rooms\n${topLines}`))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(`-# Updated <t:${now}:R>  •  auto-refresh every 20s  •  ELITE SYSTEM`)
    );

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// Kept so old code importing buildDashboardEmbed doesn't crash.
// It now returns a message payload, NOT an embed — send it as-is, don't wrap it in { embeds: [...] }.
const buildDashboardEmbed = buildDashboardPayload;

const busy = new Set();

async function refreshDashboard(guild) {
  const config = storage.getGuildConfig(guild.id);
  if (!config || !config.statsChannelId || !config.statsMessageId) return;
  if (busy.has(guild.id)) return; // don't overlap two refreshes
  busy.add(guild.id);

  try {
    const channel = guild.channels.cache.get(config.statsChannelId);
    if (!channel) return;
    const message = await channel.messages.fetch(config.statsMessageId).catch(() => null);
    if (!message) return;

    const payload = buildDashboardPayload(guild);

    if (message.flags.has(MessageFlags.IsComponentsV2)) {
      await message.edit(payload).catch(() => {});
      return;
    }

    // Old embed message: Discord can't convert it to V2, so post a new one,
    // save its id, and delete the old one (happens once).
    const fresh = await channel.send(payload).catch(() => null);
    if (!fresh) return;
    storage.setGuildConfig(guild.id, { statsMessageId: fresh.id });
    await message.delete().catch(() => {});
  } finally {
    busy.delete(guild.id);
  }
}

async function refreshAllDashboards(client) {
  for (const [, guild] of client.guilds.cache) {
    await refreshDashboard(guild);
  }
}

module.exports = {
  buildDashboardPayload,
  buildDashboardEmbed,
  refreshDashboard,
  refreshAllDashboards,
};

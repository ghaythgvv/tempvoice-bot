// dashboard.js — ELITE Temp Voice Stats v2 (Components V2)
// Requires discord.js >= 14.19. Optional: put banner.gif next to this file
// and it shows at the top of the card.

const fs = require('fs');
const path = require('path');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  AttachmentBuilder,
  MessageFlags,
} = require('discord.js');
const storage = require('./storage');

const ACCENT = 0x7c3aed;
const BANNER_NAME = 'banner.gif';
const BANNER_PATH = path.join(__dirname, BANNER_NAME);
const hasBanner = () => fs.existsSync(BANNER_PATH);
const { renderStatsBanner } = require('./bannerRenderer');
const LIVE_PREFIX = 'elite-voice-';
const lastKey = new Map();

const text = (md) => new TextDisplayBuilder().setContent(md);
const sep = (big = false) =>
  new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

// Big purple squares — much easier to read than thin bars
const bar = (value, max, size = 8) => {
  const filled = max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * size)) : 0;
  return '🟪'.repeat(filled) + '⬛'.repeat(size - filled);
};
const RANK = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

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

function ownerAvatar(guild, r) {
  const m = r.data.ownerId ? guild.members.cache.get(r.data.ownerId) : null;
  return m ? m.displayAvatarURL({ extension: 'png', size: 128 }) : null;
}

function roomBlock(r, i, max) {
  const limit = r.channel.userLimit ? r.channel.userLimit : '∞';
  const owner = r.data.ownerId ? `<@${r.data.ownerId}>` : '—';
  const state = r.data.locked ? '🔒 Locked' : '🌐 Open';
  return (
    `${RANK[i]}  **${r.channel.name}**\n` +
    `${bar(r.count, max)}  **${r.count}** / ${limit}\n` +
    `-# 👑 ${owner}  •  ${state}`
  );
}

function buildContainer(guild, banner) {
  const rooms = getRooms(guild);
  const live = rooms.filter((r) => r.count > 0);
  const users = live.reduce((s, r) => s + r.count, 0);
  const locked = rooms.filter((r) => r.data.locked).length;
  const top = live.slice(0, 5);
  const max = top[0]?.count ?? 0;
  const now = Math.floor(Date.now() / 1000);

  const container = new ContainerBuilder().setAccentColor(ACCENT);

  if (banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${banner}`)
      )
    );
  } else {
    // no banner image → keep the numbers in text so the card still tells the story
    container
      .addTextDisplayComponents(
        text(
          `# 👑 ELITE VOICE\n` +
            `## 🔊 ${live.length} ${live.length === 1 ? 'Room' : 'Rooms'}  ・  👥 ${users} Online\n` +
            `-# 🔥 Hottest: ${top[0] ? `**${top[0].channel.name}**` : '—'}  •  🔒 ${locked} locked  •  🌐 ${
              rooms.length - locked
            } open`
        )
      );
  }

  container
    .addSeparatorComponents(sep(true))
    .addTextDisplayComponents(
      text(
        `### 🏆 Leaderboard\n` +
          `-# ${guild.name}  •  top ${top.length} of ${live.length} live ${live.length === 1 ? 'room' : 'rooms'}`
      )
    );

  if (!top.length) {
    container.addTextDisplayComponents(
      text('*Nobody is in voice right now.*\n*Join the create channel and open the first room.*')
    );
  }

  top.forEach((r, i) => {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small)
    );
    const block = roomBlock(r, i, max);
    const avatar = ownerAvatar(guild, r);
    if (avatar) {
      // owner's profile picture on the right of each room
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(block))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar))
      );
    } else {
      container.addTextDisplayComponents(text(block));
    }
  });

  const more = live.length - top.length;
  const idle = rooms.length - live.length;
  const extra = [];
  if (more > 0) extra.push(`+${more} more live ${more === 1 ? 'room' : 'rooms'}`);
  if (idle > 0) extra.push(`${idle} empty`);

  container
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(
      text(
        (extra.length ? `-# ${extra.join('  •  ')}\n` : '') +
          `-# 🔄 Updated <t:${now}:R>  •  every 20s  •  ELITE SYSTEM`
      )
    );

  return container;
}

// Full payload for sending a NEW message
function buildDashboardPayload(guild) {
  const banner = hasBanner();
  const payload = {
    components: [buildContainer(guild, banner ? BANNER_NAME : null)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }, // owner mentions show as names, never ping
  };
  if (banner) payload.files = [new AttachmentBuilder(BANNER_PATH, { name: BANNER_NAME })];
  return payload;
}

// Old name kept so other files that import it don't crash (returns a payload, not an embed)
const buildDashboardEmbed = buildDashboardPayload;

const busy = new Set();

async function refreshDashboard(guild) {
  const config = storage.getGuildConfig(guild.id);
  if (!config || !config.statsChannelId || !config.statsMessageId) return;
  if (busy.has(guild.id)) return;
  busy.add(guild.id);

  try {
    const channel = guild.channels.cache.get(config.statsChannelId);
    if (!channel) return;
    const message = await channel.messages.fetch(config.statsMessageId).catch(() => null);
    if (!message) return;

    // --- live animated banner (falls back to the old code below if it can't render) ---
    if (message.flags.has(MessageFlags.IsComponentsV2)) {
      const rooms = getRooms(guild);
      const data = {
        users: rooms.reduce((s, r) => s + r.count, 0),
        rooms: rooms.map((r, i) => ({
          count: r.count,
          locked: !!r.data.locked,
          name: r.channel.name,
          avatar:
            i < 3
              ? guild.members.cache.get(r.data.ownerId)?.displayAvatarURL({ extension: 'png', size: 128 }) || null
              : null,
        })),
      };
      const key = JSON.stringify(data);
      const old = [...message.attachments.values()].find(
        (a) => a.name && a.name.startsWith(LIVE_PREFIX)
      );
      let live = null;
      if (old && lastKey.get(guild.id) === key) {
        live = { name: old.name }; // nothing changed: keep the GIF already on the message
      } else {
        const gif = await renderStatsBanner(guild, data);
        if (gif) {
          const name = `${LIVE_PREFIX}${Date.now()}.gif`;
          live = { name, file: new AttachmentBuilder(gif, { name }) };
        } else if (old) {
          live = { name: old.name };
        }
      }
      if (live) {
        const payload = {
          components: [buildContainer(guild, live.name)],
          flags: MessageFlags.IsComponentsV2,
          allowedMentions: { parse: [] },
          attachments: live.file ? [] : [old],
        };
        if (live.file) payload.files = [live.file];
        const ok = await message.edit(payload).then(() => true).catch(() => false);
        if (ok && live.file) lastKey.set(guild.id, key);
        return;
      }
    }

    const bannerOn = hasBanner();
    const bannerAttached = message.attachments.some((a) => a.name === BANNER_NAME);
    const upToDate = message.flags.has(MessageFlags.IsComponentsV2) && bannerOn === bannerAttached;

    if (upToDate) {
      const { files, ...payload } = buildDashboardPayload(guild);
      if (bannerOn) payload.attachments = [...message.attachments.values()]; // keep the banner
      await message.edit(payload).catch(() => {});
      return;
    }

    // Old/different message: post a fresh one once, save its id, delete the old
    const fresh = await channel.send(buildDashboardPayload(guild)).catch(() => null);
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

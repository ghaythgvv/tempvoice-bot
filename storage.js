// Small JSON-file based storage. No database needed for this scale of bot.
// Everything is cached in memory and written to disk on every change, so a
// restart (e.g. your host redeploying the bot) doesn't lose anything:
// - which emoji each user last picked (so it comes back when they recreate a channel)
// - each user's saved channel settings — name, limit, locked state, trusted
//   list — restored automatically the next time they create a channel
// - the guild's join-to-create / category setup
// - which voice channels are currently "temp" channels, and their live state

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  userEmojis: path.join(DATA_DIR, 'userEmojis.json'),
  userSettings: path.join(DATA_DIR, 'userSettings.json'),
  tempChannels: path.join(DATA_DIR, 'tempChannels.json'),
  guildConfig: path.join(DATA_DIR, 'guildConfig.json'),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(file) {
  ensureDataDir();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`Could not parse ${file}, starting fresh:`, err.message);
    return {};
  }
}

function save(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const cache = {
  userEmojis: load(FILES.userEmojis),
  userSettings: load(FILES.userSettings),
  tempChannels: load(FILES.tempChannels),
  guildConfig: load(FILES.guildConfig),
};

module.exports = {
  // --- per-user emoji preference, so it comes back on the next channel they create ---
  getUserEmoji(userId) {
    return cache.userEmojis[userId] || null;
  },
  setUserEmoji(userId, emoji) {
    cache.userEmojis[userId] = emoji;
    save(FILES.userEmojis, cache.userEmojis);
  },

  // --- per-user saved channel settings (name, limit, locked, trusted list) ---
  getUserSettings(userId) {
    return cache.userSettings[userId] || null;
  },
  setUserSettings(userId, data) {
    cache.userSettings[userId] = { ...(cache.userSettings[userId] || {}), ...data };
    save(FILES.userSettings, cache.userSettings);
  },

  // --- live temp channel state ---
  getTempChannel(channelId) {
    return cache.tempChannels[channelId] || null;
  },
  getAllTempChannels() {
    return cache.tempChannels;
  },
  setTempChannel(channelId, data) {
    cache.tempChannels[channelId] = data;
    save(FILES.tempChannels, cache.tempChannels);
  },
  deleteTempChannel(channelId) {
    delete cache.tempChannels[channelId];
    save(FILES.tempChannels, cache.tempChannels);
  },

  // --- per-guild setup (category / join-to-create channel) ---
  getGuildConfig(guildId) {
    return cache.guildConfig[guildId] || null;
  },
  setGuildConfig(guildId, data) {
    cache.guildConfig[guildId] = { ...(cache.guildConfig[guildId] || {}), ...data };
    save(FILES.guildConfig, cache.guildConfig);
  },
};

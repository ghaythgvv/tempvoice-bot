// Small JSON-file based storage. No database needed for this scale of bot.
// Everything is cached in memory and written to disk on every change, so a
// restart (e.g. your host redeploying the bot) doesn't lose anything:
// - which emoji each user last picked (so it comes back when they recreate a channel)
// - each user's saved channel settings — name, limit, locked state, trusted
//   list — restored automatically the next time they create a channel
// - the guild's join-to-create / category setup
// - which voice channels are currently "temp" channels, and their live state
//
// IMPORTANT: on hosts with an ephemeral filesystem (Railway, Heroku, etc.),
// anything written to a plain local folder gets wiped on every redeploy or
// restart. RAILWAY_VOLUME_MOUNT_PATH is set automatically once a Railway
// Volume is attached to this service — when present, we write there instead,
// so saved settings actually survive redeploys. Locally (no volume), it
// falls back to a "data" folder next to this file, same as before.
 
const fs = require('fs');
const path = require('path');
 
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
 
if (!process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  console.warn(
    '[storage] No RAILWAY_VOLUME_MOUNT_PATH set — writing to a local folder that will NOT ' +
      'survive a redeploy on Railway. Attach a Volume to this service to fix that.'
  );
}
 
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
  try {
    ensureDataDir();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`ERROR: Could not save to ${file}: ${err.message}`);
    // Don't throw — let the bot continue; at worst a restart will lose this one change.
  }
}
 
const cache = {
  userEmojis: load(FILES.userEmojis),
  userSettings: load(FILES.userSettings),
  tempChannels: load(FILES.tempChannels),
  guildConfig: load(FILES.guildConfig),
};
 
console.log(`[storage] Using data directory: ${DATA_DIR}`);
 
module.exports = {
  // --- per-user emoji preference, so it comes back on the next channel they create ---
  getUserEmoji(userId) {
    return cache.userEmojis[userId] || null;
  },
  setUserEmoji(userId, emoji) {
    if (!userId || !emoji) {
      console.warn(`[storage] setUserEmoji: invalid userId or emoji`);
      return;
    }
    cache.userEmojis[userId] = emoji;
    save(FILES.userEmojis, cache.userEmojis);
  },
 
  // --- per-user saved channel settings (name, limit, locked, trusted list) ---
  getUserSettings(userId) {
    return cache.userSettings[userId] || null;
  },
  setUserSettings(userId, data) {
    if (!userId || !data) {
      console.warn(`[storage] setUserSettings: invalid userId or data`);
      return;
    }
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
    if (!channelId || !data) {
      console.warn(`[storage] setTempChannel: invalid channelId or data`);
      return;
    }
    cache.tempChannels[channelId] = data;
    save(FILES.tempChannels, cache.tempChannels);
  },
  deleteTempChannel(channelId) {
    if (!channelId) {
      console.warn(`[storage] deleteTempChannel: invalid channelId`);
      return;
    }
    delete cache.tempChannels[channelId];
    save(FILES.tempChannels, cache.tempChannels);
  },
 
  // --- per-guild setup (category / join-to-create channel) ---
  getGuildConfig(guildId) {
    return cache.guildConfig[guildId] || null;
  },
  setGuildConfig(guildId, data) {
    if (!guildId || !data) {
      console.warn(`[storage] setGuildConfig: invalid guildId or data`);
      return;
    }
    cache.guildConfig[guildId] = { ...(cache.guildConfig[guildId] || {}), ...data };
    save(FILES.guildConfig, cache.guildConfig);
  },
};

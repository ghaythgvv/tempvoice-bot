// Looks up the bot's own uploaded application emoji (Developer Portal ->
// your app -> Emojis) by name, for a genuinely-white icon set instead of
// Twemoji's fixed colors. Falls back to a plain Unicode emoji automatically
// if the matching custom one hasn't been uploaded (yet, or at all) — so the
// bot works fine either way, no code changes needed once you do upload them.

// Fixed custom emoji, supplied directly by ID rather than uploaded as
// application emoji — checked before the fetched cache below. Keyed to
// match the icon names used in panelView.js's ICONS map. The `name` field
// is cosmetic (Discord resolves the emoji by id), so it doesn't need to
// match whatever the emoji is actually called in its source server.
const FIXED_EMOJIS = {
  lock: { id: '1553472894976393246', name: 'lock' },
  unlock: { id: '1553483080998588456', name: 'unlock' },
  trust: { id: '1553472890601734325', name: 'trust' },
  untrust: { id: '1553472897757224980', name: 'untrust' },
  rename: { id: '1553472888906977300', name: '1000035568_purple_glow' },
  limit: { id: '1553472892111560754', name: 'limit' },
  change_emoji: { id: '1553472899589873784', name: 'change_emoji' },
  kick: { id: '1553472901301280870', name: 'kick' },
  transfer: { id: '1553472893583888475', name: 'transfer' },
  timer: { id: '1553596332025974864', name: 'timer' },
  delete: { id: '1553472896398270574', name: 'delete' },
  check: { id: '1553555472811040788', name: 'positivo' },
};

let cache = null; // Collection<id, ApplicationEmoji> | null until loaded

async function loadCustomIcons(client) {
  try {
    cache = await client.application.emojis.fetch();
    console.log(`[icons] loaded ${cache.size} custom application emoji`);
  } catch (err) {
    console.warn('[icons] could not load application emoji, using fallback icons:', err.message);
    cache = null;
  }
}

function find(name) {
  if (FIXED_EMOJIS[name]) return FIXED_EMOJIS[name];
  if (!cache) return null;
  return cache.find((e) => e.name === name) || null;
}

// For ButtonBuilder.setEmoji() / SelectMenuOption.emoji — accepts either a
// plain Unicode string or a {id, name} object.
function iconForComponent(name, fallbackUnicode) {
  const custom = find(name);
  return custom ? { id: custom.id, name: custom.name } : fallbackUnicode;
}

// For embed/message text — needs the <:name:id> markdown form.
function iconForText(name, fallbackUnicode) {
  const custom = find(name);
  return custom ? `<:${custom.name}:${custom.id}>` : fallbackUnicode;
}

module.exports = { loadCustomIcons, iconForComponent, iconForText };

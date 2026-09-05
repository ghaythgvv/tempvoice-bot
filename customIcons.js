// Looks up the bot's own uploaded application emoji (Developer Portal ->
// your app -> Emojis) by name, for a genuinely-white icon set instead of
// Twemoji's fixed colors. Falls back to a plain Unicode emoji automatically
// if the matching custom one hasn't been uploaded (yet, or at all) — so the
// bot works fine either way, no code changes needed once you do upload them.

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

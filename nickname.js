// Adding/removing the emoji prefix on a member's nickname.
//
// Design rules (these are what fix the "missing emoji" and "two emoji" bugs):
//  1. The nickname is always rebuilt as `<emoji> <base name>` after stripping
//     EVERY leading emoji first, so prefixes can never stack.
//  2. The emoji matcher understands multi-part emoji (ZWJ sequences such as
//     🐈‍⬛ = 🐈 + ZWJ + ⬛). The old matcher required a space right after the
//     first part, so 🐈‍⬛ was never stripped and the next emoji stacked on top.
//  3. Every change reads a FRESH copy of the member from Discord (discord.js
//     does not update its cached member when you call setNickname — only when
//     the gateway event arrives), and changes for the same member run one at
//     a time. Reading a stale cached nickname is what made the bot skip
//     "already correct" edits and leave people without an emoji.
//  4. A write is skipped when the nickname is already correct, and a small
//     loop guard stops a runaway rename loop if Discord ever rewrites a name
//     into something the bot keeps trying to "fix".

const MAX_NICK_LENGTH = 32;

// One emoji = a pictograph, optionally followed by VS16 / a skin tone, and
// optionally chained to more pictographs with ZWJ. The extra \u{1F300}-\u{1FAFF}
// range is a safety net for newer emoji (🪼 🫧 🪷 ...) if the host's Node/ICU
// Unicode tables are older than the emoji itself.
const PICTO = String.raw`[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}]`;
const VARIANT = String.raw`(?:\uFE0F|\p{Emoji_Modifier})?`;
const EMOJI_UNIT = String.raw`${PICTO}${VARIANT}(?:\u200D${PICTO}${VARIANT})*`;
const LEADING_EMOJI_RE = new RegExp(`^${EMOJI_UNIT}`, 'u');
const EMOJI_PREFIX_RE = new RegExp(`^${EMOJI_UNIT}\\s*`, 'u');

// The first emoji at the start of a string, or null.
function getLeadingEmoji(text) {
  const match = String(text ?? '').match(LEADING_EMOJI_RE);
  return match ? match[0] : null;
}

// Removes every emoji at the start of a name ("🌸 🎧 Ron" -> "Ron").
function stripEmojiPrefixes(name) {
  let result = String(name ?? '');
  for (let i = 0; i < 10; i++) {
    const next = result.replace(EMOJI_PREFIX_RE, '');
    if (next === result) break;
    result = next;
  }
  return result;
}

// ---- helpers -------------------------------------------------------------

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

// Cuts text to at most maxUnits UTF-16 units WITHOUT splitting an emoji or a
// surrogate pair in half (a plain .slice() can leave a broken character).
function truncate(text, maxUnits) {
  if (text.length <= maxUnits) return text;
  const parts = segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
  let out = '';
  for (const part of parts) {
    if ((out + part).length > maxUnits) break;
    out += part;
  }
  return out.trimEnd();
}

function buildNickname(emoji, base) {
  const prefix = `${emoji} `;
  return prefix + truncate(base, Math.max(1, MAX_NICK_LENGTH - prefix.length));
}

// Compare ignoring the invisible variation selector (Discord sometimes drops
// it) and stray outer spaces, so "already correct" is detected reliably.
const norm = (s) => String(s ?? '').replace(/\uFE0F/g, '').trim();

// ---- per-member queue ----------------------------------------------------

const chains = new Map();
function runExclusive(key, task) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(task);
  const tail = next.catch(() => {});
  chains.set(key, tail);
  tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return next;
}

// ---- loop guard + log throttling ----------------------------------------

const recentWrites = new Map();
function tooManyWrites(key) {
  const now = Date.now();
  const list = (recentWrites.get(key) || []).filter((t) => now - t < 60_000);
  if (list.length >= 4) {
    recentWrites.set(key, list);
    return true;
  }
  list.push(now);
  recentWrites.set(key, list);
  return false;
}

const warnedAt = new Map();
function warnOnce(key, message) {
  const last = warnedAt.get(key) || 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  warnedAt.set(key, Date.now());
  console.warn(message);
}

// ---- the actual nickname edit -------------------------------------------

// `member` must be a FRESH member. emoji = string -> set it, null -> remove it.
// Returns true only if a change was sent to Discord.
async function applyNickname(member, emoji) {
  const fallback = member.user.globalName || member.user.username;
  const current = member.nickname; // the SERVER nickname, or null if none

  let target;
  if (emoji) {
    const base = stripEmojiPrefixes(current ?? fallback).trim() || fallback;
    target = buildNickname(emoji, base);
    if (norm(target) === norm(current)) return false; // already correct
  } else {
    if (!current) return false;
    const clean = stripEmojiPrefixes(current).trim();
    if (clean === current) return false; // nothing to strip
    // Going back to the plain account name -> clear the server nickname
    // entirely instead of pinning a copy of it.
    target = clean && clean !== fallback ? clean : null;
  }

  const me = member.guild.members.me;
  if (!me || !me.permissions.has('ManageNicknames')) {
    warnOnce('perm:' + member.guild.id, '[nickname] the bot is missing the "Manage Nicknames" permission.');
    return false;
  }
  if (!member.manageable) {
    // Server owner, or a role at/above the bot's highest role. Discord will
    // NEVER allow the bot to rename these members — fix by moving the bot's
    // role higher in Server Settings > Roles (owner can't be renamed at all).
    warnOnce(
      'unmanageable:' + member.id,
      `[nickname] cannot rename ${member.user.tag}: they are the server owner or have a role above the bot's role.`
    );
    return false;
  }
  if (tooManyWrites(member.guild.id + ':' + member.id)) {
    console.warn(`[nickname] ${member.user.tag}: renamed 4x in a minute, pausing to avoid a loop.`);
    return false;
  }

  try {
    await member.setNickname(target, 'TempVC emoji sync');
    return true;
  } catch (err) {
    console.warn(`[nickname] could not update ${member.user.tag}: ${err.message}`);
    return false;
  }
}

// The one entry point voiceManager uses. Fetches a fresh member, THEN asks
// resolveEmoji(member) what the nickname should be:
//    string    -> put this emoji on the name
//    null      -> take the emoji off
//    undefined -> leave the nickname alone
function syncNickname(guild, memberId, resolveEmoji) {
  return runExclusive(`${guild.id}:${memberId}`, async () => {
    const member = await guild.members.fetch({ user: memberId, force: true }).catch(() => null);
    if (!member) return false;
    const emoji = await resolveEmoji(member);
    if (emoji === undefined) return false;
    return applyNickname(member, emoji);
  });
}

// Kept so existing callers keep working.
function applyEmojiToMember(member, emoji) {
  return syncNickname(member.guild, member.id, () => emoji);
}
function removeEmojiFromMember(member) {
  return syncNickname(member.guild, member.id, () => null);
}

module.exports = {
  applyEmojiToMember,
  removeEmojiFromMember,
  stripEmojiPrefixes,
  getLeadingEmoji,
  syncNickname,
  buildNickname,
  applyNickname, // exported for tests
};

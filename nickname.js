// Adding/removing the emoji prefix on a member's nickname. Self-healing by
// design: every apply/remove strips ANY leading emoji first (matched
// generically via Unicode, not against a fixed list) before doing anything
// else. That's what guarantees a member never ends up with more than one
// channel emoji stacked on their name, no matter which order events land in
// or which palette version applied an older one.

const MAX_NICK_LENGTH = 32;
const EMOJI_PREFIX_RE = /^\p{Extended_Pictographic}\uFE0F?\s/u;

function stripEmojiPrefixes(name) {
  let result = name;
  while (EMOJI_PREFIX_RE.test(result)) {
    result = result.replace(EMOJI_PREFIX_RE, '');
  }
  return result;
}

async function applyEmojiToMember(member, emoji) {
  try {
    const current = member.displayName;
    const clean = stripEmojiPrefixes(current);
    let name = `${emoji} ${clean}`;
    if (name.length > MAX_NICK_LENGTH) name = name.slice(0, MAX_NICK_LENGTH);
    if (name === current) return; // already correct, skip a redundant API call
    await member.setNickname(name);
  } catch (err) {
    // Most common cause: this member is the server owner, or has a role
    // above the bot's — Discord doesn't allow the bot to rename either.
    console.warn(`[nickname] could not update ${member.user.tag}: ${err.message}`);
  }
}

async function removeEmojiFromMember(member) {
  try {
    const current = member.displayName;
    const clean = stripEmojiPrefixes(current);
    if (clean === current) return; // nothing to strip
    await member.setNickname(clean.length > 0 ? clean : null);
  } catch (err) {
    console.warn(`[nickname] could not restore ${member.user.tag}: ${err.message}`);
  }
}

module.exports = { applyEmojiToMember, removeEmojiFromMember };

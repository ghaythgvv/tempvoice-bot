// Converts plain ASCII letters/digits to Mathematical Sans-Serif Bold
// Unicode equivalents — e.g. bold('like this') -> '𝗹𝗶𝗸𝗲 𝘁𝗵𝗶𝘀'. Used anywhere
// the bot shows text that can't use Discord's own ** markdown (button
// labels, select menu options/placeholders, modal titles/inputs) as well
// as embed text, for a consistent look everywhere.
//
// Only touches A-Z, a-z, 0-9 — spaces, punctuation, and emoji (including
// multi-codepoint ones) pass through untouched.
//
// IMPORTANT: never run this over text that embeds a Discord ID or token —
// a member mention (<@id>), a custom emoji tag (<:name:id>), or a relative
// timestamp (<t:unix:R>). Converting the digits inside those breaks Discord's
// parsing of the tag entirely. Only wrap the literal label text itself, and
// keep any such tag concatenated outside the bold() call.
const UPPER_START = 0x1d5d4; // Mathematical Sans-Serif Bold Capital A
const LOWER_START = 0x1d5ee; // Mathematical Sans-Serif Bold Small a
const DIGIT_START = 0x1d7ec; // Mathematical Sans-Serif Bold Digit Zero

function bold(str) {
  if (!str) return str;
  return String(str).replace(/[A-Za-z0-9]/g, (ch) => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(UPPER_START + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(LOWER_START + (code - 97));
    return String.fromCodePoint(DIGIT_START + (code - 48));
  });
}

module.exports = { bold };

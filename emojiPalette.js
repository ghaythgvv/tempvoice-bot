// The emoji a temp channel can be assigned — used for the random pick when a
// channel is first created, and for the options in the Change Emoji picker.
// Split into two sets purely because Discord caps a single select menu at 25
// options — the Change Emoji picker shows both menus together so it's still
// one pick, just from a bigger pool. Add, remove, or reorder freely, just
// keep each set at 25 or fewer.

const EMOJI_SET_A = [
  { emoji: '💕', label: 'Two Hearts' },
  { emoji: '🌸', label: 'Cherry Blossom' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👾', label: 'Alien Monster' },
  { emoji: '❤️', label: 'Red Heart' },
  { emoji: '🌼', label: 'Blossom' },
  { emoji: '☘️', label: 'Shamrock' },
  { emoji: '🌟', label: 'Glowing Star' },
  { emoji: '☀️', label: 'Sun' },
  { emoji: '🪐', label: 'Ringed Planet' },
  { emoji: '✨', label: 'Sparkles' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🐍', label: 'Snake' },
  { emoji: '🐈', label: 'Cat' },
  { emoji: '🐥', label: 'Baby Chick' },
  { emoji: '🫧', label: 'Bubbles' },
  { emoji: '🦋', label: 'Butterfly' },
  { emoji: '🦂', label: 'Scorpion' },
  { emoji: '🕷️', label: 'Spider' },
];

const EMOJI_SET_B = [
  { emoji: '🎀', label: 'Ribbon' },
  { emoji: '☁️', label: 'Cloud' },
  { emoji: '🧸', label: 'Teddy Bear' },
  { emoji: '🌷', label: 'Tulip' },
  { emoji: '🌙', label: 'Crescent Moon' },
  { emoji: '🍓', label: 'Strawberry' },
  { emoji: '🐇', label: 'Rabbit' },
  { emoji: '💌', label: 'Love Letter' },
  { emoji: '🪽', label: 'Wing' },
  { emoji: '🧁', label: 'Cupcake' },
  { emoji: '🎧', label: 'Headphone' },
  { emoji: '🪷', label: 'Lotus' },
  { emoji: '💗', label: 'Growing Heart' },
  { emoji: '🐚', label: 'Spiral Shell' },
  { emoji: '🕯️', label: 'Candle' },
  { emoji: '🦢', label: 'Swan' },
];

const EMOJI_PALETTE = [...EMOJI_SET_A, ...EMOJI_SET_B];

function randomEmoji() {
  return EMOJI_PALETTE[Math.floor(Math.random() * EMOJI_PALETTE.length)].emoji;
}

module.exports = { EMOJI_SET_A, EMOJI_SET_B, EMOJI_PALETTE, randomEmoji };

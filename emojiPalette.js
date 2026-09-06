// The emoji a temp channel can be assigned — used for the random pick when a
// channel is first created, and for the options in the Change Emoji picker.
// All emoji in one set for a single clean select menu.
// Supports multi-codepoint emoji like 🐈‍⬛ via proper Unicode handling.

const EMOJI_PALETTE = [
  { emoji: '🦢', label: 'Swan' },
  { emoji: '💖', label: 'Sparkling Heart' },
  { emoji: '🦋', label: 'Butterfly' },
  { emoji: '🫧', label: 'Bubbles' },
  { emoji: '🎀', label: 'Ribbon' },
  { emoji: '💕', label: 'Two Hearts' },
  { emoji: '🌸', label: 'Cherry Blossom' },
  { emoji: '🐥', label: 'Baby Chick' },
  { emoji: '💌', label: 'Love Letter' },
  { emoji: '🕯️', label: 'Candle' },
  { emoji: '✨', label: 'Sparkles' },
  { emoji: '🍭', label: 'Lollipop' },
  { emoji: '😍', label: 'Smiling Face Heart Eyes' },
  { emoji: '😋', label: 'Yum Face' },
  { emoji: '🥶', label: 'Cold Face' },
  { emoji: '💀', label: 'Skull' },
  { emoji: '👾', label: 'Alien Monster' },
  { emoji: '👻', label: 'Ghost' },
  { emoji: '👽', label: 'Alien' },
  { emoji: '🤡', label: 'Clown' },
  { emoji: '🙈', label: 'See No Evil Monkey' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '🎊', label: 'Confetti Ball' },
  { emoji: '😻', label: 'Smiling Cat Heart Eyes' },
  { emoji: '💋', label: 'Kiss Mark' },
  { emoji: '👀', label: 'Eyes' },
  { emoji: '🫀', label: 'Anatomical Heart' },
  { emoji: '🫂', label: 'People Hugging' },
  { emoji: '🪷', label: 'Lotus' },
  { emoji: '🍁', label: 'Maple Leaf' },
  { emoji: '🍄', label: 'Mushroom' },
  { emoji: '🌼', label: 'Blossom' },
  { emoji: '☘️', label: 'Shamrock' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '❄️', label: 'Snowflake' },
  { emoji: '🪐', label: 'Ringed Planet' },
  { emoji: '🌍', label: 'Earth Globe Europe-Africa' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🐈', label: 'Cat' },
  { emoji: '🐈‍⬛', label: 'Black Cat' },
  { emoji: '🐍', label: 'Snake' },
  { emoji: '🪼', label: 'Jellyfish' },
  { emoji: '🐙', label: 'Octopus' },
  { emoji: '🐚', label: 'Spiral Shell' },
  { emoji: '🦂', label: 'Scorpion' },
  { emoji: '🕷️', label: 'Spider' },
  { emoji: '🕸️', label: 'Spider Web' },
  { emoji: '🐾', label: 'Paw Prints' },
  { emoji: '🍓', label: 'Strawberry' },
  { emoji: '🍬', label: 'Candy' },
  { emoji: '🧁', label: 'Cupcake' },
  { emoji: '🎧', label: 'Headphone' },
  { emoji: '🔋', label: 'Battery' },
  { emoji: '👑', label: 'Crown' },
  { emoji: '💭', label: 'Thought Bubble' },
  { emoji: '⚜️', label: 'Fleur-de-lis' },
  { emoji: '♾️', label: 'Infinity' },
];

function randomEmoji() {
  return EMOJI_PALETTE[Math.floor(Math.random() * EMOJI_PALETTE.length)].emoji;
}

module.exports = { EMOJI_PALETTE, randomEmoji };


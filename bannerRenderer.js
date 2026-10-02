// bannerRenderer.js — turns live voice data into the animated ELITE banner GIF (Node side).
// Needs:  npm i @napi-rs/canvas gifenc
// Folders next to this file:  fonts/ (Poppins-Bold.ttf, Poppins-Medium.ttf)  and  assets/ (lightning-00.png ... lightning-18.png)
// If a package is missing, render returns null and the dashboard falls back to its text card.

const fs = require('fs');
const path = require('path');
const { drawBase, drawOverlay, drawPulse, W, H } = require('./bannerDraw');

const SCALE = 0.6;     // output size = 840x384. Raise toward 1 for sharper (bigger file), lower for smaller.
const FRAME_MS = 70;   // delay per frame
const LIGHTNING_ALPHA = 0.85;

let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch {
  console.warn('[banner] @napi-rs/canvas is not installed — using the text-only dashboard.');
}

let gifLib;
async function getGifLib() {
  if (gifLib !== undefined) return gifLib;
  try {
    const m = await import('gifenc');
    gifLib = m.GIFEncoder ? m : m.default;
  } catch {
    console.warn('[banner] gifenc is not installed — using the text-only dashboard.');
    gifLib = null;
  }
  return gifLib;
}

let fontsReady = false;
function registerFonts() {
  if (fontsReady || !canvasLib) return;
  const dir = path.join(__dirname, 'fonts');
  const reg = (file, family) => {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) canvasLib.GlobalFonts.registerFromPath(p, family);
    else console.warn(`[banner] missing font file: fonts/${file}`);
  };
  reg('Poppins-Bold.ttf', 'EliteBold');
  reg('Poppins-Medium.ttf', 'EliteMed');
  fontsReady = true;
}

let framesCache; // lightning frames (loaded once)
async function getFrames() {
  if (framesCache) return framesCache;
  const dir = path.join(__dirname, 'assets');
  const frames = [];
  for (let i = 0; ; i++) {
    const p = path.join(dir, `lightning-${String(i).padStart(2, '0')}.png`);
    if (!fs.existsSync(p)) break;
    frames.push(await canvasLib.loadImage(p));
  }
  if (!frames.length) console.warn('[banner] assets/lightning-00.png ... not found — no lightning.');
  framesCache = frames;
  return frames;
}

const iconCache = new Map(); // guild.id -> { url, image }
async function getIcon(guild) {
  const url = guild.iconURL({ extension: 'png', size: 256 });
  if (!url) return null;
  const cached = iconCache.get(guild.id);
  if (cached && cached.url === url) return cached.image;
  try {
    const res = await fetch(url);
    const image = await canvasLib.loadImage(Buffer.from(await res.arrayBuffer()));
    iconCache.set(guild.id, { url, image });
    return image;
  } catch {
    return null;
  }
}

const lastRender = new Map(); // guild.id -> { key, buf }  (skip re-encoding when nothing changed)

/** data: { users:number, rooms:[{count, locked}] } sorted by count desc → GIF Buffer or null */
async function renderStatsBanner(guild, data) {
  if (!canvasLib) return null;
  try {
    const gifenc = await getGifLib();
    if (!gifenc) return null;

    const key = JSON.stringify(data) + '|' + (guild.iconURL() || '');
    const prev = lastRender.get(guild.id);
    if (prev && prev.key === key) return prev.buf;

    registerFonts();
    const icon = await getIcon(guild);
    const frames = await getFrames();

    const w = Math.round(W * SCALE);
    const h = Math.round(H * SCALE);
    const make = () => {
      const c = canvasLib.createCanvas(w, h);
      const x = c.getContext('2d');
      x.scale(SCALE, SCALE);
      return [c, x];
    };

    // static layers, drawn once
    const [baseC, baseX] = make();
    drawBase(baseX);
    const [overC, overX] = make();
    const geo = drawOverlay(overX, data, icon);

    const [, ctx] = make();
    const gif = gifenc.GIFEncoder();
    const n = frames.length || 12;

    for (let i = 0; i < n; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(baseC, 0, 0);

      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      if (frames.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = LIGHTNING_ALPHA;
        ctx.drawImage(frames[i], 0, 0, W, H);
        ctx.restore();
      }
      ctx.drawImage(overC, 0, 0, W, H);
      drawPulse(ctx, geo, i / n);

      const rgba = ctx.getImageData(0, 0, w, h).data;
      const palette = gifenc.quantize(rgba, 256);
      const index = gifenc.applyPalette(rgba, palette);
      gif.writeFrame(index, w, h, { palette, delay: FRAME_MS });
    }
    gif.finish();

    const buf = Buffer.from(gif.bytes());
    lastRender.set(guild.id, { key, buf });
    return buf;
  } catch (err) {
    console.warn('[banner] render failed:', err.message);
    return null;
  }
}

module.exports = { renderStatsBanner };

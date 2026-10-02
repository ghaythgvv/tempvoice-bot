// bannerDraw.js — ELITE "Command Deck" banner. Pure Canvas 2D (no Node-only APIs),
// so it runs in @napi-rs/canvas on the bot and in a browser for previews.

const W = 1400;
const H = 640;
const F_BOLD = 'EliteBold, Arial, sans-serif';
const F_MED = 'EliteMed, Arial, sans-serif';

// ---------- helpers ----------
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// manual letter-spacing (works everywhere); returns total width
function tracked(ctx, str, x, y, spacing, align = 'left') {
  const chars = [...str];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  return total;
}

function goldGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(0.5, '#f7c548');
  g.addColorStop(1, '#c98a1b');
  return g;
}

function panel(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 28);
  ctx.fillStyle = "rgba(9,4,20,0.58)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(196,181,253,0.22)';
  ctx.stroke();
}

function label(ctx, str, x, y, align = 'left') {
  ctx.font = `20px ${F_MED}`;
  ctx.fillStyle = 'rgba(196,181,253,0.78)';
  tracked(ctx, str, x, y, 6, align);
}

// ---------- layers ----------
// 1) drawBase    : static dark background (gradients, glows, hairlines)
// 2) lightning   : animated frame blended with 'screen' (done by the caller)
// 3) drawOverlay : header + glass panels + live data (static for one render)
// 4) drawPulse   : tiny animated bits (LIVE ring, hottest-room glow)

function drawBase(ctx) {
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0b0614');
  bgGrad.addColorStop(0.55, '#16092c');
  bgGrad.addColorStop(1, '#07040f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  let g = ctx.createRadialGradient(230, 70, 0, 230, 70, 560);
  g.addColorStop(0, 'rgba(124,58,237,0.42)');
  g.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  g = ctx.createRadialGradient(1260, 590, 0, 1260, 590, 520);
  g.addColorStop(0, 'rgba(245,176,65,0.16)');
  g.addColorStop(1, 'rgba(245,176,65,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.022)';
  ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H * 0.7, 0);
    ctx.stroke();
  }
}

/**
 * Transparent overlay. Returns geometry used by drawPulse.
 * @param data { users:number, rooms:[{count:number, locked:boolean}] }  rooms sorted by count desc
 * @param icon image/canvas for the server icon, or null
 */
function drawOverlay(ctx, data, icon) {
  const rooms = data.rooms || [];
  const live = rooms.filter((r) => r.count > 0);
  const users = data.users ?? live.reduce((s, r) => s + r.count, 0);
  const locked = rooms.filter((r) => r.locked).length;
  const open = rooms.length - locked;
  const geo = { dot: null, top: null };

  // darken the header so the title stays crisp over the lightning
  const hv = ctx.createLinearGradient(0, 0, 0, 200);
  hv.addColorStop(0, 'rgba(8,3,18,0.78)');
  hv.addColorStop(1, 'rgba(8,3,18,0)');
  ctx.fillStyle = hv;
  ctx.fillRect(0, 0, W, 200);

  // gold frame
  rr(ctx, 14, 14, W - 28, H - 28, 30);
  ctx.lineWidth = 2;
  ctx.strokeStyle = goldGrad(ctx, 0, 0, W, H);
  ctx.globalAlpha = 0.45;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // ===== header =====
  const cx = 118, cy = 106, r = 54;
  ctx.save();
  ctx.shadowColor = 'rgba(247,197,72,0.6)';
  ctx.shadowBlur = 30;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = goldGrad(ctx, cx - r, cy - r, cx + r, cy + r);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (icon) {
    ctx.drawImage(icon, cx - r, cy - r, r * 2, r * 2);
  } else {
    const ig = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ig.addColorStop(0, '#7c3aed');
    ig.addColorStop(1, '#3b0f8c');
    ctx.fillStyle = ig;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `38px ${F_BOLD}`;
    tracked(ctx, 'ELT', cx, cy + 14, 2, 'center');
  }
  ctx.restore();

  ctx.font = `68px ${F_BOLD}`;
  ctx.fillStyle = '#ffffff';
  const wE = tracked(ctx, 'ELITE', 206, 114, 5);
  ctx.fillStyle = goldGrad(ctx, 206 + wE, 60, 206 + wE + 330, 120);
  tracked(ctx, 'VOICE', 206 + wE + 24, 114, 5);

  ctx.font = `20px ${F_MED}`;
  ctx.fillStyle = 'rgba(196,181,253,0.72)';
  tracked(ctx, 'LEADERS  COMMAND  DECK', 208, 152, 6);

  // LIVE pill
  const px = W - 44 - 150, py = 80;
  geo.dot = { x: px + 32, y: py + 25 };
  rr(ctx, px, py, 150, 50, 25);
  ctx.fillStyle = 'rgba(16,185,129,0.12)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(52,211,153,0.75)';
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = '#34d399';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(px + 32, py + 25, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#34d399';
  ctx.fill();
  ctx.restore();
  ctx.font = `24px ${F_BOLD}`;
  ctx.fillStyle = '#6ee7b7';
  tracked(ctx, 'LIVE', px + 54, py + 33, 5);

  // divider
  const dv = ctx.createLinearGradient(44, 0, W - 44, 0);
  dv.addColorStop(0, 'rgba(167,139,250,0)');
  dv.addColorStop(0.5, 'rgba(167,139,250,0.4)');
  dv.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = dv;
  ctx.fillRect(44, 192, W - 88, 2);

  // ===== hero: IN VOICE =====
  panel(ctx, 44, 220, 490, 244);
  label(ctx, 'IN VOICE', 76, 262);
  const digits = String(users).length;
  const size = digits <= 2 ? 180 : digits === 3 ? 150 : 118;
  ctx.font = `${size}px ${F_BOLD}`;
  const ng = ctx.createLinearGradient(0, 290, 0, 420);
  ng.addColorStop(0, '#ffffff');
  ng.addColorStop(1, '#fcd779');
  ctx.save();
  ctx.shadowColor = 'rgba(124,58,237,0.75)';
  ctx.shadowBlur = 40;
  ctx.fillStyle = ng;
  ctx.textAlign = 'left';
  ctx.fillText(String(users), 70, 412);
  ctx.restore();
  ctx.font = `21px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'left';
  ctx.fillText(users === 1 ? 'person connected right now' : 'people connected right now', 76, 446);

  // ===== podium: TOP ROOMS =====
  panel(ctx, 566, 220, 346, 244);
  label(ctx, 'TOP ROOMS', 596, 262);
  const colW = 88, colGap = 18;
  const x0 = 566 + (346 - (colW * 3 + colGap * 2)) / 2;
  const yBase = 440, maxH = 128, minH = 38;
  const top = live.slice(0, 3);
  const maxC = top[0] ? top[0].count : 0;
  const order = [1, 0, 2];
  const palettes = [
    ['#fff3c4', '#f7c548', '#b9791a'],
    ['#eef0fb', '#bfc4de', '#7c829f'],
    ['#f3c39a', '#d08a55', '#8f5228'],
  ];
  order.forEach((rank, col) => {
    const x = x0 + col * (colW + colGap);
    const room = top[rank];
    if (!room) {
      rr(ctx, x, yBase - 26, colW, 26, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fill();
      ctx.font = `28px ${F_BOLD}`;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      tracked(ctx, '—', x + colW / 2, yBase - 40, 0, 'center');
      return;
    }
    const h = minH + (maxC > 0 ? (room.count / maxC) * (maxH - minH) : 0);
    const p = palettes[rank];
    const bgd = ctx.createLinearGradient(0, yBase - h, 0, yBase);
    bgd.addColorStop(0, p[0]);
    bgd.addColorStop(0.45, p[1]);
    bgd.addColorStop(1, p[2]);
    ctx.save();
    if (rank === 0) {
      ctx.shadowColor = 'rgba(247,197,72,0.55)';
      ctx.shadowBlur = 26;
    }
    rr(ctx, x, yBase - h, colW, h, 14);
    ctx.fillStyle = bgd;
    ctx.fill();
    ctx.restore();
    ctx.font = `34px ${F_BOLD}`;
    ctx.fillStyle = '#ffffff';
    tracked(ctx, String(room.count), x + colW / 2, yBase - h - 12, 0, 'center');
    ctx.font = `28px ${F_BOLD}`;
    ctx.fillStyle = 'rgba(12,6,24,0.7)';
    tracked(ctx, String(rank + 1), x + colW / 2, yBase - 12, 0, 'center');
  });

  // ===== radar: ROOM RADAR =====
  panel(ctx, 944, 220, 412, 244);
  label(ctx, 'ROOM RADAR', 974, 262);
  ctx.font = `14px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  tracked(ctx, 'HOTTEST FIRST', 1326, 261, 3, 'right');

  const cols = 10, tile = 28, gap = 8;
  const rowsNeeded = Math.min(4, Math.max(3, Math.ceil(rooms.length / cols)));
  const total = cols * rowsNeeded;
  const gridH = rowsNeeded * tile + (rowsNeeded - 1) * gap;
  const gx = 944 + (412 - (cols * tile + (cols - 1) * gap)) / 2;
  const gy = 282 + (166 - gridH) / 2;
  for (let i = 0; i < total; i++) {
    const x = gx + (i % cols) * (tile + gap);
    const y = gy + Math.floor(i / cols) * (tile + gap);
    const room = rooms[i];
    if (i === 0 && room && room.count > 0) geo.top = { x, y, size: tile };
    ctx.save();
    if (!room) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
    } else if (room.count === 0) {
      ctx.fillStyle = 'rgba(167,139,250,0.16)';
    } else if (i === 0) {
      ctx.fillStyle = goldGrad(ctx, x, y, x + tile, y + tile);
      ctx.shadowColor = 'rgba(247,197,72,0.8)';
      ctx.shadowBlur = 16;
    } else if (room.count >= 8) {
      ctx.fillStyle = '#c4b5fd';
      ctx.shadowColor = 'rgba(196,181,253,0.7)';
      ctx.shadowBlur = 12;
    } else if (room.count >= 5) {
      ctx.fillStyle = '#8b5cf6';
      ctx.shadowColor = 'rgba(139,92,246,0.7)';
      ctx.shadowBlur = 10;
    } else if (room.count >= 3) {
      ctx.fillStyle = 'rgba(139,92,246,0.72)';
    } else {
      ctx.fillStyle = 'rgba(139,92,246,0.42)';
    }
    rr(ctx, x, y, tile, tile, 7);
    ctx.fill();
    ctx.restore();
    if (room && room.locked) {
      rr(ctx, x + tile / 2 - 4, y + tile / 2 - 4, 8, 8, 2.5);
      ctx.fillStyle = 'rgba(10,5,20,0.72)';
      ctx.fill();
    }
  }

  // ===== chips =====
  const chips = [
    ['LIVE ROOMS', String(live.length), '#a78bfa'],
    ['OPEN', String(open), '#34d399'],
    ['LOCKED', String(locked), '#fbbf24'],
    ['AVG / ROOM', live.length ? (users / live.length).toFixed(1) : '—', '#22d3ee'],
  ];
  const cGap = 18;
  const cW = (W - 88 - cGap * 3) / 4;
  chips.forEach(([name, val, color], i) => {
    const x = 44 + i * (cW + cGap);
    const y = 488;
    rr(ctx, x, y, cW, 88, 24);
    ctx.fillStyle = "rgba(9,4,20,0.58)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(196,181,253,0.14)';
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    rr(ctx, x + 18, y + 20, 5, 48, 3);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.font = `16px ${F_MED}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    tracked(ctx, name, x + 40, y + 34, 5);
    ctx.font = `40px ${F_BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(val, x + 40, y + 74);
  });

  // footer
  ctx.font = `14px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  tracked(ctx, 'AUTO-REFRESH EVERY 20 SECONDS   •   ELITE SYSTEM', W / 2, 618, 4, 'center');

  return geo;
}

function drawPulse(ctx, geo, phase) {
  if (!geo) return;
  const t = phase * Math.PI * 2;
  if (geo.dot) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(geo.dot.x, geo.dot.y, 7 + phase * 12, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(52,211,153,${(0.7 * (1 - phase)).toFixed(3)})`;
    ctx.stroke();
    ctx.restore();
  }
  if (geo.top) {
    const k = 0.5 + 0.5 * Math.sin(t);
    ctx.save();
    ctx.shadowColor = `rgba(247,197,72,${(0.45 + 0.45 * k).toFixed(3)})`;
    ctx.shadowBlur = 24;
    rr(ctx, geo.top.x, geo.top.y, geo.top.size, geo.top.size, 7);
    ctx.fillStyle = `rgba(255,236,170,${(0.12 + 0.28 * k).toFixed(3)})`;
    ctx.fill();
    ctx.restore();
  }
}

// Single still image (used for previews / fallback). bg = optional lightning frame.
function drawBanner(ctx, data, icon, bg) {
  drawBase(ctx);
  if (bg) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bg, 0, 0, W, H);
    ctx.restore();
  }
  const geo = drawOverlay(ctx, data, icon);
  drawPulse(ctx, geo, 0.25);
}

if (typeof module !== 'undefined') module.exports = { drawBase, drawOverlay, drawPulse, drawBanner, W, H };

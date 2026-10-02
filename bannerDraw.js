// bannerDraw.js — ELITE "Command Deck" banner v2. Pure Canvas 2D (no Node-only APIs),
// so it runs in @napi-rs/canvas on the bot and in a browser for previews.

const W = 1400;
const H = 780;
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

// rounded on the top corners only (podium pedestals)
function rrTop(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
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

// channel names are full of emoji / fancy fonts the banner font can't draw → keep plain letters
function cleanName(s, fallback) {
  const t = String(s || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019`]/g, "'")
    .replace(/[^A-Za-z0-9 ._'&!+\-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s._'&!+\-]+|[\s._'&!+\-]+$/g, '');
  return t || fallback;
}

function fit(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function panel(ctx, x, y, w, h) {
  rr(ctx, x, y, w, h, 30);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(26,12,52,0.66)');
  g.addColorStop(1, 'rgba(8,3,18,0.62)');
  ctx.fillStyle = g;
  ctx.fill();
  const s = ctx.createLinearGradient(0, y, 0, y + h);
  s.addColorStop(0, 'rgba(196,181,253,0.40)');
  s.addColorStop(0.5, 'rgba(196,181,253,0.14)');
  s.addColorStop(1, 'rgba(196,181,253,0.10)');
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = s;
  ctx.stroke();
  // soft top sheen
  ctx.save();
  rr(ctx, x, y, w, h, 30);
  ctx.clip();
  const sh = ctx.createLinearGradient(0, y, 0, y + 70);
  sh.addColorStop(0, 'rgba(167,139,250,0.10)');
  sh.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(x, y, w, 70);
  ctx.restore();
}

function label(ctx, str, x, y, align = 'left') {
  ctx.font = `20px ${F_MED}`;
  ctx.fillStyle = 'rgba(196,181,253,0.82)';
  tracked(ctx, str, x, y, 6, align);
}

function drawCrown(ctx, cx, bottom) {
  ctx.save();
  ctx.shadowColor = 'rgba(247,197,72,0.85)';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(cx - 24, bottom);
  ctx.lineTo(cx - 26, bottom - 22);
  ctx.lineTo(cx - 12, bottom - 11);
  ctx.lineTo(cx, bottom - 30);
  ctx.lineTo(cx + 12, bottom - 11);
  ctx.lineTo(cx + 26, bottom - 22);
  ctx.lineTo(cx + 24, bottom);
  ctx.closePath();
  ctx.fillStyle = goldGrad(ctx, cx - 26, bottom - 30, cx + 26, bottom);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(120,70,10,0.45)';
  ctx.fillRect(cx - 22, bottom - 5, 44, 3);
}

function avatarCircle(ctx, img, cx, cy, r, initial, pal, glow) {
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.strokeStyle = goldLike(ctx, cx, cy, r, pal);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const ig = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ig.addColorStop(0, '#7c3aed');
    ig.addColorStop(1, '#2e0f6b');
    ctx.fillStyle = ig;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(r * 0.95)}px ${F_BOLD}`;
    tracked(ctx, initial, cx, cy + r * 0.34, 0, 'center');
  }
  ctx.restore();
}

function goldLike(ctx, cx, cy, r, pal) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, pal[0]);
  g.addColorStop(0.5, pal[1]);
  g.addColorStop(1, pal[2]);
  return g;
}

// ---------- layers ----------
// 1) drawBase    : static dark background (gradients, glows, hairlines)
// 2) lightning   : animated frame blended with 'screen' (done by the caller)
// 3) drawOverlay : header + glass panels + live data (static for one render)
// 4) drawPulse   : animated bits (LIVE ring, equalizer, crown glow, hottest-room glow)

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

  g = ctx.createRadialGradient(720, 400, 0, 720, 400, 520);
  g.addColorStop(0, 'rgba(124,58,237,0.20)');
  g.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  g = ctx.createRadialGradient(1260, H - 50, 0, 1260, H - 50, 520);
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
 * @param data { users:number, rooms:[{count, locked, name?, avatarImg?}] }  rooms sorted by count desc
 * @param icon image/canvas for the server icon, or null
 */
function drawOverlay(ctx, data, icon) {
  const rooms = data.rooms || [];
  const live = rooms.filter((r) => r.count > 0);
  const users = data.users ?? live.reduce((s, r) => s + r.count, 0);
  const locked = rooms.filter((r) => r.locked).length;
  const open = rooms.length - locked;
  const geo = { dot: null, top: null, eq: null, crown: null };

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
  ctx.globalAlpha = 0.5;
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
  ctx.fillStyle = 'rgba(196,181,253,0.78)';
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
  dv.addColorStop(0.5, 'rgba(167,139,250,0.45)');
  dv.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = dv;
  ctx.fillRect(44, 192, W - 88, 2);

  // ===== hero: IN VOICE =====
  panel(ctx, 44, 220, 400, 380);
  label(ctx, 'IN VOICE', 76, 264);
  const digits = String(users).length;
  const size = digits <= 2 ? 196 : digits === 3 ? 156 : 120;
  ctx.font = `${size}px ${F_BOLD}`;
  const ng = ctx.createLinearGradient(0, 296, 0, 430);
  ng.addColorStop(0, '#ffffff');
  ng.addColorStop(1, '#fcd779');
  ctx.save();
  ctx.shadowColor = 'rgba(124,58,237,0.8)';
  ctx.shadowBlur = 44;
  ctx.fillStyle = ng;
  ctx.textAlign = 'left';
  ctx.fillText(String(users), 68, 430);
  ctx.restore();
  ctx.font = `21px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(users === 1 ? 'person connected right now' : 'people connected right now', 76, 468);
  geo.eq = { x: 76, bottom: 574, w: 336, h: 72, active: users > 0 };

  // ===== podium: TOP ROOMS =====
  panel(ctx, 468, 220, 536, 380);
  label(ctx, 'TOP ROOMS', 500, 264);
  ctx.font = `14px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  tracked(ctx, 'BY PEOPLE', 972, 263, 3, 'right');

  const colW = 150, colGap = 16;
  const x0 = 468 + (536 - (colW * 3 + colGap * 2)) / 2;
  const yBase = 574, hMax = 206, hMin = 136;
  const top = live.slice(0, 3);
  const maxC = top[0] ? top[0].count : 0;
  const order = [1, 0, 2];
  const palettes = [
    ['#fff1b8', '#f7c548', '#d99a22', '#8a560f'],
    ['#f4f6ff', '#c9cde4', '#9097b5', '#5b6080'],
    ['#f6cfa8', '#dc9560', '#a8622f', '#6b3a17'],
  ];
  const glows = ['rgba(247,197,72,0.75)', 'rgba(201,205,228,0.5)', 'rgba(220,149,96,0.5)'];

  // floor line under the podium
  const fl = ctx.createLinearGradient(486, 0, 986, 0);
  fl.addColorStop(0, 'rgba(196,181,253,0)');
  fl.addColorStop(0.5, 'rgba(196,181,253,0.35)');
  fl.addColorStop(1, 'rgba(196,181,253,0)');
  ctx.fillStyle = fl;
  ctx.fillRect(486, yBase, 500, 2);

  order.forEach((rank, col) => {
    const x = x0 + col * (colW + colGap);
    const mid = x + colW / 2;
    const room = top[rank];
    if (!room) {
      rrTop(ctx, x, yBase - 70, colW, 70, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(196,181,253,0.28)';
      ctx.stroke();
      ctx.restore();
      ctx.font = `13px ${F_MED}`;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      tracked(ctx, 'OPEN SLOT', mid, yBase - 28, 3, 'center');
      return;
    }
    const h = hMin + (maxC > 0 ? (room.count / maxC) * (hMax - hMin) : 0);
    const yTop = yBase - h;
    const p = palettes[rank];

    // pedestal
    ctx.save();
    if (rank === 0) {
      ctx.shadowColor = glows[0];
      ctx.shadowBlur = 34;
    }
    rrTop(ctx, x, yTop, colW, h, 18);
    const bg = ctx.createLinearGradient(0, yTop, 0, yBase);
    bg.addColorStop(0, p[0]);
    bg.addColorStop(0.3, p[1]);
    bg.addColorStop(0.75, p[2]);
    bg.addColorStop(1, p[3]);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // side shading + top highlight
    ctx.save();
    rrTop(ctx, x, yTop, colW, h, 18);
    ctx.clip();
    const side = ctx.createLinearGradient(x, 0, x + colW, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.20)');
    side.addColorStop(0.45, 'rgba(255,255,255,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.26)');
    ctx.fillStyle = side;
    ctx.fillRect(x, yTop, colW, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 12, yTop + 3, colW - 24, 3);
    ctx.restore();

    // count + name + status on the pedestal face
    ctx.font = `58px ${F_BOLD}`;
    ctx.fillStyle = '#1b0b36';
    tracked(ctx, String(room.count), mid, yTop + 68, 0, 'center');
    ctx.font = `19px ${F_BOLD}`;
    ctx.fillStyle = 'rgba(27,11,54,0.9)';
    const nm = fit(ctx, cleanName(room.name, 'Room ' + (rank + 1)), colW - 14);
    tracked(ctx, nm, mid, yTop + 100, 0, 'center');
    ctx.font = `12px ${F_MED}`;
    ctx.fillStyle = 'rgba(27,11,54,0.55)';
    tracked(ctx, room.locked ? 'LOCKED' : 'OPEN', mid, yBase - 14, 3, 'center');

    // avatar medal
    const ar = 42;
    const acy = yTop - ar - 10;
    const initial = cleanName(room.name, '?').charAt(0).toUpperCase();
    avatarCircle(ctx, room.avatarImg || null, mid, acy, ar, initial, p, glows[rank]);

    // rank badge
    const bx = mid + ar * 0.78, by = acy + ar * 0.78;
    ctx.beginPath();
    ctx.arc(bx, by, 16, 0, Math.PI * 2);
    ctx.fillStyle = goldLike(ctx, bx, by, 16, p);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(12,6,24,0.85)';
    ctx.stroke();
    ctx.font = `19px ${F_BOLD}`;
    ctx.fillStyle = '#1b0b36';
    tracked(ctx, String(rank + 1), bx, by + 7, 0, 'center');

    if (rank === 0) {
      drawCrown(ctx, mid, acy - ar - 10);
      geo.crown = { x: mid, y: acy - ar - 22 };
    }
  });

  // ===== radar: ROOM RADAR =====
  panel(ctx, 1028, 220, 328, 380);
  label(ctx, 'ROOM RADAR', 1058, 264);

  const cols = 8, tile = 28, gap = 10;
  const rowsNeeded = Math.min(7, Math.max(5, Math.ceil(rooms.length / cols)));
  const total = cols * rowsNeeded;
  const gridH = rowsNeeded * tile + (rowsNeeded - 1) * gap;
  const gx = 1028 + (328 - (cols * tile + (cols - 1) * gap)) / 2;
  const gy = 290 + (266 - gridH) / 2;
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
  ctx.font = `12px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  tracked(ctx, 'HOTTEST FIRST  •  DOT = LOCKED', 1058, 580, 2);

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
    const y = 624;
    rr(ctx, x, y, cW, 92, 24);
    const cg = ctx.createLinearGradient(0, y, 0, y + 92);
    cg.addColorStop(0, 'rgba(22,10,44,0.66)');
    cg.addColorStop(1, 'rgba(8,3,18,0.62)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(196,181,253,0.18)';
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    rr(ctx, x + 18, y + 22, 5, 48, 3);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.font = `16px ${F_MED}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    tracked(ctx, name, x + 40, y + 36, 5);
    ctx.font = `42px ${F_BOLD}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText(val, x + 40, y + 78);
  });

  // footer
  ctx.font = `14px ${F_MED}`;
  ctx.fillStyle = 'rgba(255,255,255,0.36)';
  tracked(ctx, 'AUTO-REFRESH EVERY 20 SECONDS   •   ELITE SYSTEM', W / 2, H - 28, 4, 'center');

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

  if (geo.crown) {
    const k = 0.5 + 0.5 * Math.sin(t + 1.2);
    const g = ctx.createRadialGradient(geo.crown.x, geo.crown.y, 0, geo.crown.x, geo.crown.y, 70);
    g.addColorStop(0, `rgba(255,226,140,${(0.10 + 0.22 * k).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,226,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(geo.crown.x - 70, geo.crown.y - 70, 140, 140);
  }

  if (geo.eq) {
    const { x, bottom, w, h, active } = geo.eq;
    const n = 24, bw = 8;
    const step = (w - bw) / (n - 1);
    const grad = ctx.createLinearGradient(0, bottom - h, 0, bottom);
    grad.addColorStop(0, '#ddd6fe');
    grad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = grad;
    ctx.globalAlpha = active ? 0.9 : 0.35;
    for (let j = 0; j < n; j++) {
      const a = Math.sin(t * (1 + (j % 3)) + j * 0.9);
      const b = Math.sin(t * (1 + ((j + 1) % 2)) + j * 1.7);
      const v = 0.5 + 0.25 * a + 0.25 * b;
      const bh = 8 + (h - 8) * (active ? 0.18 + 0.82 * v : 0.05);
      rr(ctx, x + j * step, bottom - bh, bw, bh, 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

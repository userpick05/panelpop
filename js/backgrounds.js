// PANEL POP — layered parallax environments behind the play boards.
//
// Donkey-Kong-Country-style depth built in layers, back to front:
//   sky gradient -> celestial -> far silhouette -> mid silhouette ->
//   ground plane (the boards sit ON this) -> ground-line accents.
// The static layers are pre-rendered once per theme into an offscreen
// canvas at boot; only the cheap ambient motion (clouds, stars, shimmer,
// drifting motes) is drawn live each frame. Everything here is render-only
// and never touches the deterministic sim.
'use strict';

(function () {

var W = 480, H = 270;

// ---- palette-driven theme table -------------------------------------------
// horizon = y where sky meets ground. Boards stand as towers rising out of
// the ground plane in front of the vista.
var THEMES = [
  { // 0 MEADOW — calm pastoral day
    name: 'MEADOW', horizon: 104,
    sky: ['#8fd0f0', '#bfe6f5', '#e8f6fb'],
    ground: ['#6fb84e', '#4f9838', '#3c7a2c'],
    far: { kind: 'hills', color: '#9fd6b0', y: 104, amp: 10, step: 46 },
    mid: { kind: 'hills', color: '#7cc06a', y: 118, amp: 16, step: 62 },
    cel: { kind: 'sun', x: 372, y: 52, r: 16, color: '#fff2b0', glow: '#ffe07a' },
    anim: 'clouds', accent: 'grass'
  },
  { // 1 DUSK DUNES — warm low sun over sand
    name: 'DUSK DUNES', horizon: 112,
    sky: ['#f2a35a', '#f6c07e', '#fbe0b0'],
    ground: ['#d8a25a', '#b87e3e', '#8f5e2c'],
    far: { kind: 'dunes', color: '#e8b878', y: 112, amp: 12, step: 70 },
    mid: { kind: 'dunes', color: '#cf9a5a', y: 126, amp: 18, step: 90 },
    cel: { kind: 'sun', x: 240, y: 78, r: 22, color: '#fff0c8', glow: '#ffb060' },
    anim: 'clouds', accent: 'palm'
  },
  { // 2 NIGHT — starfield, moon, aurora
    name: 'NIGHT', horizon: 108,
    sky: ['#1b1f4a', '#2a2f66', '#3d3f7a'],
    ground: ['#2e3466', '#242a52', '#1a1e3e'],
    far: { kind: 'mountains', color: '#2a2e5c', y: 108, amp: 28, step: 58 },
    mid: { kind: 'mountains', color: '#20244c', y: 124, amp: 20, step: 42 },
    cel: { kind: 'moon', x: 384, y: 46, r: 14, color: '#f4f2ff', glow: '#8890d0' },
    anim: 'stars', accent: 'grass_night'
  },
  { // 3 CAVERN — glowing crystals underground
    name: 'CAVERN', horizon: 96,
    sky: ['#241a3e', '#2e2350', '#3a2d64'],
    ground: ['#3a2d5c', '#2c2248', '#1e1836'],
    far: { kind: 'crystals', color: '#5a4a8c', y: 96, amp: 22, step: 40 },
    mid: { kind: 'crystals', color: '#7a5aa8', y: 118, amp: 30, step: 54 },
    cel: { kind: 'none' },
    anim: 'spores', accent: 'crystal'
  },
  { // 4 SKY ISLES — bright floating cloud kingdom
    name: 'SKY ISLES', horizon: 116,
    sky: ['#66c8ee', '#9fe0f4', '#dff4fb'],
    ground: ['#bfe8f6', '#9fd6ee', '#7fc0e0'],
    far: { kind: 'cloudbank', color: '#eaf6fc', y: 100, amp: 12, step: 60 },
    mid: { kind: 'cloudbank', color: '#cfeafa', y: 122, amp: 18, step: 78 },
    cel: { kind: 'sun', x: 388, y: 44, r: 18, color: '#fffde8', glow: '#fff0a8' },
    anim: 'birds', accent: 'none'
  },
  { // 5 SEASIDE — sun over shimmering ocean
    name: 'SEASIDE', horizon: 110,
    sky: ['#7fc6ef', '#b6e2f5', '#e6f6fc'],
    ground: ['#3f8fc8', '#2f77b0', '#245f90'],
    far: { kind: 'sails', color: '#eef6fb', y: 110, amp: 0, step: 0 },
    mid: { kind: 'flat', color: '#3f8fc8', y: 110 },
    cel: { kind: 'sun', x: 250, y: 60, r: 18, color: '#fff4cc', glow: '#ffd070' },
    anim: 'shimmer', accent: 'sand'
  },
  { // 6 EMBER — dark volcanic (boss)
    name: 'EMBER', horizon: 104,
    sky: ['#2a1420', '#4a1e28', '#7a3020'],
    ground: ['#3a1c1c', '#2a1414', '#1c0e0e'],
    far: { kind: 'mountains', color: '#3a1a1c', y: 104, amp: 30, step: 60 },
    mid: { kind: 'mountains', color: '#28131a', y: 122, amp: 22, step: 46 },
    cel: { kind: 'none' },
    anim: 'embers', accent: 'rock'
  }
];

var RngRef = window.Rng;
var statics = [];      // pre-rendered offscreen canvas per theme
var activeIdx = -1;
var motes = [];        // ambient particles for the active theme
var stars = [];
var clouds = [];
var birds = [];

// ---- small helpers --------------------------------------------------------

function lerpHex(a, b, t) {
  var ai = parseInt(a.slice(1), 16), bi = parseInt(b.slice(1), 16);
  var ar = ai >> 16, ag = (ai >> 8) & 255, ab = ai & 255;
  var br = bi >> 16, bg = (bi >> 8) & 255, bb = bi & 255;
  var r = Math.round(ar + (br - ar) * t);
  var g = Math.round(ag + (bg - ag) * t);
  var bl = Math.round(ab + (bb - ab) * t);
  return 'rgb(' + r + ',' + g + ',' + bl + ')';
}

function mkCanvas() {
  var cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  return cv;
}

// deterministic silhouette rows so each theme's mountains are stable
function silhouette(ctx, seed, baseY, amp, step, color, kind) {
  var rng = new RngRef(seed);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY);
  var x = 0, y = baseY;
  while (x <= W) {
    var nx = x + step * (0.6 + rng.next() * 0.8);
    if (kind === 'mountains' || kind === 'crystals') {
      // jagged peaks
      var peak = baseY - amp * (0.5 + rng.next());
      ctx.lineTo((x + nx) / 2, peak);
      ctx.lineTo(nx, baseY - (kind === 'crystals' ? amp * 0.2 * rng.next() : 0));
    } else {
      // rolling hills / dunes / cloudbanks — smooth-ish bumps
      var midx = (x + nx) / 2;
      var h = baseY - amp * (0.5 + rng.next());
      ctx.quadraticCurveTo(midx, h, nx, baseY + (rng.next() - 0.5) * amp * 0.3);
    }
    x = nx;
  }
  ctx.lineTo(W, baseY);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

function drawSun(ctx, c) {
  // soft glow
  var g = ctx.createRadialGradient(c.x, c.y, c.r * 0.3, c.x, c.y, c.r * 3.2);
  g.addColorStop(0, c.glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = g;
  ctx.fillRect(c.x - c.r * 3.2, c.y - c.r * 3.2, c.r * 6.4, c.r * 6.4);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.color;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawMoon(ctx, c) {
  var g = ctx.createRadialGradient(c.x, c.y, c.r * 0.4, c.x, c.y, c.r * 3);
  g.addColorStop(0, c.glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = g;
  ctx.fillRect(c.x - c.r * 3, c.y - c.r * 3, c.r * 6, c.r * 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.color;
  ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
  // craters
  ctx.fillStyle = 'rgba(140,144,208,0.35)';
  ctx.beginPath(); ctx.arc(c.x - 4, c.y - 3, 3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 4, c.y + 4, 2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(c.x + 2, c.y - 5, 1.5, 0, 7); ctx.fill();
}

// ground plane: receding floor from horizon to bottom, subtle perspective
function drawGround(ctx, th) {
  var hy = th.horizon;
  // vertical gradient darker at horizon -> ground color at front
  var g = ctx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, th.ground[2]);
  g.addColorStop(0.5, th.ground[1]);
  g.addColorStop(1, th.ground[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, W, H - hy);
  // perspective lines converging toward a vanishing point on the horizon
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  var vx = W / 2;
  for (var i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.moveTo(vx, hy);
    ctx.lineTo(vx + i * 90, H);
    ctx.stroke();
  }
  // horizontal depth bands
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  for (var d = 1; d <= 5; d++) {
    var yy = hy + (H - hy) * (d * d) / 30;
    if (yy >= H) break;
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }
  // horizon haze line
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.fillRect(0, hy - 1, W, 2);
}

function drawSeaShimmerStatic(ctx, th) {
  // static ocean base drawn as the "ground"; live shimmer added each frame
  var hy = th.horizon;
  var g = ctx.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, th.ground[2]);
  g.addColorStop(1, th.ground[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, W, H - hy);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, hy - 1, W, 2);
}

// palms / trees / crystals along a ground line
function accents(ctx, seed, th) {
  var rng = new RngRef(seed + 777);
  var kind = th.accent;
  if (kind === 'none') return;
  var y = th.horizon + 4;
  for (var i = 0; i < 14; i++) {
    var x = rng.int(W);
    // keep dense accents from the central play columns is unnecessary — they
    // sit near the horizon and get overlapped by the board towers anyway
    if (kind === 'grass' || kind === 'grass_night') {
      ctx.fillStyle = kind === 'grass' ? '#3c7a2c' : '#1a2038';
      for (var b = 0; b < 3; b++) ctx.fillRect(x + b * 2, y - 4 - (b === 1 ? 2 : 0), 1, 5);
    } else if (kind === 'palm') {
      ctx.fillStyle = '#6a4a2a';
      ctx.fillRect(x, y - 12, 2, 12);
      ctx.fillStyle = '#3f7a3a';
      ctx.fillRect(x - 5, y - 12, 5, 2);
      ctx.fillRect(x + 2, y - 12, 5, 2);
      ctx.fillRect(x - 4, y - 14, 4, 2);
      ctx.fillRect(x + 2, y - 14, 4, 2);
    } else if (kind === 'crystal') {
      var ch = ['#8a6ac0', '#6ac0b0', '#c06a9a'][rng.int(3)];
      ctx.fillStyle = ch;
      var chh = 6 + rng.int(8);
      ctx.beginPath();
      ctx.moveTo(x, y - chh); ctx.lineTo(x - 3, y); ctx.lineTo(x + 3, y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x - 1, y - chh + 2, 1, chh - 2);
    } else if (kind === 'sand' || kind === 'rock') {
      ctx.fillStyle = kind === 'sand' ? '#d8c088' : '#2a1414';
      ctx.fillRect(x, y - 2, 3 + rng.int(4), 2);
    }
  }
}

// ---- build static layers per theme ---------------------------------------

function buildTheme(idx) {
  var th = THEMES[idx];
  var cv = mkCanvas();
  var ctx = cv.getContext('2d');
  var seed = 1000 + idx * 97;

  // sky gradient
  var sg = ctx.createLinearGradient(0, 0, 0, th.horizon + 20);
  sg.addColorStop(0, th.sky[0]);
  sg.addColorStop(0.6, th.sky[1]);
  sg.addColorStop(1, th.sky[2]);
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, W, th.horizon + 20);

  // celestial
  if (th.cel.kind === 'sun') drawSun(ctx, th.cel);
  else if (th.cel.kind === 'moon') drawMoon(ctx, th.cel);

  // far + mid silhouettes
  var f = th.far, m = th.mid;
  if (f.kind === 'sails') {
    // seaside: distant sailboats sit on the water line
    drawSeaShimmerStatic(ctx, th);
    var rng = new RngRef(seed + 5);
    for (var s = 0; s < 4; s++) {
      var sx = 40 + rng.int(W - 80), sy = th.horizon - 2;
      ctx.fillStyle = '#f6fbff';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy); ctx.lineTo(sx + 7, sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8dcea';
      ctx.fillRect(sx - 4, sy, 12, 2);
    }
  } else if (m.kind === 'flat') {
    // handled by sails branch above (sea already drawn)
  } else {
    silhouette(ctx, seed + 1, f.y, f.amp, f.step, f.color, f.kind);
    silhouette(ctx, seed + 2, m.y, m.amp, m.step, m.color, m.kind);
  }

  // ground (skip for seaside — water already drawn)
  if (f.kind !== 'sails') drawGround(ctx, th);

  // ground-line accents (behind the boards)
  accents(ctx, seed, th);

  // gentle overall darkening so panels always win the contrast fight
  ctx.fillStyle = 'rgba(10,10,26,0.14)';
  ctx.fillRect(0, 0, W, H);

  statics[idx] = cv;
}

function build() {
  for (var i = 0; i < THEMES.length; i++) buildTheme(i);
}

// ---- ambient (live) layers ------------------------------------------------

function initAnim(idx) {
  var th = THEMES[idx];
  motes = []; stars = []; clouds = []; birds = [];
  var i;
  if (th.anim === 'clouds') {
    for (i = 0; i < 5; i++)
      clouds.push({ x: Math.random() * W, y: 16 + Math.random() * (th.horizon - 40),
        s: 3 + Math.random() * 5, v: 0.06 + Math.random() * 0.08 });
  } else if (th.anim === 'stars') {
    for (i = 0; i < 46; i++)
      stars.push({ x: Math.random() * W, y: Math.random() * (th.horizon - 6),
        p: Math.random() * 6.28, tw: 0.6 + Math.random() * 2 });
  } else if (th.anim === 'birds') {
    for (i = 0; i < 3; i++)
      birds.push({ x: Math.random() * W, y: 24 + Math.random() * 50,
        v: 0.15 + Math.random() * 0.1, p: Math.random() * 6.28 });
    for (i = 0; i < 4; i++)
      clouds.push({ x: Math.random() * W, y: 20 + Math.random() * 60,
        s: 4 + Math.random() * 6, v: 0.05 + Math.random() * 0.06 });
  } else if (th.anim === 'spores') {
    for (i = 0; i < 26; i++)
      motes.push({ x: Math.random() * W, y: Math.random() * H,
        v: 0.1 + Math.random() * 0.15, drift: Math.random() * 6.28,
        c: ['#8a6ac0', '#6ac0b0', '#cfaef0'][i % 3] });
  } else if (th.anim === 'embers') {
    for (i = 0; i < 30; i++)
      motes.push({ x: Math.random() * W, y: th.horizon + Math.random() * (H - th.horizon),
        v: 0.3 + Math.random() * 0.5, drift: Math.random() * 6.28,
        c: Math.random() < 0.5 ? '#ff8040' : '#ffc060' });
  }
}

function drawClouds(ctx) {
  for (var i = 0; i < clouds.length; i++) {
    var c = clouds[i];
    c.x += c.v;
    if (c.x - c.s * 3 > W) c.x = -c.s * 3;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#ffffff';
    var s = c.s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, s, 0, 6.29);
    ctx.arc(c.x + s, c.y + 2, s * 0.8, 0, 6.29);
    ctx.arc(c.x - s, c.y + 2, s * 0.7, 0, 6.29);
    ctx.arc(c.x + s * 0.4, c.y - s * 0.5, s * 0.7, 0, 6.29);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawStars(ctx, frame) {
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(frame * 0.05 * s.tw + s.p));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
    if (s.tw > 1.6 && a > 0.7) { // bright ones sparkle a cross
      ctx.fillRect((s.x | 0) - 1, s.y | 0, 3, 1);
      ctx.fillRect(s.x | 0, (s.y | 0) - 1, 1, 3);
    }
  }
  ctx.globalAlpha = 1;
  // occasional shooting star
  var cyc = frame % 520;
  if (cyc < 26) {
    var t = cyc / 26;
    var sx = 40 + t * 180, sy = 20 + t * 40;
    ctx.globalAlpha = (1 - t) * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 10, sy - 4); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawAuroraOrShimmer() {} // reserved

function drawBirds(ctx, frame) {
  drawClouds(ctx);
  ctx.strokeStyle = 'rgba(40,44,70,0.6)';
  ctx.lineWidth = 1;
  for (var i = 0; i < birds.length; i++) {
    var b = birds[i];
    b.x += b.v;
    if (b.x - 6 > W) { b.x = -6; b.y = 24 + Math.random() * 50; }
    var flap = Math.sin(frame * 0.2 + b.p) * 2;
    ctx.beginPath();
    ctx.moveTo(b.x - 3, b.y + flap);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(b.x + 3, b.y + flap);
    ctx.stroke();
  }
}

function drawMotes(ctx, frame) {
  for (var i = 0; i < motes.length; i++) {
    var m = motes[i];
    m.y -= m.v;
    m.x += Math.sin(frame * 0.03 + m.drift) * 0.3;
    if (m.y < -2) { m.y = H + 2; m.x = Math.random() * W; }
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(frame * 0.08 + m.drift);
    ctx.fillStyle = m.c;
    ctx.fillRect(m.x | 0, m.y | 0, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawShimmer(ctx, th, frame) {
  // horizontal light bands rolling across the sea
  var hy = th.horizon;
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  for (var r = 0; r < 10; r++) {
    var yy = hy + 6 + r * ((H - hy) / 10);
    var phase = Math.sin(frame * 0.04 + r * 0.9);
    var wdt = 30 + 40 * (r / 10);
    var xx = (W / 2) + phase * (40 + r * 8) - wdt / 2;
    ctx.fillRect(xx, yy, wdt, 1);
  }
  ctx.globalAlpha = 1;
  // sun glitter column
  ctx.globalAlpha = 0.25;
  for (var g = 0; g < 8; g++) {
    var gy = hy + 4 + g * ((H - hy) / 9);
    var gw = 6 + Math.abs(Math.sin(frame * 0.1 + g)) * 8;
    ctx.fillRect(250 - gw / 2, gy, gw, 1);
  }
  ctx.globalAlpha = 1;
}

// ---- public draw ----------------------------------------------------------

function draw(ctx, idx, frame) {
  idx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
  if (!statics[idx]) buildTheme(idx);
  if (idx !== activeIdx) { activeIdx = idx; initAnim(idx); }
  var th = THEMES[idx];

  ctx.drawImage(statics[idx], 0, 0);

  switch (th.anim) {
    case 'clouds': drawClouds(ctx); break;
    case 'stars': drawStars(ctx, frame); break;
    case 'birds': drawBirds(ctx, frame); break;
    case 'spores': drawMotes(ctx, frame); break;
    case 'embers': drawMotes(ctx, frame); break;
    case 'shimmer': drawShimmer(ctx, th, frame); break;
  }
}

// platform slab + cast shadow so a board reads as standing on the ground
function platform(ctx, ox, oy, idx, w, h) {
  idx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
  var th = THEMES[idx];
  // the board's own 3px frame border ends at oy+h+3; sit the slab just below
  // that so its lit top face actually peeks out and reads as a floor the
  // tower stands on (not buried under the border).
  var by = oy + h + 3;             // slab top, clear of the board border
  var cx = ox + w / 2;
  // soft cast shadow on the floor, a touch beyond the slab
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, by + 11, w / 2 + 13, 6, 0, 0, 6.29);
  ctx.fill();
  ctx.globalAlpha = 1;
  // slab: lit top face + shaded front face + dark base line, themed. Wider
  // than the tower so it reads as a plinth it stands on.
  var top = th.ground[1], front = th.ground[2], edge = th.ground[0];
  ctx.fillStyle = front;
  ctx.fillRect(ox - 9, by + 3, w + 18, 8);
  ctx.fillStyle = top;
  ctx.fillRect(ox - 9, by, w + 18, 4);
  ctx.fillStyle = edge;
  ctx.fillRect(ox - 9, by + 10, w + 18, 1);
  // top bevel highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(ox - 9, by, w + 18, 1);
  // front-face shadow gradient for a little roundness
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(ox - 9, by + 8, w + 18, 3);
}

function themeName(idx) {
  idx = ((idx % THEMES.length) + THEMES.length) % THEMES.length;
  return THEMES[idx].name;
}

window.Backgrounds = {
  build: build, draw: draw, platform: platform,
  count: THEMES.length, themeName: themeName
};

})();

// PANEL POP — abstract ambient backgrounds behind the play boards.
//
// A slow drifting color "nebula" wash + soft rising bokeh orbs, tuned dark
// and muted so the panels always stay the star. No scenery, no ground — each
// board floats on the wash with a dark halo behind it for separation.
//
// Reactive: pulse(cx, amount) brightens a region of the wash when a bold
// garbage drop lands there (bigger attack -> brighter flourish). The whole
// thing is render-only and never touches the deterministic sim. Ambient
// motion is advanced in tick() at the fixed sim rate (called from the game
// update) so the feel is identical on 60/120/144 Hz displays.
'use strict';

(function () {

var W = 480, H = 270;

// per-mode / per-stage palettes. b0 = base fill; blobs = the drifting wash
// colors; orbs = the floating-light colors. All dark-anchored.
var PALS = [
  { b0: '#07110f', blobs: ['#3fc9a0', '#5fc96e', '#56b8e8', '#7fd8c0'], orbs: ['#5fc96e', '#56b8e8', '#9fe0c0'] }, // 0 MEADOW
  { b0: '#130810', blobs: ['#f27d9d', '#f2a35a', '#a97fe8', '#f2ca4e'], orbs: ['#f27d9d', '#f2ca4e', '#c78fe8'] }, // 1 SUNSET
  { b0: '#060616', blobs: ['#4a5aa8', '#7f8fe8', '#a97fe8', '#5566c0'], orbs: ['#8f9fe8', '#b9a9f0', '#c8c8ee'] }, // 2 NIGHT
  { b0: '#120618', blobs: ['#c04a9a', '#a97fe8', '#7f5ac0', '#e87fc0'], orbs: ['#e87fc0', '#b98fe8', '#f0a9d0'] }, // 3 AMETHYST
  { b0: '#06131c', blobs: ['#3fc0e8', '#56b8e8', '#4fd0c0', '#8fe0f0'], orbs: ['#56b8e8', '#5fd0d0', '#a9e8f0'] }, // 4 AQUA
  { b0: '#060f1e', blobs: ['#3f6fc8', '#3fa0c0', '#5a5ab0', '#4fc0d0'], orbs: ['#4fa0d0', '#5fc0d0', '#8fb0e8'] }, // 5 OCEAN
  { b0: '#140606', blobs: ['#c0342a', '#f2884e', '#7a2a4a', '#e8b060'], orbs: ['#f2884e', '#e85a4a', '#f0c070'] }  // 6 EMBER
];

var activeIdx = -1;
var blobPh = [], blobSp = [], blobT = 0;
var orbs = [];
var pulses = [];   // reactive brighten flourishes

function norm(idx) { return ((idx % PALS.length) + PALS.length) % PALS.length; }
function hex2rgba(hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function initPalette(idx) {
  var pal = PALS[idx];
  activeIdx = idx;
  blobPh = []; blobSp = []; blobT = 0; orbs = []; pulses = [];
  var i;
  for (i = 0; i < pal.blobs.length; i++) {
    blobPh.push(Math.random() * 6.28);
    blobSp.push(0.0006 + Math.random() * 0.0006);
  }
  for (i = 0; i < 11; i++) {
    orbs.push({
      x: Math.random() * W, y: Math.random() * H,
      r: 8 + Math.random() * 18,
      c: pal.orbs[i % pal.orbs.length],
      v: 0.05 + Math.random() * 0.12,
      a: 0.08 + Math.random() * 0.10
    });
  }
}

// build() kept for the boot sequence; the wash is cheap-live so there is
// nothing heavy to pre-render. Palette state inits lazily on first tick.
function build() { /* no-op */ }

// track the live canvas size so the wash fills the whole screen (the canvas is
// 480x270 in landscape but tall in portrait). Re-scatters the bokeh into the
// new bounds so orbs cover the full area instead of clustering in a corner.
function setSize(w, h) {
  if (w === W && h === H) return;
  W = w; H = h;
  // only relocate orbs that now fall outside the bounds — so a small WebView
  // viewport wobble (system/URL bar animating) doesn't make the whole bokeh
  // field visibly jump; the rest drift into the new area via tick() wrapping
  for (var i = 0; i < orbs.length; i++) {
    if (orbs[i].x > W) orbs[i].x = Math.random() * W;
    if (orbs[i].y > H + orbs[i].r) orbs[i].y = Math.random() * H;
  }
}

// advance ambient motion one fixed 60 Hz step (called from the game update)
function tick(idx) {
  idx = norm(idx);
  if (idx !== activeIdx) initPalette(idx);
  blobT++;
  var i;
  for (i = 0; i < orbs.length; i++) {
    var o = orbs[i];
    o.y -= o.v;
    if (o.y + o.r < 0) { o.y = H + o.r; o.x = Math.random() * W; }
  }
  for (i = pulses.length - 1; i >= 0; i--) {
    var p = pulses[i];
    p.life--;
    p.r += p.growth;
    if (p.life <= 0) pulses.splice(i, 1);
  }
}

// render the current state
function draw(ctx, idx, frame) {
  idx = norm(idx);
  if (idx !== activeIdx) { initPalette(idx); }
  var pal = PALS[idx];
  var i;

  ctx.fillStyle = pal.b0;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // drifting nebula blobs
  for (i = 0; i < pal.blobs.length; i++) {
    var cx = W * (0.5 + 0.32 * Math.cos(blobT * blobSp[i] + blobPh[i]));
    var cy = H * (0.5 + 0.30 * Math.sin(blobT * blobSp[i] * 0.82 + blobPh[i] * 1.3));
    var R = W * 0.40;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, hex2rgba(pal.blobs[i], 0.16));
    g.addColorStop(0.5, hex2rgba(pal.blobs[i], 0.05));
    g.addColorStop(1, hex2rgba(pal.blobs[i], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // soft rising bokeh
  for (i = 0; i < orbs.length; i++) {
    var b = orbs[i];
    var og = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    og.addColorStop(0, hex2rgba(b.c, b.a));
    og.addColorStop(0.6, hex2rgba(b.c, b.a * 0.35));
    og.addColorStop(1, hex2rgba(b.c, 0));
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.29); ctx.fill();
  }

  // reactive brighten flourishes (a bold drop lit up this side)
  for (i = 0; i < pulses.length; i++) {
    var pl = pulses[i];
    var k = pl.life / pl.max;             // 1 -> 0
    var a = pl.amp * k * k;               // ease-out fade
    var pg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, pl.r);
    pg.addColorStop(0, hex2rgba(pl.c, a));
    pg.addColorStop(0.5, hex2rgba(pl.c, a * 0.4));
    pg.addColorStop(1, hex2rgba(pl.c, 0));
    ctx.fillStyle = pg;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();

  // gentle edge vignette to hold focus toward the middle
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, W * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(4,4,12,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// dark halo + soft contact shadow behind a board so it separates from the
// wash and the panels read (replaces the old ground platform).
function halo(ctx, ox, oy, w, h) {
  var cx = ox + w / 2, cy = oy + h / 2;
  var g = ctx.createRadialGradient(cx, cy, h * 0.18, cx, cy, h * 0.80);
  g.addColorStop(0, 'rgba(6,6,16,0.55)');
  g.addColorStop(1, 'rgba(6,6,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ox - 52, oy - 36, w + 104, h + 92);
  // faint contact shadow beneath
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(cx, oy + h + 7, w * 0.60, 5, 0, 0, 6.29);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// a bold drop landed on the side centered at screen-x cx — brighten it.
// amount ~ garbage cell count; color defaults to a warm impact light.
function pulse(cx, amount, color) {
  amount = Math.max(1, amount || 1);
  pulses.push({
    x: cx, y: H * 0.5,
    r: 55,
    growth: 1.6 + Math.min(6, amount) * 0.5,
    amp: Math.min(0.30, 0.07 + Math.min(12, amount) * 0.02),
    life: 32, max: 32,
    c: color || '#ffe8c0'
  });
  if (pulses.length > 6) pulses.shift();
}

window.Backgrounds = {
  build: build, setSize: setSize, tick: tick, draw: draw, halo: halo, pulse: pulse,
  count: PALS.length
};

})();

// PANEL POP — keyboard (DAS auto-repeat) + touch input.
'use strict';

(function () {

var DAS_DELAY = 12; // frames before auto-repeat
var DAS_RATE = 4;   // frames between repeats

var keysDown = {};
var keysEdge = {};  // pressed since last frame

// player mappings
var MAPS = [
  { left: ['a'], right: ['d'], up: ['w'], down: ['s'], swap: ['f'], raise: ['g'] },
  { left: ['arrowleft'], right: ['arrowright'], up: ['arrowup'], down: ['arrowdown'], swap: ['.'], raise: [','] }
];

// das state per player per direction
var das = [{}, {}];

var menuQueue = []; // 'up'|'down'|'left'|'right'|'ok'|'back'
var globalQueue = []; // 'pause'|'volup'|'voldown'|'mute'

function keyName(e) {
  var k = e.key.toLowerCase();
  return k;
}

window.addEventListener('keydown', function (e) {
  var k = keyName(e);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (!keysDown[k]) keysEdge[k] = true;
  keysDown[k] = true;

  // menu navigation (edge only)
  if (k === 'arrowup' || k === 'w') menuQueue.push('up');
  else if (k === 'arrowdown' || k === 's') menuQueue.push('down');
  else if (k === 'arrowleft' || k === 'a') menuQueue.push('left');
  else if (k === 'arrowright' || k === 'd') menuQueue.push('right');
  else if (k === 'enter' || k === 'f' || k === ' ' || k === '.') menuQueue.push('ok');
  else if (k === 'escape' || k === 'backspace') menuQueue.push('back');

  if (k === 'escape' || k === 'p') globalQueue.push('pause');
  if (k === '+' || k === '=') globalQueue.push('volup');
  if (k === '-' || k === '_') globalQueue.push('voldown');
  if (k === 'm') globalQueue.push('mute');

  window.Audio2 && Audio2.unlock();
}, { passive: false });

window.addEventListener('keyup', function (e) {
  keysDown[keyName(e)] = false;
});

// keys released while unfocused never fire keyup — clear everything so a
// held raise/direction can't stick after Alt-Tab
function releaseAll() {
  keysDown = {};
  keysEdge = {};
  das = [{}, {}];
  touchPoints = {}; // strand no drags across alt-tab/blur
  padClear();       // a held RAISE/direction must not stick after backgrounding
}
window.addEventListener('blur', releaseAll);
document.addEventListener('visibilitychange', function () {
  if (document.hidden) releaseAll();
});

function anyDown(list) {
  for (var i = 0; i < list.length; i++) if (keysDown[list[i]]) return true;
  return false;
}
function anyEdge(list) {
  for (var i = 0; i < list.length; i++) if (keysEdge[list[i]]) return true;
  return false;
}

// dir with DAS: returns true on initial press and on repeat ticks
function dasDir(p, dir, map) {
  var st = das[p];
  var down = anyDown(map[dir]);
  var edge = anyEdge(map[dir]);
  // edge first: a tap pressed+released between two sim frames still counts
  if (edge) { st[dir] = 0; return true; }
  if (!down) { st[dir] = 0; return false; }
  st[dir] = (st[dir] || 0) + 1;
  if (st[dir] >= DAS_DELAY) {
    if ((st[dir] - DAS_DELAY) % DAS_RATE === 0) return true;
  }
  return false;
}

// ---- virtual on-screen pad (phones) ----------------------------------------
// The touchpad overlay (js/touchpad.js) feeds this state; it merges into
// player-0 board input exactly like the keyboard, so the engine sees no
// difference. Directions get the same DAS auto-repeat as keys.
var padHeld = { left: false, right: false, up: false, down: false };
var padDas = { left: 0, right: 0, up: 0, down: 0 };
var padMenuDas = { left: 0, right: 0, up: 0, down: 0 };
var padRaise = false;
var padSwapEdge = false;

// ctrl: 'left'|'right'|'up'|'down' (held, drives cursor + menu nav) |
// 'raise' (held) | 'swap' (edge; also = menu OK) | 'back' (edge; menu back +
// in-game pause)
function padSet(ctrl, pressed) {
  if (ctrl === 'swap') { if (pressed) { padSwapEdge = true; menuQueue.push('ok'); } }
  else if (ctrl === 'back') { if (pressed) { menuQueue.push('back'); globalQueue.push('pause'); } }
  else if (ctrl === 'raise') { padRaise = pressed; }
  else if (ctrl in padHeld) {
    padHeld[ctrl] = pressed;
    if (!pressed) { padDas[ctrl] = 0; padMenuDas[ctrl] = 0; }
  }
}
function padClear() {
  padHeld.left = padHeld.right = padHeld.up = padHeld.down = false;
  padDas.left = padDas.right = padDas.up = padDas.down = 0;
  padMenuDas.left = padMenuDas.right = padMenuDas.up = padMenuDas.down = 0;
  padRaise = false; padSwapEdge = false;
}
function padDir(dir) {
  if (!padHeld[dir]) { padDas[dir] = 0; return false; }
  var c = padDas[dir]++;
  if (c === 0) return true;
  if (c >= DAS_DELAY && (c - DAS_DELAY) % DAS_RATE === 0) return true;
  return false;
}
// push held D-pad directions into the menu queue (slower, own DAS) so the pad
// navigates menus everywhere, not just gameplay. Call once per frame.
function pumpPadMenu() {
  var dirs = ['up', 'down', 'left', 'right'];
  for (var i = 0; i < dirs.length; i++) {
    var d = dirs[i];
    if (!padHeld[d]) { padMenuDas[d] = 0; continue; }
    var c = padMenuDas[d]++;
    if (c === 0 || (c >= 16 && (c - 16) % 7 === 0)) menuQueue.push(d);
  }
}

// per-frame board input for player p. combined=true merges both mappings
// (solo modes: either hand works)
function boardInput(p, combined) {
  var inp = { left: false, right: false, up: false, down: false, swap: false, raise: false };
  var maps = combined ? [0, 1] : [p];
  for (var i = 0; i < maps.length; i++) {
    var m = MAPS[maps[i]];
    if (dasDir(maps[i], 'left', m)) inp.left = true;
    if (dasDir(maps[i], 'right', m)) inp.right = true;
    if (dasDir(maps[i], 'up', m)) inp.up = true;
    if (dasDir(maps[i], 'down', m)) inp.down = true;
    if (anyEdge(m.swap)) inp.swap = true;
    if (anyDown(m.raise)) inp.raise = true;
  }
  // the virtual pad drives player 0 (the phone player)
  if (p === 0) {
    if (padDir('left')) inp.left = true;
    if (padDir('right')) inp.right = true;
    if (padDir('up')) inp.up = true;
    if (padDir('down')) inp.down = true;
    if (padSwapEdge) inp.swap = true;
    if (padRaise) inp.raise = true;
  }
  return inp;
}

// touch: taps + drags in internal-canvas coords + held points (RAISE button).
// A "tap" fires on pointer-UP with little movement; anything that travels
// further is a drag (drag-to-swap), so the two never collide.
var TAP_SLOP = 6; // internal px
var taps = [];
var touchPoints = {}; // id -> {x,y,sx,sy,moved}
var canvasRef = null, scaleFn = null;

function initTouch(canvas, toInternal) {
  canvasRef = canvas;
  scaleFn = toInternal;
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Audio2 && Audio2.unlock();
    if (e.button !== undefined && e.button !== 0) return; // primary only
    // capture so a mouse released OUTSIDE the canvas still delivers its
    // pointerup here — otherwise the entry leaks and hover becomes a
    // permanent phantom drag
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    var pt = scaleFn(e.clientX, e.clientY);
    touchPoints[e.pointerId] = { x: pt.x, y: pt.y, sx: pt.x, sy: pt.y, moved: false, consumed: false };
  }, { passive: false });
  canvas.addEventListener('pointermove', function (e) {
    var p = touchPoints[e.pointerId];
    if (!p) return;
    var pt = scaleFn(e.clientX, e.clientY);
    p.x = pt.x; p.y = pt.y;
    if (Math.abs(p.x - p.sx) > TAP_SLOP || Math.abs(p.y - p.sy) > TAP_SLOP) p.moved = true;
  });
  function up(e) {
    var p = touchPoints[e.pointerId];
    if (p && !p.moved && !p.consumed) taps.push({ x: p.sx, y: p.sy });
    delete touchPoints[e.pointerId];
  }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', function (e) { delete touchPoints[e.pointerId]; });
}

function heldPoints() {
  var out = [];
  for (var k in touchPoints) {
    if (!touchPoints[k].consumed) out.push(touchPoints[k]);
  }
  return out;
}

// active pointers with ids (for drag tracking)
function pointers() {
  var out = [];
  for (var k in touchPoints) {
    var p = touchPoints[k];
    if (p.consumed) continue;
    out.push({ id: k, x: p.x, y: p.y, sx: p.sx, sy: p.sy, moved: p.moved });
  }
  return out;
}

// mark all current pointers ineligible for drag adoption — called when a new
// game starts so a finger held through a RESTART can't act on the new board
function consumePointers() {
  for (var k in touchPoints) touchPoints[k].consumed = true;
}

// call at END of each frame
function endFrame() {
  keysEdge = {};
  taps.length = 0;
  padSwapEdge = false; // consumed once per frame
}

function drainMenu() { var q = menuQueue.slice(); menuQueue.length = 0; return q; }
function drainGlobal() { var q = globalQueue.slice(); globalQueue.length = 0; return q; }

window.Input = {
  boardInput: boardInput,
  drainMenu: drainMenu,
  drainGlobal: drainGlobal,
  endFrame: endFrame,
  initTouch: initTouch,
  taps: taps,
  heldPoints: heldPoints,
  pointers: pointers,
  consumePointers: consumePointers,
  padSet: padSet,
  padClear: padClear,
  pumpPadMenu: pumpPadMenu
};

})();

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
  return inp;
}

// touch: taps in internal-canvas coords + held points (for RAISE button)
var taps = [];
var touchPoints = {}; // id -> {x,y}
var canvasRef = null, scaleFn = null;

function initTouch(canvas, toInternal) {
  canvasRef = canvas;
  scaleFn = toInternal;
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Audio2 && Audio2.unlock();
    var pt = scaleFn(e.clientX, e.clientY);
    touchPoints[e.pointerId] = pt;
    taps.push(pt);
  }, { passive: false });
  canvas.addEventListener('pointermove', function (e) {
    if (touchPoints[e.pointerId]) touchPoints[e.pointerId] = scaleFn(e.clientX, e.clientY);
  });
  function up(e) { delete touchPoints[e.pointerId]; }
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

function heldPoints() {
  var out = [];
  for (var k in touchPoints) out.push(touchPoints[k]);
  return out;
}

// call at END of each frame
function endFrame() {
  keysEdge = {};
  taps.length = 0;
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
  heldPoints: heldPoints
};

})();

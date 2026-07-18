// PANEL POP — floating on-screen control deck for phones (portrait).
//
// A TRANSPARENT overlay that floats over the lower part of the game rather than
// a solid slab, so the game keeps the whole screen. Layout:
//
//     [ D-PAD ]                         [ START ] [ RAISE ]
//                                          [ B ]    [ A ]
//
// The D-pad sits bottom-left; on the right, A / B on the bottom row with
// START (pause) and RAISE on the row directly above (RAISE over A). It feeds
// the same Input pad state the keyboard uses, so it drives BOTH menu navigation
// (D-pad + A=OK + B=back) and gameplay (cursor + SWAP + RAISE + START=pause).
//
// The container is pointer-events:none and only the buttons are interactive, so
// taps anywhere else still reach the game canvas (tap/drag-to-swap keeps working).
'use strict';

(function () {

var root = null, dpadEl = null, arrows = {}, aEl = null, bEl = null,
    startEl = null, raiseEl = null;
var mode = 'auto';          // 'auto' | 'on' | 'off'
var built = false, shown = false;
var dpadPointer = null, dpadRect = null, curDir = null;

// touch-PRIMARY device (phone/tablet): a coarse pointer with no hover. Excludes
// desktops and touch laptops (which have a mouse -> hover:hover).
function isTouchDevice() {
  if (window.matchMedia) {
    return window.matchMedia('(pointer: coarse)').matches &&
           window.matchMedia('(hover: none)').matches;
  }
  return ('ontouchstart' in window) && navigator.maxTouchPoints > 0;
}
function enabled() {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return isTouchDevice();
}

var CSS =
// deck: a transparent full-width band floating over the game's lower region
'#tp-deck{position:fixed;left:0;right:0;bottom:0;height:44vh;z-index:30;' +
'display:none;pointer-events:none;touch-action:none;' +
'-webkit-user-select:none;user-select:none;}' +
// D-pad — a rounded cross; the whole square is the thumb zone (dominant axis)
'.tp-dpad{position:absolute;left:6vw;bottom:6vh;width:34vw;height:34vw;' +
'max-width:190px;max-height:190px;pointer-events:auto;touch-action:none;' +
'border-radius:24%;background:rgba(38,38,74,0.5);' +
'border:2px solid rgba(255,255,255,0.12);' +
'box-shadow:inset 0 2px 0 rgba(255,255,255,0.05);}' +
'.tp-cross{position:absolute;background:rgba(70,70,120,0.55);border-radius:6px;}' +
'.tp-cross.h{left:14%;right:14%;top:34%;bottom:34%;}' +
'.tp-cross.v{top:14%;bottom:14%;left:34%;right:34%;}' +
'.tp-ar{position:absolute;color:rgba(255,255,255,0.62);font:700 4.6vmin sans-serif;' +
'transform:translate(-50%,-50%);pointer-events:none;}' +
'.tp-ar.u{left:50%;top:14%;}.tp-ar.d{left:50%;top:86%;}' +
'.tp-ar.l{left:14%;top:50%;}.tp-ar.r{left:86%;top:50%;}' +
'.tp-ar.on{color:#f2ca4e;}' +
// right cluster: a bottom-right column — top row (START/RAISE) over bottom row (B/A)
'.tp-right{position:absolute;right:5vw;bottom:6vh;display:flex;flex-direction:column;' +
'align-items:flex-end;gap:2.2vh;pointer-events:none;}' +
'.tp-row{display:flex;align-items:flex-end;gap:3.5vw;pointer-events:none;}' +
'.tp-btn{pointer-events:auto;touch-action:none;border-radius:50%;' +
'font:700 4vmin sans-serif;display:flex;align-items:center;justify-content:center;' +
'color:#101020;border:2px solid rgba(0,0,0,0.25);box-shadow:0 2px 0 rgba(0,0,0,0.3);}' +
'.tp-btn.press{transform:translateY(2px);box-shadow:none;filter:brightness(1.2);}' +
'.tp-a{width:20vw;height:20vw;max-width:110px;max-height:110px;background:#f27d9d;}' +
'.tp-b{width:17vw;height:17vw;max-width:94px;max-height:94px;background:#7f8fe8;}' +
// START / RAISE pills on the row above
'.tp-pill{pointer-events:auto;touch-action:none;border-radius:22px;' +
'display:flex;align-items:center;justify-content:center;font:700 3vmin sans-serif;' +
'height:8vw;max-height:44px;background:rgba(42,42,72,0.72);color:#e8e8f4;' +
'border:2px solid rgba(255,255,255,0.14);}' +
'.tp-pill.press{background:rgba(242,202,78,0.55);color:#101020;}' +
'.tp-start{width:22vw;max-width:118px;}' +
'.tp-raise{width:20vw;max-width:108px;}';

function make(cls, html) {
  var d = document.createElement('div');
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}

function build() {
  if (built) return;
  built = true;
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  root = make('', '');
  root.id = 'tp-deck';

  dpadEl = make('tp-dpad');
  dpadEl.appendChild(make('tp-cross h'));
  dpadEl.appendChild(make('tp-cross v'));
  arrows.up = make('tp-ar u', '&#9650;');
  arrows.down = make('tp-ar d', '&#9660;');
  arrows.left = make('tp-ar l', '&#9664;');
  arrows.right = make('tp-ar r', '&#9654;');
  dpadEl.appendChild(arrows.up); dpadEl.appendChild(arrows.down);
  dpadEl.appendChild(arrows.left); dpadEl.appendChild(arrows.right);

  // right cluster: top row (START | RAISE) above bottom row (B | A)
  var right = make('tp-right');
  var topRow = make('tp-row');
  startEl = make('tp-pill tp-start', 'START');
  raiseEl = make('tp-pill tp-raise', 'RAISE');
  topRow.appendChild(startEl); topRow.appendChild(raiseEl);
  var btnRow = make('tp-row');
  bEl = make('tp-btn tp-b', 'B');
  aEl = make('tp-btn tp-a', 'A');
  btnRow.appendChild(bEl); btnRow.appendChild(aEl);
  right.appendChild(topRow); right.appendChild(btnRow);

  root.appendChild(dpadEl);
  root.appendChild(right);
  document.body.appendChild(root);

  wireDpad();
  wireButton(aEl, 'swap', false);      // A = swap in game / OK in menus
  wireButton(bEl, 'back', false);      // B = back in menus
  wireButton(startEl, 'start', false); // START = pause (toggles in game)
  wireButton(raiseEl, 'raise', true);  // RAISE = hold to raise

  window.addEventListener('resize', function () { dpadRect = null; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) resetVisuals();
  });
  window.addEventListener('blur', resetVisuals);
}

function resetVisuals() {
  setDir(null);
  [aEl, bEl, startEl, raiseEl].forEach(function (el) {
    if (el) el.classList.remove('press');
  });
}

function setDir(dir) {
  if (dir === curDir) return;
  ['up', 'down', 'left', 'right'].forEach(function (k) {
    Input.padSet(k, k === dir);
    if (arrows[k]) arrows[k].classList.toggle('on', k === dir);
  });
  curDir = dir;
}

function wireDpad() {
  function pt(e) {
    if (!dpadRect) dpadRect = dpadEl.getBoundingClientRect();
    var cx = dpadRect.left + dpadRect.width / 2;
    var cy = dpadRect.top + dpadRect.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var dz = dpadRect.width * 0.12;
    if (Math.abs(dx) < dz && Math.abs(dy) < dz) { setDir(null); return; }
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  }
  dpadEl.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Audio2 && Audio2.unlock();
    dpadPointer = e.pointerId;
    dpadRect = dpadEl.getBoundingClientRect();
    try { dpadEl.setPointerCapture(e.pointerId); } catch (x) {}
    pt(e);
  }, { passive: false });
  dpadEl.addEventListener('pointermove', function (e) {
    if (e.pointerId !== dpadPointer) return;
    pt(e);
  });
  function end(e) {
    if (e.pointerId !== dpadPointer) return;
    dpadPointer = null; dpadRect = null; setDir(null);
  }
  dpadEl.addEventListener('pointerup', end);
  dpadEl.addEventListener('pointercancel', end);
}

function wireButton(el, ctrl, held) {
  el.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Audio2 && Audio2.unlock();
    try { el.setPointerCapture(e.pointerId); } catch (x) {}
    Input.padSet(ctrl, true);
    el.classList.add('press');
  }, { passive: false });
  function up() {
    if (held) Input.padSet(ctrl, false); // edge buttons auto-release
    el.classList.remove('press');
  }
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function applyShown(show) {
  shown = show;
  if (root) root.style.display = show ? 'block' : 'none';
  if (!show) { Input.padClear(); resetVisuals(); }
}

// called each frame; the deck floats on touch devices in PORTRAIT (all screens).
// In landscape (rotated phone, or a portrait web bundle in an old landscape
// shell) it falls back to the centered canvas + tap controls.
function setActive() {
  if (!built) build();
  // strict '>' so an exactly-square viewport reads as landscape here too —
  // matches main.js resize() (vh > vw), so the deck can't show over a
  // landscape-laid-out canvas at the vw===vh boundary
  var portrait = window.innerHeight > window.innerWidth;
  var want = enabled() && portrait;
  if (want !== shown) applyShown(want);
}

function setMode(m) { mode = m; if (built) setActive(); }

window.Touchpad = {
  setActive: setActive, setMode: setMode,
  enabled: enabled, deckActive: function () { return shown; }
};

})();

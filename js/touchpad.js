// PANEL POP — on-screen Game-Boy-style control deck for phones.
//
// A permanent bottom panel (shown on ALL screens on touch devices, hidden on
// desktop): a thumb D-pad on the left, A / B buttons on the right, and a RAISE
// button in the middle. It feeds the same Input pad state the keyboard uses, so
// it drives BOTH menu navigation (D-pad + A=OK + B=back) and gameplay (cursor +
// SWAP + RAISE + pause). Adding `body.gb` switches the page to the portrait
// "screen on top, controls below" layout.
'use strict';

(function () {

var root = null, dpadEl = null, arrows = {}, aEl = null, bEl = null, raiseEl = null;
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
// deck: a flex child at the bottom of the column layout (see index.html .gb)
'#tp-deck{display:none;flex:0 0 auto;height:clamp(240px,46vh,440px);width:100%;' +
'box-sizing:border-box;align-items:center;justify-content:space-between;' +
'padding:0 5vw;background:linear-gradient(#18182e,#101019);' +
'border-top:2px solid rgba(255,255,255,0.06);touch-action:none;' +
'-webkit-user-select:none;user-select:none;z-index:20;}' +
'body.gb #tp-deck{display:flex;}' +
// D-pad — a rounded cross; the whole square is the thumb zone (dominant axis)
'.tp-dpad{position:relative;width:38vmin;height:38vmin;max-width:210px;max-height:210px;' +
'border-radius:24%;background:#26264a;border:2px solid rgba(255,255,255,0.10);' +
'box-shadow:inset 0 2px 0 rgba(255,255,255,0.06);touch-action:none;}' +
'.tp-cross{position:absolute;background:#33335c;border-radius:6px;}' +
'.tp-cross.h{left:14%;right:14%;top:34%;bottom:34%;}' +
'.tp-cross.v{top:14%;bottom:14%;left:34%;right:34%;}' +
'.tp-ar{position:absolute;color:rgba(255,255,255,0.6);font:700 4.6vmin sans-serif;' +
'transform:translate(-50%,-50%);pointer-events:none;}' +
'.tp-ar.u{left:50%;top:14%;}.tp-ar.d{left:50%;top:86%;}' +
'.tp-ar.l{left:14%;top:50%;}.tp-ar.r{left:86%;top:50%;}' +
'.tp-ar.on{color:#f2ca4e;}' +
// right button cluster
'.tp-right{position:relative;width:40vmin;height:38vmin;max-width:220px;max-height:210px;}' +
'.tp-btn{position:absolute;touch-action:none;border-radius:50%;font:700 4vmin sans-serif;' +
'display:flex;align-items:center;justify-content:center;color:#101020;' +
'border:2px solid rgba(0,0,0,0.25);box-shadow:0 2px 0 rgba(0,0,0,0.3);}' +
'.tp-btn.press{transform:translateY(2px);box-shadow:none;filter:brightness(1.2);}' +
'.tp-a{right:2vmin;bottom:6vmin;width:19vmin;height:19vmin;max-width:104px;max-height:104px;' +
'background:#f27d9d;}' +
'.tp-b{right:20vmin;bottom:15vmin;width:16vmin;height:16vmin;max-width:88px;max-height:88px;' +
'background:#7f8fe8;}' +
// RAISE in the middle (Start/Select spot)
'.tp-raise{position:relative;width:20vmin;max-width:120px;height:8vmin;max-height:44px;' +
'border-radius:22px;background:#2a2a48;border:2px solid rgba(255,255,255,0.12);' +
'color:#e8e8f4;font:700 3vmin sans-serif;display:flex;align-items:center;' +
'justify-content:center;touch-action:none;}' +
'.tp-raise.press{background:rgba(242,202,78,0.5);color:#101020;}';

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

  raiseEl = make('tp-raise', 'RAISE');

  var right = make('tp-right');
  aEl = make('tp-btn tp-a', 'A');
  bEl = make('tp-btn tp-b', 'B');
  right.appendChild(bEl); right.appendChild(aEl);

  root.appendChild(dpadEl);
  root.appendChild(raiseEl);
  root.appendChild(right);
  document.body.appendChild(root);

  wireDpad();
  wireButton(aEl, 'swap', false);   // A = swap in game / OK in menus
  wireButton(bEl, 'back', false);   // B = back in menus / pause in game
  wireButton(raiseEl, 'raise', true); // RAISE = hold to raise

  window.addEventListener('resize', function () { dpadRect = null; });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) resetVisuals();
  });
  window.addEventListener('blur', resetVisuals);
}

function resetVisuals() {
  setDir(null);
  if (aEl) aEl.classList.remove('press');
  if (bEl) bEl.classList.remove('press');
  if (raiseEl) raiseEl.classList.remove('press');
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
  document.body.classList.toggle('gb', show);
  if (!show) { Input.padClear(); resetVisuals(); }
}

// called each frame; the GB deck is permanent on touch devices in PORTRAIT
// (all screens). In landscape (rotated phone, or a portrait web bundle served
// into a not-yet-updated landscape shell) it falls back to the centered canvas
// + tap controls rather than a cramped deck.
function setActive() {
  if (!built) build();
  var portrait = window.innerHeight >= window.innerWidth;
  var want = enabled() && portrait;
  if (want !== shown) applyShown(want);
}

function setMode(m) { mode = m; if (built) setActive(); }

window.Touchpad = { setActive: setActive, setMode: setMode, enabled: enabled };

})();

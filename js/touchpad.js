// PANEL POP — virtual on-screen controls for phones (app + mobile web).
//
// A translucent overlay: a round thumb D-pad (bottom-left), SWAP + RAISE
// action buttons (bottom-right), and a small pause button (top-right). It
// feeds the same Input pad state the keyboard uses, so the engine is unaware.
// Auto-shown on coarse-pointer / touch devices; hidden on desktop. Only
// visible during active play (hidden on menus / pause / countdown).
'use strict';

(function () {

var root = null, dpadEl = null, arrows = {}, aEl = null, bEl = null, pauseEl = null;
var mode = 'auto';          // 'auto' | 'on' | 'off'
var built = false, visible = false;
var dpadPointer = null, dpadRect = null, curDir = null;

// touch-PRIMARY device (phone/tablet): a coarse pointer with no hover. This
// excludes desktops and touch laptops (which have a mouse -> hover:hover), so
// keyboard players never see the pad; a forced mode can still turn it on.
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
'.tpad{position:fixed;inset:0;z-index:20;pointer-events:none;touch-action:none;' +
'display:none;-webkit-user-select:none;user-select:none;}' +
'.tpad.on{display:block;}' +
'.tp-dpad{position:fixed;left:16px;bottom:16px;width:132px;height:132px;' +
'border-radius:50%;background:rgba(28,28,52,0.30);border:2px solid rgba(255,255,255,0.14);' +
'pointer-events:auto;touch-action:none;}' +
'.tp-ar{position:absolute;color:rgba(255,255,255,0.55);font:700 18px sans-serif;' +
'left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;}' +
'.tp-ar.u{top:14px;}.tp-ar.d{top:auto;bottom:14px;transform:translate(-50%,0);}' +
'.tp-ar.l{left:16px;transform:translate(0,-50%);}.tp-ar.r{left:auto;right:16px;transform:translate(0,-50%);}' +
'.tp-ar.on{color:#f2ca4e;}' +
'.tp-btn{position:fixed;pointer-events:auto;touch-action:none;border-radius:50%;' +
'background:rgba(28,28,52,0.40);border:2px solid rgba(255,255,255,0.18);color:#e8e8f4;' +
'display:flex;align-items:center;justify-content:center;font:700 12px sans-serif;' +
'text-align:center;line-height:1.05;}' +
'.tp-btn.press{background:rgba(242,202,78,0.55);color:#101020;}' +
'.tp-a{right:22px;bottom:26px;width:78px;height:78px;font-size:13px;}' +
'.tp-b{right:104px;bottom:78px;width:62px;height:62px;font-size:11px;}' +
'.tp-pause{right:14px;top:12px;width:40px;height:40px;font-size:15px;' +
'background:rgba(28,28,52,0.40);}';

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

  root = make('tpad');
  dpadEl = make('tp-dpad');
  arrows.up = make('tp-ar u', '&#9650;');
  arrows.down = make('tp-ar d', '&#9660;');
  arrows.left = make('tp-ar l', '&#9664;');
  arrows.right = make('tp-ar r', '&#9654;');
  dpadEl.appendChild(arrows.up); dpadEl.appendChild(arrows.down);
  dpadEl.appendChild(arrows.left); dpadEl.appendChild(arrows.right);
  aEl = make('tp-btn tp-a', 'SWAP');
  bEl = make('tp-btn tp-b', 'RAISE');
  pauseEl = make('tp-btn tp-pause', '&#10073;&#10073;');
  root.appendChild(dpadEl); root.appendChild(aEl);
  root.appendChild(bEl); root.appendChild(pauseEl);
  document.body.appendChild(root);

  wireDpad();
  wireButton(aEl, 'swap', false);
  wireButton(bEl, 'raise', true);
  wirePause();

  // re-evaluate auto visibility if the device orientation/inputs change
  window.addEventListener('resize', function () { if (visible) applyVisible(true); });
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
    var dz = 16;
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
  function up(e) {
    // edge controls (swap) auto-release; held controls (raise) release now
    if (held) Input.padSet(ctrl, false);
    el.classList.remove('press');
  }
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function wirePause() {
  pauseEl.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    pauseEl.classList.add('press');
  }, { passive: false });
  function up() { pauseEl.classList.remove('press'); }
  pauseEl.addEventListener('pointerup', up);
  pauseEl.addEventListener('pointercancel', up);
}

function applyVisible(show) {
  visible = show;
  if (!root) return;
  root.classList.toggle('on', show);
  if (!show) {
    // never let a control stick when the pad hides
    Input.padClear();
    setDir(null);
    if (aEl) aEl.classList.remove('press');
    if (bEl) bEl.classList.remove('press');
  }
}

// called each frame by the game: show only during active play, and only when
// this device wants the pad at all
function setActive(playing) {
  if (!built) build();
  var want = enabled() && playing;
  if (want !== visible) applyVisible(want);
}

function setMode(m) { mode = m; } // 'auto' | 'on' | 'off' (verification/opt-in)

window.Touchpad = { setActive: setActive, setMode: setMode, enabled: enabled };

})();

// PANEL POP — game shell: fixed-timestep loop, screens, modes, HUD, wiring.
'use strict';

(function () {

var APP_VERSION = '0.9.0';

// Two native layouts. Landscape (desktop / wide) is the original 480x270.
// A portrait viewport switches to a TALL internal canvas — 270 wide, height
// matched to the device aspect so it fills top-to-bottom with no letterbox —
// and every screen lays out portrait-native. W/H are read everywhere, so
// flipping them reflows the whole UI. isPortrait() keys the per-screen layout.
var LAND_W = 480, LAND_H = 270, PORT_W = 270;
var W = LAND_W, H = LAND_H;
var canvas, ctx;
var frame = 0;

function isPortrait() { return H > W; }

// ---- canvas & scaling ------------------------------------------------------

function setupCanvas() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  Input.initTouch(canvas, function (cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
  });
}

function resize() {
  var vw = window.innerWidth, vh = window.innerHeight;
  if (!vw || !vh) { vw = LAND_W; vh = LAND_H; }
  if (vh > vw) {
    // portrait: match the device aspect so the game fills the screen; clamp so
    // an unusually tall/short viewport still lays out sanely
    W = PORT_W;
    H = Math.round(PORT_W * vh / vw);
    if (H < 440) H = 440; else if (H > 640) H = 640;
  } else {
    W = LAND_W; H = LAND_H;
  }
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  ctx.imageSmoothingEnabled = false; // resetting canvas.width clears this
  if (window.Backgrounds) Backgrounds.setSize(W, H); // wash fills the real canvas
  syncRaiseBtn();
  var s = Math.min(vw / W, vh / H);
  if (!isFinite(s) || s <= 0.05) s = 1;
  canvas.style.width = Math.round(W * s) + 'px';
  canvas.style.height = Math.round(H * s) + 'px';
}

// Per-frame board placement — depends on orientation, so a rotation mid-match
// re-flows instantly. Sets g.bo (solo/puzzle) or g.bo1/g.bo2 + g.centerX (vs).
function layoutGame(g) {
  var bw = Render.BOARD_W;
  if (g.kind === 'vs' || g.kind === 'net') {
    if (isPortrait()) {
      g.bo1 = { x: 18, y: 118 };
      g.bo2 = { x: W - 18 - bw, y: 118 };
    } else {
      g.bo1 = { x: 104, y: 44 };
      g.bo2 = { x: W - 104 - bw, y: 44 };
    }
    g.centerX = Math.round(W / 2);
  } else {
    g.bo = isPortrait()
      ? { x: Math.round((W - bw) / 2), y: 104 }
      : { x: 56, y: 34 };
  }
}

// A framed backing so each board reads as its own space against the ambient
// background instead of blending in — tinted with the player's accent color.
function drawBoardFrame(x, y, col) {
  var bw = Render.BOARD_W, bh = Render.BOARD_H + Render.CELL; // +preview row
  ctx.fillStyle = 'rgba(8,8,22,0.55)';
  ctx.fillRect(x - 5, y - 5, bw + 10, bh + 10);
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 4, y - 4, bw + 8, bh + 8);
  ctx.lineWidth = 1;
}

// ---- tiny helpers -----------------------------------------------------------

var COL_TEXT = '#e8e8f4', COL_DIM = '#8a8aa8', COL_ACC = '#f2ca4e',
    COL_BAD = '#e84f6a', COL_OK = '#5fc96e', COL_BLUE = '#56b8e8';

function text(t, x, y, col, s) { Font.drawText(ctx, t, x, y, col || COL_TEXT, s || 1); }
function ctext(t, cx, y, col, s) { Font.drawTextCentered(ctx, t, cx, y, col || COL_TEXT, s || 1); }
function pad(n, len) { n = '' + n; while (n.length < len) n = '0' + n; return n; }
function mmss(frames) {
  var s = Math.max(0, Math.ceil(frames / 60));
  return Math.floor(s / 60) + ':' + pad(s % 60, 2);
}

var toast = { msg: '', t: 0 };
function showToast(m) { toast.msg = m; toast.t = 90; }

// ---- screen manager ---------------------------------------------------------

var screen = null;
var fadeT = 0; // brief fade-in on every screen change
function go(s) {
  screen = s; fadeT = 8;
  if (window.Input) Input.padClear(); // don't carry a held D-pad dir across screens
  if (s.enter) s.enter();
}

// dev/debug handle (harmless in production; used by automated verification)
window.__pp = {
  get screen() { return screen; },
  get game() { return game; },
  screens: function () {
    return { title: titleScreen, menu: menuScreen, results: resultsScreen, game: gameScreen };
  },
  // step the sim manually (verification in hidden tabs where rAF is paused)
  tick: function (n) {
    n = n || 1;
    for (var i = 0; i < n; i++) {
      handleGlobalKeys(); screen.update();
      if (fadeT > 0) fadeT--;
      Input.endFrame(); frame++;
    }
    screen.draw();
  },
  shot: function () { return canvas.toDataURL('image/png'); }
};

// ---- menu widget ------------------------------------------------------------

function MenuList(items, x, y, spacing) {
  this.items = items; this.x = x; this.y = y;
  this.spacing = spacing || 14;
  this.idx = 0;
  this.zones = [];
}
MenuList.prototype.onMenu = function (ev) {
  if (ev === 'up') { this.idx = (this.idx + this.items.length - 1) % this.items.length; Audio2.sfx.move(); }
  if (ev === 'down') { this.idx = (this.idx + 1) % this.items.length; Audio2.sfx.move(); }
  if (ev === 'ok') { Audio2.sfx.select(); return this.items[this.idx]; }
  return null;
};
MenuList.prototype.tap = function (p) {
  for (var i = 0; i < this.zones.length; i++) {
    var z = this.zones[i];
    if (p.y >= z.y0 && p.y < z.y1) {
      if (this.idx === z.idx) { Audio2.sfx.select(); return this.items[z.idx]; }
      this.idx = z.idx; Audio2.sfx.move(); return null;
    }
  }
  return null;
};
MenuList.prototype.draw = function (labels) {
  this.zones = [];
  for (var i = 0; i < this.items.length; i++) {
    var y = this.y + i * this.spacing;
    var sel = i === this.idx;
    if (sel) {
      ctx.fillStyle = 'rgba(242,202,78,0.12)';
      ctx.fillRect(this.x - 14, y - 3, 200, 12);
      text('>', this.x - 10, y, COL_ACC);
    }
    text(labels ? labels[i] : this.items[i], this.x, y, sel ? COL_ACC : COL_TEXT);
    this.zones.push({ y0: y - 3, y1: y + this.spacing - 3, idx: i });
  }
};

// ---- board event wiring (fx + sfx) -----------------------------------------

var CHAIN_COLORS = { 2: '#56b8e8', 3: '#5fc96e', 4: '#f2ca4e', 5: '#f2884e' };
var SHOUTS = { 4: 'AWESOME!', 5: 'FANTASTIC!', 6: 'INCREDIBLE!', 7: 'UNBELIEVABLE!' };

function chainColor(step) { return CHAIN_COLORS[Math.min(5, step)] || CHAIN_COLORS[5]; }

function processEvents(board, bo, g) {
  var E = Engine;
  var riseOff = Math.floor(board.riseSub / E.CELL_SUB * 16);
  var popIdx = 0;
  for (var i = 0; i < board.events.length; i++) {
    var ev = board.events[i];
    var ex = bo.x + (ev.x || 0) * 16, ey = bo.y + (ev.y || 0) * 16 - riseOff;
    switch (ev.t) {
      case 'swap': Audio2.sfx.swap(); break;
      case 'move': Audio2.sfx.move(); break;
      case 'pop':
        Fx.spawnPop(ex, ey, Sprites.palettes[ev.color].f);
        Audio2.sfx.pop(popIdx++, board.chainCounter);
        break;
      case 'match':
        if (ev.chain >= 2) {
          Fx.badge(ex + 16, ey - 8, 'x' + ev.chain + ' CHAIN!', chainColor(ev.chain),
            ev.chain >= 3 ? 2 : 1);
          Audio2.sfx.chain(ev.chain);
          Fx.shake('b' + bo.x, Math.min(4, ev.chain));
        }
        if (ev.n >= 4) Fx.badge(ex + 16, ey + 8, ev.n + ' COMBO!', COL_BLUE, ev.n >= 6 ? 2 : 1);
        // floating score for anything beyond a plain 3-match
        var pts = 10 * ev.n + E.comboBonus(ev.n) + E.chainBonus(ev.chain);
        if (pts > 30) Fx.badge(ex + 16, ey + 20, '+' + pts, '#e8e8f4');
        // hitstop: the whole game holds its breath on big moments
        if (g && (ev.chain >= 3 || ev.n >= 5)) {
          g.hitstop = Math.max(g.hitstop || 0, Math.min(6, 2 + ev.chain));
        }
        break;
      case 'land': if ((frame & 3) === 0) Audio2.sfx.land(); break;
      case 'garbage_land': Audio2.sfx.garbageLand(); Fx.shake('b' + bo.x, 3); break;
      case 'garbage_pop': Audio2.sfx.garbagePop(); Fx.sparkle(ex, ey); break;
      case 'level': Fx.badge(bo.x + 48, bo.y + 40, 'SPEED UP!', COL_OK, 1); Audio2.sfx.levelUp(); break;
      case 'game_over': Audio2.sfx.lose(); Fx.shake('b' + bo.x, 5); break;
      case 'chain_end':
        if (ev.chain >= 4) {
          Fx.badge(bo.x + 48, bo.y + 60, SHOUTS[Math.min(7, ev.chain)], chainColor(ev.chain), 2);
          // solo/puzzle have no enemy — a big chain lights your own side
          if (g && g.kind !== 'vs') Backgrounds.pulse(bo.x + 48, ev.chain, chainColor(ev.chain));
        } else if (ev.chain === 3) {
          Fx.badge(bo.x + 48, bo.y + 60, 'GREAT!', COL_OK, 1);
        }
        break;
    }
  }
}

// ---- HUD --------------------------------------------------------------------

function drawSoloHud(board, x, y, mode, timer, dispScore) {
  text('SCORE', x, y, COL_DIM);
  text(pad(dispScore === undefined ? board.score : dispScore, 7), x, y + 8,
    dispScore !== undefined && dispScore < board.score ? COL_ACC : COL_TEXT);
  if (mode === 'score') {
    text('TIME', x, y + 24, COL_DIM);
    text(mmss(timer), x, y + 32, timer < 600 ? COL_BAD : COL_TEXT);
  } else {
    text('TIME', x, y + 24, COL_DIM);
    text(mmss(board.frame), x, y + 32, COL_TEXT);
  }
  text('SPEED LV', x, y + 48, COL_DIM);
  text('' + board.level, x, y + 56, COL_TEXT);
  text('BEST CHAIN', x, y + 72, COL_DIM);
  text('x' + board.maxChain, x, y + 80, board.maxChain >= 4 ? COL_ACC : COL_TEXT);
  if (board.stopTimer > 0) {
    text('STOP', x, y + 96, COL_BLUE);
    ctx.fillStyle = COL_BLUE;
    ctx.fillRect(x, y + 104, Math.min(60, board.stopTimer / 10), 3);
  }
}

function drawVolumeBar() {
  if (toast.t > 0) {
    toast.t--;
    ctx.fillStyle = 'rgba(10,10,28,0.85)';
    ctx.fillRect(W / 2 - 60, H - 22, 120, 14);
    ctext(toast.msg, W / 2, H - 18, COL_ACC);
  }
}

// ---- TITLE ------------------------------------------------------------------

var titleScreen = {
  enter: function () { Audio2.playSong('menu'); },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'ok') { Audio2.sfx.select(); go(menuScreen); return; }
    }
    if (Input.taps.length) { Audio2.unlock(); Audio2.sfx.select(); go(menuScreen); }
  },
  draw: function () {
    drawBgPanels();
    var port = isPortrait();
    var logoY = port ? Math.round(H * 0.24) : 60;
    // logo: letters bob in a wave, flanked by bobbing panels
    drawWaveText('PANEL', W / 2, logoY, '#f27d9d', 4);
    drawWaveText('POP', W / 2, logoY + 36, COL_ACC, 4);
    var bobL = Math.round(Math.sin(frame / 14) * 3);
    var bobR = Math.round(Math.sin(frame / 14 + 1.5) * 3);
    ctx.drawImage(Sprites.panels[0].normal, W / 2 - 122, logoY + 14 + bobL);
    ctx.drawImage(Sprites.panels[3].normal, W / 2 + 106, logoY + 14 + bobR);
    var midY = port ? Math.round(H * 0.56) : 160;
    ctx.fillStyle = '#5a5a8c';
    ctx.fillRect(W / 2 - 90, midY - 26, 180, 1);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(frame / 14);
    ctext(port ? 'TAP OR PRESS A' : 'PRESS ENTER', W / 2, midY, COL_TEXT);
    ctx.globalAlpha = 1;
    ctext('SWAP - MATCH 3 - CHAIN!', W / 2, midY + 30, COL_DIM);
    ctext('V' + APP_VERSION, W / 2, H - 24, COL_DIM);
    ctext(port ? 'A OK   B BACK   START PAUSE' : 'VOLUME - / +   MUSIC M', W / 2, H - 12, COL_DIM);
  }
};

// per-letter sine-wave text (title logo)
function drawWaveText(str, cx, y, color, scale) {
  var total = Font.textWidth(str, scale);
  var x = Math.round(cx - total / 2);
  for (var i = 0; i < str.length; i++) {
    var ch = str[i];
    var dy = Math.round(Math.sin(frame / 12 + i * 0.7) * 2);
    Font.drawText(ctx, ch, x, y + dy, color, scale);
    x += Font.textWidth(ch, scale) + scale;
  }
}

// floating background panels on title/menus
var bgP = [];
function drawBgPanels() {
  ctx.fillStyle = '#0e0e22';
  ctx.fillRect(0, 0, W, H);
  if (!bgP.length) {
    for (var i = 0; i < 14; i++) {
      bgP.push({ x: Math.random() * W, y: Math.random() * H, c: i % 6, v: 0.15 + Math.random() * 0.3 });
    }
  }
  ctx.globalAlpha = 0.16;
  for (var j = 0; j < bgP.length; j++) {
    var p = bgP[j];
    p.y -= p.v;
    if (p.y < -18) { p.y = H + 18; p.x = Math.random() * W; }
    ctx.drawImage(Sprites.panels[p.c].normal, p.x | 0, p.y | 0);
  }
  ctx.globalAlpha = 1;
}

// ---- MAIN MENU --------------------------------------------------------------

var menuScreen = {
  list: null,
  enter: function () {
    Audio2.playSong('menu');
    this.list = new MenuList(
      ['ENDLESS', 'SCORE ATTACK', 'VS CPU', '2 PLAYERS', 'PUZZLE', 'STORY', 'ONLINE', 'HOW TO PLAY'],
      60, 70, 13);
  },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      var pick = this.list.onMenu(q[i]);
      if (q[i] === 'back') { go(titleScreen); return; }
      if (pick) return this.launch(pick);
    }
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var pick2 = this.list.tap(taps[t]);
      if (pick2) return this.launch(pick2);
    }
  },
  launch: function (pick) {
    if (pick === 'ENDLESS') startSolo('endless');
    else if (pick === 'SCORE ATTACK') startSolo('score');
    else if (pick === 'VS CPU') go(vsSelectScreen);
    else if (pick === '2 PLAYERS') startVs2P();
    else if (pick === 'PUZZLE') go(puzzleSelectScreen);
    else if (pick === 'STORY') go(storyIntroScreen);
    else if (pick === 'ONLINE') go(onlineScreen);
    else if (pick === 'HOW TO PLAY') go(howToScreen);
  },
  draw: function () {
    drawBgPanels();
    var port = isPortrait();
    ctext('PANEL POP', W / 2, port ? 22 : 26, COL_ACC, 2);
    // list — a left column in landscape, centered in portrait (with the
    // records moved below it instead of off to the right)
    this.list.x = port ? Math.round(W / 2 - 58) : 60;
    this.list.y = port ? 62 : 70;
    this.list.draw();
    var pc = 0, pcs = Save.get('puzzleCleared'), k;
    for (k in pcs) if (pcs[k]) pc++;
    var story = Save.get('storyBeaten') ? 'CLEAR!' : (Save.get('storyStage') + '/8');
    if (port) {
      var rx = 20, ry = this.list.y + this.list.items.length * this.list.spacing + 14;
      text('RECORDS', rx, ry, COL_DIM);
      text('ENDLESS   ' + pad(Save.get('hiEndless'), 7), rx, ry + 13);
      text('SCORE ATK ' + pad(Save.get('hiScore'), 7), rx, ry + 24);
      text('BEST CHAIN x' + Save.get('bestChainEndless'), rx, ry + 35);
      text('PUZZLES ' + pc + '/30   STORY ' + story, rx, ry + 46,
        Save.get('storyBeaten') ? COL_ACC : COL_TEXT);
    } else {
      var x = 280, y = 74;
      text('RECORDS', x, y, COL_DIM);
      text('ENDLESS ' + pad(Save.get('hiEndless'), 7), x, y + 14);
      text('SCORE ATK ' + pad(Save.get('hiScore'), 7), x, y + 26);
      text('BEST CHAIN x' + Save.get('bestChainEndless'), x, y + 38);
      text('PUZZLES ' + pc + '/30', x, y + 50);
      text('STORY ' + story, x, y + 62, Save.get('storyBeaten') ? COL_ACC : COL_TEXT);
    }
    ctext(port ? 'D-PAD MOVE   A OK   B BACK' : 'ARROWS/WASD MOVE   ENTER OK   ESC BACK',
      W / 2, H - 12, COL_DIM);
  }
};

// ---- HOW TO PLAY -------------------------------------------------------------

var howToScreen = {
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++)
      if (q[i] === 'ok' || q[i] === 'back') { Audio2.sfx.back(); go(menuScreen); return; }
    if (Input.taps.length) { go(menuScreen); }
  },
  draw: function () {
    drawBgPanels();
    ctext('HOW TO PLAY', W / 2, 20, COL_ACC, 2);
    var x = 46, y = 48, dy = 11;
    var lines = [
      ['MOVE CURSOR', 'WASD OR ARROWS'],
      ['SWAP PANELS', 'F OR . (P2 USES .)'],
      ['RAISE STACK', 'G OR , (HOLD)'],
      ['PAUSE', 'ESC OR P'],
      ['', ''],
      ['PHONE: USE THE ON-SCREEN D-PAD +', ''],
      ['SWAP / RAISE BUTTONS, OR TAP/DRAG PANELS.', ''],
      ['MATCH 3+ PANELS IN A ROW OR COLUMN.', ''],
      ['PANELS FALLING FROM A CLEAR THAT MATCH', ''],
      ['AGAIN MAKE A CHAIN - X2, X3, X4...', ''],
      ['BIG COMBOS AND CHAINS STOP THE STACK', ''],
      ['AND IN VS MODES DROP GARBAGE ON THE', ''],
      ['ENEMY. CLEAR NEXT TO GARBAGE TO BREAK', ''],
      ['IT INTO PANELS. DO NOT REACH THE TOP!', '']
    ];
    for (var i = 0; i < lines.length; i++) {
      text(lines[i][0], x, y + i * dy, i < 4 ? COL_DIM : COL_TEXT);
      text(lines[i][1], x + 150, y + i * dy, COL_TEXT);
    }
    ctext('ENTER TO RETURN', W / 2, H - 14, COL_DIM);
  }
};

// ---- ONLINE ------------------------------------------------------------------

function randomTag() {
  var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var s = '';
  for (var i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
function currentTag() {
  var t = Save.get('pilotTag');
  if (!t) { t = randomTag(); Save.set('pilotTag', t); }
  return t;
}

// reusable 4-slot character editor (name + join code)
var editorCtx = null;
function openEditor(title, initial, len, onDone, onBack) {
  var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var chars = [];
  initial = (initial || '').toUpperCase();
  for (var i = 0; i < len; i++) {
    var idx = A.indexOf(initial[i] || 'A');
    chars.push(idx < 0 ? 0 : idx);
  }
  editorCtx = { title: title, A: A, chars: chars, len: len, slot: 0, onDone: onDone, onBack: onBack };
  go(editorScreen);
}
function editorString() {
  var s = '';
  for (var i = 0; i < editorCtx.chars.length; i++) s += editorCtx.A[editorCtx.chars[i]];
  return s;
}
var editorScreen = {
  update: function () {
    var c = editorCtx, q = Input.drainMenu(), i;
    for (i = 0; i < q.length; i++) {
      var e = q[i];
      if (e === 'back') { Audio2.sfx.back(); c.onBack(); return; }
      else if (e === 'left') { c.slot = (c.slot + c.len - 1) % c.len; Audio2.sfx.move(); }
      else if (e === 'right') { c.slot = (c.slot + 1) % c.len; Audio2.sfx.move(); }
      else if (e === 'up') { c.chars[c.slot] = (c.chars[c.slot] + 1) % c.A.length; Audio2.sfx.move(); }
      else if (e === 'down') { c.chars[c.slot] = (c.chars[c.slot] + c.A.length - 1) % c.A.length; Audio2.sfx.move(); }
      else if (e === 'ok') { Audio2.sfx.select(); c.onDone(editorString()); return; }
    }
    var taps = Input.taps, slotW = 30, x0 = W / 2 - (c.len * slotW) / 2;
    for (i = 0; i < taps.length; i++) {
      var p = taps[i];
      if (p.y > H - 42 && Math.abs(p.x - W / 2) < 34) { Audio2.sfx.select(); c.onDone(editorString()); return; }
      var sx = Math.floor((p.x - x0) / slotW);
      if (sx >= 0 && sx < c.len) {
        c.slot = sx;
        if (p.y < 128) c.chars[sx] = (c.chars[sx] + 1) % c.A.length;
        else if (p.y > 148) c.chars[sx] = (c.chars[sx] + c.A.length - 1) % c.A.length;
        Audio2.sfx.move();
      }
    }
  },
  draw: function () {
    drawBgPanels();
    var c = editorCtx;
    ctext(c.title, W / 2, 34, COL_ACC, 2);
    var slotW = 30, x0 = W / 2 - (c.len * slotW) / 2;
    for (var i = 0; i < c.len; i++) {
      var x = x0 + i * slotW + slotW / 2, sel = i === c.slot;
      if (sel) {
        ctx.fillStyle = 'rgba(242,202,78,0.14)'; ctx.fillRect(x - 13, 126, 26, 22);
        ctext('^', x, 116, COL_ACC); ctext('v', x, 152, COL_ACC);
      }
      ctext(c.A[c.chars[i]], x, 130, sel ? COL_ACC : COL_TEXT, 2);
    }
    ctx.fillStyle = '#22223c'; ctx.fillRect(W / 2 - 34, H - 42, 68, 22);
    ctext('DONE', W / 2, H - 36, COL_ACC);
    ctext('UP/DOWN LETTER   LEFT/RIGHT SLOT', W / 2, H - 14, COL_DIM);
  }
};

var onlineScreen = {
  list: null,
  enter: function () { this.list = new MenuList(['LEADERBOARDS', 'VS ONLINE', 'SET NAME'], W / 2 - 44, 92, 16); },
  update: function () {
    var q = Input.drainMenu(), i;
    for (i = 0; i < q.length; i++) {
      if (q[i] === 'back') { Audio2.sfx.back(); go(menuScreen); return; }
      var pick = this.list.onMenu(q[i]);
      if (pick) return this.act(pick);
    }
    var taps = Input.taps;
    for (i = 0; i < taps.length; i++) { var p = this.list.tap(taps[i]); if (p) return this.act(p); }
  },
  act: function (pick) {
    if (pick === 'SET NAME')
      openEditor('YOUR NAME', currentTag(), 4,
        function (s) { Save.set('pilotTag', s.replace(/ /g, 'A')); go(onlineScreen); },
        function () { go(onlineScreen); });
    else if (pick === 'LEADERBOARDS') go(leaderboardScreen);
    else if (pick === 'VS ONLINE') {
      if (!Net.isEnabled()) showToast('ONLINE NOT AVAILABLE');
      else go(vsOnlineScreen);
    }
  },
  draw: function () {
    drawBgPanels();
    ctext('ONLINE', W / 2, 30, COL_ACC, 2);
    this.list.draw();
    ctext('NAME: ' + currentTag(), W / 2, 150, COL_TEXT);
    ctext(Net.isEnabled() ? 'CONNECTED' : 'OFFLINE - LOCAL ONLY', W / 2, 168,
      Net.isEnabled() ? COL_OK : COL_DIM);
    ctext('ESC BACK', W / 2, H - 12, COL_DIM);
    drawVolumeBar();
  }
};

var leaderboardScreen = {
  mode: 'endless', scores: null, loading: false,
  enter: function () { this.mode = 'endless'; this.load(); },
  load: function () {
    var self = this; this.scores = null; this.loading = true;
    Net.fetchTop(this.mode, 10, function (list) { self.scores = list; self.loading = false; });
  },
  toggle: function () { this.mode = this.mode === 'endless' ? 'score' : 'endless'; Audio2.sfx.move(); this.load(); },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      var e = q[i];
      if (e === 'back' || e === 'ok') { Audio2.sfx.back(); go(onlineScreen); return; }
      if (e === 'left' || e === 'right' || e === 'up' || e === 'down') this.toggle();
    }
    if (Input.taps.length) this.toggle();
  },
  draw: function () {
    drawBgPanels();
    ctext('LEADERBOARD', W / 2, 20, COL_ACC, 2);
    ctext('< ' + (this.mode === 'endless' ? 'ENDLESS' : 'SCORE ATTACK') + ' >', W / 2, 42, COL_TEXT);
    var y = 62;
    if (this.loading) ctext('LOADING...', W / 2, 110, COL_DIM);
    else if (this.scores === null) {
      ctext('OFFLINE', W / 2, 96, COL_BAD);
      var best = this.mode === 'endless' ? Save.get('hiEndless') : Save.get('hiScore');
      ctext('YOUR BEST  ' + pad(best, 7), W / 2, 116, COL_TEXT);
    } else if (this.scores.length === 0) {
      ctext('NO SCORES YET', W / 2, 104, COL_DIM);
      ctext('BE THE FIRST!', W / 2, 118, COL_ACC);
    } else {
      for (var i = 0; i < this.scores.length; i++) {
        var s = this.scores[i], c = i < 3 ? COL_ACC : COL_TEXT;
        var nm = String(s.name || '???').slice(0, 4); // untrusted remote value
        var sc = Math.max(0, Math.min(9999999, s.score | 0));
        text((i + 1) + '.', W / 2 - 84, y + i * 13, COL_DIM);
        text(nm, W / 2 - 62, y + i * 13, c);
        text(pad(sc, 7), W / 2 + 14, y + i * 13, c);
      }
    }
    ctext('LEFT/RIGHT SWITCH   ESC BACK', W / 2, H - 12, COL_DIM);
  }
};

// ---- VS ONLINE (room codes + lockstep) --------------------------------------

var lobby = null; // { role, status, code, match, cancelled, started }

var vsOnlineScreen = {
  list: null,
  enter: function () { this.list = new MenuList(['HOST GAME', 'JOIN GAME'], W / 2 - 40, 100, 16); },
  update: function () {
    var q = Input.drainMenu(), i;
    for (i = 0; i < q.length; i++) {
      if (q[i] === 'back') { Audio2.sfx.back(); go(onlineScreen); return; }
      var pick = this.list.onMenu(q[i]); if (pick) return this.act(pick);
    }
    var taps = Input.taps;
    for (i = 0; i < taps.length; i++) { var p = this.list.tap(taps[i]); if (p) return this.act(p); }
  },
  act: function (pick) {
    if (pick === 'HOST GAME') startHost();
    else if (pick === 'JOIN GAME')
      openEditor('ENTER CODE', '', 4,
        function (code) { startJoin(code); },
        function () { go(vsOnlineScreen); });
  },
  draw: function () {
    drawBgPanels();
    ctext('VS ONLINE', W / 2, 30, COL_ACC, 2);
    this.list.draw();
    ctext('PLAYING AS ' + currentTag(), W / 2, 150, COL_DIM);
    ctext('ESC BACK', W / 2, H - 12, COL_DIM);
  }
};

function startHost() {
  lobby = { role: 'host', status: 'CREATING ROOM...', code: '', match: null, cancelled: false, started: false };
  go(lobbyScreen);
  Net.createRoom(currentTag(), function (match, code) {
    if (!match || lobby.cancelled) { if (match) match.leave(); if (lobby) lobby.status = 'FAILED'; return; }
    lobby.match = match; lobby.code = code; lobby.status = 'WAITING FOR PLAYER';
    setupMatch(match, 'h');
    match.ref.child('g/joined').on('value', function (snap) {
      if (snap.val() && !lobby.started) {
        lobby.started = true;
        match.ref.child('g/joined').off();
        // sets seed + round=1 -> the round listener drives beginNetMatch on
        // BOTH peers (single start path)
        match.startMatch(baseSeed());
      }
    });
  });
}
function startJoin(code) {
  lobby = { role: 'guest', status: 'JOINING...', code: code, match: null, cancelled: false, started: false };
  go(lobbyScreen);
  Net.joinRoom(code, currentTag(), function (match, err) {
    if (!match) { lobby.status = err === 'full' ? 'ROOM FULL' : 'NO SUCH ROOM'; return; }
    if (lobby.cancelled) { match.leave(); return; }
    lobby.match = match; lobby.status = 'CONNECTING...';
    setupMatch(match, 'g');
    // the host sets round=1 once it sees us join -> our round listener fires
    // -> beginNetMatch. No separate seed listener needed.
  });
}
var lobbyScreen = {
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'back') {
        if (lobby && lobby.match) lobby.match.leave();
        if (lobby) lobby.cancelled = true;
        Audio2.sfx.back(); go(vsOnlineScreen); return;
      }
    }
  },
  draw: function () {
    drawBgPanels();
    ctext('VS ONLINE', W / 2, 30, COL_ACC, 2);
    if (lobby && lobby.role === 'host' && lobby.code) {
      ctext('YOUR CODE', W / 2, 84, COL_DIM);
      ctext(lobby.code, W / 2, 104, COL_ACC, 3);
      ctext('SHARE IT WITH A FRIEND', W / 2, 140, COL_TEXT);
    }
    ctext(lobby ? lobby.status : '', W / 2, 172, COL_TEXT);
    ctext('ESC CANCEL', W / 2, H - 12, COL_DIM);
  }
};

var NET_DELAY = 18; // input-delay frames (buffers Firebase relay latency)

function beginNetMatch(match, side, seed) {
  var lv = 3;
  var boardH = new Engine.Board({ seed: seed, mode: 'vs', level: lv });
  var boardG = new Engine.Board({ seed: seed + 1, mode: 'vs', level: lv });
  var localB = side === 'h' ? boardH : boardG;
  var remoteB = side === 'h' ? boardG : boardH;
  game = {
    kind: 'net', side: side, match: match,
    boardH: boardH, boardG: boardG, b1: localB, b2: remoteB,
    bo1: { x: 48, y: 40 }, bo2: { x: 336, y: 40 },
    genFrame: 0, simFrame: 0, DELAY: NET_DELAY,
    localInputs: [], localHashes: {}, waiting: false, desync: false, oppLeft: false,
    over: false, overT: 0, winner: 0,
    countdown: COUNTDOWN_F, hitstop: 0, dispScore: 0,
    theme: themeFor(seed), paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  match.onOpponentLeave = function () {
    if (!game || game.kind !== 'net') return;
    game.oppLeft = true;
    if (!game.over) { game.over = true; game.overT = 0; game.winner = 1; Audio2.sfx.win(); }
  };
  match.onRematch = function () {
    // both sides asked for a rematch — host drives the next round
    if (game && game.kind === 'net' && game.side === 'h') match.nextRound(baseSeed());
  };
  match.onRoundStart = function () {
    match.readSeed(function (s) { if (s != null) beginNetMatch(match, side, s); });
  };
  game.oppTag = '???';
  match.ref.child(side === 'h' ? 'g/joined' : 'meta/host').once('value', function (s) {
    if (game && game.kind === 'net') game.oppTag = (s.val() || '???');
  });
  Fx.clear();
  Audio2.playSong('play');
  go(gameScreen);
}

// Match-level callbacks are set ONCE (not per round). Every match start —
// round 1 and every rematch — is driven by the single `round` listener, so
// beginNetMatch runs exactly once per round on each peer.
function setupMatch(match, side) {
  match.onOpponentLeave = function () {
    if (!game || game.kind !== 'net') return;
    game.oppLeft = true;
    if (!game.over) { game.over = true; game.overT = 0; game.winner = 1; Audio2.sfx.win(); }
  };
  match.onRematch = function () {
    if (game && game.kind === 'net' && side === 'h') match.nextRound(baseSeed());
  };
  match.onRoundStart = function () {
    // clear the relay buffers so a rematch doesn't compare against round-1's
    // stale remote hashes/inputs (harmless no-op on round 1)
    match.resetStreams();
    match.readSeed(function (s) { if (s != null) beginNetMatch(match, side, s); });
  };
}

function endNetMatch(g) {
  g.over = true; g.overT = 0; g.dispScore = g.b1.score;
  // you win if the opponent (remote board) topped out first
  g.winner = g.b2.gameOver ? (g.b1.gameOver ? 0 : 1) : 2;
  if (g.winner === 1) Audio2.sfx.win();
  else if (g.winner === 2) Audio2.sfx.lose();
}

// loopback "match" for offline smoke-testing the net path (remote == local,
// so the lockstep always has the peer's input). Never reachable via the UI.
function mockMatch() {
  var m = {
    _in: {}, onOpponentLeave: null, onRematch: null, onRoundStart: null,
    ref: { child: function () {
      return {
        on: function () {}, off: function () {}, remove: function () {},
        set: function () {}, transaction: function () {},
        once: function (ev, cb) { cb && cb({ val: function () { return null; }, exists: function () { return false; } }); }
      };
    } },
    sendInput: function (f, i) { m._in[f] = i; },
    getRemoteInput: function (f) { return m._in[f] !== undefined ? m._in[f] : null; },
    getRemoteHash: function () { return undefined; },
    sendHash: function () {}, flush: function () {}, leave: function () {},
    requestRematch: function () {}, startMatch: function () {},
    readSeed: function (cb) { cb(4242); }, nextRound: function () {}
  };
  return m;
}
window.__pp.startNetMock = function () { beginNetMatch(mockMatch(), 'h', 4242); };

// Esc / pause during an online match = forfeit (pausing would just stall the
// opponent, so there's no real pause online).
function forfeitNet() {
  var g = game;
  if (!g || g.kind !== 'net' || g.over) return;
  if (g.match) g.match.leave();
  g.over = true; g.overT = 0; g.winner = 2; g.oppLeft = false;
  Audio2.sfx.lose();
}

function screenBoOf(g, board) {
  // which screen slot a canonical board is drawn in, given our side
  if (g.side === 'h') return board === g.boardH ? g.bo1 : g.bo2;
  return board === g.boardG ? g.bo1 : g.bo2;
}
function routeNetAttacks(g) {
  var i, at;
  for (i = 0; i < g.boardH.attacks.length; i++) {
    at = g.boardH.attacks[i]; g.boardG.queueGarbage(at.w, at.h);
    Backgrounds.pulse(screenBoOf(g, g.boardG).x + Render.BOARD_W / 2, at.w * at.h);
  }
  for (i = 0; i < g.boardG.attacks.length; i++) {
    at = g.boardG.attacks[i]; g.boardH.queueGarbage(at.w, at.h);
    Backgrounds.pulse(screenBoOf(g, g.boardH).x + Render.BOARD_W / 2, at.w * at.h);
  }
  g.boardH.attacks.length = 0; g.boardG.attacks.length = 0;
}

// ---- VS DIFFICULTY SELECT ----------------------------------------------------

var vsSelectScreen = {
  list: null,
  enter: function () {
    this.list = new MenuList([1, 2, 3, 4, 5, 6, 7, 8], 200, 70, 14);
    this.list.idx = 2;
  },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'back') { Audio2.sfx.back(); go(menuScreen); return; }
      var pick = this.list.onMenu(q[i]);
      if (pick) { startVsCpu(pick); return; }
    }
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var pick2 = this.list.tap(taps[t]);
      if (pick2) { startVsCpu(pick2); return; }
    }
  },
  draw: function () {
    drawBgPanels();
    ctext('VS CPU', W / 2, 30, COL_ACC, 2);
    ctext('CHOOSE DIFFICULTY', W / 2, 52, COL_DIM);
    this.list.x = isPortrait() ? Math.round(W / 2 - 52) : 200;
    this.list.y = isPortrait() ? 76 : 70;
    var labels = [];
    var names = ['ROOKIE', 'EASY', 'NORMAL', 'SPICY', 'HARD', 'EXPERT', 'MASTER', 'INSANE'];
    for (var i = 0; i < 8; i++) labels.push((i + 1) + ' - ' + names[i]);
    this.list.draw(labels);
  }
};

// ---- PUZZLE SELECT -----------------------------------------------------------

var puzzleSelectScreen = {
  idx: 0,
  grid: function () {
    // 6 columns of level tiles; tighter pitch in portrait so they fit 270 wide
    return isPortrait()
      ? { x0: 13, cw: 41, y0: 72, rh: 32 }
      : { x0: 118, cw: 42, y0: 60, rh: 32 };
  },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      var ev = q[i];
      if (ev === 'back') { Audio2.sfx.back(); go(menuScreen); return; }
      if (ev === 'left' && this.idx % 6 > 0) { this.idx--; Audio2.sfx.move(); }
      if (ev === 'right' && this.idx % 6 < 5) { this.idx++; Audio2.sfx.move(); }
      if (ev === 'up' && this.idx >= 6) { this.idx -= 6; Audio2.sfx.move(); }
      if (ev === 'down' && this.idx < 24) { this.idx += 6; Audio2.sfx.move(); }
      if (ev === 'ok') { Audio2.sfx.select(); startPuzzle(this.idx); return; }
    }
    var g = this.grid();
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var p = taps[t];
      var c = Math.floor((p.x - g.x0) / g.cw), r = Math.floor((p.y - g.y0) / g.rh);
      if (c >= 0 && c < 6 && r >= 0 && r < 5) {
        var ti = r * 6 + c;
        if (ti >= 30) continue;
        if (this.idx === ti) { Audio2.sfx.select(); startPuzzle(ti); return; }
        this.idx = ti; Audio2.sfx.move();
      }
    }
  },
  draw: function () {
    drawBgPanels();
    ctext('PUZZLE', W / 2, 22, COL_ACC, 2);
    var g = this.grid();
    var cleared = Save.get('puzzleCleared');
    for (var i = 0; i < 30; i++) {
      var c = i % 6, r = Math.floor(i / 6);
      var x = g.x0 + c * g.cw, y = g.y0 + r * g.rh;
      var sel = i === this.idx;
      ctx.fillStyle = sel ? '#f2ca4e' : (cleared[i] ? '#2c5c38' : '#22223c');
      ctx.fillRect(x, y, 34, 24);
      ctx.fillStyle = sel ? '#7a5c10' : '#0a0a1c';
      ctx.fillRect(x + 1, y + 1, 32, 22);
      text(pad(i + 1, 2), x + 9, y + 5, sel ? COL_ACC : (cleared[i] ? COL_OK : COL_TEXT));
      if (cleared[i]) text('*', x + 24, y + 13, COL_OK);
    }
    ctext(Puzzle.LEVELS[this.idx].name + ' - ' + Puzzle.LEVELS[this.idx].sol.length + ' MOVES',
      W / 2, H - 26, COL_TEXT);
    ctext(isPortrait() ? 'B BACK' : 'ESC BACK', W / 2, H - 12, COL_DIM);
  }
};

// ---- STORY INTRO / DIALOG ------------------------------------------------------

var storyIntroScreen = {
  enter: function () {
    this.stage = Math.min(Save.get('storyStage'), 7);
    this.portrait = Story.drawPortrait(this.stage);
  },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'back') { Audio2.sfx.back(); go(menuScreen); return; }
      if (q[i] === 'ok') { Audio2.sfx.select(); startStory(this.stage); return; }
    }
    if (Input.taps.length) { startStory(this.stage); }
  },
  draw: function () {
    drawBgPanels();
    var st = Story.STAGES[this.stage];
    ctext('STAGE ' + (this.stage + 1) + ' OF 8', W / 2, 30, COL_DIM);
    ctx.drawImage(this.portrait, 0, 0, 26, 26, W / 2 - 39, 52, 78, 78);
    ctext(st.name, W / 2, 142, Sprites.palettes[st.color].f, 2);
    ctext('"' + st.intro + '"', W / 2, 172, COL_TEXT);
    if ((frame >> 5) % 2) ctext('ENTER TO BATTLE', W / 2, 210, COL_ACC);
    ctext('ESC BACK', W / 2, H - 12, COL_DIM);
  }
};

var storyEndScreen = {
  enter: function () { Audio2.playSong('results'); Audio2.sfx.win(); },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++)
      if (q[i] === 'ok' || q[i] === 'back') { go(menuScreen); return; }
    if (Input.taps.length) go(menuScreen);
  },
  draw: function () {
    drawBgPanels();
    ctext('CONGRATULATIONS!', W / 2, 60, COL_ACC, 2);
    ctext('LORD PRISM IS DEFEATED.', W / 2, 100);
    ctext('THE PANELS POP FREELY ONCE MORE.', W / 2, 116);
    ctext('THANK YOU FOR PLAYING', W / 2, 150, COL_TEXT);
    ctext('PANEL POP V' + APP_VERSION, W / 2, 164, COL_DIM);
    for (var i = 0; i < 6; i++) {
      ctx.drawImage(Sprites.panels[i].normal, W / 2 - 60 + i * 20, 186);
    }
    ctext('ENTER TO RETURN', W / 2, H - 14, COL_DIM);
  }
};

// ---- GAME SESSIONS ------------------------------------------------------------

var game = null; // active session object

function baseSeed() { return (Date.now() & 0xfffffff) >>> 0; }

// pick an environment theme from a seed (well-mixed so consecutive games
// don't repeat)
function themeFor(seed) {
  var h = (seed ^ (seed >>> 13)) * 0x9e3779b1;
  return ((h >>> 8) % Backgrounds.count + Backgrounds.count) % Backgrounds.count;
}

// --- solo (endless / score attack)
var COUNTDOWN_F = 150; // 3..2..1..GO!

function startSolo(mode) {
  var seed = baseSeed();
  game = {
    kind: 'solo', mode: mode,
    board: new Engine.Board({ seed: seed, mode: mode === 'score' ? 'score' : 'endless', level: mode === 'score' ? 3 : 1 }),
    bo: { x: 56, y: 34 },
    timer: mode === 'score' ? 120 * 60 : 0,
    theme: themeFor(seed),
    over: false, overT: 0,
    countdown: COUNTDOWN_F, hitstop: 0, dispScore: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
  Input.consumePointers(); // a finger held through RESTART can't act on the new board
  Audio2.playSong('play');
  go(gameScreen);
}

// --- vs (cpu / 2p / story)
function startVsCpu(tier, storyStage) {
  var seed = baseSeed();
  game = {
    kind: 'vs', cpu: true, tier: tier,
    storyStage: (storyStage === undefined ? null : storyStage),
    b1: new Engine.Board({ seed: seed, mode: 'vs', level: 2 + Math.floor(tier / 2) }),
    b2: new Engine.Board({ seed: seed + 1, mode: 'vs', level: 2 + Math.floor(tier / 2) }),
    bo1: { x: 48, y: 40 }, bo2: { x: 336, y: 40 },
    theme: (storyStage !== undefined && storyStage !== null)
      ? Story.STAGES[storyStage].bg : themeFor(seed),
    over: false, overT: 0, winner: 0,
    countdown: COUNTDOWN_F, hitstop: 0, dispScore: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  game.ai = new AiPlayer(game.b2, tier, seed + 99);
  Fx.clear();
  Input.consumePointers(); // a finger held through RESTART can't act on the new board
  Audio2.playSong('play');
  go(gameScreen);
}

function startVs2P() {
  var seed = baseSeed();
  game = {
    kind: 'vs', cpu: false,
    b1: new Engine.Board({ seed: seed, mode: 'vs', level: 3 }),
    b2: new Engine.Board({ seed: seed + 1, mode: 'vs', level: 3 }),
    bo1: { x: 48, y: 40 }, bo2: { x: 336, y: 40 },
    theme: themeFor(seed),
    over: false, overT: 0, winner: 0,
    countdown: COUNTDOWN_F, hitstop: 0, dispScore: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
  Input.consumePointers(); // a finger held through RESTART can't act on the new board
  Audio2.playSong('play');
  go(gameScreen);
}

function startStory(stage) {
  startVsCpu(Story.STAGES[stage].tier, stage);
}

// --- puzzle
function startPuzzle(idx) {
  game = {
    kind: 'puzzle', idx: idx,
    board: Puzzle.loadLevel(Engine.Board, idx),
    bo: { x: 56, y: 34 },
    theme: idx % Backgrounds.count, // calm rotation through the environments
    over: false, overT: 0, won: false,
    settleWait: 0,
    countdown: 0, hitstop: 0, movePunch: 0, // puzzles start instantly (zen)
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
  Input.consumePointers(); // a finger held through RESTART can't act on the new board
  Audio2.playSong('play');
  go(gameScreen);
}

// touch -> cursor moves; returns true when the engine should swap this frame.
// Two schemes coexist: tap a cell to move the cursor / tap the cursor to
// swap, and DRAG a panel horizontally to swap it along under your finger
// (one swap per frame, so a fast fling walks the panel cell by cell).
// `tch` is the per-game drag state {dragId, dragCx, dragCy}.
// TODO(netplay): cursor writes here bypass the input log; route through
// synthesized directional inputs before building replays/online play
function touchBoard(board, bo, tch) {
  var swapReq = false;
  var i, cx, cy;
  // panels render up to a cell ABOVE their grid row while the stack rises —
  // map screen points to the row the player is visually touching
  var riseOff = Math.floor(board.riseSub / Engine.CELL_SUB * 16);

  // taps (fire on finger-up with little movement)
  var taps = Input.taps;
  for (i = 0; i < taps.length; i++) {
    var p = taps[i];
    cx = Math.floor((p.x - bo.x) / 16); cy = Math.floor((p.y - bo.y + riseOff) / 16);
    if (cx < 0 || cx > 5 || cy < 0 || cy > 11) continue;
    if (cx > 4) cx = 4;
    if (board.cursor.x === cx && board.cursor.y === cy) {
      swapReq = true;
    } else {
      board.cursor.x = cx; board.cursor.y = cy;
      Audio2.sfx.move();
    }
  }

  // drag-to-swap
  var pts = Input.pointers();
  var drag = null;
  if (tch.dragId !== null) {
    // require moved: browsers recycle pointer ids (mouse always id 1), and a
    // fresh same-id press must not resume the old drag's stale column
    for (i = 0; i < pts.length; i++)
      if (pts[i].id === tch.dragId && pts[i].moved) { drag = pts[i]; break; }
    if (!drag) tch.dragId = null; // finger lifted (or id was recycled)
  }
  if (tch.dragId === null) {
    // adopt the first moved pointer whose START was on the board
    for (i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (!q.moved) continue;
      var scx = Math.floor((q.sx - bo.x) / 16), scy = Math.floor((q.sy - bo.y + riseOff) / 16);
      if (scx < 0 || scx > 5 || scy < 0 || scy > 11) continue;
      tch.dragId = q.id;
      tch.dragCx = scx; tch.dragCy = scy;
      drag = q;
      break;
    }
  }
  if (drag) {
    cx = Math.floor((drag.x - bo.x) / 16); cy = Math.floor((drag.y - bo.y + riseOff) / 16);
    if (cx < 0) cx = 0; if (cx > 5) cx = 5;
    if (cy < 0) cy = 0; if (cy > 11) cy = 11;
    tch.dragCy = cy; // the finger row is where we attempt swaps
    if (cx > tch.dragCx && tch.dragCx <= 4 && !swapReq) {
      // dragging right: cursor covers (dragCx, dragCx+1). Only advance the
      // drag when the swap is actually legal RIGHT NOW (the dragged panel is
      // un-swappable for 4 frames mid-animation) — otherwise retry next
      // frame so a fast fling walks the panel cell by cell without stranding
      if (dragSwapLegal(board, tch.dragCx, tch.dragCy)) {
        board.cursor.x = tch.dragCx; board.cursor.y = tch.dragCy;
        swapReq = true;
        tch.dragCx++;
      }
    } else if (cx < tch.dragCx && tch.dragCx >= 1 && !swapReq) {
      if (dragSwapLegal(board, tch.dragCx - 1, tch.dragCy)) {
        board.cursor.x = tch.dragCx - 1; board.cursor.y = tch.dragCy;
        swapReq = true;
        tch.dragCx--;
      }
    }
  }

  return swapReq;
}

function dragSwapLegal(board, x, y) {
  var a = board.grid[y][x], b = board.grid[y][x + 1];
  if (!board.canSwapCell(a) || !board.canSwapCell(b)) return false;
  return !(a.state === Engine.EMPTY && b.state === Engine.EMPTY);
}

// is the floating on-screen control deck showing (touch + portrait)?
function deckActive() {
  return !!(window.Touchpad && Touchpad.deckActive && Touchpad.deckActive());
}

// RAISE on-screen button zone (landscape / desktop fallback; the portrait deck
// carries its own RAISE). Recomputed from W/H each use since they now vary.
var raiseBtn = { x: 0, y: 0, w: 52, h: 26 };
function syncRaiseBtn() { raiseBtn.x = W - 66; raiseBtn.y = H - 40; }
function raiseHeld() {
  if (deckActive()) return false; // the floating deck's RAISE feeds the pad
  var pts = Input.heldPoints();
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (p.x >= raiseBtn.x && p.x <= raiseBtn.x + raiseBtn.w &&
        p.y >= raiseBtn.y && p.y <= raiseBtn.y + raiseBtn.h) return true;
  }
  return false;
}

// ---- GAME SCREEN ----------------------------------------------------------------

var gameScreen = {
  update: function () {
    var g = game;
    layoutGame(g); // keep board placement current (handles rotation mid-match)

    // cursor glide + ambient background advance at sim rate on every path
    // (incl. pause/countdown/hitstop) so they never stall or vary by refresh
    Backgrounds.tick(g.theme);
    if (g.kind === 'vs' || g.kind === 'net') { Render.tickCursorLerp(g.b1); Render.tickCursorLerp(g.b2); }
    else Render.tickCursorLerp(g.board);

    if (g.paused) { this.updatePause(); return; }

    // discard stale menu events during play (WASD etc. would otherwise pile
    // up and replay into the pause menu)
    Input.drainMenu();

    // pre-game countdown: boards visible but frozen
    if (g.countdown > 0 && !g.over) {
      if (g.countdown === COUNTDOWN_F || g.countdown === COUNTDOWN_F - 40 ||
          g.countdown === COUNTDOWN_F - 80) Audio2.sfx.count();
      if (g.countdown === 31) Audio2.sfx.go(); // GO! draws at 30 — same frame
      g.countdown--;
      Fx.update();
      return;
    }

    // hitstop: brief full freeze on big chains/combos
    if (g.hitstop > 0 && !g.over) { g.hitstop--; return; }

    if (g.kind === 'solo') this.updateSolo();
    else if (g.kind === 'vs') this.updateVs();
    else if (g.kind === 'net') this.updateNet();
    else if (g.kind === 'puzzle') this.updatePuzzle();

    Fx.update();
  },

  updateNet: function () {
    var g = game, m = g.match;
    if (g.over) {
      g.boardH.step(null); g.boardG.step(null);
      g.overT++;
      if (g.overT > 90) go(resultsScreen);
      return;
    }
    // local input is the DETERMINISTIC packet only (keyboard + on-screen pad);
    // touch cell-tap/drag is intentionally NOT used online — it writes the
    // cursor directly and would desync the lockstep.
    var li = Input.boardInput(0, true);
    g.localInputs[g.genFrame] = li;
    m.sendInput(g.genFrame, li);
    g.genFrame++;

    g.waiting = false;
    var steps = 0;
    while (g.simFrame < g.genFrame - g.DELAY && steps < 8) {
      var ri = m.getRemoteInput(g.simFrame);
      if (ri === null) { g.waiting = true; break; } // stall until the peer's input arrives
      g.waitTicks = 0;
      var lin = g.localInputs[g.simFrame] || { left: false, right: false, up: false, down: false, swap: false, raise: false };
      var hIn = g.side === 'h' ? lin : ri;
      var gIn = g.side === 'h' ? ri : lin;
      g.boardH.step(hIn); g.boardG.step(gIn);
      routeNetAttacks(g);
      processEvents(g.boardH, screenBoOf(g, g.boardH), null);
      processEvents(g.boardG, screenBoOf(g, g.boardG), null);
      g.dispScore += Math.ceil((g.b1.score - g.dispScore) * 0.2);

      // desync guard: exchange a combined hash every 30 frames, compare when
      // the peer's hash for a past frame is in
      if (g.simFrame % 30 === 0) {
        var h = (g.boardH.hash() ^ Math.imul(g.boardG.hash(), 31)) >>> 0;
        g.localHashes[g.simFrame] = h;
        m.sendHash(g.simFrame, h);
      }
      g.simFrame++; steps++;

      if (g.boardH.gameOver || g.boardG.gameOver) { endNetMatch(g); break; }
    }
    // compare any peer hashes we can
    for (var f in g.localHashes) {
      var rh = m.getRemoteHash(f | 0);
      if (rh !== undefined) {
        if (rh !== g.localHashes[f]) { g.desync = true; if (!g.over) { g.over = true; g.overT = 0; g.winner = 0; } }
        delete g.localHashes[f];
      }
    }
    // liveness: if the peer's inputs stop arriving for too long (a frozen /
    // silently-dropped client whose onDisconnect never fired), end the match
    // rather than hang forever.
    if (g.waiting) {
      g.waitTicks = (g.waitTicks || 0) + 1;
      if (g.waitTicks > 8 * 60 && !g.over) { // ~8s of no peer input
        g.oppLeft = true; g.over = true; g.overT = 0; g.winner = 1; Audio2.sfx.win();
        if (m.leave) m.leave();
      }
    }
  },

  updateSolo: function () {
    var g = game, b = g.board;
    if (!g.over) {
      var inp = Input.boardInput(0, true);
      if (raiseHeld()) inp.raise = true;
      if (touchBoard(b, g.bo, g.touch)) inp.swap = true;
      b.step(inp);
      processEvents(b, g.bo, g);
      g.dispScore += Math.ceil((b.score - g.dispScore) * 0.2);

      if (g.mode === 'score') {
        g.timer--;
        // final 10 seconds tick
        if (g.timer > 0 && g.timer <= 600 && g.timer % 60 === 0) Audio2.sfx.tick();
        if (g.timer <= 0 && !b.gameOver) {
          b.gameOver = true; g.won = true;
        }
      }
      Audio2.playSong(b.inWarning() && !b.gameOver ? 'panic' : 'play');
      if (b.gameOver) { g.over = true; g.overT = 0; g.dispScore = b.score; }
    } else {
      b.step(null);
      g.overT++;
      if (g.overT === 40) {
        // records — flag at save time so the results banner is exact
        if (g.mode === 'endless') {
          if (b.score > Save.get('hiEndless')) { Save.set('hiEndless', b.score); g.newRecord = true; }
          if (b.maxChain > Save.get('bestChainEndless')) Save.set('bestChainEndless', b.maxChain);
        } else {
          if (b.score > Save.get('hiScore')) { Save.set('hiScore', b.score); g.newRecord = true; }
        }
        // online leaderboard (fail-silent)
        if (Net.isEnabled() && b.score > 0)
          Net.submitScore(g.mode === 'score' ? 'score' : 'endless', currentTag(), b.score);
      }
      if (g.overT > 60) go(resultsScreen);
    }
  },

  updateVs: function () {
    var g = game;
    if (!g.over) {
      var inp1 = Input.boardInput(0, g.cpu); // vs cpu: either mapping works
      if (touchBoard(g.b1, g.bo1, g.touch)) inp1.swap = true;
      if (raiseHeld()) inp1.raise = true;
      var inp2 = g.cpu ? g.ai.update() : Input.boardInput(1, false);
      g.b1.step(inp1);
      g.b2.step(inp2);
      processEvents(g.b1, g.bo1, g);
      processEvents(g.b2, g.bo2, g);
      g.dispScore += Math.ceil((g.b1.score - g.dispScore) * 0.2);

      // route attacks — a bold drop lights up the side it lands on (the wash
      // brightens more for a bigger block)
      var i, at;
      for (i = 0; i < g.b1.attacks.length; i++) {
        at = g.b1.attacks[i];
        g.b2.queueGarbage(at.w, at.h);
        Backgrounds.pulse(g.bo2.x + Render.BOARD_W / 2, at.w * at.h);
      }
      for (i = 0; i < g.b2.attacks.length; i++) {
        at = g.b2.attacks[i];
        g.b1.queueGarbage(at.w, at.h);
        Backgrounds.pulse(g.bo1.x + Render.BOARD_W / 2, at.w * at.h);
      }
      g.b1.attacks.length = 0;
      g.b2.attacks.length = 0;

      Audio2.playSong((g.b1.inWarning() || g.b2.inWarning()) ? 'panic' : 'play');

      if (g.b1.gameOver || g.b2.gameOver) {
        g.over = true; g.overT = 0; g.dispScore = g.b1.score;
        // check b2 first: an exact-frame double-KO resolves in the player's
        // favor (biases P1 in 2P; a same-frame tie across two independently
        // seeded boards is negligible, and a story-mode tie counts as a win)
        g.winner = g.b2.gameOver ? 1 : 2;
        if (g.winner === 1) Audio2.sfx.win();
        if (g.cpu && g.winner === 1) Save.set('vsWins', Save.get('vsWins') + 1);
        // story progression
        if (g.storyStage !== null && g.winner === 1) {
          var next = g.storyStage + 1;
          if (next > Save.get('storyStage')) Save.set('storyStage', next);
          if (next >= 8) Save.set('storyBeaten', true);
        }
      }
    } else {
      g.b1.step(null); g.b2.step(null);
      g.overT++;
      if (g.overT > 90) go(resultsScreen);
    }
  },

  updatePuzzle: function () {
    var g = game, b = g.board;
    if (!g.over) {
      var inp = Input.boardInput(0, true);
      inp.raise = false;
      if (b.movesLeft <= 0) inp.swap = false; // budget spent — no more swaps
      // budget spent: don't run touch either (cursor jitter during settle)
      if (b.movesLeft > 0 && touchBoard(b, g.bo, g.touch)) inp.swap = true;
      b.step(inp);
      processEvents(b, g.bo, g);
      // count executed swaps (restart lives in the pause menu)
      for (var i = 0; i < b.events.length; i++)
        if (b.events[i].t === 'swap') { b.movesLeft--; g.movePunch = 10; }
      if (g.movePunch > 0) g.movePunch--;

      if (Puzzle.settled(b, Engine)) {
        g.settleWait++;
        if (g.settleWait > 20) {
          if (b.isEmpty()) {
            g.over = true; g.won = true; g.overT = 0;
            var pc = Save.get('puzzleCleared'); pc[g.idx] = true; Save.set('puzzleCleared', pc);
            Audio2.sfx.win();
          } else if (b.movesLeft <= 0) {
            g.over = true; g.won = false; g.overT = 0;
            Audio2.sfx.lose();
          }
        }
      } else {
        g.settleWait = 0;
      }
    } else {
      b.step(null);
      g.overT++;
      if (g.overT > 50) go(resultsScreen);
    }
  },

  updatePause: function () {
    var g = game;
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      var pick = g.pauseList.onMenu(q[i]);
      if (q[i] === 'back') { togglePause(); return; }
      if (pick === 'CONTINUE') { togglePause(); return; }
      if (pick === 'RESTART') { restartGame(); return; }
      if (pick === 'QUIT') { Audio2.sfx.back(); go(menuScreen); return; }
    }
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var pick2 = g.pauseList.tap(taps[t]);
      if (pick2 === 'CONTINUE') { togglePause(); return; }
      if (pick2 === 'RESTART') { restartGame(); return; }
      if (pick2 === 'QUIT') { go(menuScreen); return; }
    }
  },

  draw: function () {
    var g = game;
    layoutGame(g);
    var port = isPortrait();
    var HALF = Render.BOARD_W / 2;
    // layered environment behind everything
    Backgrounds.draw(ctx, g.theme, frame);

    if (g.kind === 'solo' || g.kind === 'puzzle') {
      var b = g.board;
      Backgrounds.halo(ctx, g.bo.x, g.bo.y, Render.BOARD_W, Render.BOARD_H);
      drawBoardFrame(g.bo.x, g.bo.y, COL_BLUE);
      Render.drawBoard(ctx, b, g.bo.x, g.bo.y, {});
      if (g.kind === 'solo') {
        if (port) drawSoloHudStrip(b, g);
        else drawSoloHud(b, g.bo.x + 120, 40, g.mode, g.timer, g.dispScore);
      } else {
        if (port) drawPuzzleHudStrip(g);
        else {
          var lv = Puzzle.LEVELS[g.idx], hx = g.bo.x + 120;
          text('PUZZLE ' + (g.idx + 1), hx, 40, COL_DIM);
          text(lv.name, hx, 50, COL_TEXT);
          text('MOVES LEFT', hx, 70, COL_DIM);
          text('' + Math.max(0, g.board.movesLeft), hx, 80,
            g.board.movesLeft > 0 ? COL_ACC : COL_BAD, g.movePunch > 5 ? 3 : 2);
          text('ESC: PAUSE/RETRY', hx, 104, COL_DIM);
          if (g.board.maxChain >= 2) text('CHAIN x' + g.board.maxChain + '!', hx, 122, COL_ACC);
        }
      }
      // on-canvas RAISE button only when there's no floating deck (desktop /
      // landscape mobile) — the phone deck carries its own RAISE
      if (g.kind === 'solo' && !deckActive()) {
        ctx.fillStyle = '#22223c';
        ctx.fillRect(raiseBtn.x, raiseBtn.y, raiseBtn.w, raiseBtn.h);
        text('RAISE', raiseBtn.x + 8, raiseBtn.y + 9, COL_DIM);
      }
      if (g.over) {
        var msg = g.kind === 'puzzle'
          ? (g.won ? 'CLEAR!' : 'OUT OF MOVES')
          : (g.won ? 'TIME UP!' : 'GAME OVER');
        ctext(msg, g.bo.x + HALF, g.bo.y + 80, g.won ? COL_ACC : COL_BAD, stampScale(g.overT));
      }
    } else {
      // vs — each board framed in its player's color so they read as separate
      // spaces (you = green, rival = red), side by side with a clear gutter
      Backgrounds.halo(ctx, g.bo1.x, g.bo1.y, Render.BOARD_W, Render.BOARD_H);
      Backgrounds.halo(ctx, g.bo2.x, g.bo2.y, Render.BOARD_W, Render.BOARD_H);
      drawBoardFrame(g.bo1.x, g.bo1.y, COL_OK);
      drawBoardFrame(g.bo2.x, g.bo2.y, COL_BAD);
      Render.drawBoard(ctx, g.b1, g.bo1.x, g.bo1.y, {});
      Render.drawBoard(ctx, g.b2, g.bo2.x, g.bo2.y, { showCursor: true });
      var cxm = g.centerX;
      var leftName = g.kind === 'net' ? currentTag() : (g.cpu ? 'YOU' : 'P1');
      var rightName = g.kind === 'net' ? (g.oppTag || '???')
        : (g.cpu ? (g.storyStage !== null ? Story.STAGES[g.storyStage].name : 'CPU LV' + g.tier) : 'P2');
      var nameY = g.bo1.y - (port ? 16 : 14);
      var garbY = g.bo1.y - (port ? 28 : 26);
      ctext(leftName, g.bo1.x + HALF, nameY, COL_OK);
      ctext(rightName, g.bo2.x + HALF, nameY, COL_BAD);
      // score / chain / status: a top band in portrait (thin gutter), a center
      // column in landscape (wide gutter)
      if (port) {
        ctext('SCORE ' + pad(g.dispScore, 7), cxm, 26, COL_TEXT);
        ctext('CHAIN x' + g.b1.maxChain, cxm, 40, g.b1.maxChain >= 3 ? COL_ACC : COL_DIM);
        if (g.kind === 'net' && !g.over) {
          if (g.desync) ctext('DESYNC', cxm, 54, COL_BAD);
          else if (g.waiting && (frame >> 3) % 2) ctext('WAITING...', cxm, 54, COL_DIM);
        }
      } else {
        ctext('SCORE', cxm, 60, COL_DIM);
        ctext(pad(g.dispScore, 7), cxm, 70);
        ctext('CHAIN x' + g.b1.maxChain, cxm, 86, g.b1.maxChain >= 3 ? COL_ACC : COL_DIM);
        if (g.kind === 'net' && !g.over) {
          if (g.desync) ctext('DESYNC', cxm, 108, COL_BAD);
          else if (g.waiting && (frame >> 3) % 2) ctext('WAITING...', cxm, 108, COL_DIM);
        }
      }
      // pending garbage warning above each board
      var q1 = 0, q2 = 0, i;
      for (i = 0; i < g.b1.garbageQueue.length; i++) q1 += g.b1.garbageQueue[i].w * g.b1.garbageQueue[i].h;
      for (i = 0; i < g.b2.garbageQueue.length; i++) q2 += g.b2.garbageQueue[i].w * g.b2.garbageQueue[i].h;
      if (q1) ctext('! ' + q1, g.bo1.x + HALF, garbY, COL_BAD);
      if (q2) ctext('! ' + q2, g.bo2.x + HALF, garbY, COL_BAD);

      if (g.over) {
        if (g.kind === 'net' && g.winner === 0) {
          ctext(g.desync ? 'DESYNC' : 'DRAW', cxm, port ? g.bo1.y + 90 : 130, COL_BAD, 2);
        } else {
          var wbo = g.winner === 1 ? g.bo1 : g.bo2;
          var lbo = g.winner === 1 ? g.bo2 : g.bo1;
          ctext('WIN!', wbo.x + HALF, wbo.y + 80, COL_ACC, stampScale(g.overT));
          ctext('LOSE', lbo.x + HALF, lbo.y + 80, COL_BAD, stampScale(g.overT));
        }
        if (g.kind === 'net' && g.oppLeft) ctext('OPPONENT LEFT', cxm, port ? g.bo1.y + 110 : 150, COL_DIM);
      }
    }

    Fx.draw(ctx);

    // pre-game countdown overlay
    if (g.countdown > 0 && !g.over) {
      var n = g.countdown > COUNTDOWN_F - 40 ? '3'
            : g.countdown > COUNTDOWN_F - 80 ? '2'
            : g.countdown > 30 ? '1' : 'GO!';
      // punch-in anchored to each number's window START
      var winStart = g.countdown > COUNTDOWN_F - 40 ? COUNTDOWN_F - 1
                   : g.countdown > COUNTDOWN_F - 80 ? COUNTDOWN_F - 41
                   : g.countdown > 30 ? COUNTDOWN_F - 81 : 30;
      var cs = (winStart - g.countdown) < 5 ? 5 : 4;
      var boards = (g.kind === 'vs' || g.kind === 'net') ? [g.bo1, g.bo2] : [g.bo];
      for (var bi = 0; bi < boards.length; bi++) {
        var bb = boards[bi];
        ctext(n, bb.x + HALF + 1, bb.y + 78 + 1, '#101020', cs);
        ctext(n, bb.x + HALF, bb.y + 78, n === 'GO!' ? COL_OK : COL_ACC, cs);
      }
    }

    if (g.paused) {
      ctx.fillStyle = 'rgba(8,8,20,0.8)';
      ctx.fillRect(0, 0, W, H);
      ctext('PAUSED', W / 2, port ? Math.round(H * 0.30) : 70, COL_ACC, 2);
      g.pauseList.draw();
    }
  }
};

// right-aligned text (portrait HUD strips)
function rtext(t, xr, y, col, s) {
  Font.drawText(ctx, t, xr - Font.textWidth(t, s || 1), y, col || COL_TEXT, s || 1);
}

// portrait solo HUD: a thin strip across the top (score | time | speed/chain)
function drawSoloHudStrip(b, g) {
  var y = 12;
  text('SCORE', 8, y, COL_DIM);
  text(pad(g.dispScore, 7), 8, y + 9,
    g.dispScore < b.score ? COL_ACC : COL_TEXT);
  var tv = g.mode === 'score' ? mmss(g.timer) : mmss(b.frame);
  ctext('TIME', W / 2, y, COL_DIM);
  ctext(tv, W / 2, y + 9, (g.mode === 'score' && g.timer < 600) ? COL_BAD : COL_TEXT);
  rtext('SPD ' + b.level, W - 8, y, COL_DIM);
  rtext('CHAIN x' + b.maxChain, W - 8, y + 9, b.maxChain >= 4 ? COL_ACC : COL_TEXT);
  if (b.stopTimer > 0) {
    ctx.fillStyle = COL_BLUE;
    ctx.fillRect(8, y + 20, Math.min(W - 16, b.stopTimer / 10 * 3), 3);
  }
}

// portrait puzzle HUD strip (level | moves | chain)
function drawPuzzleHudStrip(g) {
  var lv = Puzzle.LEVELS[g.idx], y = 12;
  text('PUZZLE ' + (g.idx + 1), 8, y, COL_DIM);
  text(lv.name, 8, y + 9, COL_TEXT);
  ctext('MOVES', W / 2, y, COL_DIM);
  ctext('' + Math.max(0, g.board.movesLeft), W / 2, y + 8,
    g.board.movesLeft > 0 ? COL_ACC : COL_BAD, g.movePunch > 5 ? 2 : 1);
  if (g.board.maxChain >= 2) rtext('CHAIN x' + g.board.maxChain, W - 8, y, COL_ACC);
}

// big banner text punches in oversized then settles
function stampScale(t) { return t < 5 ? 4 : (t < 10 ? 3 : 2); }

function togglePause() {
  var g = game;
  g.paused = !g.paused;
  Audio2.sfx.select();
  Input.drainMenu(); // flush the Esc that toggled us (it also queues 'back')
  if (g.paused) {
    var py = isPortrait() ? Math.round(H * 0.30) + 30 : 110;
    g.pauseList = new MenuList(['CONTINUE', 'RESTART', 'QUIT'], W / 2 - 30, py);
    Audio2.stopMusic();
  } else {
    Audio2.playSong('play');
  }
}

function restartGame() {
  var g = game;
  if (g.kind === 'solo') startSolo(g.mode);
  else if (g.kind === 'puzzle') startPuzzle(g.idx);
  else if (g.kind === 'vs' && g.cpu) {
    if (g.storyStage !== null) startStory(g.storyStage);
    else startVsCpu(g.tier);
  } else startVs2P();
}

function currentSongWanted() {
  if (screen === gameScreen && game) return game.paused ? null : 'play';
  if (screen === resultsScreen) return 'results';
  return 'menu';
}

// ---- RESULTS -------------------------------------------------------------------

var resultsScreen = {
  list: null,
  t: 0,
  disp: 0,
  enter: function () {
    Audio2.playSong('results');
    this.t = 0;
    this.disp = 0;
    var g = game;
    this.rematchWaiting = false;
    var items = ['RETRY', 'MENU'];
    if (g.kind === 'puzzle' && g.won && g.idx < 29) items.unshift('NEXT PUZZLE');
    if (g.kind === 'vs' && g.storyStage !== null && g.winner === 1) {
      items = g.storyStage >= 7 ? ['THE END...', 'MENU'] : ['NEXT STAGE', 'MENU'];
    }
    if (g.kind === 'net') items = (g.oppLeft || g.desync) ? ['MENU'] : ['REMATCH', 'MENU'];
    this.list = new MenuList(items, W / 2 - 40, 176);
  },
  update: function () {
    this.t++;
    var g = game;
    var finalScore = (g.kind === 'vs' || g.kind === 'net') ? g.b1.score : (g.board ? g.board.score : 0);
    this.disp += Math.ceil((finalScore - this.disp) * 0.12);
    if (this.disp > finalScore) this.disp = finalScore;
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'back') { if (g.kind === 'net' && g.match) g.match.leave(); go(menuScreen); return; }
      var pick = this.list.onMenu(q[i]);
      if (pick) return this.act(pick);
    }
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var pick2 = this.list.tap(taps[t]);
      if (pick2) return this.act(pick2);
    }
  },
  act: function (pick) {
    var g = game;
    if (pick === 'RETRY') restartGame();
    else if (pick === 'MENU') { if (g.kind === 'net' && g.match) g.match.leave(); go(menuScreen); }
    else if (pick === 'NEXT PUZZLE') startPuzzle(g.idx + 1);
    else if (pick === 'NEXT STAGE') go(storyIntroScreen);
    else if (pick === 'THE END...') go(storyEndScreen);
    else if (pick === 'REMATCH') { if (g.match) { this.rematchWaiting = true; g.match.requestRematch(); } }
  },
  draw: function () {
    drawBgPanels();
    var g = game;
    if (g.kind === 'solo') {
      ctext(g.mode === 'score' ? 'SCORE ATTACK' : 'ENDLESS', W / 2, 30, COL_DIM);
      ctext(g.won ? 'TIME UP!' : 'GAME OVER', W / 2, 48, g.won ? COL_ACC : COL_BAD, stampScale(this.t));
      ctext('SCORE ' + this.disp, W / 2, 84, this.disp < g.board.score ? COL_ACC : COL_TEXT);
      ctext('BEST CHAIN x' + g.board.maxChain, W / 2, 98);
      ctext('PANELS CLEARED ' + g.board.panelsCleared, W / 2, 112);
      if (g.newRecord && this.disp >= g.board.score && (frame >> 4) % 2)
        ctext('NEW RECORD!', W / 2, 132, COL_ACC);
    } else if (g.kind === 'puzzle') {
      ctext('PUZZLE ' + (g.idx + 1) + ' - ' + Puzzle.LEVELS[g.idx].name, W / 2, 30, COL_DIM);
      ctext(g.won ? 'CLEAR!' : 'OUT OF MOVES', W / 2, 48, g.won ? COL_OK : COL_BAD, stampScale(this.t));
      if (g.won && g.board.maxChain >= 2) ctext('CHAIN x' + g.board.maxChain + '!', W / 2, 84, COL_ACC);
    } else if (g.kind === 'net') {
      ctext('ONLINE MATCH', W / 2, 30, COL_DIM);
      var nmsg = g.winner === 1 ? 'YOU WIN!' : (g.winner === 2 ? 'YOU LOSE' : (g.desync ? 'DESYNC' : 'DRAW'));
      ctext(nmsg, W / 2, 50, g.winner === 1 ? COL_ACC : COL_BAD, stampScale(this.t));
      ctext('VS ' + (g.oppTag || '???'), W / 2, 86, COL_TEXT);
      ctext('SCORE ' + g.b1.score + '   CHAIN x' + g.b1.maxChain, W / 2, 104, COL_DIM);
      if (g.oppLeft) ctext('OPPONENT LEFT', W / 2, 122, COL_DIM);
      if (this.rematchWaiting) ctext('WAITING FOR OPPONENT...', W / 2, 150, COL_ACC);
    } else {
      var st = g.storyStage !== null ? Story.STAGES[g.storyStage] : null;
      ctext(g.winner === 1 ? 'YOU WIN!' : (g.cpu ? 'YOU LOSE' : 'PLAYER ' + g.winner + ' WINS!'),
        W / 2, 48, g.winner === 1 || !g.cpu ? COL_ACC : COL_BAD, stampScale(this.t));
      if (st) {
        ctext('"' + (g.winner === 1 ? st.win : st.lose) + '"', W / 2, 90, COL_TEXT);
      }
      ctext('SCORE ' + g.b1.score + '   CHAIN x' + g.b1.maxChain, W / 2, 118, COL_DIM);
    }
    this.list.draw();
  }
};

// ---- BOOT & LOOP -----------------------------------------------------------------

// volume/music keys work on EVERY screen; 'pause' only routes into a live
// game. Draining every frame everywhere also prevents Esc presses in menus
// from piling up and phantom-pausing the next game.
function handleGlobalKeys() {
  var gq = Input.drainGlobal();
  for (var i = 0; i < gq.length; i++) {
    var ev = gq[i];
    if (ev === 'pause') {
      if (screen === gameScreen && game && !game.over) {
        if (game.kind === 'net') forfeitNet(); else togglePause();
      }
    } else if (ev === 'volup') {
      Audio2.volUp(); showToast('VOL ' + Math.round(Audio2.getVolume() * 100) + '%');
    } else if (ev === 'voldown') {
      Audio2.volDown(); showToast('VOL ' + Math.round(Audio2.getVolume() * 100) + '%');
    } else if (ev === 'mute') {
      Audio2.setMusicOn(!Audio2.isMusicOn());
      showToast(Audio2.isMusicOn() ? 'MUSIC ON' : 'MUSIC OFF');
      if (Audio2.isMusicOn()) {
        var song = currentSongWanted();
        if (song) Audio2.playSong(song);
      }
    }
  }
}

function boot() {
  Save.load();
  Audio2.init();
  Net.init();
  SpritesBuild();
  Backgrounds.build();
  setupCanvas();
  Touchpad.setActive(); // build the deck + apply gb layout before first sizing
  resize();
  go(titleScreen);

  var last = performance.now();
  var acc = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    acc += Math.min(100, now - last);
    last = now;
    var steps = 0;
    while (acc >= 1000 / 60 && steps < 3) {
      handleGlobalKeys();
      Input.pumpPadMenu(); // D-pad -> menu nav on every screen
      screen.update();
      if (fadeT > 0) fadeT--; // sim-rate so the fade lasts the same everywhere
      Input.endFrame();
      frame++;
      acc -= 1000 / 60;
      steps++;
    }
    if (acc >= 1000 / 60) acc = 0; // dropped frames: don't spiral
    if ((frame % 60) === 0) resize(); // safety: some hosts report 0-size early
    screen.draw();
    drawVolumeBar(); // global overlay: volume/music toasts on every screen
    if (fadeT > 0) { // brief fade-in on screen changes (decremented in sim)
      ctx.fillStyle = 'rgba(8,8,20,' + (fadeT / 8 * 0.8).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    // Game-Boy control deck: permanent on touch devices (all screens)
    Touchpad.setActive();
  }
  requestAnimationFrame(loop);
}

window.addEventListener('load', boot);

window.APP_VERSION = APP_VERSION;

})();

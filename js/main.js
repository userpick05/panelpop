// PANEL POP — game shell: fixed-timestep loop, screens, modes, HUD, wiring.
'use strict';

(function () {

var APP_VERSION = '0.1.0';

var W = 480, H = 270;
var canvas, ctx;
var frame = 0;

// ---- canvas & scaling ------------------------------------------------------

function setupCanvas() {
  canvas = document.getElementById('game');
  canvas.width = W; canvas.height = H;
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  resize();
  window.addEventListener('resize', resize);
  Input.initTouch(canvas, function (cx, cy) {
    var r = canvas.getBoundingClientRect();
    return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
  });
}

function resize() {
  var ww = window.innerWidth, wh = window.innerHeight;
  var s = Math.min(ww / W, wh / H);
  if (!isFinite(s) || s <= 0.1) s = 1; // window not measurable yet
  if (s > 1.5) s = Math.floor(s); // integer scale when big enough
  canvas.style.width = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
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
function go(s) { screen = s; if (s.enter) s.enter(); }

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
    for (var i = 0; i < n; i++) { handleGlobalKeys(); screen.update(); Input.endFrame(); frame++; }
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

function processEvents(board, bo) {
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
          Fx.badge(ex + 16, ey - 6, 'x' + ev.chain + ' CHAIN!', COL_ACC);
          Audio2.sfx.chain(ev.chain);
          Fx.shake('b' + bo.x, Math.min(3, ev.chain));
        }
        if (ev.n >= 4) Fx.badge(ex + 16, ey + 6, ev.n + ' COMBO!', COL_BLUE);
        break;
      case 'land': if ((frame & 3) === 0) Audio2.sfx.land(); break;
      case 'garbage_land': Audio2.sfx.garbageLand(); Fx.shake('b' + bo.x, 3); break;
      case 'garbage_pop': Audio2.sfx.garbagePop(); Fx.sparkle(ex, ey); break;
      case 'level': Fx.badge(bo.x + 48, bo.y + 40, 'SPEED UP!', COL_OK); Audio2.sfx.levelUp(); break;
      case 'game_over': Audio2.sfx.lose(); Fx.shake('b' + bo.x, 5); break;
      case 'chain_end':
        if (ev.chain >= 3) Fx.badge(bo.x + 48, bo.y + 24, 'GREAT!', COL_OK);
        break;
    }
  }
}

// ---- HUD --------------------------------------------------------------------

function drawSoloHud(board, x, y, mode, timer) {
  text('SCORE', x, y, COL_DIM);
  text(pad(board.score, 7), x, y + 8, COL_TEXT);
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
    // logo
    ctext('PANEL', W / 2, 60, '#f27d9d', 4);
    ctext('POP', W / 2, 96, COL_ACC, 4);
    ctx.fillStyle = '#5a5a8c';
    ctx.fillRect(W / 2 - 90, 134, 180, 1);
    if ((frame >> 5) % 2) ctext('PRESS ENTER', W / 2, 160, COL_TEXT);
    ctext('SWAP - MATCH 3 - CHAIN!', W / 2, 190, COL_DIM);
    ctext('V' + APP_VERSION, W / 2, H - 24, COL_DIM);
    ctext('VOLUME - / +   MUSIC M', W / 2, H - 12, COL_DIM);
  }
};

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
      ['ENDLESS', 'SCORE ATTACK', 'VS CPU', '2 PLAYERS', 'PUZZLE', 'STORY', 'HOW TO PLAY'],
      60, 74);
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
    else if (pick === 'HOW TO PLAY') go(howToScreen);
  },
  draw: function () {
    drawBgPanels();
    ctext('PANEL POP', W / 2, 26, COL_ACC, 2);
    this.list.draw();
    // records box
    var x = 280, y = 74;
    text('RECORDS', x, y, COL_DIM);
    text('ENDLESS ' + pad(Save.get('hiEndless'), 7), x, y + 14);
    text('SCORE ATK ' + pad(Save.get('hiScore'), 7), x, y + 26);
    text('BEST CHAIN x' + Save.get('bestChainEndless'), x, y + 38);
    var pc = 0; var pcs = Save.get('puzzleCleared');
    for (var k in pcs) if (pcs[k]) pc++;
    text('PUZZLES ' + pc + '/30', x, y + 50);
    text('STORY ' + (Save.get('storyBeaten') ? 'CLEAR!' : (Save.get('storyStage') + '/8')), x, y + 62,
      Save.get('storyBeaten') ? COL_ACC : COL_TEXT);
    ctext('ARROWS/WASD MOVE   ENTER OK   ESC BACK', W / 2, H - 12, COL_DIM);
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
      ['TOUCH: DRAG A PANEL SIDEWAYS TO SWAP,', ''],
      ['OR TAP A CELL THEN TAP IT AGAIN.', ''],
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
    var labels = [];
    var names = ['ROOKIE', 'EASY', 'NORMAL', 'SPICY', 'HARD', 'EXPERT', 'MASTER', 'INSANE'];
    for (var i = 0; i < 8; i++) labels.push((i + 1) + ' - ' + names[i]);
    this.list.draw(labels);
  }
};

// ---- PUZZLE SELECT -----------------------------------------------------------

var puzzleSelectScreen = {
  idx: 0,
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
    var taps = Input.taps;
    for (var t = 0; t < taps.length; t++) {
      var p = taps[t];
      var c = Math.floor((p.x - 118) / 42), r = Math.floor((p.y - 60) / 32);
      if (c >= 0 && c < 6 && r >= 0 && r < 5) {
        var ti = r * 6 + c;
        if (this.idx === ti) { Audio2.sfx.select(); startPuzzle(ti); return; }
        this.idx = ti; Audio2.sfx.move();
      }
    }
  },
  draw: function () {
    drawBgPanels();
    ctext('PUZZLE', W / 2, 22, COL_ACC, 2);
    var cleared = Save.get('puzzleCleared');
    for (var i = 0; i < 30; i++) {
      var c = i % 6, r = Math.floor(i / 6);
      var x = 118 + c * 42, y = 60 + r * 32;
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
    ctext('ESC BACK', W / 2, H - 12, COL_DIM);
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

// --- solo (endless / score attack)
function startSolo(mode) {
  var seed = baseSeed();
  game = {
    kind: 'solo', mode: mode,
    board: new Engine.Board({ seed: seed, mode: mode === 'score' ? 'score' : 'endless', level: mode === 'score' ? 3 : 1 }),
    bo: { x: 56, y: 34 },
    timer: mode === 'score' ? 120 * 60 : 0,
    over: false, overT: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
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
    over: false, overT: 0, winner: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  game.ai = new AiPlayer(game.b2, tier, seed + 99);
  Fx.clear();
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
    over: false, overT: 0, winner: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
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
    over: false, overT: 0, won: false,
    settleWait: 0,
    paused: false, pauseList: null,
    touch: { dragId: null, dragCx: 0, dragCy: 0 }
  };
  Fx.clear();
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

  // taps (fire on finger-up with little movement)
  var taps = Input.taps;
  for (i = 0; i < taps.length; i++) {
    var p = taps[i];
    cx = Math.floor((p.x - bo.x) / 16); cy = Math.floor((p.y - bo.y) / 16);
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
    for (i = 0; i < pts.length; i++) if (pts[i].id === tch.dragId) { drag = pts[i]; break; }
    if (!drag) tch.dragId = null; // finger lifted
  }
  if (tch.dragId === null) {
    // adopt the first moved pointer whose START was on the board
    for (i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (!q.moved) continue;
      var scx = Math.floor((q.sx - bo.x) / 16), scy = Math.floor((q.sy - bo.y) / 16);
      if (scx < 0 || scx > 5 || scy < 0 || scy > 11) continue;
      tch.dragId = q.id;
      tch.dragCx = scx; tch.dragCy = scy;
      drag = q;
      break;
    }
  }
  if (drag) {
    cx = Math.floor((drag.x - bo.x) / 16); cy = Math.floor((drag.y - bo.y) / 16);
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

// RAISE on-screen button zone (solo/puzzle-free modes)
var raiseBtn = { x: W - 66, y: H - 40, w: 52, h: 26 };
function raiseHeld() {
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

    if (g.paused) { this.updatePause(); return; }

    // discard stale menu events during play (WASD etc. would otherwise pile
    // up and replay into the pause menu)
    Input.drainMenu();

    if (g.kind === 'solo') this.updateSolo();
    else if (g.kind === 'vs') this.updateVs();
    else if (g.kind === 'puzzle') this.updatePuzzle();

    Fx.update();
  },

  updateSolo: function () {
    var g = game, b = g.board;
    if (!g.over) {
      var inp = Input.boardInput(0, true);
      if (raiseHeld()) inp.raise = true;
      if (touchBoard(b, g.bo, g.touch)) inp.swap = true;
      b.step(inp);
      processEvents(b, g.bo);

      if (g.mode === 'score') {
        g.timer--;
        if (g.timer <= 0 && !b.gameOver) {
          b.gameOver = true; g.won = true;
        }
      }
      Audio2.playSong(b.inWarning() && !b.gameOver ? 'panic' : 'play');
      if (b.gameOver) { g.over = true; g.overT = 0; }
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
      processEvents(g.b1, g.bo1);
      processEvents(g.b2, g.bo2);

      // route attacks
      var i;
      for (i = 0; i < g.b1.attacks.length; i++) g.b2.queueGarbage(g.b1.attacks[i].w, g.b1.attacks[i].h);
      for (i = 0; i < g.b2.attacks.length; i++) g.b1.queueGarbage(g.b2.attacks[i].w, g.b2.attacks[i].h);
      g.b1.attacks.length = 0;
      g.b2.attacks.length = 0;

      Audio2.playSong((g.b1.inWarning() || g.b2.inWarning()) ? 'panic' : 'play');

      if (g.b1.gameOver || g.b2.gameOver) {
        g.over = true; g.overT = 0;
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
      if (touchBoard(b, g.bo, g.touch) && b.movesLeft > 0) inp.swap = true;
      b.step(inp);
      processEvents(b, g.bo);
      // count executed swaps (restart lives in the pause menu)
      for (var i = 0; i < b.events.length; i++)
        if (b.events[i].t === 'swap') b.movesLeft--;

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
    ctx.fillStyle = '#0e0e22';
    ctx.fillRect(0, 0, W, H);

    if (g.kind === 'solo' || g.kind === 'puzzle') {
      var b = g.board;
      Render.drawBoard(ctx, b, g.bo.x, g.bo.y, {});
      var hx = g.bo.x + 120;
      if (g.kind === 'solo') {
        drawSoloHud(b, hx, 40, g.mode, g.timer);
        // raise button (touch)
        ctx.fillStyle = '#22223c';
        ctx.fillRect(raiseBtn.x, raiseBtn.y, raiseBtn.w, raiseBtn.h);
        text('RAISE', raiseBtn.x + 8, raiseBtn.y + 9, COL_DIM);
      } else {
        var lv = Puzzle.LEVELS[g.idx];
        text('PUZZLE ' + (g.idx + 1), hx, 40, COL_DIM);
        text(lv.name, hx, 50, COL_TEXT);
        text('MOVES LEFT', hx, 70, COL_DIM);
        text('' + Math.max(0, g.board.movesLeft), hx, 80, g.board.movesLeft > 0 ? COL_ACC : COL_BAD, 2);
        text('ESC: PAUSE/RETRY', hx, 104, COL_DIM);
        if (g.board.maxChain >= 2) text('CHAIN x' + g.board.maxChain + '!', hx, 122, COL_ACC);
      }
      if (g.over) {
        var msg = g.kind === 'puzzle'
          ? (g.won ? 'CLEAR!' : 'OUT OF MOVES')
          : (g.won ? 'TIME UP!' : 'GAME OVER');
        ctext(msg, g.bo.x + 48, g.bo.y + 80, g.won ? COL_ACC : COL_BAD, 2);
      }
    } else {
      // vs
      Render.drawBoard(ctx, g.b1, g.bo1.x, g.bo1.y, {});
      Render.drawBoard(ctx, g.b2, g.bo2.x, g.bo2.y, { showCursor: true });
      // center HUD
      var cxm = W / 2;
      ctext(g.cpu ? 'YOU' : 'P1', g.bo1.x + 48, g.bo1.y - 14, COL_BLUE);
      var rightName = g.cpu ? (g.storyStage !== null ? Story.STAGES[g.storyStage].name : 'CPU LV' + g.tier) : 'P2';
      ctext(rightName, g.bo2.x + 48, g.bo2.y - 14, COL_BAD);
      ctext('SCORE', cxm, 60, COL_DIM);
      ctext(pad(g.b1.score, 7), cxm, 70);
      ctext('CHAIN x' + g.b1.maxChain, cxm, 86, g.b1.maxChain >= 3 ? COL_ACC : COL_DIM);
      // pending garbage warning
      var q1 = 0, q2 = 0, i;
      for (i = 0; i < g.b1.garbageQueue.length; i++) q1 += g.b1.garbageQueue[i].w * g.b1.garbageQueue[i].h;
      for (i = 0; i < g.b2.garbageQueue.length; i++) q2 += g.b2.garbageQueue[i].w * g.b2.garbageQueue[i].h;
      if (q1) ctext('! ' + q1, g.bo1.x + 48, g.bo1.y - 26, COL_BAD);
      if (q2) ctext('! ' + q2, g.bo2.x + 48, g.bo2.y - 26, COL_BAD);

      if (g.over) {
        var wbo = g.winner === 1 ? g.bo1 : g.bo2;
        var lbo = g.winner === 1 ? g.bo2 : g.bo1;
        ctext('WIN!', wbo.x + 48, wbo.y + 80, COL_ACC, 2);
        ctext('LOSE', lbo.x + 48, lbo.y + 80, COL_BAD, 2);
      }
    }

    Fx.draw(ctx);

    if (g.paused) {
      ctx.fillStyle = 'rgba(8,8,20,0.8)';
      ctx.fillRect(0, 0, W, H);
      ctext('PAUSED', W / 2, 70, COL_ACC, 2);
      g.pauseList.draw();
    }
  }
};

function togglePause() {
  var g = game;
  g.paused = !g.paused;
  Audio2.sfx.select();
  Input.drainMenu(); // flush the Esc that toggled us (it also queues 'back')
  if (g.paused) {
    g.pauseList = new MenuList(['CONTINUE', 'RESTART', 'QUIT'], W / 2 - 30, 110);
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
  enter: function () {
    Audio2.playSong('results');
    var g = game;
    var items = ['RETRY', 'MENU'];
    if (g.kind === 'puzzle' && g.won && g.idx < 29) items.unshift('NEXT PUZZLE');
    if (g.kind === 'vs' && g.storyStage !== null && g.winner === 1) {
      items = g.storyStage >= 7 ? ['THE END...', 'MENU'] : ['NEXT STAGE', 'MENU'];
    }
    this.list = new MenuList(items, W / 2 - 40, 170);
  },
  update: function () {
    var q = Input.drainMenu();
    for (var i = 0; i < q.length; i++) {
      if (q[i] === 'back') { go(menuScreen); return; }
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
    else if (pick === 'MENU') go(menuScreen);
    else if (pick === 'NEXT PUZZLE') startPuzzle(g.idx + 1);
    else if (pick === 'NEXT STAGE') go(storyIntroScreen);
    else if (pick === 'THE END...') go(storyEndScreen);
  },
  draw: function () {
    drawBgPanels();
    var g = game;
    if (g.kind === 'solo') {
      ctext(g.mode === 'score' ? 'SCORE ATTACK' : 'ENDLESS', W / 2, 30, COL_DIM);
      ctext(g.won ? 'TIME UP!' : 'GAME OVER', W / 2, 48, g.won ? COL_ACC : COL_BAD, 2);
      ctext('SCORE ' + g.board.score, W / 2, 84);
      ctext('BEST CHAIN x' + g.board.maxChain, W / 2, 98);
      ctext('PANELS CLEARED ' + g.board.panelsCleared, W / 2, 112);
      if (g.newRecord) ctext('NEW RECORD!', W / 2, 132, COL_ACC);
    } else if (g.kind === 'puzzle') {
      ctext('PUZZLE ' + (g.idx + 1) + ' - ' + Puzzle.LEVELS[g.idx].name, W / 2, 30, COL_DIM);
      ctext(g.won ? 'CLEAR!' : 'OUT OF MOVES', W / 2, 48, g.won ? COL_OK : COL_BAD, 2);
      if (g.won && g.board.maxChain >= 2) ctext('CHAIN x' + g.board.maxChain + '!', W / 2, 84, COL_ACC);
    } else {
      var st = g.storyStage !== null ? Story.STAGES[g.storyStage] : null;
      ctext(g.winner === 1 ? 'YOU WIN!' : (g.cpu ? 'YOU LOSE' : 'PLAYER ' + g.winner + ' WINS!'),
        W / 2, 48, g.winner === 1 || !g.cpu ? COL_ACC : COL_BAD, 2);
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
      if (screen === gameScreen && game && !game.over) togglePause();
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
  SpritesBuild();
  setupCanvas();
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
      screen.update();
      Input.endFrame();
      frame++;
      acc -= 1000 / 60;
      steps++;
    }
    if (acc >= 1000 / 60) acc = 0; // dropped frames: don't spiral
    if ((frame % 60) === 0) resize(); // safety: some hosts report 0-size early
    screen.draw();
    drawVolumeBar(); // global overlay: volume/music toasts on every screen
  }
  requestAnimationFrame(loop);
}

window.addEventListener('load', boot);

window.APP_VERSION = APP_VERSION;

})();

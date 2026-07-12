// PANEL POP — core board simulation.
//
// Deterministic, input-driven, fixed-timestep (60 Hz). Board state is a pure
// function of (seed, per-frame input log). No Math.random, no Date, no DOM.
// This is the future online-multiplayer hook: two machines fed the same seed
// and input log stay bit-identical (see tool/test_engine.js determinism test).
//
// Grid layout: row 0 = TOP of the playfield, row 11 = bottom visible row,
// row 12 = the dimmed incoming preview row (solid ground, not matchable).
// The stack rises in 16-subunit steps; a full step shifts every row up one.
'use strict';

(function () {

var RngRef = (typeof module !== 'undefined' && module.exports)
  ? require('./rng.js').Rng
  : window.Rng;

// ---- constants -----------------------------------------------------------

var COLS = 6;
var ROWS = 12;          // visible, matchable rows (0..11)
var PREVIEW_ROW = 12;   // incoming row index
var CELL_SUB = 16;      // rise subunits per cell

// panel states
var EMPTY = 0, IDLE = 1, SWAP = 2, HOVER = 3, FALL = 4, MATCH = 5, LAND = 6;

// frame timings (SNES-ish feel; tuned, not extracted)
var SWAP_F = 4;
var HOVER_F = 12;
var FLASH_F = 42;       // whole match group flashes before first pop
var POP_INT = 9;        // stagger between individual pops
var POP_PAD = 4;        // pad after last pop before cells empty
var LAND_F = 10;        // landing bounce (visual; solid + swappable)
var GARB_FLASH = 30;    // garbage flash before conversion starts
var DEATH_GRACE = 90;   // frames of top pressure before game over
var STOP_MAX = 60 * 12;

var NCOLORS_BASE = 5;
var NCOLORS_HI = 6;
var HI_COLOR_LEVEL = 10; // new rows use 6 colors at/after this speed level

// scoring tables (Tetris-Attack-flavored)
var COMBO_BONUS = { 4: 20, 5: 30, 6: 50, 7: 60, 8: 70, 9: 80, 10: 100, 11: 140, 12: 170 };
var CHAIN_BONUS = [0, 0, 50, 80, 150, 300, 400, 500, 700, 900, 1100, 1300, 1500, 1800];

function comboBonus(n) {
  if (n <= 3) return 0;
  if (COMBO_BONUS[n]) return COMBO_BONUS[n];
  return 170 + (n - 12) * 30;
}
function chainBonus(step) {
  if (step < 2) return 0;
  if (step < CHAIN_BONUS.length) return CHAIN_BONUS[step];
  return CHAIN_BONUS[CHAIN_BONUS.length - 1] + (step - CHAIN_BONUS.length + 1) * 300;
}

// stop time granted (frames); much larger when the stack is in danger
function stopFrames(comboSize, chainStep, inDanger) {
  var f = 0;
  if (comboSize >= 4) f += 20 + (comboSize - 4) * 12;
  if (chainStep >= 2) f += 40 + (chainStep - 2) * 25;
  if (f > 0 && f < 20) f = 20;
  if (inDanger) f = (f * 4) | 0;
  return f;
}

// garbage sent (VS): combos >= 4 send a 1-tall block, chains send tall blocks
// at chain end. Returns list of {w, h}.
function comboGarbage(n) {
  if (n < 4) return [];
  if (n <= 7) return [{ w: n - 1, h: 1 }];
  // big combos split into multiple blocks like TA
  if (n === 8) return [{ w: 3, h: 1 }, { w: 4, h: 1 }];
  if (n === 9) return [{ w: 4, h: 1 }, { w: 4, h: 1 }];
  if (n === 10) return [{ w: 5, h: 1 }, { w: 5, h: 1 }];
  if (n === 11) return [{ w: 5, h: 1 }, { w: 6, h: 1 }];
  if (n === 12) return [{ w: 6, h: 1 }, { w: 6, h: 1 }];
  var out = [];
  var rem = n - 1;
  while (rem > 0) { out.push({ w: Math.min(6, rem), h: 1 }); rem -= 6; }
  return out;
}

// ---- cell ----------------------------------------------------------------

function makeCell() {
  return {
    color: -1,      // -1 empty, 0..5 panel color
    state: EMPTY,
    t: 0,           // state timer (counts down)
    chain: false,   // eligible to extend the chain if matched
    gid: 0,         // >0: cell belongs to garbage block with this id
    // swap animation
    swapFrom: 0,    // -1 came from left, +1 came from right (render offset)
    // match lifecycle (absolute frame numbers)
    mPop: 0, mEnd: 0, popped: false,
    fell: false     // landed this frame (internal)
  };
}

function clearCell(c) {
  c.color = -1; c.state = EMPTY; c.t = 0; c.chain = false; c.gid = 0;
  c.swapFrom = 0; c.mPop = 0; c.mEnd = 0; c.popped = false; c.fell = false;
}

function copyCell(dst, src) {
  dst.color = src.color; dst.state = src.state; dst.t = src.t;
  dst.chain = src.chain; dst.gid = src.gid; dst.swapFrom = src.swapFrom;
  dst.mPop = src.mPop; dst.mEnd = src.mEnd; dst.popped = src.popped;
  dst.fell = src.fell;
}

// ---- board ---------------------------------------------------------------

// opts: { seed, mode: 'endless'|'score'|'vs'|'puzzle', level, startRows,
//         riseEnabled, nColorsOverride }
function Board(opts) {
  opts = opts || {};
  this.rng = new RngRef(opts.seed !== undefined ? opts.seed : 1);
  this.mode = opts.mode || 'endless';
  this.frame = 0;

  this.grid = [];
  for (var r = 0; r <= PREVIEW_ROW; r++) {
    var row = [];
    for (var c = 0; c < COLS; c++) row.push(makeCell());
    this.grid.push(row);
  }

  this.cursor = { x: 2, y: 8 };

  this.level = opts.level || 1;
  this.baseLevel = this.level;
  this.riseEnabled = opts.riseEnabled !== false;
  this.riseSub = 0;             // subunit progress toward next row shift
  this.stopTimer = 0;
  this.forcedRaise = false;     // player held raise since last commit
  this.deathTimer = DEATH_GRACE;

  this.score = 0;
  this.panelsCleared = 0;
  this.chainCounter = 1;        // current chain step (1 = no chain yet)
  this.maxChain = 1;
  this.maxCombo = 0;
  this.gameOver = false;
  this.win = false;             // set externally in VS

  this.garbage = [];            // active blocks {id,x,y,w,h,state,t,convertCol}
  this.garbageQueue = [];       // pending {w,h,delay}
  this.nextGid = 1;

  this.attacks = [];            // outgoing {w,h} — mode layer routes these
  this.events = [];             // per-frame events for render/audio
  this.swapLockout = 0;

  this.nColorsOverride = opts.nColorsOverride || 0;

  if (opts.startRows !== 0) this.seedStack(opts.startRows || 5);
  this.fillPreviewRow();
}

Board.prototype.nColors = function () {
  if (this.nColorsOverride) return this.nColorsOverride;
  return this.level >= HI_COLOR_LEVEL ? NCOLORS_HI : NCOLORS_BASE;
};

// subunits per frame the stack rises at the current level
Board.prototype.riseSpeed = function () {
  var lv = Math.min(this.level, 50);
  var s = 0.09 * Math.pow(1.09, lv - 1);
  return Math.min(s, 2.2);
};

// ---- setup ---------------------------------------------------------------

// pick a color for (r,c) that creates no immediate 3-line with already-set
// neighbors (left two, below two OR above two depending on fill direction)
Board.prototype.pickSafeColor = function (r, c, n) {
  var g = this.grid;
  for (var tries = 0; tries < 24; tries++) {
    var col = this.rng.int(n);
    if (c >= 2 && g[r][c - 1].color === col && g[r][c - 2].color === col) continue;
    if (r >= 2 && g[r - 1][c].color === col && g[r - 2][c].color === col) continue;
    if (r <= ROWS - 2 && g[r + 1][c].color === col && g[r + 2][c].color === col) continue;
    return col;
  }
  return this.rng.int(n);
};

Board.prototype.seedStack = function (nRows) {
  // ragged, natural-looking opening stack in the bottom nRows
  var heights = [];
  var c;
  for (c = 0; c < COLS; c++) heights.push(Math.max(1, nRows - 1 + this.rng.int(3) - 1));
  for (c = 0; c < COLS; c++) {
    for (var i = 0; i < heights[c] && i < ROWS - 2; i++) {
      var r = ROWS - 1 - i;
      var cell = this.grid[r][c];
      cell.color = this.pickSafeColor(r, c, this.nColors());
      cell.state = IDLE;
    }
  }
};

Board.prototype.fillPreviewRow = function () {
  var n = this.nColors();
  for (var c = 0; c < COLS; c++) {
    var cell = this.grid[PREVIEW_ROW][c];
    clearCell(cell);
    // no horizontal 3 inside the new row; no vertical 3 with the two rows
    // that will sit directly above it (relative neighbors are preserved
    // because the whole stack shifts together)
    for (var tries = 0; tries < 24; tries++) {
      var col = this.rng.int(n);
      if (c >= 2 &&
          this.grid[PREVIEW_ROW][c - 1].color === col &&
          this.grid[PREVIEW_ROW][c - 2].color === col) continue;
      if (this.grid[ROWS - 1][c].color === col &&
          this.grid[ROWS - 2][c].color === col) continue;
      cell.color = col;
      break;
    }
    if (cell.color < 0) cell.color = this.rng.int(n);
    cell.state = IDLE; // becomes active when shifted into row 11
  }
};

// recolor any preview cell that would 3-match the moment the row locks in
Board.prototype.validatePreviewRow = function () {
  var n = this.nColors();
  var pv = this.grid[PREVIEW_ROW];
  for (var c = 0; c < COLS; c++) {
    for (var tries = 0; tries < 24; tries++) {
      var bad = false;
      var col = pv[c].color;
      if (c >= 2 && pv[c - 1].color === col && pv[c - 2].color === col) bad = true;
      if (c <= COLS - 3 && pv[c + 1].color === col && pv[c + 2].color === col) bad = true;
      if (c >= 1 && c <= COLS - 2 && pv[c - 1].color === col && pv[c + 1].color === col) bad = true;
      var up1 = this.grid[ROWS - 1][c], up2 = this.grid[ROWS - 2][c];
      if (!up1.gid && !up2.gid && up1.color === col && up2.color === col &&
          up1.state !== EMPTY && up2.state !== EMPTY) bad = true;
      if (!bad) break;
      pv[c].color = this.rng.int(n);
    }
  }
};

// ---- queries -------------------------------------------------------------

Board.prototype.cellAt = function (r, c) {
  if (r < 0 || r > PREVIEW_ROW || c < 0 || c >= COLS) return null;
  return this.grid[r][c];
};

Board.prototype.topFilledRow = function () {
  for (var r = 0; r < ROWS; r++)
    for (var c = 0; c < COLS; c++)
      if (this.grid[r][c].state !== EMPTY) return r;
  return ROWS;
};

// warning: panic music/animation. danger: big stop-time rewards.
Board.prototype.inWarning = function () { return this.topFilledRow() <= 3; };
Board.prototype.inDanger = function () { return this.topFilledRow() <= 1; };

// hover shrinks as the speed level climbs
Board.prototype.hoverFrames = function () {
  return Math.max(4, HOVER_F - Math.floor(this.level / 6));
};
Board.prototype.topPressed = function () {
  for (var c = 0; c < COLS; c++)
    if (this.grid[0][c].state !== EMPTY) return true;
  return false;
};

// any pop/flash/garbage-clear activity that pauses the rise & death timer
Board.prototype.clearActive = function () {
  for (var r = 0; r < ROWS; r++)
    for (var c = 0; c < COLS; c++)
      if (this.grid[r][c].state === MATCH) return true;
  for (var i = 0; i < this.garbage.length; i++)
    if (this.garbage[i].state === 'clearing') return true;
  return false;
};

// chain is alive while any chain-flagged panel is airborne or matching
Board.prototype.chainAlive = function () {
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var cell = this.grid[r][c];
      if (!cell.chain) continue;
      if (cell.state === HOVER || cell.state === FALL || cell.state === MATCH) return true;
      if (cell.fell) return true; // landed this frame; match check pending
    }
  }
  return false;
};

Board.prototype.isEmpty = function () {
  for (var r = 0; r < ROWS; r++)
    for (var c = 0; c < COLS; c++)
      if (this.grid[r][c].state !== EMPTY) return false;
  return this.garbage.length === 0;
};

// ---- input ---------------------------------------------------------------

// input: { left,right,up,down,swap: edge-triggered bools; raise: held bool }
Board.prototype.applyInput = function (input) {
  if (!input || this.gameOver) return;
  var cur = this.cursor;
  if (input.left && cur.x > 0) { cur.x--; this.events.push({ t: 'move' }); }
  if (input.right && cur.x < COLS - 2) { cur.x++; this.events.push({ t: 'move' }); }
  if (input.up && cur.y > 0) { cur.y--; this.events.push({ t: 'move' }); }
  if (input.down && cur.y < ROWS - 1) { cur.y++; this.events.push({ t: 'move' }); }
  if (input.swap) this.trySwap();
  this.raiseHeld = !!input.raise;
};

// falling panels ARE swappable (catch/juggle tech); hovering, matching and
// mid-swap panels are not. Swapping into a falling panel's path is legal —
// the faller lands on top of the swapped panel.
Board.prototype.canSwapCell = function (cell) {
  if (cell.gid) return false;
  return cell.state === EMPTY || cell.state === IDLE ||
         cell.state === LAND || cell.state === FALL;
};

Board.prototype.trySwap = function () {
  var y = this.cursor.y, x = this.cursor.x;
  var a = this.grid[y][x], b = this.grid[y][x + 1];
  if (!this.canSwapCell(a) || !this.canSwapCell(b)) return;
  if (a.state === EMPTY && b.state === EMPTY) return;

  var tmp = makeCell();
  copyCell(tmp, a); copyCell(a, b); copyCell(b, tmp);
  // both cells animate; empty cells just swap instantly
  if (a.state !== EMPTY) { a.state = SWAP; a.t = SWAP_F; a.swapFrom = 1; }
  if (b.state !== EMPTY) { b.state = SWAP; b.t = SWAP_F; b.swapFrom = -1; }
  this.events.push({ t: 'swap' });
};

// ---- garbage -------------------------------------------------------------

Board.prototype.queueGarbage = function (w, h) {
  this.garbageQueue.push({ w: w, h: h, delay: 45 });
};

Board.prototype.spawnQueuedGarbage = function () {
  if (this.garbageQueue.length === 0) return;
  var q = this.garbageQueue[0];
  if (q.delay > 0) { q.delay--; return; }
  // garbage never deploys while the receiver is mid-clear or mid-chain
  if (this.clearActive() || this.chainAlive()) return;
  // one falling block at a time keeps drops readable
  for (var i = 0; i < this.garbage.length; i++)
    if (this.garbage[i].state === 'falling') return;
  this.garbageQueue.shift();
  var x = q.w >= COLS ? 0 : this.rng.int(COLS - q.w + 1);
  var gb = {
    id: this.nextGid++, x: x, y: -q.h, w: q.w, h: q.h,
    state: 'falling', t: 0, convertCol: 0, convertRow: 0
  };
  this.garbage.push(gb);
  this.events.push({ t: 'garbage_in' });
};

Board.prototype.garbageCellsBlocked = function (gb, testY) {
  // is the row below (testY + h) blocked for this block?
  var below = testY + gb.h;
  if (below > ROWS - 1) {
    if (below > ROWS - 1 + 1) return true;
    // resting on the floor row (row 11 bottom) — blocked when bottom would
    // pass row 11
    return below > ROWS - 1;
  }
  for (var c = gb.x; c < gb.x + gb.w; c++) {
    var cell = this.cellAt(below, c);
    if (cell && cell.state !== EMPTY) return true;
  }
  return false;
};

Board.prototype.writeGarbageCells = function (gb) {
  for (var r = gb.y; r < gb.y + gb.h; r++) {
    if (r < 0 || r > ROWS - 1) continue;
    for (var c = gb.x; c < gb.x + gb.w; c++) {
      var cell = this.grid[r][c];
      cell.color = -1; cell.state = IDLE; cell.gid = gb.id; cell.chain = false;
    }
  }
};

Board.prototype.eraseGarbageCells = function (gb) {
  for (var r = Math.max(0, gb.y); r < gb.y + gb.h && r < ROWS; r++)
    for (var c = gb.x; c < gb.x + gb.w; c++)
      if (this.grid[r][c].gid === gb.id) clearCell(this.grid[r][c]);
};

Board.prototype.stepGarbage = function () {
  var i, gb;
  this.spawnQueuedGarbage();
  for (i = 0; i < this.garbage.length; i++) {
    gb = this.garbage[i];
    if (gb.state === 'falling') {
      this.eraseGarbageCells(gb);
      if (!this.garbageCellsBlocked(gb, gb.y)) {
        gb.y++;
      } else {
        gb.state = 'idle';
        this.events.push({ t: 'garbage_land' });
      }
      this.writeGarbageCells(gb);
    } else if (gb.state === 'idle') {
      // becomes falling again if support disappears (fully unsupported)
      if (!this.garbageCellsBlocked(gb, gb.y)) {
        gb.state = 'falling';
      }
    } else if (gb.state === 'clearing') {
      gb.t--;
      if (gb.t <= 0) {
        // convert next bottom-row cell (left to right)
        var r = gb.y + gb.h - 1;
        var c = gb.x + gb.convertCol;
        if (gb.convertCol < gb.w) {
          if (r >= 0 && r < ROWS) {
            var cell = this.grid[r][c];
            cell.gid = 0;
            cell.color = this.rng.int(this.nColors());
            cell.state = IDLE;
            cell.chain = true; // converted panels can extend chains
            this.events.push({ t: 'garbage_pop', x: c, y: r });
          }
          gb.convertCol++;
          gb.t = POP_INT;
        } else {
          // bottom row fully converted — shrink block
          gb.h--;
          gb.convertCol = 0;
          if (gb.h <= 0) {
            this.garbage.splice(i, 1); i--;
          } else {
            gb.state = 'idle';
            // remaining garbage cells keep chain-relevant panels below
            this.writeGarbageCells(gb);
          }
        }
      }
    }
  }
};

// trigger garbage clearing for blocks adjacent to matched cells (cascades to
// touching blocks like the real game)
Board.prototype.triggerGarbage = function (matchedCells) {
  var toClear = {};
  var i, gb, k;
  for (i = 0; i < matchedCells.length; i++) {
    var m = matchedCells[i];
    var dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (k = 0; k < dirs.length; k++) {
      var cell = this.cellAt(m.r + dirs[k][0], m.c + dirs[k][1]);
      if (cell && cell.gid) toClear[cell.gid] = true;
    }
  }
  // cascade: garbage touching clearing garbage also clears
  var changed = true;
  while (changed) {
    changed = false;
    for (i = 0; i < this.garbage.length; i++) {
      gb = this.garbage[i];
      if (toClear[gb.id]) continue;
      for (var j = 0; j < this.garbage.length; j++) {
        var other = this.garbage[j];
        if (!toClear[other.id]) continue;
        if (this.garbageTouches(gb, other)) { toClear[gb.id] = true; changed = true; break; }
      }
    }
  }
  for (i = 0; i < this.garbage.length; i++) {
    gb = this.garbage[i];
    if (toClear[gb.id] && gb.state === 'idle') {
      gb.state = 'clearing';
      gb.t = GARB_FLASH;
      gb.convertCol = 0;
      this.events.push({ t: 'garbage_clear' });
    }
  }
};

Board.prototype.garbageTouches = function (a, b) {
  var xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
  var yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
  if (xOverlap && (a.y + a.h === b.y || b.y + b.h === a.y)) return true;
  if (yOverlap && (a.x + a.w === b.x || b.x + b.w === a.x)) return true;
  return false;
};

// ---- physics -------------------------------------------------------------

Board.prototype.stepPanels = function () {
  var r, c, cell;

  // timers: swap / land / match lifecycle
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      cell = this.grid[r][c];
      cell.fell = false;
      if (cell.state === SWAP) {
        cell.t--;
        if (cell.t <= 0) { cell.state = IDLE; cell.swapFrom = 0; cell.fell = true; }
      } else if (cell.state === LAND) {
        cell.t--;
        if (cell.t <= 0) cell.state = IDLE;
      } else if (cell.state === MATCH) {
        if (!cell.popped && this.frame >= cell.mPop) {
          cell.popped = true;
          this.score += 10;
          this.panelsCleared++;
          this.events.push({ t: 'pop', x: c, y: r, color: cell.color });
        }
        if (this.frame >= cell.mEnd) {
          // whole group done — this cell empties now; panels above get the
          // chain flag when they unsupport (handled in gravity below via
          // explicit flagging here)
          this.flagChainAbove(r, c);
          clearCell(cell);
        }
      }
    }
  }

  // gravity — bottom-up so stacks fall as a unit
  for (c = 0; c < COLS; c++) {
    for (r = ROWS - 1; r >= 0; r--) {
      cell = this.grid[r][c];
      if (cell.gid) continue; // garbage handled separately
      if (cell.state === IDLE || cell.state === LAND) {
        var below = this.cellAt(r + 1, c);
        var supported = (r === ROWS - 1) || (below && below.state !== EMPTY);
        if (!supported) {
          cell.state = HOVER;
          cell.t = this.hoverFrames();
        }
      } else if (cell.state === HOVER) {
        var b2 = this.cellAt(r + 1, c);
        var sup2 = (r === ROWS - 1) || (b2 && b2.state !== EMPTY);
        if (sup2) {
          // support restored (swap slid a panel underneath) — cancel hover
          cell.state = IDLE;
          cell.t = 0;
        } else {
          cell.t--;
          if (cell.t <= 0) { cell.state = FALL; cell.t = 0; }
        }
      }
    }
  }

  // falling — move down one row per frame, bottom-up per column
  for (c = 0; c < COLS; c++) {
    for (r = ROWS - 1; r >= 0; r--) {
      cell = this.grid[r][c];
      if (cell.state !== FALL || cell.gid) continue;
      var dest = this.cellAt(r + 1, c);
      if (r < ROWS - 1 && dest.state === EMPTY) {
        copyCell(dest, cell);
        clearCell(cell);
      } else {
        cell.state = LAND;
        cell.t = LAND_F;
        cell.fell = true; // match check this frame; chain flag may clear
        this.events.push({ t: 'land', x: c, y: r });
      }
    }
  }
};

// when a matched cell empties, everything sitting above it becomes
// chain-eligible (the classic chain rule)
Board.prototype.flagChainAbove = function (r, c) {
  for (var rr = r - 1; rr >= 0; rr--) {
    var cell = this.grid[rr][c];
    if (cell.state === EMPTY) break;
    if (cell.gid) break; // garbage blocks the flag walk
    cell.chain = true;
  }
};

// ---- matching ------------------------------------------------------------

Board.prototype.matchEligible = function (cell) {
  return cell.state === IDLE || cell.state === LAND;
};

Board.prototype.detectMatches = function () {
  var r, c, i;
  var marked = [];
  var mark = {};
  var g = this.grid;

  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      var cell = g[r][c];
      if (cell.state === EMPTY || cell.gid || !this.matchEligible(cell)) continue;
      // horizontal run
      if (c + 2 < COLS &&
          g[r][c + 1].color === cell.color && this.matchEligible(g[r][c + 1]) && !g[r][c + 1].gid &&
          g[r][c + 2].color === cell.color && this.matchEligible(g[r][c + 2]) && !g[r][c + 2].gid) {
        var cc = c;
        while (cc < COLS && g[r][cc].color === cell.color &&
               this.matchEligible(g[r][cc]) && !g[r][cc].gid) {
          if (!mark[r + ',' + cc]) { mark[r + ',' + cc] = true; marked.push({ r: r, c: cc }); }
          cc++;
        }
      }
      // vertical run
      if (r + 2 < ROWS &&
          g[r + 1][c].color === cell.color && this.matchEligible(g[r + 1][c]) && !g[r + 1][c].gid &&
          g[r + 2][c].color === cell.color && this.matchEligible(g[r + 2][c]) && !g[r + 2][c].gid) {
        var rr = r;
        while (rr < ROWS && g[rr][c].color === cell.color &&
               this.matchEligible(g[rr][c]) && !g[rr][c].gid) {
          if (!mark[rr + ',' + c]) { mark[rr + ',' + c] = true; marked.push({ r: rr, c: c }); }
          rr++;
        }
      }
    }
  }

  if (marked.length === 0) {
    // panels that came to REST this frame without matching lose their chain
    // flag; panels still airborne (hover/fall after a sideways swap) keep it
    for (r = 0; r < ROWS; r++)
      for (c = 0; c < COLS; c++) {
        var cl = this.grid[r][c];
        if (cl.fell && cl.chain && (cl.state === IDLE || cl.state === LAND))
          cl.chain = false;
      }
    return;
  }

  var n = marked.length;
  var isChain = false;
  for (i = 0; i < n; i++)
    if (this.grid[marked[i].r][marked[i].c].chain) { isChain = true; break; }

  if (isChain) {
    this.chainCounter++;
    if (this.chainCounter > this.maxChain) this.maxChain = this.chainCounter;
  }
  var chainStep = isChain ? this.chainCounter : 1;
  if (n > this.maxCombo) this.maxCombo = n;

  // sort reading order (top-left first) for the sequential pop
  marked.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
  var start = this.frame + FLASH_F;
  for (i = 0; i < n; i++) {
    var mc = this.grid[marked[i].r][marked[i].c];
    mc.state = MATCH;
    mc.popped = false;
    mc.mPop = start + i * POP_INT;
    mc.mEnd = start + n * POP_INT + POP_PAD;
  }

  // scoring
  this.score += comboBonus(n) + chainBonus(chainStep);

  // stop time: MAX, not sum — additive stop is a classic stall exploit
  this.stopTimer = Math.min(STOP_MAX,
    Math.max(this.stopTimer, stopFrames(n, chainStep, this.inDanger())));

  // outgoing attacks
  if (this.mode === 'vs') {
    var gs = comboGarbage(n);
    for (i = 0; i < gs.length; i++) this.attacks.push(gs[i]);
  }

  // garbage adjacency
  this.triggerGarbage(marked);

  this.events.push({
    t: 'match', n: n, chain: chainStep,
    x: marked[0].c, y: marked[0].r
  });

  // panels that came to rest un-matched this frame drop their flag
  for (r = 0; r < ROWS; r++)
    for (c = 0; c < COLS; c++) {
      var cl2 = this.grid[r][c];
      if (cl2.fell && cl2.chain && (cl2.state === IDLE || cl2.state === LAND))
        cl2.chain = false;
    }
};

// chain end bookkeeping — fires the chain attack (VS) and resets the counter
Board.prototype.updateChainState = function () {
  if (this.chainAlive() || this.clearActive()) return;
  if (this.chainCounter > 1) {
    if (this.mode === 'vs') {
      this.attacks.push({ w: COLS, h: this.chainCounter - 1 });
    }
    this.events.push({ t: 'chain_end', chain: this.chainCounter });
    this.chainCounter = 1;
  }
  // sweep stale flags (e.g. garbage-converted panels that never moved) so a
  // later unrelated match can't count as a chain
  for (var r = 0; r < ROWS; r++)
    for (var c = 0; c < COLS; c++)
      if (this.grid[r][c].chain &&
          (this.grid[r][c].state === IDLE || this.grid[r][c].state === LAND))
        this.grid[r][c].chain = false;
};

// ---- rise ----------------------------------------------------------------

Board.prototype.stepRise = function () {
  if (!this.riseEnabled || this.gameOver) return;

  var clearing = this.clearActive();
  var raising = this.raiseHeld && !clearing;

  if (raising && !this.topPressed()) {
    // manual raise cancels remaining stop time (risk/reward) but is ignored
    // while topped out — it must never kill the player
    this.stopTimer = 0;
    this.riseSub += 4;
  } else {
    if (clearing) return; // clears pause the rise (stop time doesn't tick)
    if (this.chainCounter > 1) return; // chains freeze the rise
    if (this.stopTimer > 0) { this.stopTimer--; return; }
    this.riseSub += this.riseSpeed();
  }

  if (this.riseSub < CELL_SUB) return;
  this.riseSub -= CELL_SUB;

  if (this.topPressed()) {
    // can't commit the row — pressure is handled in stepDeath
    this.riseSub = CELL_SUB - 0.01;
    return;
  }

  // re-validate the preview row at lock-in time: clears since generation may
  // have changed the rows above it (classic clone bug: instant match on entry)
  this.validatePreviewRow();

  // shift everything up one row
  for (var r = 0; r < PREVIEW_ROW; r++) {
    for (var c = 0; c < COLS; c++) {
      copyCell(this.grid[r][c], this.grid[r + 1][c]);
    }
  }
  for (var c2 = 0; c2 < COLS; c2++) clearCell(this.grid[PREVIEW_ROW][c2]);
  this.fillPreviewRow();

  // garbage rides the stack
  for (var i = 0; i < this.garbage.length; i++) this.garbage[i].y--;

  if (this.cursor.y > 0) this.cursor.y--;
  this.events.push({ t: 'rise' });
};

Board.prototype.stepDeath = function () {
  if (this.gameOver) return;
  var pressed = this.topPressed();
  var busy = this.clearActive() || this.chainAlive() || this.stopTimer > 0;
  if (pressed && !busy && this.riseEnabled) {
    this.deathTimer--;
    if (this.deathTimer <= 0) {
      this.gameOver = true;
      this.events.push({ t: 'game_over' });
    }
  } else {
    this.deathTimer = DEATH_GRACE;
  }
};

// ---- speed level ---------------------------------------------------------

Board.prototype.stepLevel = function () {
  if (this.mode === 'endless' || this.mode === 'score') {
    var lv = this.baseLevel + Math.floor(this.panelsCleared / 25);
    if (lv > this.level) {
      this.level = Math.min(lv, 50);
      this.events.push({ t: 'level', level: this.level });
    }
  }
};

// ---- main step -------------------------------------------------------------

Board.prototype.step = function (input) {
  this.events.length = 0;
  if (this.gameOver) { this.frame++; return; }

  this.applyInput(input);
  this.stepPanels();
  this.stepGarbage();
  this.detectMatches();
  this.updateChainState();
  this.stepRise();
  this.stepDeath();
  this.stepLevel();
  this.frame++;
};

// ---- determinism hash ------------------------------------------------------

Board.prototype.hash = function () {
  var h = 0x811c9dc5;
  function mix(v) {
    h ^= (v + 1) & 0xff;
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  for (var r = 0; r <= PREVIEW_ROW; r++) {
    for (var c = 0; c < COLS; c++) {
      var cell = this.grid[r][c];
      mix(cell.color + 2); mix(cell.state); mix(cell.chain ? 1 : 0); mix(cell.gid & 0xff);
    }
  }
  mix(this.cursor.x); mix(this.cursor.y);
  mix(this.score & 0xff); mix((this.score >> 8) & 0xff);
  mix(this.chainCounter); mix(this.garbage.length);
  mix((this.riseSub * 16) & 0xff);
  return h >>> 0;
};

// ---- exports ---------------------------------------------------------------

var Engine = {
  Board: Board,
  COLS: COLS, ROWS: ROWS, PREVIEW_ROW: PREVIEW_ROW, CELL_SUB: CELL_SUB,
  EMPTY: EMPTY, IDLE: IDLE, SWAP: SWAP, HOVER: HOVER, FALL: FALL,
  MATCH: MATCH, LAND: LAND,
  SWAP_F: SWAP_F, HOVER_F: HOVER_F, FLASH_F: FLASH_F, POP_INT: POP_INT,
  LAND_F: LAND_F, DEATH_GRACE: DEATH_GRACE,
  comboBonus: comboBonus, chainBonus: chainBonus, comboGarbage: comboGarbage
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Engine;
} else {
  window.Engine = Engine;
}

})();

// PANEL POP — CPU opponent. Plays its own board through the same input
// interface as a human: moves the cursor step by step, then swaps.
// Deterministic (own seeded RNG) and blind to the opponent's board and to
// the RNG future — it only reads settled panel colors.
'use strict';

(function () {

var RngRef = (typeof module !== 'undefined' && module.exports)
  ? require('./rng.js').Rng
  : window.Rng;
var E = (typeof module !== 'undefined' && module.exports)
  ? require('./engine.js')
  : null; // browser: window.Engine at construct time

// difficulty tiers 1..8
var TIERS = [
  null,
  { think: 55, move: 14, mistake: 0.45, chainAware: false, raise: 0.0 },  // 1
  { think: 42, move: 11, mistake: 0.32, chainAware: false, raise: 0.05 }, // 2
  { think: 34, move: 9,  mistake: 0.22, chainAware: false, raise: 0.10 }, // 3
  { think: 26, move: 7,  mistake: 0.15, chainAware: true,  raise: 0.15 }, // 4
  { think: 20, move: 6,  mistake: 0.10, chainAware: true,  raise: 0.25 }, // 5
  { think: 15, move: 5,  mistake: 0.06, chainAware: true,  raise: 0.35 }, // 6
  { think: 11, move: 4,  mistake: 0.03, chainAware: true,  raise: 0.5 },  // 7
  { think: 7,  move: 3,  mistake: 0.01, chainAware: true,  raise: 0.65 }  // 8
];

function AiPlayer(board, tier, seed) {
  this.board = board;
  this.p = TIERS[Math.max(1, Math.min(8, tier))];
  this.rng = new RngRef(seed || 777);
  this.cool = 30;         // frames until next decision/action
  this.plan = null;       // {x, y, swap}
  this.E = E || window.Engine;
}

// color of a settled, swappable, non-garbage panel; -1 empty; -2 unusable
AiPlayer.prototype.colorAt = function (r, c) {
  if (r < 0 || r >= 12 || c < 0 || c >= 6) return -2;
  var cell = this.board.grid[r][c];
  if (cell.gid) return -2;
  if (cell.state === this.E.EMPTY) return -1;
  if (cell.state === this.E.IDLE || cell.state === this.E.LAND) return cell.color;
  return -2;
};

AiPlayer.prototype.colHeight = function (c) {
  for (var r = 0; r < 12; r++)
    if (this.board.grid[r][c].state !== this.E.EMPTY) return 12 - r;
  return 0;
};

// would placing `color` at (r,c) make a 3-line? uses `cols` override map
AiPlayer.prototype.makesMatch = function (r, c, color, ov) {
  if (color < 0) return 0;
  var self = this;
  function at(rr, cc) {
    var k = rr + ',' + cc;
    if (k in ov) return ov[k];
    return self.colorAt(rr, cc);
  }
  var n, size = 0;
  // horizontal
  n = 1;
  var cc2 = c - 1; while (at(r, cc2) === color) { n++; cc2--; }
  cc2 = c + 1; while (at(r, cc2) === color) { n++; cc2++; }
  if (n >= 3) size += n;
  // vertical
  n = 1;
  var rr2 = r - 1; while (at(rr2, c) === color) { n++; rr2--; }
  rr2 = r + 1; while (at(rr2, c) === color) { n++; rr2++; }
  if (n >= 3) size += n;
  return size;
};

// score a swap at cursor (x,y)
AiPlayer.prototype.scoreSwap = function (x, y) {
  var a = this.colorAt(y, x), b = this.colorAt(y, x + 1);
  if (a === -2 || b === -2) return -1;
  if (a === b) return -1; // includes empty/empty and same color
  var ov = {};
  ov[y + ',' + x] = b;
  ov[y + ',' + (x + 1)] = a;

  // panels swapped into open air will fall — project the landing row so we
  // score where the panel ENDS UP, not where it briefly passes through
  var scoreV = 0;
  var mA = this.makesMatch(y, x, b, ov);
  var mB = this.makesMatch(y, x + 1, a, ov);
  var made = mA + mB;
  if (made > 0) {
    scoreV += 100 + made * 12;
    if (this.p.chainAware) {
      // cascade potential: filled cells above the matched area
      var above = 0;
      if (mA && this.colorAt(y - 1, x) >= 0) above++;
      if (mB && this.colorAt(y - 1, x + 1) >= 0) above++;
      scoreV += above * 25;
    }
    // prefer matches lower in the stack when tall
    scoreV += y;
    return scoreV;
  }

  // flattening: move a panel from a tall column toward a short one
  var hA = this.colHeight(x), hB = this.colHeight(x + 1);
  var diff = hA - hB;
  if (a >= 0 && b === -1 && diff >= 2) return 8 + diff * 3;
  if (b >= 0 && a === -1 && diff <= -2) return 8 - diff * 3;
  return 0;
};

AiPlayer.prototype.decide = function () {
  var best = null, bestScore = 1;
  var cands = [];
  for (var y = 0; y < 12; y++) {
    for (var x = 0; x < 5; x++) {
      var s = this.scoreSwap(x, y);
      if (s > 0) cands.push({ x: x, y: y, s: s });
      if (s > bestScore) { bestScore = s; best = { x: x, y: y }; }
    }
  }
  // mistakes: sometimes take a random candidate instead of the best
  if (cands.length && this.rng.next() < this.p.mistake) {
    var pick = cands[this.rng.int(cands.length)];
    return { x: pick.x, y: pick.y, swap: true };
  }
  if (best) return { x: best.x, y: best.y, swap: true };
  return null;
};

// returns an engine input object for this frame
AiPlayer.prototype.update = function () {
  var inp = { left: false, right: false, up: false, down: false, swap: false, raise: false };
  var b = this.board;
  if (b.gameOver) return inp;

  var warning = b.inWarning();

  if (this.cool > 0) {
    this.cool--;
    // aggressive tiers keep the stack fed when it's low and safe
    if (!this.plan && !warning && this.colTallest() < 5 &&
        this.rng.next() < this.p.raise) {
      inp.raise = true;
    }
    return inp;
  }

  if (!this.plan) {
    this.plan = this.decide();
    this.cool = warning ? Math.max(3, this.p.think >> 1) : this.p.think;
    if (!this.plan) {
      // nothing to do: raise if safe
      if (!warning && this.colTallest() < 6) inp.raise = true;
      return inp;
    }
    return inp;
  }

  // execute plan: one cursor step (or the swap) per action tick
  var cur = b.cursor;
  if (cur.y > this.plan.y) inp.up = true;
  else if (cur.y < this.plan.y) inp.down = true;
  else if (cur.x > this.plan.x) inp.left = true;
  else if (cur.x < this.plan.x) inp.right = true;
  else {
    inp.swap = true;
    this.plan = null;
    this.cool = this.p.move;
    return inp;
  }
  this.cool = this.p.move;
  return inp;
};

AiPlayer.prototype.colTallest = function () {
  var m = 0;
  for (var c = 0; c < 6; c++) m = Math.max(m, this.colHeight(c));
  return m;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AiPlayer: AiPlayer, TIERS: TIERS };
} else {
  window.AiPlayer = AiPlayer;
}

})();

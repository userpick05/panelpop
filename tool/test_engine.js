// PANEL POP — headless engine tests. Run: node tool/test_engine.js
'use strict';

var E = require('../js/engine.js');
var Board = E.Board;

var passed = 0, failed = 0, current = '';

function test(name, fn) {
  current = name;
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (err) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + err.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || 'eq') + ': expected ' + b + ', got ' + a);
}

// bare board for scripted scenarios
function bare(opts) {
  var o = { seed: 1, startRows: 0, riseEnabled: false, mode: 'endless' };
  for (var k in (opts || {})) o[k] = opts[k];
  return new Board(o);
}
function place(b, r, c, color) {
  var cell = b.grid[r][c];
  cell.color = color; cell.state = E.IDLE; cell.t = 0; cell.chain = false; cell.gid = 0;
}
function run(b, frames, inputFn) {
  var evs = [];
  for (var i = 0; i < frames; i++) {
    b.step(inputFn ? inputFn(i, b) : null);
    for (var j = 0; j < b.events.length; j++) evs.push(b.events[j]);
    if (b.gameOver) break;
  }
  return evs;
}
function countEv(evs, t) {
  var n = 0;
  for (var i = 0; i < evs.length; i++) if (evs[i].t === t) n++;
  return n;
}
function findEv(evs, t) {
  for (var i = 0; i < evs.length; i++) if (evs[i].t === t) return evs[i];
  return null;
}

// ---------------------------------------------------------------------------
console.log('PANEL POP engine tests');

test('swap completes and matches 3 horizontally', function () {
  var b = bare();
  // row 11: [G, R, R, R] after swapping [R, G, ...]
  place(b, 11, 0, 0); place(b, 11, 1, 1); place(b, 11, 2, 0); place(b, 11, 3, 0);
  b.cursor.x = 0; b.cursor.y = 11;
  var evs = run(b, 120, function (i) { return i === 0 ? { swap: true } : null; });
  var m = findEv(evs, 'match');
  assert(m, 'expected a match event');
  eq(m.n, 3, 'combo size');
  eq(m.chain, 1, 'no chain');
  eq(b.score, 30, 'score 3 panels x10');
  eq(b.grid[11][1].state, E.EMPTY, 'matched cells emptied');
  eq(b.panelsCleared, 3);
});

test('no self-triggered matches from rising rows (2500 frames)', function () {
  var b = new Board({ seed: 7, mode: 'endless', level: 30, startRows: 4 });
  var evs = run(b, 2500, null);
  eq(countEv(evs, 'match'), 0, 'row generation must never self-match');
});

test('chain x2: panels falling after a clear match again', function () {
  var b = bare({ mode: 'vs' });
  // c0 vertical R match rows 9-11; G's above at rows 7,8 fall into
  // horizontal G match with row-11 G's at c1,c2
  place(b, 9, 0, 0); place(b, 10, 0, 0); place(b, 11, 0, 0);
  place(b, 7, 0, 1); place(b, 8, 0, 1);
  place(b, 11, 1, 1); place(b, 11, 2, 1);
  var evs = run(b, 400, null);
  eq(countEv(evs, 'match'), 2, 'two match events');
  var end = findEv(evs, 'chain_end');
  assert(end, 'chain should end');
  eq(end.chain, 2, 'chain x2');
  eq(b.maxChain, 2);
  // chain garbage dispatched at chain end: full width, height chain-1
  var chainAtk = null;
  for (var i = 0; i < b.attacks.length; i++)
    if (b.attacks[i].w === 6) chainAtk = b.attacks[i];
  assert(chainAtk, 'chain attack sent');
  eq(chainAtk.h, 1, 'x2 chain sends height 1');
});

test('landing without a match clears the chain flag', function () {
  var b = bare();
  // R match at bottom; single G above falls and lands alone
  place(b, 11, 0, 0); place(b, 11, 1, 0); place(b, 11, 2, 0);
  place(b, 10, 0, 1);
  run(b, 300, null);
  eq(b.grid[11][0].color, 1, 'G landed at bottom');
  eq(b.grid[11][0].chain, false, 'flag cleared on quiet landing');
  eq(b.chainCounter, 1);
  eq(b.maxChain, 1, 'no chain scored');
});

test('combo 5 (cross) scores combo bonus and sends garbage', function () {
  var b = bare({ mode: 'vs' });
  place(b, 11, 0, 0); place(b, 11, 1, 0); place(b, 11, 2, 0);
  place(b, 10, 1, 0); place(b, 9, 1, 0);
  var evs = run(b, 150, null);
  var m = findEv(evs, 'match');
  eq(m.n, 5, 'cross = 5 panels');
  eq(b.score, 50 + E.comboBonus(5), 'score with combo bonus');
  eq(b.attacks.length, 1, 'one combo attack');
  eq(b.attacks[0].w, 4, 'combo 5 sends 4-wide');
  eq(b.attacks[0].h, 1);
});

test('two separate 3-matches same frame = one x6 combo', function () {
  var b = bare();
  place(b, 11, 0, 0); place(b, 11, 1, 0); place(b, 11, 2, 0);
  place(b, 11, 3, 1); place(b, 11, 4, 1); place(b, 11, 5, 1);
  var evs = run(b, 150, null);
  eq(countEv(evs, 'match'), 1, 'single match event');
  eq(findEv(evs, 'match').n, 6, 'combo counts all panels board-wide');
});

test('stop time is max, not sum', function () {
  var b = bare();
  b.stopTimer = 300;
  place(b, 11, 0, 0); place(b, 11, 1, 0); place(b, 11, 2, 0); place(b, 11, 3, 0);
  run(b, 10, null);
  eq(b.stopTimer, 300, 'smaller award must not add to remaining stop');
});

test('manual raise cancels stop time', function () {
  var b = new Board({ seed: 3, mode: 'endless', startRows: 3 });
  b.stopTimer = 500;
  b.step({ raise: true });
  eq(b.stopTimer, 0, 'raise cancels stop');
});

test('swap under hovering panel cancels hover (support restored)', function () {
  var b = bare();
  place(b, 9, 0, 2);          // floater, will hover then fall
  place(b, 10, 1, 3);         // panel to slide underneath at row 10
  place(b, 11, 0, 4); place(b, 11, 1, 4); // ground (not matching: only 2)
  b.cursor.x = 0; b.cursor.y = 10;
  b.step(null); // floater enters HOVER
  eq(b.grid[9][0].state, E.HOVER, 'floater hovering');
  b.step({ swap: true }); // slide support under it
  b.step(null);
  assert(b.grid[9][0].state === E.IDLE || b.grid[9][0].state === E.LAND,
    'hover cancelled by restored support, got state ' + b.grid[9][0].state);
});

test('falling panel is swappable (catch tech)', function () {
  var b = bare();
  place(b, 3, 0, 2);
  b.cursor.x = 0; b.cursor.y = 8;
  var caught = false;
  run(b, 200, function (i, bd) {
    if (!caught && bd.grid[8][0].state === E.FALL) { caught = true; return { swap: true }; }
    return null;
  });
  assert(caught, 'panel passed cursor row in FALL state');
  eq(b.grid[11][1].color, 2, 'panel ended up in column 1 at the bottom');
  eq(b.grid[11][0].state, E.EMPTY, 'column 0 empty');
});

test('swapping into a falling panel\'s path: faller lands on top', function () {
  var b = bare();
  place(b, 2, 0, 2);           // faller in column 0
  place(b, 11, 1, 3);          // panel to swap into column 0 at row 11
  b.cursor.x = 0; b.cursor.y = 11;
  run(b, 200, function (i, bd) {
    // swap while the faller is still airborne well above row 10
    if (i === 14) return { swap: true };
    return null;
  });
  eq(b.grid[11][0].color, 3, 'swapped panel holds row 11');
  eq(b.grid[10][0].color, 2, 'faller stacked on top, no clip');
});

test('garbage falls, lands, converts on adjacent match with chain flags', function () {
  var b = bare({ mode: 'vs' });
  b.queueGarbage(3, 1);
  run(b, 120, null); // delay + fall to floor
  eq(b.garbage.length, 1, 'garbage landed');
  var gb = b.garbage[0];
  eq(gb.state, 'idle');
  eq(gb.y, 11, 'rests on the floor row');
  // vertical match right next to it
  var mc = gb.x + gb.w < 6 ? gb.x + gb.w : gb.x - 1;
  place(b, 11, mc, 0); place(b, 10, mc, 0); place(b, 9, mc, 0);
  var evs = run(b, 200, null);
  assert(findEv(evs, 'garbage_clear'), 'garbage triggered');
  eq(b.garbage.length, 0, '1-tall block fully converted');
  var converted = 0;
  for (var c = gb.x; c < gb.x + gb.w; c++) {
    var cell = b.grid[11][c];
    if (cell.state !== E.EMPTY && cell.gid === 0 && cell.color >= 0) converted++;
  }
  eq(converted, 3, 'bottom row became real panels');
});

test('tall garbage shrinks by one row per clear', function () {
  var b = bare({ mode: 'vs' });
  b.queueGarbage(6, 3);
  run(b, 150, null);
  eq(b.garbage.length, 1);
  var gb = b.garbage[0];
  eq(gb.h, 3);
  eq(gb.y + gb.h - 1, 11, 'bottom row on floor');
  // match adjacent (vertical, needs a column NOT under garbage — full width,
  // so match against its bottom row via... place panels inside? no column is
  // free; use a horizontal match directly beneath impossible — instead lower
  // the block onto a pedestal so row 11 stays open)
  // simpler: fresh board with pedestal
  var b2 = bare({ mode: 'vs' });
  place(b2, 11, 0, 4); place(b2, 11, 1, 5); place(b2, 11, 2, 4);
  b2.queueGarbage(6, 3); // lands on rows 8..10 resting on pedestal at 11
  run(b2, 150, null);
  var g2 = b2.garbage[0];
  eq(g2.y, 8, 'stacked on pedestal');
  // now match the pedestal row by dropping... place a horizontal match at
  // row 11 columns 3..5 (empty floor next to pedestal, adjacent to garbage
  // bottom row via column 3 row 10)
  place(b2, 11, 3, 0); place(b2, 11, 4, 0); place(b2, 11, 5, 0);
  var evs2 = run(b2, 400, null);
  assert(findEv(evs2, 'garbage_clear'), 'tall garbage triggered');
  eq(b2.garbage.length, 1, 'block survives');
  eq(b2.garbage[0].h, 2, 'shrunk by one row');
});

test('determinism: same seed + inputs => identical hash', function () {
  function script(i) {
    var inp = {};
    if (i % 7 === 0) inp.swap = true;
    if (i % 11 === 0) inp.left = true;
    if (i % 13 === 0) inp.right = true;
    if (i % 17 === 0) inp.down = true;
    if (i % 23 === 0) inp.up = true;
    if (i % 50 < 3) inp.raise = true;
    return inp;
  }
  var a = new Board({ seed: 42, mode: 'endless', level: 8 });
  var bd = new Board({ seed: 42, mode: 'endless', level: 8 });
  for (var i = 0; i < 1200; i++) {
    a.step(script(i)); bd.step(script(i));
    if (i % 100 === 0) eq(a.hash(), bd.hash(), 'hash diverged at frame ' + i);
  }
  eq(a.hash(), bd.hash(), 'final hash');
  eq(a.score, bd.score, 'score');
  var c2 = new Board({ seed: 43, mode: 'endless', level: 8 });
  for (var j = 0; j < 1200; j++) c2.step(script(j));
  assert(c2.hash() !== a.hash(), 'different seed should diverge');
});

test('top pressure causes game over after grace', function () {
  var b = bare({ riseEnabled: true });
  for (var r = 0; r < 12; r++) place(b, r, 0, (r % 2) ? 0 : 1);
  var evs = run(b, E.DEATH_GRACE + 30, null);
  assert(b.gameOver, 'game over under sustained top pressure');
  assert(findEv(evs, 'game_over'));
});

test('clears pause the death timer', function () {
  var b = bare({ riseEnabled: true });
  for (var r = 0; r < 12; r++) place(b, r, 0, (r % 2) ? 0 : 1);
  // a big match elsewhere keeps the board busy
  place(b, 11, 3, 2); place(b, 11, 4, 2); place(b, 11, 5, 2);
  run(b, 60, null);
  assert(!b.gameOver, 'death timer held while clearing');
});

test('preview row never enters play with an instant match', function () {
  // stress: high level fast rise, random-ish swaps, watch for match events
  // whose panels were all preview-fresh (heuristic: any match within 1 frame
  // of a rise event with no swap in the previous 30 frames is suspicious —
  // we instead just verify no matches occur with zero input at max speed)
  var b = new Board({ seed: 99, mode: 'endless', level: 45, startRows: 2 });
  var evs = run(b, 1500, null);
  eq(countEv(evs, 'match'), 0, 'no input => no matches ever');
});

test('score tables', function () {
  eq(E.comboBonus(3), 0);
  eq(E.comboBonus(4), 20);
  eq(E.comboBonus(6), 50);
  eq(E.chainBonus(2), 50);
  eq(E.chainBonus(5), 300);
  var g = E.comboGarbage(8);
  eq(g.length, 2); eq(g[0].w, 3); eq(g[1].w, 4);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

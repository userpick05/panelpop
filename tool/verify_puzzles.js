// PANEL POP — replay every puzzle's reference solution and prove the board
// clears completely within the move budget. Run: node tool/verify_puzzles.js
'use strict';

var E = require('../js/engine.js');
var P = require('../js/puzzle.js');

var failed = 0;

for (var i = 0; i < P.LEVELS.length; i++) {
  var lv = P.LEVELS[i];
  var b = P.loadLevel(E.Board, i);
  var f;

  // sanity: board must start settled with no instant matches
  var pre = 0;
  for (f = 0; f < 240; f++) {
    b.step(null);
    for (var e = 0; e < b.events.length; e++)
      if (b.events[e].t === 'match') pre++;
  }
  if (pre > 0) {
    console.log('FAIL  L' + (i + 1) + ' ' + lv.name + ': board self-clears (' + pre + ' matches with no input)');
    failed++;
    continue;
  }

  var ok = true;
  for (var m = 0; m < lv.sol.length && ok; m++) {
    var x = lv.sol[m][0];
    var y = 11 - lv.sol[m][1];
    b.cursor.x = x; b.cursor.y = y;
    b.step({ swap: true });
    // wait for the board to settle (cap 1200 frames for long chains)
    var done = false;
    for (f = 0; f < 1200; f++) {
      b.step(null);
      if (P.settled(b, E)) { done = true; break; }
    }
    if (!done) { console.log('FAIL  L' + (i + 1) + ' ' + lv.name + ': never settled after move ' + (m + 1)); ok = false; }
  }
  if (!ok) { failed++; continue; }

  if (b.isEmpty()) {
    console.log('  ok  L' + (i + 1) + ' ' + lv.name + ' (' + lv.sol.length + ' moves, maxChain x' + b.maxChain + ')');
  } else {
    var left = 0;
    for (var r = 0; r < 12; r++)
      for (var c = 0; c < 6; c++)
        if (b.grid[r][c].state !== E.EMPTY) left++;
    console.log('FAIL  L' + (i + 1) + ' ' + lv.name + ': ' + left + ' panels remain');
    failed++;
  }
}

console.log(failed ? '\n' + failed + ' level(s) BROKEN' : '\nall ' + P.LEVELS.length + ' levels verified solvable');
process.exit(failed ? 1 : 0);

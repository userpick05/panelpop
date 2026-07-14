// PANEL POP — Puzzle mode: clear EVERY panel within the move budget.
// Level format: rows are the stack from top to bottom, '.'=empty, '0'-'5'
// colors. sol = the reference solution as [cursorX, rowFromBottom] swaps —
// every level is machine-verified solvable by tool/verify_puzzles.js.
'use strict';

(function () {

var LEVELS = [
  { name: 'FIRST SWAP', rows: ['00.0..'], sol: [[2, 0]] },
  { name: 'SLIDE OVER', rows: ['0.00..'], sol: [[0, 0]] },
  { name: 'NUDGE', rows: ['..0.00'], sol: [[2, 0]] },
  { name: 'MIND THE GAP', rows: ['1.....', '1.1...'], sol: [[0, 1]] },
  { name: 'PULL TOGETHER', rows: ['..33.3'], sol: [[4, 0]] },
  { name: 'STAIRCASE', rows: ['2.....', '22....'], sol: [[1, 0], [0, 1]] },
  { name: 'CORNER POCKET', rows: ['.....0', '....00'], sol: [[3, 0], [4, 1]] },
  { name: 'TWIN GAPS', rows: ['0..1..', '0.01.1'], sol: [[0, 1], [3, 1]] },
  { name: 'DOUBLE DECKER', rows: ['11.1..', '00.0..'], sol: [[2, 0], [2, 0]] },
  { name: 'CHAIN REACTION', rows: ['..1...', '1100.0'], sol: [[4, 0]] },
  { name: 'MIRROR CHAIN', rows: ['...1..', '0.0011'], sol: [[0, 0]] },
  { name: 'CHAIN AGAIN', rows: ['..4...', '4433.3'], sol: [[4, 0]] },
  { name: 'AFTERSHOCK', rows: ['..44.4', '..33.3'], sol: [[4, 0], [4, 0]] },
  { name: 'SIDESTEP', rows: ['4.44..', '3.33..'], sol: [[0, 0], [0, 0]] },
  { name: 'ECHO CANYON', rows: ['2..5..', '2.25.5'], sol: [[0, 1], [3, 1]] },
  { name: 'DOUBLE STAIRS', rows: ['0..1..', '00.11.'], sol: [[1, 0], [0, 1], [4, 0], [3, 1]] },
  { name: 'TRIPLE DECKER', rows: ['22.2..', '11.1..', '00.0..'], sol: [[2, 0], [2, 0], [2, 0]] },
  { name: 'TRIPLE ECHO', rows: ['..22.2', '..11.1', '..00.0'], sol: [[4, 0], [4, 0], [4, 0]] },
  { name: 'STACKED SNACK', rows: ['33.3..', '55.5..'], sol: [[2, 0], [2, 0]] },
  { name: 'TOWER TOPPLE', rows: ['..1...', '.121..', '2200.0'], sol: [[4, 0]] },
  { name: 'TOPPLE MIRROR', rows: ['...1..', '..121.', '0.0022'], sol: [[0, 0]] },
  { name: 'SKY CHAIN', rows: ['..3...', '.31...', '3121..', '2200.0'], sol: [[4, 0]] },
  { name: 'AVALANCHE', rows: ['...3..', '...13.', '..1213', '0.0022'], sol: [[0, 0]] },
  { name: 'PATIENCE', rows: ['33.3..', '22.2..', '11.1..', '00.0..'], sol: [[2, 0], [2, 0], [2, 0], [2, 0]] },
  { name: 'QUAKE', rows: ['..55.5', '..44.4', '..33.3'], sol: [[4, 0], [4, 0], [4, 0]] },
  { name: 'MEGA CHAIN', rows: ['..4...', '.43...', '.314..', '3121..', '2200.0'], sol: [[4, 0]] },
  { name: 'LONG HAUL', rows: ['44.4..', '33.3..', '22.2..', '11.1..', '00.0..'], sol: [[2, 0], [2, 0], [2, 0], [2, 0], [2, 0]] },
  { name: 'GRAND CHAIN', rows: ['..5...', '.54...', '.43...', '5314..', '3121..', '2200.0'], sol: [[4, 0]] },
  { name: 'CHAOS THEORY', rows: ['2..3..', '22.33.'], sol: [[1, 0], [0, 1], [4, 0], [3, 1]] },
  { name: 'GRAND FINALE', rows: ['..0...', '.05...', '.54...', '.430..', '5314..', '3121..', '2200.0'], sol: [[4, 0]] }
];

// build a Board loaded with a level (no rise, no auto stack)
function loadLevel(BoardCtor, idx) {
  var lv = LEVELS[idx];
  var b = new BoardCtor({ seed: 1000 + idx, mode: 'puzzle', startRows: 0, riseEnabled: false });
  var rows = lv.rows;
  var top = 12 - rows.length;
  for (var i = 0; i < rows.length; i++) {
    for (var c = 0; c < 6; c++) {
      var ch = rows[i][c];
      if (ch === '.' || ch === undefined) continue;
      var cell = b.grid[top + i][c];
      cell.color = parseInt(ch, 10);
      cell.state = 1; // IDLE
    }
  }
  // puzzle boards show no preview row
  for (var c2 = 0; c2 < 6; c2++) {
    var pc = b.grid[12][c2];
    pc.color = -1; pc.state = 0;
  }
  b.movesLeft = lv.sol.length;
  return b;
}

// board fully settled? (no swap/hover/fall/match/garbage motion)
function settled(b, E) {
  for (var r = 0; r < 12; r++)
    for (var c = 0; c < 6; c++) {
      var s = b.grid[r][c].state;
      if (s === E.SWAP || s === E.HOVER || s === E.FALL || s === E.MATCH) return false;
    }
  return true;
}

var Puzzle = { LEVELS: LEVELS, loadLevel: loadLevel, settled: settled };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Puzzle;
} else {
  window.Puzzle = Puzzle;
}

})();

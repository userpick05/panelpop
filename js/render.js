// PANEL POP — board renderer. Draws one Board at a pixel origin.
'use strict';

(function () {

var CELL = 16;
var E = null; // Engine ref, set on first draw

var BOARD_W = 6 * CELL;   // 96
var BOARD_H = 12 * CELL;  // 192

// draw a garbage block region
function drawGarbage(ctx, gb, ox, oy, riseOff, frame) {
  var x = ox + gb.x * CELL;
  var y = oy + gb.y * CELL - riseOff;
  var w = gb.w * CELL, h = gb.h * CELL;
  var flash = gb.state === 'clearing' && (frame >> 2) % 2 === 0;
  ctx.fillStyle = flash ? '#e8e8f4' : '#8b8ba4';
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = flash ? '#ffffff' : '#a8a8c0';
  ctx.fillRect(x + 1, y + 1, w - 2, 2);
  ctx.fillStyle = flash ? '#c0c0d8' : '#5c5c78';
  ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
  // rivets
  ctx.fillStyle = flash ? '#9c9cb8' : '#44445c';
  for (var rr = 0; rr < gb.h; rr++) {
    for (var cc = 0; cc < gb.w; cc++) {
      ctx.fillRect(x + cc * CELL + 7, y + rr * CELL + 7, 2, 2);
    }
  }
  // face in the middle
  if (gb.h >= 1 && gb.w >= 2) {
    var fx = x + ((w / 2) | 0) - 6, fy = y + ((h / 2) | 0) - 3;
    ctx.fillStyle = flash ? '#606078' : '#2c2c40';
    ctx.fillRect(fx, fy, 2, 3); ctx.fillRect(fx + 8, fy, 2, 3);
    ctx.fillRect(fx + 2, fy + 5, 7, 1);
  }
}

// board frame + background
function drawFrame(ctx, ox, oy, warning, frame) {
  ctx.fillStyle = '#14142a';
  ctx.fillRect(ox - 3, oy - 3, BOARD_W + 6, BOARD_H + 6);
  var edge = warning ? ((frame >> 3) % 2 ? '#e84f6a' : '#5a5a8c') : '#5a5a8c';
  ctx.fillStyle = edge;
  ctx.fillRect(ox - 3, oy - 3, BOARD_W + 6, 2);
  ctx.fillRect(ox - 3, oy + BOARD_H + 1, BOARD_W + 6, 2);
  ctx.fillRect(ox - 3, oy - 3, 2, BOARD_H + 6);
  ctx.fillRect(ox + BOARD_W + 1, oy - 3, 2, BOARD_H + 6);
  ctx.fillStyle = '#0a0a1c';
  ctx.fillRect(ox, oy, BOARD_W, BOARD_H);
  // subtle column stripes
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (var c = 0; c < 6; c += 2) ctx.fillRect(ox + c * CELL, oy, CELL, BOARD_H);
}

// draw one board; opts: {showCursor, cursorAnim}
function drawBoard(ctx, board, ox, oy, opts) {
  if (!E) E = window.Engine;
  opts = opts || {};
  var frame = board.frame;
  var riseOff = Math.floor(board.riseSub / E.CELL_SUB * CELL);
  var warning = board.inWarning() && !board.gameOver;

  var sh = Fx.shakeOffset('b' + ox);
  ox += sh.x | 0; oy += sh.y | 0;

  drawFrame(ctx, ox, oy, warning, frame);

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, BOARD_W, BOARD_H + CELL); // preview row visible below
  ctx.clip();

  for (var r = 0; r <= E.PREVIEW_ROW; r++) {
    for (var c = 0; c < 6; c++) {
      var cell = board.grid[r][c];
      if (cell.state === E.EMPTY || cell.color < 0) continue;
      if (cell.gid) continue; // garbage drawn as blocks

      var x = ox + c * CELL;
      var y = oy + r * CELL - riseOff;
      var spr = Sprites.panels[cell.color];
      var img = spr.normal;

      if (r === E.PREVIEW_ROW) {
        ctx.drawImage(spr.dim, x, y);
        continue;
      }

      if (cell.state === E.SWAP) {
        var prog = cell.t / E.SWAP_F;
        x += Math.round(cell.swapFrom * prog * CELL);
      } else if (cell.state === E.MATCH) {
        if (cell.popped) continue; // gone (sparkle already fired)
        if (frame < cell.mPop - 26) {
          img = ((frame >> 1) % 2) ? spr.flash : spr.normal; // white blink
        } else {
          img = spr.dark; // "braced" phase before its pop
        }
      } else if (cell.state === E.LAND && cell.t > E.LAND_F - 4) {
        // landing squash
        ctx.drawImage(img, 0, 0, CELL, CELL, x, y + 2, CELL, CELL - 2);
        continue;
      }

      // warning row jitter
      if (warning && (cell.state === E.IDLE)) {
        y += ((frame >> 2) + c) % 2;
      }

      ctx.drawImage(img, x, y);
    }
  }

  // garbage blocks
  for (var i = 0; i < board.garbage.length; i++) {
    drawGarbage(ctx, board.garbage[i], ox, oy, riseOff, frame);
  }

  // dim the preview strip
  ctx.fillStyle = 'rgba(8,8,20,0.35)';
  ctx.fillRect(ox, oy + BOARD_H, BOARD_W, CELL);

  // cursor
  if (opts.showCursor !== false && !board.gameOver) {
    var cur = Sprites.cursor[(frame >> 4) % 2];
    ctx.drawImage(cur,
      ox + board.cursor.x * CELL - 3,
      oy + board.cursor.y * CELL - 3 - riseOff);
  }

  ctx.restore();

  // game over veil
  if (board.gameOver) {
    ctx.fillStyle = 'rgba(10,10,28,0.6)';
    ctx.fillRect(ox, oy, BOARD_W, BOARD_H);
  }

  return { x: ox, y: oy, w: BOARD_W, h: BOARD_H, riseOff: riseOff };
}

window.Render = {
  CELL: CELL, BOARD_W: BOARD_W, BOARD_H: BOARD_H,
  drawBoard: drawBoard
};

})();

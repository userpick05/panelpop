// PANEL POP — all pixel art generated at boot onto offscreen canvases.
// Pastel SNES-puzzle homage: each color has a distinct shape (colorblind-safe).
'use strict';

(function () {

var CELL = 16;

// tile fill, tile shade, tile highlight per color
var PALETTES = [
  { f: '#f27d9d', d: '#c04f70', h: '#ffb1c8', name: 'heart' },
  { f: '#5fc96e', d: '#379149', h: '#98e8a2', name: 'circle' },
  { f: '#56b8e8', d: '#2f7fae', h: '#96dcff', name: 'triangle' },
  { f: '#f2ca4e', d: '#bd9426', h: '#ffe897', name: 'star' },
  { f: '#a97fe8', d: '#7a51b8', h: '#cfaeff', name: 'diamond' },
  { f: '#7f8fe8', d: '#5361b5', h: '#b2bcff', name: 'hex' }
];

// 10x10 shape masks
var SHAPES = [
  [ // heart
    '..........',
    '.##....##.',
    '####..####',
    '##########',
    '##########',
    '.########.',
    '..######..',
    '...####...',
    '....##....',
    '..........'
  ],
  [ // circle
    '..........',
    '...####...',
    '..######..',
    '.########.',
    '.########.',
    '.########.',
    '.########.',
    '..######..',
    '...####...',
    '..........'
  ],
  [ // triangle (up)
    '..........',
    '....##....',
    '....##....',
    '...####...',
    '...####...',
    '..######..',
    '..######..',
    '.########.',
    '##########',
    '..........'
  ],
  [ // star
    '....##....',
    '....##....',
    '...####...',
    '##########',
    '.########.',
    '..######..',
    '..######..',
    '.###..###.',
    '.#......#.',
    '..........'
  ],
  [ // diamond
    '....##....',
    '...####...',
    '..######..',
    '.########.',
    '##########',
    '.########.',
    '..######..',
    '...####...',
    '....##....',
    '..........'
  ],
  [ // hex (inverted triangle)
    '..........',
    '##########',
    '.########.',
    '.########.',
    '..######..',
    '..######..',
    '...####...',
    '...####...',
    '....##....',
    '..........'
  ]
];

function mkCanvas(w, h) {
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

function drawShape(ctx, mask, ox, oy, color) {
  ctx.fillStyle = color;
  for (var r = 0; r < mask.length; r++)
    for (var c = 0; c < mask[r].length; c++)
      if (mask[r][c] === '#') ctx.fillRect(ox + c, oy + r, 1, 1);
}

// variant: 'normal' | 'flash' | 'dark' | 'dim'
function drawPanel(color, variant) {
  var cv = mkCanvas(CELL, CELL);
  var ctx = cv.getContext('2d');
  var p = PALETTES[color];

  var fill = p.f, shade = p.d, hi = p.h, icon = '#ffffff';
  if (variant === 'flash') { fill = '#ffffff'; shade = '#cccccc'; hi = '#ffffff'; icon = p.f; }
  if (variant === 'dark') { fill = p.d; shade = '#00000000'; hi = p.d; icon = p.f; }

  // rounded tile
  ctx.fillStyle = fill;
  ctx.fillRect(1, 0, CELL - 2, CELL);
  ctx.fillRect(0, 1, CELL, CELL - 2);
  // bottom/right shade
  ctx.fillStyle = shade;
  ctx.fillRect(1, CELL - 1, CELL - 2, 1);
  ctx.fillRect(CELL - 1, 1, 1, CELL - 2);
  ctx.fillRect(2, CELL - 2, CELL - 3, 1);
  // top/left highlight
  ctx.fillStyle = hi;
  ctx.fillRect(1, 0, CELL - 2, 1);
  ctx.fillRect(0, 1, 1, CELL - 2);
  ctx.fillRect(1, 1, CELL - 3, 1);

  drawShape(ctx, SHAPES[color], 3, 3, icon);

  if (variant === 'dim') {
    ctx.fillStyle = 'rgba(10,10,30,0.62)';
    ctx.fillRect(0, 0, CELL, CELL);
  }
  return cv;
}

// cursor: two-cell bracket, 2 pulse frames
function drawCursor(frame) {
  var w = CELL * 2 + 6, h = CELL + 6;
  var cv = mkCanvas(w, h);
  var ctx = cv.getContext('2d');
  var g = frame ? 1 : 0; // pulse gap
  ctx.fillStyle = '#ffffff';
  var t = 2; // thickness
  var corners = [
    [0 + g, 0 + g], [CELL + 3, 0 + g],
    [0 + g, h - t - g]
  ];
  function bracket(x, y, dx, dy) {
    ctx.fillRect(x, y, t + 4, t);
    ctx.fillRect(x, y, t, t + 4);
  }
  // draw 8 L corners (4 per cell region, shared middle)
  function cellBrackets(ox) {
    bracket(ox + g, g, 1, 1);
    ctx.fillRect(ox + CELL + 2 - g - 4, g, 6, t);
    ctx.fillRect(ox + CELL + 4 - t - g, g, t, t + 4);
    bracket(ox + g, h - t - g - 4 + 4, 1, -1);
    ctx.fillRect(ox + g, h - t - g, 6, t);
    ctx.fillRect(ox + g, h - t - g - 4, t, 6);
    ctx.fillRect(ox + CELL + 2 - g - 4, h - t - g, 6, t);
    ctx.fillRect(ox + CELL + 4 - t - g, h - t - g - 4, t, 6);
  }
  cellBrackets(0);
  cellBrackets(CELL + 2);
  return cv;
}

function build() {
  var panels = [];
  for (var i = 0; i < PALETTES.length; i++) {
    panels.push({
      normal: drawPanel(i, 'normal'),
      flash: drawPanel(i, 'flash'),
      dark: drawPanel(i, 'dark'),
      dim: drawPanel(i, 'dim')
    });
  }
  window.Sprites = {
    CELL: CELL,
    panels: panels,
    cursor: [drawCursor(0), drawCursor(1)],
    palettes: PALETTES
  };
}

window.SpritesBuild = build;

})();

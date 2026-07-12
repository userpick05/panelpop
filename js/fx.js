// PANEL POP — render-side effects: particles, badges, screen shake.
// Visual only — allowed to use Math.random (never the engine RNG).
'use strict';

(function () {

var parts = [];   // {x,y,vx,vy,life,color,size}
var rings = [];   // {x,y,r,life,color} expanding pop rings
var badges = [];  // {x,y,text,color,life,vy,scale,punch}
var shakes = {};  // boardKey -> {mag, t}

function spawnPop(x, y, colorHex) {
  for (var i = 0; i < 6; i++) {
    parts.push({
      x: x + 8, y: y + 8,
      vx: (Math.random() - 0.5) * 2.4,
      vy: -Math.random() * 2.2 - 0.4,
      life: 22 + Math.random() * 10,
      color: colorHex,
      size: Math.random() < 0.4 ? 2 : 1
    });
  }
  rings.push({ x: x + 8, y: y + 8, r: 2, life: 12, color: colorHex });
}

function sparkle(x, y) {
  parts.push({ x: x + 8, y: y + 8, vx: 0, vy: -0.6, life: 18, color: '#ffffff', size: 2 });
}

// scale: text size (default 1); big badges get a punch-in (start oversized)
function badge(x, y, text, color, scale) {
  badges.push({
    x: x, y: y, text: text, color: color || '#ffffff',
    life: 55, vy: -0.45, scale: scale || 1, punch: scale > 1 ? 8 : 0
  });
}

function shake(key, mag) {
  var s = shakes[key];
  if (!s || mag > s.mag) shakes[key] = { mag: mag, t: 14 };
}

function shakeOffset(key) {
  var s = shakes[key];
  if (!s || s.t <= 0) return { x: 0, y: 0 };
  var m = s.mag * (s.t / 14);
  return { x: (Math.random() - 0.5) * m * 2, y: (Math.random() - 0.5) * m * 2 };
}

function update() {
  var i;
  for (i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (i = rings.length - 1; i >= 0; i--) {
    var rg = rings[i];
    rg.r += 1.4; rg.life--;
    if (rg.life <= 0) rings.splice(i, 1);
  }
  for (i = badges.length - 1; i >= 0; i--) {
    var b = badges[i];
    b.y += b.vy; b.life--;
    if (b.punch > 0) b.punch--;
    if (b.life <= 0) badges.splice(i, 1);
  }
  for (var k in shakes) if (shakes[k].t > 0) shakes[k].t--;
}

function draw(ctx) {
  var i;
  for (i = 0; i < rings.length; i++) {
    var rg = rings[i];
    ctx.globalAlpha = Math.min(0.7, rg.life / 12);
    ctx.strokeStyle = rg.color;
    ctx.lineWidth = 1;
    ctx.strokeRect((rg.x - rg.r) | 0, (rg.y - rg.r) | 0, (rg.r * 2) | 0, (rg.r * 2) | 0);
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < parts.length; i++) {
    var p = parts[i];
    ctx.globalAlpha = Math.min(1, p.life / 12);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (i = 0; i < badges.length; i++) {
    var b = badges[i];
    var s = b.scale + (b.punch > 4 ? 1 : 0); // brief oversize punch-in
    ctx.globalAlpha = Math.min(1, b.life / 20);
    Font.drawTextCentered(ctx, b.text, b.x + 1, (b.y | 0) + 1, '#101020', s);
    Font.drawTextCentered(ctx, b.text, b.x, b.y | 0, b.color, s);
  }
  ctx.globalAlpha = 1;
}

function clear() { parts.length = 0; rings.length = 0; badges.length = 0; shakes = {}; }

window.Fx = {
  spawnPop: spawnPop, sparkle: sparkle, badge: badge,
  shake: shake, shakeOffset: shakeOffset,
  update: update, draw: draw, clear: clear
};

})();

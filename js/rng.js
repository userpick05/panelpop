// PANEL POP — seeded deterministic RNG (mulberry32)
// Engine code must ONLY use Rng instances, never Math.random, so that
// board state is a pure function of (seed, input log) — the online-MP hook.
'use strict';

function Rng(seed) {
  this.s = seed >>> 0;
  if (this.s === 0) this.s = 0x9e3779b9;
}

Rng.prototype.next = function () {
  var t = (this.s += 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// integer in [0, n)
Rng.prototype.int = function (n) {
  return (this.next() * n) | 0;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Rng: Rng };
}

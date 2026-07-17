// PANEL POP — online lockstep sync test.
// Two peers (host side + guest side) run BOTH boards from the same seed, each
// stepping the host board with host inputs and the guest board with guest
// inputs (the canonical mapping the netcode uses). Their combined board hash
// must stay identical every frame — i.e. the online match can't desync.
// Run: node tool/test_lockstep.js
'use strict';

var E = require('../js/engine.js');
var Rng = require('../js/rng.js').Rng;

function pack(i) {
  return (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) |
         (i.down ? 8 : 0) | (i.swap ? 16 : 0) | (i.raise ? 32 : 0);
}
function unpack(c) {
  return { left: !!(c & 1), right: !!(c & 2), up: !!(c & 4),
           down: !!(c & 8), swap: !!(c & 16), raise: !!(c & 32) };
}

// a plausible input stream (some moves, swaps, occasional raise)
function stream(seed, n) {
  var r = new Rng(seed), out = [];
  for (var f = 0; f < n; f++) {
    var i = { left: false, right: false, up: false, down: false, swap: false, raise: false };
    var d = r.next();
    if (d < 0.14) i.left = true; else if (d < 0.28) i.right = true;
    if (r.next() < 0.10) i.up = true; else if (r.next() < 0.10) i.down = true;
    if (r.next() < 0.14) i.swap = true;
    if (r.next() < 0.05) i.raise = true;
    out.push(pack(i));
  }
  return out;
}

// one peer: owns both canonical boards, routes garbage like the real match
function Peer(seed) {
  this.bH = new E.Board({ seed: seed, mode: 'vs', level: 3 });
  this.bG = new E.Board({ seed: seed + 1, mode: 'vs', level: 3 });
}
Peer.prototype.step = function (hostCode, guestCode) {
  this.bH.step(unpack(hostCode));
  this.bG.step(unpack(guestCode));
  var i, at;
  for (i = 0; i < this.bH.attacks.length; i++) { at = this.bH.attacks[i]; this.bG.queueGarbage(at.w, at.h); }
  for (i = 0; i < this.bG.attacks.length; i++) { at = this.bG.attacks[i]; this.bH.queueGarbage(at.w, at.h); }
  this.bH.attacks.length = 0; this.bG.attacks.length = 0;
};
Peer.prototype.hash = function () { return (this.bH.hash() ^ Math.imul(this.bG.hash(), 31)) >>> 0; };

var passed = 0, failed = 0;
function run(name, seed, n) {
  var host = stream(seed * 7 + 1, n), guest = stream(seed * 7 + 2, n);
  // peer A generates host inputs locally + receives guest; peer B the mirror.
  // Both apply the SAME canonical mapping, so both must match every frame.
  var A = new Peer(seed), B = new Peer(seed);
  for (var f = 0; f < n; f++) {
    A.step(host[f], guest[f]);
    B.step(host[f], guest[f]);
    if (A.hash() !== B.hash()) {
      console.log('FAIL  ' + name + ': desync at frame ' + f);
      failed++; return;
    }
  }
  console.log('  ok  ' + name + ' (' + n + ' frames, final hash ' + A.hash() + ')');
  passed++;
}

console.log('PANEL POP lockstep sync tests');
for (var s = 1; s <= 6; s++) run('seed ' + s, s * 1000 + 137, 1500);

// packing round-trips
(function () {
  var ok = true;
  for (var c = 0; c < 64; c++) if (pack(unpack(c)) !== c) ok = false;
  console.log((ok ? '  ok  ' : 'FAIL  ') + 'input pack/unpack round-trip');
  if (ok) passed++; else failed++;
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

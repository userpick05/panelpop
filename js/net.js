// PANEL POP — online layer (Firebase Realtime Database).
//
// Powers two things, both fail-silent (offline / no config => disabled, game
// falls back to local, nothing breaks):
//   * Leaderboards — global top scores for Endless & Score Attack.
//   * Online Versus — room-code matchmaking + a relay for delay-based lockstep
//     on the deterministic engine (both peers simulate both boards from the
//     same seed + exchanged input streams, so garbage stays perfectly synced).
//
// The Firebase compat SDK is loaded from the CDN in index.html; if it didn't
// load (offline) or FIREBASE_CONFIG is null, Net.enabled stays false.
'use strict';

(function () {

var db = null;
var enabled = false;

function init() {
  try {
    if (!window.firebase || !window.FIREBASE_CONFIG) return;
    firebase.initializeApp(window.FIREBASE_CONFIG);
    db = firebase.database();
    enabled = true;
  } catch (e) {
    enabled = false;
  }
}

// ---- input packing (versus relay) -----------------------------------------
// one frame of input <-> a 6-bit int, so batches are tiny
function packInput(i) {
  return (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.up ? 4 : 0) |
         (i.down ? 8 : 0) | (i.swap ? 16 : 0) | (i.raise ? 32 : 0);
}
function unpackInput(c) {
  return {
    left: !!(c & 1), right: !!(c & 2), up: !!(c & 4),
    down: !!(c & 8), swap: !!(c & 16), raise: !!(c & 32)
  };
}

// ---- leaderboards ----------------------------------------------------------

// submit a score (fail-silent). name is a short tag; score an integer.
function submitScore(mode, name, score, cb) {
  if (!enabled) { if (cb) cb(false); return; }
  try {
    var ref = db.ref('scores/' + mode).push();
    ref.set({
      name: String(name || '???').slice(0, 4).toUpperCase(),
      score: Math.max(0, Math.min(9999999, score | 0)),
      ts: firebase.database.ServerValue.TIMESTAMP
    }, function (err) { if (cb) cb(!err); });
  } catch (e) { if (cb) cb(false); }
}

// fetch top n scores, descending. cb(list|null) — null on any failure.
function fetchTop(mode, n, cb) {
  if (!enabled) { cb(null); return; }
  try {
    db.ref('scores/' + mode).orderByChild('score').limitToLast(n)
      .once('value', function (snap) {
        var out = [];
        snap.forEach(function (c) {
          var v = c.val();
          if (v && typeof v.score === 'number') out.push({ name: v.name || '???', score: v.score });
        });
        out.sort(function (a, b) { return b.score - a.score; });
        cb(out);
      }, function () { cb(null); });
  } catch (e) { cb(null); }
}

// ---- versus room relay -----------------------------------------------------
// A NetMatch owns one room. side is 'h' (host) or 'g' (guest); the other side
// is auto-derived. Inputs are batched (K frames per write) to keep RTDB writes
// modest. Frame N's input is read via getRemote(N); undefined until it arrives.

var BATCH = 5; // frames per relayed batch

function NetMatch(code, side) {
  this.code = code;
  this.side = side;
  this.other = side === 'h' ? 'g' : 'h';
  this.ref = db.ref('rooms/' + code);
  this.remote = {};         // frame -> input code
  this.remoteHash = {};     // frame -> hash
  this.pending = [];        // local inputs awaiting a batch flush
  this.pendingStart = 0;    // frame index of pending[0]
  this.round = 0;           // rematch counter
  this.onOpponentLeave = null;
  this.onRematch = null;    // cb(round) when both sides ready for a new match
  this._rematchLocal = false;
  this._bind();
}

NetMatch.prototype._bind = function () {
  var self = this;
  // presence: drop our alive flag if we disconnect; watch the opponent's
  this.ref.child(this.side + '/alive').onDisconnect().remove();
  this.ref.child(this.side + '/alive').set(true);
  this.ref.child(this.other + '/alive').on('value', function (snap) {
    if (snap.val() !== true && self.onOpponentLeave) self.onOpponentLeave();
  });
  // opponent input batches
  this.ref.child(this.other + '/in').on('child_added', function (snap) {
    var b = snap.val();
    if (!b || typeof b.s !== 'number' || !b.d) return;
    for (var i = 0; i < b.d.length; i++) self.remote[b.s + i] = b.d[i];
  });
  // opponent periodic hashes (desync detection)
  this.ref.child(this.other + '/hash').on('child_added', function (snap) {
    self.remoteHash[snap.key | 0] = snap.val();
  });
  // rematch handshake
  this.ref.child('rematch').on('value', function (snap) {
    var v = snap.val() || {};
    if (v.h && v.g && self.onRematch) self.onRematch();
  });
  // round bumps (host starts a new match, streams cleared)
  this.ref.child('round').on('value', function (snap) {
    var r = snap.val() | 0;
    if (r > self.round) { self.round = r; if (self.onRoundStart) self.onRoundStart(r); }
  });
};

// queue a local input for frame `frame`; flushes a batch every BATCH frames
NetMatch.prototype.sendInput = function (frame, input) {
  if (this.pending.length === 0) this.pendingStart = frame;
  this.pending.push(packInput(input));
  if (this.pending.length >= BATCH) this._flush();
};
NetMatch.prototype._flush = function () {
  if (this.pending.length === 0) return;
  var idx = Math.floor(this.pendingStart / BATCH);
  try {
    this.ref.child(this.side + '/in/' + idx).set({ s: this.pendingStart, d: this.pending.slice() });
  } catch (e) {}
  this.pending = [];
};
NetMatch.prototype.flush = function () { this._flush(); }; // force (end of tick)

NetMatch.prototype.getRemote = function (frame) { return this.remote[frame]; };
NetMatch.prototype.getRemoteInput = function (frame) {
  var c = this.remote[frame];
  return c === undefined ? null : unpackInput(c);
};

NetMatch.prototype.sendHash = function (frame, hash) {
  try { this.ref.child(this.side + '/hash/' + frame).set(hash); } catch (e) {}
};
NetMatch.prototype.getRemoteHash = function (frame) { return this.remoteHash[frame]; };

// host sets the shared seed + starts round 1
NetMatch.prototype.startMatch = function (seed) {
  try {
    this.ref.child('seed').set(seed);
    this.ref.child('round').set(1);
  } catch (e) {}
};
NetMatch.prototype.readSeed = function (cb) {
  this.ref.child('seed').once('value', function (s) { cb(s.val()); });
};

// request a rematch; onRematch fires when BOTH sides have requested
NetMatch.prototype.requestRematch = function () {
  this._rematchLocal = true;
  try { this.ref.child('rematch/' + this.side).set(true); } catch (e) {}
};
// host: begin the next round with a fresh seed, clearing the streams
NetMatch.prototype.nextRound = function (seed) {
  try {
    var self = this;
    this.ref.child('h/in').remove(); this.ref.child('g/in').remove();
    this.ref.child('h/hash').remove(); this.ref.child('g/hash').remove();
    this.ref.child('rematch').remove();
    this.remote = {}; this.remoteHash = {}; this.pending = []; this._rematchLocal = false;
    this.ref.child('seed').set(seed);
    this.ref.child('round').transaction(function (r) { return (r | 0) + 1; });
  } catch (e) {}
};
NetMatch.prototype.resetStreams = function () {
  this.remote = {}; this.remoteHash = {}; this.pending = []; this._rematchLocal = false;
};

NetMatch.prototype.leave = function () {
  try {
    this.ref.child(this.side + '/alive').off();
    this.ref.child(this.other + '/alive').off();
    this.ref.child(this.other + '/in').off();
    this.ref.child(this.other + '/hash').off();
    this.ref.child('rematch').off();
    this.ref.child('round').off();
    this.ref.child(this.side + '/alive').remove();
  } catch (e) {}
};

// ---- room lifecycle --------------------------------------------------------

function randomCode() {
  var C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  var s = '';
  for (var i = 0; i < 4; i++) s += C[Math.floor(Math.random() * C.length)];
  return s;
}

// host: create a fresh room, return a NetMatch (side 'h'). cb(match, code)
function createRoom(hostTag, cb) {
  if (!enabled) { cb(null); return; }
  var code = randomCode();
  try {
    var ref = db.ref('rooms/' + code);
    ref.set({ meta: { created: firebase.database.ServerValue.TIMESTAMP, host: hostTag } },
      function (err) {
        if (err) { cb(null); return; }
        cb(new NetMatch(code, 'h'), code);
      });
  } catch (e) { cb(null); }
}

// guest: join an existing room by code. cb(match|null) — null if missing/full
function joinRoom(code, guestTag, cb) {
  if (!enabled) { cb(null); return; }
  code = String(code || '').toUpperCase().slice(0, 4);
  try {
    var ref = db.ref('rooms/' + code);
    ref.child('meta').once('value', function (snap) {
      if (!snap.exists()) { cb(null); return; } // no such room
      ref.child('g/joined').once('value', function (g) {
        if (g.val()) { cb(null, 'full'); return; }
        ref.child('g/joined').set(guestTag || '???');
        cb(new NetMatch(code, 'g'), code);
      });
    }, function () { cb(null); });
  } catch (e) { cb(null); }
}

window.Net = {
  init: init,
  isEnabled: function () { return enabled; },
  submitScore: submitScore,
  fetchTop: fetchTop,
  createRoom: createRoom,
  joinRoom: joinRoom,
  BATCH: BATCH
};

})();

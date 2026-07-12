// PANEL POP — WebAudio synth: sfx + chiptune music sequencer.
// Lessons baked in from ROCKBREAKER feedback: quiet by default, obvious -/+
// volume, and playback STOPS when the tab is hidden (visibilitychange, not
// just blur).
'use strict';

(function () {

var ctx = null;
var master = null;
var musicGain = null;
var sfxGain = null;
var volume = 0.25;
var musicOn = true;
var currentSong = null;
var songTimer = null;
var songStep = 0;
var unlocked = false;

function ensure() {
  if (ctx) return true;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.5;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 1.0;
  sfxGain.connect(master);
  return true;
}

// user-gesture unlock
function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  var first = !unlocked;
  unlocked = true;
  // a song requested before unlock was only parked in currentSong — start it
  if (first && musicOn && currentSong && !songTimer) {
    var pending = currentSong;
    currentSong = null;
    playSong(pending);
  }
}

function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = volume;
  window.Save && Save.set('volume', volume);
}
function getVolume() { return volume; }
function volUp() { setVolume(Math.round((volume + 0.05) * 100) / 100); }
function volDown() { setVolume(Math.round((volume - 0.05) * 100) / 100); }

// ---- sfx ------------------------------------------------------------------

function blip(freq, dur, type, gain, slide) {
  if (!ctx || !unlocked) return;
  var t = ctx.currentTime;
  var o = ctx.createOscillator();
  var g = ctx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain || 0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, gain, freq) {
  if (!ctx || !unlocked) return;
  var t = ctx.currentTime;
  var len = (ctx.sampleRate * dur) | 0;
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  var src = ctx.createBufferSource();
  src.buffer = buf;
  var f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = freq || 1200;
  var g = ctx.createGain();
  g.gain.setValueAtTime(gain || 0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t);
}

var Sfx = {
  move:   function () { blip(520, 0.04, 'square', 0.07); },
  swap:   function () { blip(330, 0.06, 'square', 0.12, 120); },
  land:   function () { blip(140, 0.05, 'triangle', 0.10); },
  // pop pitch climbs through a combo/chain
  pop: function (idx, chain) {
    var f = 440 + idx * 70 + (chain - 1) * 160;
    blip(f, 0.09, 'square', 0.16, 60);
  },
  chain: function (step) {
    var base = 520 + step * 60;
    blip(base, 0.09, 'square', 0.17);
    setTimeout(function () { blip(base * 1.25, 0.09, 'square', 0.17); }, 60);
    setTimeout(function () { blip(base * 1.5, 0.12, 'square', 0.17); }, 120);
  },
  garbageLand: function () { noise(0.25, 0.3, 700); blip(90, 0.2, 'triangle', 0.2); },
  garbagePop: function () { blip(600, 0.05, 'square', 0.1, 300); },
  levelUp: function () { blip(660, 0.08, 'square', 0.15); setTimeout(function () { blip(880, 0.12, 'square', 0.15); }, 80); },
  raise: function () { blip(200, 0.03, 'triangle', 0.06); },
  select: function () { blip(700, 0.05, 'square', 0.12); },
  back:   function () { blip(300, 0.06, 'square', 0.10); },
  win: function () {
    [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.15, 'square', 0.16); }, i * 120);
    });
  },
  lose: function () {
    [400, 350, 300, 200].forEach(function (f, i) {
      setTimeout(function () { blip(f, 0.2, 'triangle', 0.18); }, i * 150);
    });
  }
};

// ---- music ------------------------------------------------------------------
// tiny step sequencer: each song = { bpm, bass: [...], lead: [...] } with note
// numbers (semitones from A2, 0 = rest) looping.

function nf(n) { return 110 * Math.pow(2, n / 12); } // note -> freq (A2 base)

var SONGS = {
  menu: {
    bpm: 100,
    bass: [3, 0, 3, 0, 8, 0, 8, 0, 10, 0, 10, 0, 8, 0, 5, 0],
    lead: [15, 0, 19, 0, 22, 19, 15, 0, 20, 0, 22, 0, 19, 0, 0, 0]
  },
  play: {
    bpm: 118,
    bass: [3, 3, 0, 3, 6, 0, 3, 0, 1, 1, 0, 1, 5, 0, 6, 8],
    lead: [15, 0, 15, 18, 20, 0, 18, 15, 13, 0, 13, 15, 17, 15, 13, 10]
  },
  panic: {
    bpm: 160,
    bass: [3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 5, 5, 6, 6],
    lead: [15, 0, 14, 0, 13, 0, 14, 15, 15, 14, 13, 0, 18, 17, 15, 13]
  },
  results: {
    bpm: 90,
    bass: [8, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 0, 10, 0, 0, 0],
    lead: [20, 0, 22, 24, 20, 0, 0, 0, 17, 0, 20, 22, 24, 0, 0, 0]
  }
};

function stopMusic() {
  if (songTimer) { clearInterval(songTimer); songTimer = null; }
  currentSong = null;
}

function playSong(name) {
  if (!musicOn || !unlocked || !ctx) { currentSong = musicOn ? name : null; return; }
  if (currentSong === name && songTimer) return;
  stopMusic();
  currentSong = name;
  var song = SONGS[name];
  if (!song) return;
  songStep = 0;
  var stepMs = (60000 / song.bpm) / 4;
  songTimer = setInterval(function () {
    if (!ctx || ctx.state !== 'running') return;
    var i = songStep % song.bass.length;
    var t = ctx.currentTime;
    var b = song.bass[i];
    if (b) {
      var o = ctx.createOscillator(); var g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = nf(b - 12);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + stepMs / 1000 * 0.9);
      o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + stepMs / 1000);
    }
    var l = song.lead[i];
    if (l) {
      var o2 = ctx.createOscillator(); var g2 = ctx.createGain();
      o2.type = 'square'; o2.frequency.value = nf(l);
      g2.gain.setValueAtTime(0.07, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + stepMs / 1000 * 0.8);
      o2.connect(g2); g2.connect(musicGain); o2.start(t); o2.stop(t + stepMs / 1000);
    }
    songStep++;
  }, stepMs);
}

function setMusicOn(on) {
  musicOn = on;
  Save.set('musicOn', on);
  if (!on) stopMusic();
}

// stop when hidden — visibilitychange, NOT blur (backgrounded tabs kept
// playing in ROCKBREAKER until this exact handler was added)
document.addEventListener('visibilitychange', function () {
  if (!ctx) return;
  if (document.hidden) {
    ctx.suspend();
  } else if (unlocked) {
    ctx.resume();
  }
});

window.Audio2 = {
  unlock: unlock,
  setVolume: setVolume, getVolume: getVolume, volUp: volUp, volDown: volDown,
  sfx: Sfx,
  playSong: playSong, stopMusic: stopMusic,
  setMusicOn: setMusicOn,
  isMusicOn: function () { return musicOn; },
  init: function () {
    volume = Save.get('volume');
    musicOn = Save.get('musicOn');
  }
};

})();

// PANEL POP — localStorage persistence (scores, progress, settings).
'use strict';

(function () {

var KEY = 'panelpop_save_v1';

var defaults = {
  volume: 0.25,          // quiet by default
  musicOn: true,
  hiEndless: 0,
  hiScore: 0,            // score attack
  bestChainEndless: 1,
  puzzleCleared: {},     // { levelIndex: true }
  storyStage: 0,         // next stage to play (0-based)
  storyBeaten: false,
  vsWins: 0
};

var data = null;

function load() {
  data = {};
  for (var k in defaults) data[k] = defaults[k];
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      for (var k2 in parsed) {
        if (!(k2 in data)) continue;
        // corrupt/tampered values crash far from load — validate types here
        var v = parsed[k2], d = defaults[k2];
        if (typeof v !== typeof d) continue;
        if (typeof d === 'object' && (v === null || Array.isArray(v))) continue;
        data[k2] = v;
      }
    }
  } catch (e) { /* fresh save */ }
  return data;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full/blocked */ }
}

function get(k) { if (!data) load(); return data[k]; }
function set(k, v) { if (!data) load(); data[k] = v; save(); }

window.Save = { load: load, save: save, get: get, set: set };

})();

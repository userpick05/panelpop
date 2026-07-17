// PANEL POP — generate the OTA manifests GitHub Pages serves.
//   ota/web.json — { webVersion, files[] } for silent game (web) updates.
//   ota/apk.json — { version, apkUrl, notes } for native shell (APK) updates.
// webVersion is read from js/main.js APP_VERSION so it can never drift.
// Run: node tool/gen_manifests.js
'use strict';
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var GH_USER = 'userpick05';
var REPO = 'panelpop';

// web version = the game's APP_VERSION
var mainJs = fs.readFileSync(path.join(root, 'js', 'main.js'), 'utf8');
var m = mainJs.match(/APP_VERSION\s*=\s*'([^']+)'/);
if (!m) { console.error('could not find APP_VERSION in js/main.js'); process.exit(1); }
var webVersion = m[1];

// the exact files the WebView needs, in load order (index first)
var jsFiles = fs.readdirSync(path.join(root, 'js'))
  .filter(function (f) { return f.endsWith('.js'); })
  .map(function (f) { return 'js/' + f; });
var files = ['index.html'].concat(jsFiles);

var otaDir = path.join(root, 'ota');
if (!fs.existsSync(otaDir)) fs.mkdirSync(otaDir);

fs.writeFileSync(path.join(otaDir, 'web.json'),
  JSON.stringify({ webVersion: webVersion, files: files }, null, 2) + '\n');

// apk.json — the NATIVE SHELL version, read from config.dart's kNativeVersion
// (NOT pubspec — pubspec's version is just the per-build APK identity). This
// keeps the two update tracks decoupled: bump kNativeVersion ONLY when the
// Dart/native shell actually changes, so web-only game updates (new modes,
// online, controls, all pure JS) ship silently via web OTA and never fire the
// "app update available" banner.
var cfg = fs.readFileSync(path.join(root, 'app', 'lib', 'ota', 'config.dart'), 'utf8');
var nv = cfg.match(/kNativeVersion\s*=\s*'([^']+)'/);
var nativeVersion = nv ? nv[1] : webVersion;
var apkUrl = 'https://github.com/' + GH_USER + '/' + REPO +
  '/releases/download/v' + nativeVersion + '/panelpop-' + nativeVersion + '.apk';

fs.writeFileSync(path.join(otaDir, 'apk.json'),
  JSON.stringify({
    version: nativeVersion,
    apkUrl: apkUrl,
    notes: 'PANEL POP v' + nativeVersion
  }, null, 2) + '\n');

console.log('ota/web.json  webVersion=' + webVersion + ' (' + files.length + ' files)');
console.log('ota/apk.json  version=' + nativeVersion);
console.log('              apkUrl=' + apkUrl);

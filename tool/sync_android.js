// Copy the game (index.html + js/) into the Android app's assets so the
// WebView ships the exact same files the web version runs.
// Run: node tool/sync_android.js   (build_apk.ps1 calls this automatically)
'use strict';
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var dest = path.join(root, 'app', 'assets', 'www');

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'js'), { recursive: true });

fs.copyFileSync(path.join(root, 'index.html'), path.join(dest, 'index.html'));
var jsDir = path.join(root, 'js');
var files = fs.readdirSync(jsDir).filter(function (f) { return f.endsWith('.js'); });
files.forEach(function (f) {
  fs.copyFileSync(path.join(jsDir, f), path.join(dest, 'js', f));
});
console.log('synced index.html + ' + files.length + ' js files -> app/assets/www');

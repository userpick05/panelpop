// dev-only static server (no deps). node tool/serve.js [port]
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var port = parseInt(process.argv[2] || '8123', 10);
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
http.createServer(function (req, res) {
  var p = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && p === '/__shot') {
    // dev-only: page posts a canvas dataURL; we save it as PNG for review
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      var b64 = body.replace(/^data:image\/png;base64,/, '');
      var out = path.join(root, 'tool', 'shot.png');
      fs.writeFile(out, Buffer.from(b64, 'base64'), function (err) {
        res.writeHead(err ? 500 : 200);
        res.end(err ? 'fail' : 'saved');
      });
    });
    return;
  }
  if (p === '/') p = '/index.html';
  var file = path.join(root, p);
  if (file.indexOf(root) !== 0) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, function () { console.log('panelpop dev server on http://localhost:' + port); });

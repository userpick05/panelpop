// PANEL POP — in-app static file server.
//
// Serves the writable www dir over http://127.0.0.1:<fixed port> so the
// WebView always has ONE stable origin (saves survive OTA swaps) and works
// fully offline. No-store headers so an OTA-updated file is picked up on the
// next load rather than a stale cached one.
import 'dart:io';

import 'config.dart';

class LocalServer {
  static HttpServer? _server;

  static Future<int> start(String rootDir) async {
    // Reuse if already up (hot restart in dev).
    if (_server != null) return _server!.port;
    final server =
        await HttpServer.bind(InternetAddress.loopbackIPv4, kLocalPort, shared: true);
    _server = server;
    server.listen((req) => _handle(req, rootDir));
    return server.port;
  }

  static Future<void> _handle(HttpRequest req, String rootDir) async {
    try {
      var p = Uri.decodeComponent(req.uri.path);
      if (p == '/' || p.isEmpty) p = '/index.html';
      // keep the request inside rootDir
      final normalized = p.replaceAll('..', '');
      final file = File('$rootDir$normalized');
      if (!await file.exists()) {
        req.response.statusCode = HttpStatus.notFound;
        await req.response.close();
        return;
      }
      req.response.headers.set('Cache-Control', 'no-store');
      req.response.headers.contentType = _mime(normalized);
      await req.response.addStream(file.openRead());
      await req.response.close();
    } catch (_) {
      try {
        req.response.statusCode = HttpStatus.internalServerError;
        await req.response.close();
      } catch (_) {}
    }
  }

  static ContentType _mime(String path) {
    if (path.endsWith('.html')) return ContentType.html;
    if (path.endsWith('.js')) return ContentType('application', 'javascript');
    if (path.endsWith('.css')) return ContentType('text', 'css');
    if (path.endsWith('.json')) return ContentType('application', 'json');
    if (path.endsWith('.png')) return ContentType('image', 'png');
    return ContentType.binary;
  }
}

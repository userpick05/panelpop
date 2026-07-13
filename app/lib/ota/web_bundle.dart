// PANEL POP — web bundle manager (the WEB OTA half).
//
// The game is served from a writable directory (appDocs/www) via a local
// server, NOT straight from Flutter assets. That gives one stable origin for
// saves and lets OTA overwrite the game files in place. Flow:
//   1. ensureBundle(): if the writable copy is missing or older than the APK's
//      bundled game, (re)extract the bundled assets/www into appDocs/www.
//   2. checkForWebUpdate(): fetch ota/web.json; if it advertises a newer web
//      version than what's on disk, download the listed files and swap them in.
//      Takes effect on the next launch — never hot-swapped mid-session.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'config.dart';

class WebBundle {
  /// Absolute path to the writable www directory the local server serves.
  static late String wwwPath;

  static File _versionFile(String dir) => File('$dir/.webversion');

  /// Make sure appDocs/www holds a game at least as new as the bundled one.
  /// Returns the www path.
  static Future<String> ensureBundle() async {
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/www');
    wwwPath = dir.path;

    final onDisk = await _readVersion(dir.path);
    if (onDisk == null || _isNewer(kBundledWebVersion, onDisk)) {
      await _extractBundled(dir);
      await _versionFile(dir.path).writeAsString(kBundledWebVersion);
    }
    return dir.path;
  }

  static Future<String?> _readVersion(String dir) async {
    try {
      final f = _versionFile(dir);
      if (await f.exists()) return (await f.readAsString()).trim();
    } catch (_) {}
    return null;
  }

  /// Copy every bundled `assets/www/**` file into [dir], recreating subdirs.
  static Future<void> _extractBundled(Directory dir) async {
    if (await dir.exists()) await dir.delete(recursive: true);
    await dir.create(recursive: true);
    final manifest =
        jsonDecode(await rootBundle.loadString('AssetManifest.json'))
            as Map<String, dynamic>;
    const prefix = 'assets/www/';
    for (final key in manifest.keys) {
      if (!key.startsWith(prefix)) continue;
      final rel = key.substring(prefix.length);
      final out = File('${dir.path}/$rel');
      await out.parent.create(recursive: true);
      final bytes = await rootBundle.load(key);
      await out.writeAsBytes(bytes.buffer.asUint8List(
          bytes.offsetInBytes, bytes.lengthInBytes));
    }
  }

  /// Check the remote web manifest and, if newer, download + apply it.
  /// Returns the new version string when an update was applied, else null.
  /// Any failure (offline, malformed, 404) is swallowed — an update check must
  /// never disrupt play.
  static Future<String?> checkForWebUpdate() async {
    if (kOtaBase.contains('<GITHUB')) return null; // not configured yet
    try {
      final res = await http
          .get(Uri.parse(kWebManifestUrl))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final remote = (json['webVersion'] as String?)?.trim();
      final files = (json['files'] as List?)?.cast<String>();
      if (remote == null || files == null || files.isEmpty) return null;

      final current = await _readVersion(wwwPath) ?? kBundledWebVersion;
      if (!_isNewer(remote, current)) return null;

      // Download to a staging dir first; only swap in once ALL files land, so
      // a mid-download failure can't leave a half-updated (broken) game.
      final staging = Directory('$wwwPath/../www_stage');
      if (await staging.exists()) await staging.delete(recursive: true);
      await staging.create(recursive: true);
      for (final rel in files) {
        final url = '$kOtaBase/$rel';
        final r = await http
            .get(Uri.parse(url))
            .timeout(const Duration(seconds: 20));
        if (r.statusCode != 200) {
          await staging.delete(recursive: true);
          return null; // abort — keep the working copy intact
        }
        final out = File('${staging.path}/$rel');
        await out.parent.create(recursive: true);
        await out.writeAsBytes(r.bodyBytes);
      }
      // Promote staging -> live, then stamp the version.
      for (final rel in files) {
        final src = File('${staging.path}/$rel');
        final dst = File('$wwwPath/$rel');
        await dst.parent.create(recursive: true);
        await src.copy(dst.path);
      }
      await staging.delete(recursive: true);
      await _versionFile(wwwPath).writeAsString(remote);
      return remote;
    } catch (e) {
      debugPrint('Web update check failed: $e');
      return null;
    }
  }

  /// True when [a] is a higher dotted version than [b]. Tolerant of differing
  /// segment counts and non-numeric noise.
  static bool _isNewer(String a, String b) {
    final pa = _parts(a), pb = _parts(b);
    final n = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < n; i++) {
      final av = i < pa.length ? pa[i] : 0;
      final bv = i < pb.length ? pb[i] : 0;
      if (av != bv) return av > bv;
    }
    return false;
  }

  static List<int> _parts(String v) => v
      .split('.')
      .map((p) => int.tryParse(p.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0)
      .toList();
}

// PANEL POP — native shell (APK) update, for the rare time the Flutter wrapper
// itself changes. Mirrors the pattern used across the userpick05 apps: check a
// version.json, and if it advertises a newer build, download the APK and hand
// it to Android's package installer (one user tap to confirm).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

import 'config.dart';

class ApkUpdateInfo {
  final String version;
  final String apkUrl;
  final String notes;
  const ApkUpdateInfo(
      {required this.version, required this.apkUrl, required this.notes});
}

class ApkUpdate {
  /// Returns info when ota/apk.json advertises a newer native build; null when
  /// up to date, unreachable, or malformed. A failed check never disrupts play.
  static Future<ApkUpdateInfo?> check() async {
    if (!Platform.isAndroid) return null;
    if (kOtaBase.contains('<GITHUB')) return null;
    try {
      final res = await http
          .get(Uri.parse(kApkManifestUrl))
          .timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;
      final json = jsonDecode(res.body) as Map<String, dynamic>;
      final latest = (json['version'] as String?)?.trim();
      final apkUrl = (json['apkUrl'] as String?)?.trim();
      if (latest == null || apkUrl == null || apkUrl.isEmpty) return null;
      if (!_isNewer(latest, kNativeVersion)) return null;
      return ApkUpdateInfo(
        version: latest,
        apkUrl: apkUrl,
        notes: (json['notes'] as String?)?.trim() ?? '',
      );
    } catch (e) {
      debugPrint('APK update check failed: $e');
      return null;
    }
  }

  /// Download the APK (progress 0..1) then launch the system installer.
  static Future<void> downloadAndInstall(ApkUpdateInfo info,
      {void Function(double)? onProgress}) async {
    if (await Permission.requestInstallPackages.isDenied) {
      await Permission.requestInstallPackages.request();
    }
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/panelpop-${info.version}.apk');

    final request = http.Request('GET', Uri.parse(info.apkUrl));
    final response = await request.send();
    if (response.statusCode != 200) {
      throw HttpException('Download failed (${response.statusCode})');
    }
    final total = response.contentLength ?? 0;
    var received = 0;
    final sink = file.openWrite();
    await for (final chunk in response.stream) {
      sink.add(chunk);
      received += chunk.length;
      if (total > 0) onProgress?.call(received / total);
    }
    await sink.flush();
    await sink.close();

    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) {
      throw Exception('Could not open installer: ${result.message}');
    }
  }

  static bool _isNewer(String latest, String current) {
    final a = _parts(latest), b = _parts(current);
    final len = a.length > b.length ? a.length : b.length;
    for (var i = 0; i < len; i++) {
      final av = i < a.length ? a[i] : 0;
      final bv = i < b.length ? b[i] : 0;
      if (av != bv) return av > bv;
    }
    return false;
  }

  static List<int> _parts(String v) => v
      .split('.')
      .map((p) => int.tryParse(p.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0)
      .toList();
}

// PANEL POP — Android shell.
//
// A thin WebView around the game (the same files as the web version). The game
// is served from a writable copy via a local server so it can be updated
// over-the-air without a reinstall, while saves stay put. See lib/ota/.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'ota/apk_update.dart';
import 'ota/local_server.dart';
import 'ota/web_bundle.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  // Prepare the writable game copy and serve it locally (stable origin).
  // If startup fails (e.g. the fixed port is held by another app, or asset
  // extraction fails), show an error screen instead of a black window.
  try {
    final www = await WebBundle.ensureBundle();
    final port = await LocalServer.start(www);
    runApp(PanelPopApp(url: 'http://127.0.0.1:$port/index.html'));
  } catch (e) {
    runApp(const _BootErrorApp());
  }
}

class _BootErrorApp extends StatelessWidget {
  const _BootErrorApp();
  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        backgroundColor: Color(0xFF08081A),
        body: Center(
          child: Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              "Couldn't start PANEL POP.\nClose other apps and reopen.",
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFFE8E8F4), fontSize: 16),
            ),
          ),
        ),
      ),
    );
  }
}

class PanelPopApp extends StatelessWidget {
  final String url;
  const PanelPopApp({super.key, required this.url});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PANEL POP',
      debugShowCheckedModeBanner: false,
      home: GameScreen(url: url),
    );
  }
}

class GameScreen extends StatefulWidget {
  final String url;
  const GameScreen({super.key, required this.url});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> with WidgetsBindingObserver {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WakelockPlus.enable();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF08081A))
      ..loadRequest(Uri.parse(widget.url));
    // Kick off update checks after first frame — they never block play.
    WidgetsBinding.instance.addPostFrameCallback((_) => _checkUpdates());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    }
  }

  Future<void> _checkUpdates() async {
    // WEB: silently fetched and applied for next launch.
    final newWeb = await WebBundle.checkForWebUpdate();
    if (newWeb != null && mounted) {
      _snack('Game updated to v$newWeb — restart to play the latest.');
    }
    // NATIVE (APK): offer a one-tap install when the shell itself is behind.
    final apk = await ApkUpdate.check();
    if (apk != null && mounted) _offerApkUpdate(apk);
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: const Color(0xFF22223c),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 6),
    ));
  }

  void _offerApkUpdate(ApkUpdateInfo info) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('App update v${info.version} available'),
      backgroundColor: const Color(0xFF22223c),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 10),
      action: SnackBarAction(
        label: 'UPDATE',
        textColor: const Color(0xFFf2ca4e),
        onPressed: () => _runApkUpdate(info),
      ),
    ));
  }

  // Download the APK behind a modal progress dialog (the download is ~45 MB, so
  // a silent background fetch looks like "nothing happened"). The dialog shows
  // live MB/percentage on every chunk — even when the server sends no total, so
  // it can never sit frozen at 0% — then hands off to the system installer.
  Future<void> _runApkUpdate(ApkUpdateInfo info) async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    // (received, total-or-null) — drives the dialog without rebuilding the app.
    final progress = ValueNotifier<(int, int?)>((0, null));
    var dialogOpen = true;
    // Dispose the notifier exactly when the dialog route is gone (whether we pop
    // it or the user backs out of it), so nothing writes to it afterwards.
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _DownloadDialog(info: info, progress: progress),
    ).then((_) {
      dialogOpen = false;
      progress.dispose();
    });

    try {
      await ApkUpdate.downloadAndInstall(info, onProgress: (received, total) {
        if (dialogOpen) progress.value = (received, total);
      });
      if (mounted && dialogOpen) Navigator.of(context, rootNavigator: true).pop();
      if (mounted) _snack('Tap INSTALL in the system prompt to finish.');
    } catch (e) {
      if (mounted && dialogOpen) Navigator.of(context, rootNavigator: true).pop();
      if (mounted) {
        final msg = e.toString().replaceFirst('Exception: ', '');
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Update failed: $msg'),
          backgroundColor: const Color(0xFF22223c),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 8),
          action: SnackBarAction(
            label: 'RETRY',
            textColor: const Color(0xFFf2ca4e),
            onPressed: () => _runApkUpdate(info),
          ),
        ));
      }
    }
  }

  // Android back = Esc (pause / menu back). Exit via home/recents like any game.
  void _sendEscape() {
    _controller.runJavaScript(
      "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));"
      "window.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape'}));",
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) _sendEscape();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF08081A),
        body: WebViewWidget(controller: _controller),
      ),
    );
  }
}

// Modal shown while the update APK downloads. Reads a (received, total?) stream
// and shows live MB + a progress bar — determinate when the server gives a
// total, indeterminate (still animating) when it doesn't, so it always reads as
// "actively downloading" rather than a frozen 0%.
class _DownloadDialog extends StatelessWidget {
  const _DownloadDialog({required this.info, required this.progress});

  final ApkUpdateInfo info;
  final ValueListenable<(int, int?)> progress;

  static String _mb(int bytes) => (bytes / (1024 * 1024)).toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: true, // back can dismiss; the download keeps going in the background
      child: AlertDialog(
        backgroundColor: const Color(0xFF1b1b30),
        title: Text('Downloading update v${info.version}',
            style: const TextStyle(color: Colors.white, fontSize: 16)),
        content: ValueListenableBuilder<(int, int?)>(
          valueListenable: progress,
          builder: (_, value, _) {
            final received = value.$1;
            final total = value.$2;
            final frac = (total != null && total > 0) ? received / total : null;
            final label = total != null
                ? '${_mb(received)} / ${_mb(total)} MB  (${(frac! * 100).round()}%)'
                : '${_mb(received)} MB…';
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: frac,
                    minHeight: 10,
                    backgroundColor: const Color(0xFF33335c),
                    valueColor:
                        const AlwaysStoppedAnimation(Color(0xFFf2ca4e)),
                  ),
                ),
                const SizedBox(height: 12),
                Text(label,
                    style: const TextStyle(
                        color: Color(0xFFcfcfe6), fontSize: 13)),
              ],
            );
          },
        ),
      ),
    );
  }
}

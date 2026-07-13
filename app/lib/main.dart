// PANEL POP — Android shell.
//
// A thin WebView around the game (the same files as the web version). The game
// is served from a writable copy via a local server so it can be updated
// over-the-air without a reinstall, while saves stay put. See lib/ota/.
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
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

  // Prepare the writable game copy and serve it locally (stable origin).
  final www = await WebBundle.ensureBundle();
  final port = await LocalServer.start(www);

  runApp(PanelPopApp(url: 'http://127.0.0.1:$port/index.html'));
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
        onPressed: () async {
          try {
            await ApkUpdate.downloadAndInstall(info);
          } catch (e) {
            if (mounted) _snack('Update failed: $e');
          }
        },
      ),
    ));
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

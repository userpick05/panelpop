// PANEL POP — Android shell. A thin WebView around the exact same game files
// the web version uses (synced into assets/www by tool/sync_android.js), so
// gameplay changes always land on both platforms.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const PanelPopApp());
}

class PanelPopApp extends StatelessWidget {
  const PanelPopApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      title: 'PANEL POP',
      debugShowCheckedModeBanner: false,
      home: GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

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
      ..loadFlutterAsset('assets/www/index.html');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // the game already stops audio/sim on visibilitychange; nothing extra
    // needed, but re-assert immersive mode when we come back
    if (state == AppLifecycleState.resumed) {
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    }
  }

  // Android back button = Esc (pause / menu back). The game handles the rest;
  // the user exits via home/recents like any game.
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

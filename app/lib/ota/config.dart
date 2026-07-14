// PANEL POP — OTA configuration.
//
// Two update tracks:
//   * WEB   — the game itself (index.html + js/*). Ships silently: the app
//             pulls a newer web bundle from GitHub Pages and applies it on the
//             next launch. No reinstall, no prompt.
//   * NATIVE — the Flutter shell (this APK). Rarely changes; when it does the
//             app offers a one-tap APK download + install.
//
// kBundledWebVersion MUST match the game's APP_VERSION baked into the APK's
// bundled assets. tool/gen_manifests.js keeps ota/web.json in sync.
library;

const String kBundledWebVersion = '0.6.0'; // == js/main.js APP_VERSION at build
const String kNativeVersion = '0.6.0'; // == pubspec version (shell build)

// GitHub Pages serves the repo root, so the game and both manifests live at:
const String kOtaBase = 'https://userpick05.github.io/panelpop';
const String kWebManifestUrl = '$kOtaBase/ota/web.json';
const String kApkManifestUrl = '$kOtaBase/ota/apk.json';

// Fixed loopback port for the in-app static server. Kept constant across
// launches so the WebView origin — and therefore localStorage / saves — never
// changes, whether the files came from the bundle or from an OTA update.
const int kLocalPort = 47653;

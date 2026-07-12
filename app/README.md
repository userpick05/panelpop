# PANEL POP — Android shell

Thin Flutter WebView around the game at the repo root. **Do not edit
`assets/www/` — it is generated.** Run `node ../tool/sync_android.js` (or just
`powershell ../tool/build_apk.ps1`, which does it for you) before any
`flutter build` / `flutter run`, or the pubspec asset references will fail.

- Landscape-locked, immersive fullscreen, wakelock, back button = pause.
- `android/gradle.properties` disables Kotlin incremental compilation — the
  C:-drive pub cache vs F:-drive project combination crashes it on Windows.
- Release APK: `app/build/app/outputs/flutter-apk/app-release.apk`
  (debug-signed; fine for sideloading).

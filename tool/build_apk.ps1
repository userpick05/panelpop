# PANEL POP - one-command release APK.
# Syncs the game files into the Flutter shell, then builds.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

node (Join-Path $root "tool\sync_android.js")
Set-Location (Join-Path $root "app")
flutter build apk --release
Write-Host ""
Write-Host "APK: app\build\app\outputs\flutter-apk\app-release.apk"

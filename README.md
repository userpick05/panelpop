# PANEL POP

An 8-bit style panel-swap puzzle game in the spirit of Panel de Pon — rising stack, two-panel cursor, match-3 clears, and deep chain combos. Pure HTML5: no dependencies, no build step.

**Play:** double-click `index.html`.

## Modes

- **Endless** — survive the rising stack, speed climbs forever, chase the high score.
- **Score Attack** — 2 minutes, biggest score wins.
- **Vs. CPU** — battle an AI opponent; combos and chains send garbage blocks.
- **2 Player** — local versus on one keyboard.
- **Puzzle** — clear the whole board in a fixed number of swaps.
- **Story** — climb the ladder of rivals to the final boss.

## Controls

| Action | Player 1 | Player 2 (2P mode) |
|---|---|---|
| Move cursor | WASD | Arrow keys |
| Swap | F | . (period) |
| Raise stack | G | , (comma) |
| Pause | Esc or P | Esc or P |
| Volume | - / + | - / + |

Touch: tap a cell to move the cursor, tap again to swap; on-screen RAISE button.

## Online multiplayer (future hook)

The board simulation is deterministic and input-driven: given the same RNG seed and the same time-stamped input log, two machines produce bit-identical board states (verified by the determinism test in `tool/test_engine.js`). Netplay can therefore be added later by exchanging input logs (lockstep or rollback) without touching the engine — see `js/engine.js` header notes.

## Android

The Android app is a thin Flutter WebView shell (`app/`) around the **exact
same game files** — `tool/sync_android.js` copies `index.html` + `js/` into
the app's assets at build time, so any gameplay change ships to web and
Android identically. Landscape-locked, fullscreen, screen stays awake, back
button = pause.

Build: `powershell tool/build_apk.ps1` → `app/build/app/outputs/flutter-apk/app-release.apk`

Touch controls (web + Android): **drag a panel sideways to swap it**, or tap
a cell then tap it again; hold the on-screen RAISE button to raise the stack.

## Environments

Each round is set in one of seven layered parallax worlds (meadow, dusk dunes,
night, cavern, sky isles, seaside, ember). The play board sits on a platform in
the foreground with the vista receding behind it. `js/backgrounds.js` owns this;
it is render-only (pre-rendered static layers + subtle live ambient motion) and
never touches the deterministic engine. Theme is picked by seed in the solo/vs
modes, rotates by level in Puzzle, and is fixed per Story stage.

## Development

- Engine (`js/engine.js`) is pure logic, loadable in Node via a `module.exports` guard.
- Headless tests: `node tool/test_engine.js`
- Everything else is classic `<script>` tags so the game runs from `file://`.

# Changelog

## v0.8.1 — 2026-07-17 (branch feature-v0.8-portrait)

Fix: the in-app APK update could sit on "Downloading update…" forever with no
visible progress (native shell only — the game itself is unchanged).

- **Real download feedback** — a modal progress dialog with a bar and live
  `MB / MB (%)`, updated on every chunk. Previously progress was only shown
  when the server reported a total size; GitHub's redirected asset sometimes
  reports it as unknown, so the old snackbar sat frozen at 0% for the whole
  ~45 MB download and looked hung.
- **Stall timeout** — if the connection goes idle for 30 s mid-download it now
  aborts with "Download stalled — check your connection" and a **RETRY**
  action, instead of hanging indefinitely.
- Also: follows redirects explicitly, clears any stale partial download before
  starting, and cleans up the partial file on failure.

## v0.8.0 — 2026-07-13 (branch feature-v0.8-portrait)

Portrait, Game-Boy-style controls on phones.

- **Portrait orientation** — the Android app is now portrait; the game screen
  sits at the top with a control deck below (web layout switches to a
  `screen + deck` column on touch devices; desktop still centers the canvas).
- **On-screen D-pad + A / B / RAISE buttons, on every screen** — big, always
  visible, so you drive the menus and the game with the pad instead of poking
  small text. D-pad = move cursor / navigate menus; A = swap / confirm;
  B = back / pause; RAISE = hold to raise. Feeds the same input pipeline as the
  keyboard, so nothing downstream changed.

## v0.7.0 — 2026-07-13 (branch feature-v0.7-online)

Online — leaderboards + real-time versus, all fail-silent (offline or before
a Firebase project is configured, the game runs exactly as before).

- **Online leaderboards** — global top-10 for Endless and Score Attack. Set a
  4-letter pilot name; scores submit on game over. Falls back to your local
  best when offline.
- **Online Versus** — real-time head-to-head over **room codes**: HOST gets a
  code to share, JOIN enters it. Runs delay-based **lockstep** on the
  deterministic engine (both sides simulate both boards from one seed +
  exchanged inputs, so the garbage stays perfectly in sync), with board-hash
  **desync detection**. **Rematch** in the same room after a match; forfeit on
  quit. Powered by a Firebase relay (no dedicated server).
- Firebase config lives in `js/firebase-config.js` (null until you create a
  project — see README). New: `js/net.js`, `tool/gen_manifests.js` already
  syncs the new files; `tool/test_lockstep.js` proves two peers stay
  bit-identical over 1500 frames.

## v0.6.0 — 2026-07-12 (branch feature-v0.5-ota)

- **Virtual on-screen controls for phones.** A translucent thumb **D-pad**
  (move the cursor), **SWAP** and **RAISE** buttons, and a pause button. No
  more hunting for a tiny cell with a fat finger — move the cursor and press
  SWAP. Auto-shown on touch-primary devices (the Android app and mobile web
  browsers); hidden on desktop. Tap/drag-to-swap still works too. Delivered to
  installed apps over the air — no reinstall needed. (`js/touchpad.js`, wired
  into the same input pipeline as the keyboard.)

## v0.5.1 — 2026-07-12 (branch feature-v0.5-ota)

- **Fix: game rendered tiny on many phones.** The canvas fit-scale was snapped
  to a whole number above 1.5×, so a phone whose natural fit was ~1.5–1.9×
  floored to 1× and drew the board at 480×270 in the middle of the screen. Now
  it always scales to the largest aspect-preserving fit, so it fills the
  display. (Also the first fix delivered over the air — installed 0.5.0 apps
  pull it silently.)

## v0.5.0 — 2026-07-12 (branch feature-v0.5-ota)

Now on GitHub (public: `userpick05/panelpop`) and set up for over-the-air
updates.

- **Web OTA (silent):** the game is web content, so the Android app updates it
  without a reinstall. The shell serves the game from a writable copy through a
  fixed-port loopback server — one stable origin, so **saves survive updates**
  and it works fully offline. On launch it checks `ota/web.json`; a newer web
  bundle is downloaded to a staging dir, promoted atomically, and applied on the
  next launch. Push new game files → every install picks them up.
- **APK OTA (native shell):** for the rare time the Flutter wrapper itself
  changes, the app checks `ota/apk.json` and offers a one-tap download + install
  (same pattern as the other userpick05 apps).
- **GitHub Pages:** the repo also serves the game as a playable web build at
  `https://userpick05.github.io/panelpop/`, which doubles as the OTA source.
- `tool/gen_manifests.js` regenerates both manifests from `APP_VERSION` /
  pubspec so versions can't drift.

## v0.4.0 — 2026-07-12 (branch feature-v0.4-backgrounds)

Abstract ambient backgrounds — all shared JS, so web and Android both get
them. Tribunal'd SHIP.

- **Nebula + Bokeh**: a slow drifting color wash for depth with soft rising
  bokeh orbs, tuned dark and muted so the panels always stay the star. No
  scenery, no ground — each board floats on the wash with a dark halo behind
  it that keeps the panels crisp.
- **Reactive brighten**: when a bold garbage drop lands on a side, the wash
  there lightly brightens — bigger attacks glow brighter — then fades back.
  In Vs. it lights up the enemy's side as your attack arrives; in solo/puzzle
  a big chain briefly lights your own side.
- **7 per-mode palettes** (Meadow / Sunset / Night / Amethyst / Aqua / Ocean /
  Ember) — the same effect recolored, so Endless varies by seed, Puzzle
  rotates, and each Story rival gets its own mood (Lord Prism = Ember). No new
  art per palette; it's a color swap.
- Render-only and advanced at the fixed sim rate, so it never touches the
  deterministic game and feels identical at any display refresh rate.

  (Replaced an earlier literal-landscape take that didn't land — same
  version, new direction, pre-merge.)

## v0.3.0 — 2026-07-12 (branch feature-v0.3-polish)

Game-feel pass — all shared JS, so web and Android get every change.

### Feel
- **3-2-1-GO! countdown** before solo and versus rounds (boards visible,
  frozen), with beeps and punch-in numbers.
- **Hitstop**: the whole game freezes for a few frames on x3+ chains and
  5+ combos — big moments land.
- **Cursor glide**: the cursor eases between cells instead of teleporting
  (pixel-space lerp, continuous across rise commits, identical feel at any
  display refresh rate).
- Chain badges escalate in color and size; x4+ chains shout AWESOME! /
  FANTASTIC! / INCREDIBLE! / UNBELIEVABLE!; floating +score popups.
- Pop rings on every cleared panel; pulsing red danger vignette; landing
  squash and shakes carried over.

### Interface
- Animated title: logo letters wave, flanking panels bob, PRESS ENTER fades.
- Screen-change fade transitions; punch-in stamps for GAME OVER / WIN /
  LOSE / CLEAR and the countdown.
- Score displays count up (in-game HUD and results); NEW RECORD flashes
  after the count finishes.
- Puzzle move counter punches on spend; Score Attack ticks through its
  final 10 seconds.

## v0.2.0 — 2026-07-12 (branch feature-v0.2-android)

### Android app
- Flutter WebView shell at `app/` wrapping the **same game files** as the web
  version — `tool/sync_android.js` copies them into assets at build time, so
  web and Android can never drift. One-command build: `tool/build_apk.ps1`.
- Landscape-locked, immersive fullscreen, screen stays awake, Android back
  button = pause/menu-back.
- Gradle: Kotlin incremental compilation disabled (cross-drive Windows crash;
  same fix as Stashpot).

### Touch controls (web + Android)
- **Drag-to-swap**: drag a panel sideways and it walks under your finger,
  one legal swap per frame; mid-animation swaps retry instead of stranding
  the panel. Tap-a-cell / tap-again-to-swap still works (taps now fire on
  finger-up with a 6px slop so drags and taps never collide).

## v0.1.0 — 2026-07-12 (branch feature-v0.1-mvp)

Initial version, built overnight. Full Tribunal review (reviewer → converge → judge): **SHIP**.

### Game
- Panel de Pon-style core: 6x12 rising stack, 2-wide cursor, match-3+, hover/fall
  physics, chains (flags survive airborne swaps; catch/juggle tech works), combos,
  stop time (max-not-sum, danger-scaled), manual raise (cancels stop, never kills
  while topped out), top-out grace, speed levels, 6th color at high speed.
- **Endless** and **Score Attack** (2:00) with localStorage records.
- **Vs. CPU** — 8 difficulty tiers; cursor-simulation AI (its own seeded RNG, sees
  only settled panels). Combo/chain garbage exchange with block conversion.
- **2 Players** — local versus, WASD+F/G vs arrows+period/comma.
- **Puzzle** — 30 authored levels, every one machine-verified solvable; chain
  ladder up to a x7 GRAND FINALE built on alternating-anchor staircases.
- **Story** — 8 original rivals (Poppy → Lord Prism) with escalating AI, dialog,
  ending; progress saved.
- Deterministic engine: board state = f(seed, input log) — the future online-
  multiplayer hook (see README). 21 headless engine tests + 30-level verifier.

### Presentation
- 480x270 pixel canvas; every sprite, portrait, and the 4x5 font generated in
  code at boot — zero image assets.
- WebAudio chiptune (menu/play/panic/results) + synth sfx; **quiet by default**,
  -/+ volume anywhere, M music toggle, stops when the tab is hidden.
- Chain/combo badges, pop particles, landing squash, danger shake, garbage faces.
- Touch: tap to move cursor, tap-again to swap, on-screen RAISE.

### Tribunal fixes (post-review)
- Airborne swaps no longer kill a live chain (SWAP counts in chainAlive).
- Whole columns hover/fall as one unit (slinky fall fixed at both gravity checks);
  chain puzzles redesigned for the corrected physics.
- Global keys centralized: no phantom pause from menu Esc; volume works everywhere.
- Rise frozen between chain links; double-KO resolves in the player's favor;
  save-data type validation; stuck keys cleared on Alt-Tab; title music starts on
  first input; chain garbage capped; off-screen garbage can't silently evaporate;
  exact-tie no longer shows NEW RECORD; multiply glyph in chain badges.

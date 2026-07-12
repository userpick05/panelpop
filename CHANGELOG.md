# Changelog

## v0.4.0 — 2026-07-12 (branch feature-v0.4-backgrounds)

Layered background environments — all shared JS, so web and Android both get
them. Tribunal'd SHIP.

- **7 themed vistas** behind the play boards, built in Donkey-Kong-Country
  style layers: sky gradient → sun/moon → far & mid silhouettes → a receding
  perspective ground plane → ground-line details. The boards sit on a themed
  platform plinth with a cast shadow, so each one reads as planted on the
  floor with the world stretching back behind it.
- Themes: **MEADOW** (sun, clouds, rolling hills), **DUSK DUNES** (low sun,
  palms, sand), **NIGHT** (moon, twinkling stars, shooting stars, mountains),
  **CAVERN** (glowing crystals, floating spores), **SKY ISLES** (cloud banks,
  gliding birds), **SEASIDE** (shimmering ocean, sun glitter, distant sails),
  **EMBER** (volcanic dusk, rising embers).
- Ambient motion is deliberately subtle — nothing that competes with the
  panels. Static layers are pre-rendered per theme at boot; the environment
  is render-only and never affects the deterministic game.
- Theme is chosen by seed (Endless / Score Attack / Vs / 2P), rotates by
  level in Puzzle, and each of the 8 Story rivals gets a fitting world
  (Lord Prism's showdown is EMBER).

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

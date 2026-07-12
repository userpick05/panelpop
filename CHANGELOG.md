# Changelog

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

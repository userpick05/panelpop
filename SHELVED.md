# Shelved / deferred (v0.1.0)

- **Online multiplayer** — deliberately deferred (user call: see the game working
  first). Engine is deterministic + input-driven for it; touch input currently
  writes the cursor directly and must be routed through the input log first
  (TODO(netplay) in js/main.js).
- **Metal/gray garbage + shock (!) panels** — the SNES sources for the exact
  cross-trigger rules are thin; skipped rather than shipped wrong.
- **Judge's P3 nits** (accepted, not blockers): garbage falls with ~1-frame/row
  lag behind panels (cosmetic); releaseAll() doesn't clear touch points on blur;
  tap-QUIT from pause skips the back sfx; unmute during panic plays 'play' for
  one frame; vsWins is saved but not displayed anywhere yet.
- **Draw screen for exact-frame double-KO** — resolves in the player's favor
  instead (commented in js/main.js).

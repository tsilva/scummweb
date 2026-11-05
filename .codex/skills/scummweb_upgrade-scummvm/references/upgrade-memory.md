# Upgrade memory

This file holds reusable upgrade knowledge. The machine-checked
[patch ledger](patches.json) owns individual adaptations. Read current source and
tests when porting; do not treat an old implementation shape as the requirement.

## Source and build boundaries

- `scripts/scummvm-version.sh` pins the release tag, peeled upstream commit and
  numeric Emscripten SDK. A tag or SDK alias alone is not a reproducible pin.
- `scripts/build_scummvm_web.sh` owns checkout verification, the ordered native
  patch series, dynamic engine/subengine configuration and codec/toolchain setup.
  Its engine arrays and subengine checks are the current support inventory;
  do not replace them with upstream defaults or duplicate their list here.
- Preserve Ogg/Vorbis, FLAC, MAD/MP3, PNG, JPEG, zlib and Theora configuration and
  the intentional disabled external MIDI/synth paths. Rebuild codec libraries
  when SDK/ABI compatibility requires it. Keep upstream license notices.
- `SCUMMVM_REUSE_CATALOG=1` preserves tracked game configuration/catalog and the
  launcher assets while rebuilding code. Do not redetect every game, download
  replacement packages, or migrate artwork as a side effect of an engine upgrade.
- Edit templates in `web-shell/`, source patches in `patches/scummvm/`, and the
  generated-audio adapter in `scripts/patch_scummvm_audio.py`. The build stages
  `dist/` and syncs `scummvm-shell/`; app preparation stages the latter to `public/`.
  Do not hand-edit generated JS/Wasm or substitute upstream shell templates.
- The audio adapter deliberately matches exact generated SDL3 patterns and fails
  when they change. Port it semantically after an SDK/SDL upgrade rather than
  weakening its match or bypassing it. Test silence, finite/clamped samples,
  suspended audio and the gesture that starts audio without skipping a cutscene.

## Browser/runtime compatibility

- Shell mounts must remain visible to the POSIX backend. Preserve BrowserFS
  operation receiver binding and WASI errno translation for Emscripten 4, default
  config initialization, per-version save directories, and current save-access
  coordination. Existing browser saves are user data, not disposable fixtures.
- Keep local game handoff origin/source validation and support either archive or
  runtime becoming ready first. Archive completion must not overwrite the active
  inline-fallback URL: that causes valid first-frame messages to be rejected.
- OpenGL draws alone are not proof of a game frame: ScummVM draws its splash and
  GUI through the same renderer. Patch 12 signals after actual refresh with an
  engine, no visible overlay, and a completed splash or prior GUI launch. Its
  `splash`, `_launched`, `_overlayVisible` and refresh lifecycle references are
  explicit porting points. Preserve original splash/intro behavior. Dark game
  frames are valid; brightness polling alone can miss them or cleared WebGL
  backbuffers. Keep the shell/native callback contract and software fallbacks.
- A hosted game can request Return to Launcher without terminating the runtime.
  Patch 14 guards native launcher construction and explicitly signals successful
  main teardown. Emscripten's keepalive runtime can bypass both `Module.quit` and
  `Module.onExit`; input/Escape heuristics cannot establish a real exit. Preserve
  the native host callback, synchronous canvas hiding, and idempotent navigation.
- Cached archives use validated atomic manifest/payload records and Blob slices.
  Do not reintroduce ZIP extraction/checksumming on every launch, all-file MEMFS
  copies, or unbounded preloading. Preserve 8 MiB local cache eviction, optional
  small-file prewarm/fallback, byte-exact range/BOM/EOF behavior, and current
  archive/path/size validation. Runtime/theme/translation hints must fail safely.
- Preserve content-addressed JS/Wasm/engine URLs and exact-version immutable
  caching. HTML revalidates; incorrect versions cannot receive immutable caching.
  Regenerate both runtime manifests and the per-file data index after rebuilding.
- `test/scummvm-shell-output.test.mjs`, `test/runtime-bootstrap.test.mjs`,
  `test/scummvm-filesystem.test.mjs`, `test/first-frame.test.mjs`,
  `test/game-route-frame.test.mjs`, `test/audio-start-control.test.mjs` and save
  tests provide local regression coverage. Node tests do not replace gameplay,
  audible output, real save/resume or launch-time measurements in Brave.

- The web save bridge (patch 13) must retain actual detected identities and per-version save paths. Capability flags alone are insufficient: PreAGI and non-Myst/Riven Mohawk titles are excluded. Keep nonexistent autosave placeholders, bundled intro bytes, Kyrandia restart saves and Groovie reserved slot zero out of Continue. Native filename getters may need fixed engine prefixes for engines whose saves ignore target names. Query mode uses a temporary configuration; it must not rewrite user targets. Save timestamps and index validation remain in the shell/library contract.

## Keeping this memory useful

When a patch is introduced or changed, update its ledger purpose, invariants,
regression verification, retirement condition and SHA-256 in the same change.
Keep generated-runtime patch adapters named `scripts/patch_scummvm_*`; the checker
covers Python, JavaScript and shell adapters. Extend coverage for new adapter kinds.
Retired entries retain the lesson and identify the upstream fix; they must not
leave an active file behind. Update this file for cross-cutting SDK, build or
browser-integration lessons. Store verified conclusions, not guesses or raw QA.

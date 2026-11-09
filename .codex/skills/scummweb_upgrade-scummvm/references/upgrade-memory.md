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
- Full builds publish the source inputs alongside the browser binaries. Keep
  the pinned upstream archive, ScummWEB patch and build-source ZIP, library
  source inputs and checksums in sync. Update the source packager when linked
  libraries change. A project commit from a local worktree can be absent from
  the public remote and cannot stand in for the build-source ZIP.
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
  explicit porting points. Patch 23 skips the native splash for browser games
  and still marks it complete. Preserve game-owned intros. Dark game
  frames are valid; brightness polling alone can miss them or cleared WebGL
  backbuffers. Keep the shell/native callback contract and software fallbacks.
- Defer only nonfatal compatibility prompts when the player iframe opts in.
  Keep the translated native text and show every distinct warning for that
  launch. Fatal startup errors and dialogs requiring a game or file choice
  must retain their native behavior.
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

- The web save bridge (patch 13) must retain actual detected identities and per-version save paths. Capability flags alone are insufficient: PreAGI and non-Myst/Riven Mohawk titles are excluded. Keep nonexistent autosave placeholders, bundled intro bytes, Kyrandia restart saves and Groovie reserved slot zero out of Continue. Native filename getters may need fixed engine prefixes for engines whose saves ignore target names. Query mode uses a temporary configuration; it must not rewrite user targets. Route query iframes to the actual shell, initialize the backend and graphics overlay, resolve the configured metadata plugin and return through normal backend cleanup. AGS save metadata can decode thumbnails and use the overlay pixel format. Run the query after standard graphics setup, before the engine launch loop. Do not run game detection in a save query: the archive is intentionally absent, and AGS requires game files to detect even a known target. The native CLI listing branch runs too early for this dynamic WebAssembly backend; do not substitute it for the web query path. Save timestamps and index validation remain in the shell/library contract.

- Save completion (patch 15) belongs at the shared save-manager output lifetime,
  not Engine::saveGameState or finalize alone: original dialogs can bypass the
  former and Lure deletes its stream without the latter. BrowserFS LocalStorage
  persists buffered bytes at descriptor close. Finalize compression and destroy
  the wrapped stream before native listing; do not reenter native listing from
  FS.close. Preserve the shell's close-error observer, pending filenames written
  before truncation, retryable metadata persistence and exclusive save-session
  lock. Metadata does not make multi-key filesystem writes crash-atomic.

- Intro skip is edition-specific. Patch 24 uses the engine's normal first-scene transition or native intro abort and keeps original character, input and menu choices. Exercise both paths and keep the original Play path for fresh launches.

## Keyboard callback lifetime

- SDL 3.2.4's Emscripten unregister path dereferences the numeric window target
  sentinel as a string and skips keyboard cleanup. ScummVM display recreation
  accumulates listeners: Mystery House received six native callbacks for one
  trusted, non-repeating browser keydown. The generated keyboard adapter replaces
  only the same callback/target/type/capture registration, retaining the newest
  window userData. Do not debounce characters or suppress held-key repeat to hide
  this lifecycle bug. Apply on shell-only and full builds; test after display
  initialization and preserve independent callbacks and ordinary DOM listeners.

## Intro checkpoints

- Some engines save normally but do not honor startup `save_slot`. Patch 17
  uses Nippon Safes boot parameter 1 to retain language/character selection
  without the story intro, and routes Sword25 through its queued Lua persistence API after resource and
  interface initialization. Do not call Sword25's native unpersist routine from
  inside a coroutine or before its services exist. Keep the startup-script marker
  strict and retain the original behavior when no slot is requested.

## Keeping this memory useful

When a patch is introduced or changed, update its ledger purpose, invariants,
regression verification, retirement condition and SHA-256 in the same change.
Keep generated-runtime patch adapters named `scripts/patch_scummvm_*`; the checker
covers Python, JavaScript and shell adapters. Extend coverage for new adapter kinds.
Retired entries retain the lesson and identify the upstream fix; they must not
leave an active file behind. Update this file for cross-cutting SDK, build or
browser-integration lessons. Store verified conclusions, not guesses or raw QA.

## Mortevielle and Z-Vision

- Keep Mortevielle's `mort.dat` and Z-Vision's font data in the browser filesystem index. Z-Vision requires the Emscripten FreeType port. Its DVD movie option requires MPEG-2 and A52 together, so the browser build uses the standard video tracks.
- Keep both engines in the browser's Continue capability list. The pinned native engines support save listing and loading during startup.

## Evaluator-only telemetry

- Patch 16 reports Queen room variables after display update only when an external evaluator opts in. Keep pending transitions and cutaways distinct from a ready room. Preserve the bounded transition queue and explicit overflow failure so a polling consumer cannot silently miss an endpoint. This telemetry is evaluator data, not player observations.
- Keep indexed game variables in a separate queue so existing room consumers remain compatible. Take a baseline at first presentation, queue changed writes at the setter to catch values that revert between polls, and replace the baseline on restore because Queen's deserializer writes the array directly. Verify both queues after rebuilding the native plugin.
- Include Emscripten headers before ScummVM headers that define forbidden C-library symbols. Parenthesize JavaScript object literals containing commas inside `EM_ASM`, since the C preprocessor does not group macro arguments by JavaScript braces.
- Keep opt-in engine and game identity available for every engine. SCUMM banks
  are sampled at engine ticks because the VM can write directly to its arrays.
  Publish a fresh baseline after native restore or restart. Use the physical
  room resource and detected index MD5 for edition-specific progress rules.

- Patch 19 adds opt-in, read-only snapshots for engines with known room and variable storage. Keep native bank indices, omit unavailable room IDs, and publish a whole sample at once. These samples are independent of the Queen and SCUMM evaluation queues.
- The AGOS adapter records the Elvira II finale at script dispatch because the losing and winning branches share a late ritual variable and replay prompt. Gate branch IDs on the full database fingerprint and preserve the outcome across scripted loads within the ending. A successful user restore or a new attempt clears it.

- Patch 20 samples engine-owned room and game state in the remaining shipped plugins. Keep the browser query flag separate from evaluator queues. Preserve sparse keys, treat native room names and IDs as engine-specific, and keep ordinary browser launches off by default.
- AGI uses the edition fingerprint already used by its save compatibility check. SCI fingerprints the complete resource map when present. GLK's common event state is shared across interpreters, while each story's room and variables belong to its own VM.

## Agent game controls

- The shared browser fallback counts presented frames. Preserve dedicated
  engine update boundaries where they exist. Saving and loading are separate
  capabilities and the engine's current-scene checks still apply. Verify
  deferred restores after the next presented frame.
- Some save APIs use fixed filenames even when the launch target has another
  name. Keep the engine filename check alongside the native save list, and
  verify the save exists before acknowledging success. Composer must close its
  output stream so BrowserFS can publish the completed file.
- AGOS quick saves use the idle input path and the original redraw scripts.
  Plumbers checkpoints use the decision scene, its prior scene and the score.
  Keep either adapter away from unfinished transitions and cinematic frames.

- Exact ticks belong to a supported engine update boundary. The Sky hook
  acknowledges pause only after the completed tick renders, yields while held,
  and lets queued browser input reach the first resumed update. Keep native
  save/load on that same boundary and honor engine availability checks.
- The shell scopes both native save paths and save indexes by the AgentSCUMM
  run. Scoped listings do not update the ordinary browser library. Preserve
  startup checkpoint handling and the normal save stream completion callbacks.
- Queen renders frames from nested walk, dialogue, and cutaway loops. Count
  these updates as well as updates from the main loop. Keep save and load
  between commands. Queen restores a room through its normal entry path, so
  finish the load after presentation and exclude setup frames from the tick
  count. The Pinnacle map waits for input after its fade and must acknowledge
  the load there. Queen's normal tick interval is 100 milliseconds.
- Some serializers change the active scene or rebuild graphics. Use a completed
  engine update outside renderer calls and script callbacks for these operations.
  DreamWeb redraws through its original native load path. Nippon Safes uses its
  existing location switch and keeps the progress slot reserved. The prison's
  ten-character `estcarcere` key must match the visited-room table on restore.
  Migrate older `estcarcer` entries while reading the same save layout. A
  newly visited prison still shows its native introduction. Tinsel
  reconstructs scenes over several updates, so hold the restore acknowledgment
  until that reconstruction finishes.
- Composer saves contain one palette index per sprite pixel. Set the format
  when rebuilding surfaces and retain the restore's dirty rectangles until the
  next draw. Sword25 uses its original persistence dispatch for load handlers.
  Temporary save listing objects must not destroy the live persistence service.

- Gnap captures a thumbnail from the live scene for an external save. Its
  native writer normally receives a thumbnail prepared by the in-game menu.
- Pegasus Prime assigns scoped saves stable filenames. Exercise a second load
  in the same session. Closing an already closed drawer could restore an
  input handler from the neighborhood destroyed by the first load.
- Return to Zork and Woodruff delegate restoration to their original scripts.
  Match the callback bytes before offering runtime checkpoints. Check the
  rendered scene and restored native variables after the script returns.

# Maintaining ScummWEB

- [Play, import games, and back up saves](#playing-and-importing-games)
- [Develop and test](#local-development)
- [Rebuild ScummVM and add freeware](#rebuilding-and-upgrading-scummvm)
- [Manage artwork](#artwork-storage-and-publishing)
- [Deploy and publish game files](production-delivery.md)

## Playing and importing games

Choose a game from the library or Recently Played, then select **Play**.
For games with multiple copies, the version selector remembers your available
choice. Otherwise it favors the latest known revision, with the included copy
or browser language used to break ties. Demos have separate cards. **Game not
included** means you need your own copy. Check the
[compatibility results](game-testing.md) for tested editions.

The app-install invitation becomes eligible on the third homepage visit in the
same browser. A fresh page load counts once; client-side navigation and component
remounts do not add visits. Dismissing it permanently suppresses the invitation,
including in other open tabs, while the browser retains the site's local data.
Installed apps, embedded pages and browsers without writable local storage do
not show it. Installation still depends on browser support.

Use **Add a game**, or drop ZIPs, ISOs, or a folder containing them onto the
homepage or a game page. Pack one game per ZIP, with its data at the root or
inside one enclosing folder. Local archives support up to 4 GiB including
unpacked contents. ISO imports support ISO 9660 and Joliet data discs with
2048-byte sectors and read game files directly from the image. Imported ZIPs and
ISOs detect games at the archive root first, then search subfolders and launch
from the detected data directory. Installers beside the game data can stay in
place. Import checks the file contents to distinguish editions; large discs can
take longer to scan.
UDF-only images, raw BIN/CUE images, interleaved files and multi-extent files
need to be extracted and packed as a ZIP first. Disc images must contain
ScummVM game data; installer-only discs need installation/extraction first.
Large compressed ZIPs need temporary browser storage. A large ZIP with
compression disabled can be read directly from disk. See
[packaging a collection](#package-a-local-scummvm-collection).

If a ZIP or ISO is inaccessible, use **Allow file access** to restore permission or
**Locate ZIP or ISO** to reconnect a moved file or replace a legacy folder entry.
Reimporting the same archive also refreshes access. Reconnecting preserves the
source ID and its saves.

Once the library contains an imported version, press and hold a game cover, or
choose **Manage library**, to enter removal mode. The button stays hidden when
the library contains only bundled games.
Only cards with removable imported versions shake in this mode.
Use the **×** on an imported game's cover to remove its library reference; original game files,
cached archives and saved games stay untouched. A card with multiple versions
opens a chooser with a trash button beside each imported version. Removed rows
fade out and collapse; the chooser stays open to remove another version or close
when finished. Bundled versions cannot be removed. **Undo** restores removals in reverse
order during the current visit, including the original imported-game IDs.
The removal notice offers Undo for five seconds, then fades out.
Choose **Done** or press Escape to return to browsing. Previously hidden bundled
games are restored automatically when the library loads. These library changes
apply to the current browser only.

An import with the same game data as an included copy uses the bundled version.
Reimport an older unverified archive to make a distinct edition selectable again.
Fingerprints compare normalized data paths, uncompressed sizes, and CRC-32
values, ignoring manuals, licenses, launchers, and configuration. Regenerate
[`data/bundled-game-files.json`](../data/bundled-game-files.json) with
`node scripts/generate-bundled-game-files.mjs` after publishing changed ZIPs.
The command uses public range reads.

### Player controls

In-game overlay buttons and touch pads share the translucent surface, border,
icon colors and interaction states in [`game-controls.css`](../app/styles/game-controls.css).
Adjust the `--game-control-*` variables together to keep every control consistent.
Idle controls use subdued colors; hover, keyboard focus, pressed and expanded
states increase their opacity. Top and bottom controls share vertical insets,
and both sides share horizontal insets, using the larger safe-area inset on
each axis to preserve symmetric spacing around cutouts.

- **Esc** or **Open game menu** opens the shared menu. **Esc** returns from a
  picker or closes the menu. Clicking or tapping outside the menu closes it
  when no save or load is in progress. The game pauses at a supported update
  boundary.
  Sound Volume starts at 100%, Game Speed at 1.0×, and subtitles enabled with
  speech each launch. Games with optional subtitles show a **Subtitles** switch;
  changes apply to the running game for the current session. **Resume Game** returns focus to the game, and
  **Quit Game** returns to the game page or library. Choosing Exit or Quit Game
  immediately removes the toolbar and touch controls while navigation completes.
- **Save Game** and **Load Game** use the selected edition's native slots.
  **New Save** takes an unused manual slot. Overwriting asks for confirmation
  and keeps the existing caption. Games can deny saving or loading during
  cutscenes. Unsupported actions offer the native menu. Maintain verified
  shortcuts in [`game-menu.mjs`](../app/game-player/game-menu.mjs).
- On desktop, move the pointer to the top edge or outside the game canvas to
  reveal the toolbar. Keyboard focus or an open game menu keeps it visible.
  Press **Esc** to release cursor capture and reveal the toolbar.
- On recognized TVs, use the D-pad and **OK** to navigate. During play,
  **Back** focuses **Exit game**, Left/Right moves between toolbar buttons, and
  Down returns to the game. In mouse-driven games, tap **OK** to left-click or
  hold and release to right-click.

If the browser suspends audio, choose **Start audio**. Nonfatal engine messages
appear under **Compatibility warning**. Fatal errors stop startup.

### Mobile play

Browse in portrait; gameplay uses landscape. Leaving a game requests portrait
again. If the browser refuses rotation, the gallery shows a phone rotation icon
and a prompt to turn your device upright. If fullscreen is refused, use
the fullscreen button beside the game menu to try again. It is available outside
fullscreen on supported devices once the game has opened.
The game remains open when you rotate back. **Exit game** stays available.
While **Skip intro** is visible, the toolbar and touch gameplay controls stay
hidden. They return to their normal visibility when the action disappears.

- Tap the game to position the cursor. Double-tap or press **L** to left-click.
  Use **R** for right-click. Drag the cursor pad while holding either button
  to drag in the game. You can also hold and drag directly on the canvas.
- Touch pads share a circular disc and thumb cap. The pointer symbol marks
  cursor control: moving your finger moves the cursor; holding still does not.
  Lifting resets the cap without repositioning the game cursor. Arrows mark
  movement controls, which retain each game's directional behavior.
- In Grim Fandango and Escape from Monkey Island, the stick walks or turns. The lightning button opens
  Use/Talk, Examine, Pick up/Put away, and Inventory. When dialogue choices are
  available, the right-hand actions become a single checkmark to confirm the
  highlighted line (Enter). Move the stick up/down to change the selection.
  Exploration actions return automatically when choices close. In Hugo games,
  the stick walks in the direction you drag.
- In Hugo, Apple II Hi-Res Adventures, and Zork I–III, tap the keyboard icon
  and press Enter to submit a command. An empty field sends Enter by itself.
- In Zork I–III, supported phone browsers also show a microphone beside the
  keyboard. Hold it while speaking an English command; release to transcribe
  and submit it automatically, without opening the keyboard. This uses the
  browser's built-in speech recognition (Siri's speech engine in Safari),
  which may require a network connection and microphone permission. The mic
  stays hidden when recognition is unsupported, and hides if permission or
  the speech service is unavailable. Cancelling the touch, leaving the player,
  or opening the game menu discards the recording without sending a command.
  If the permission prompt leaves fullscreen, the player tries to restore it
  when recording starts or focus returns. Browsers that require another gesture
  retry on the next tap or key press in the player.
- In Castle Master, hold the movement stick up/down to walk or left/right to
  turn; release it to stop. The lightning button opens Use/Activate, Throw rock,
  Look up/down, Face forward, Walk, Run, Crawl, and Game information. Tap the
  game to aim; double-tap to dismiss a title screen. The bundled DOS demo
  automatically selects the prince and skips character selection on both Play
  and Skip intro.

### Continue and native saves

**Continue** loads the selected edition's latest eligible native save by
write time, including player autosaves. It checks the slot again at launch.
Intro checkpoints, incomplete writes, and reserved restart slots stay out of
Continue. **Start from beginning** keeps your saves. When an engine lacks
startup-load support, use its in-game menu.

The browser-local index supplies launch actions from checked save files.
Changed or unknown entries trigger a background native metadata query that
yields to a launch. Imported copies keep separate save paths, and older shared
saves remain available for backup. Existing settings take precedence over the
shell's original-menu defaults. The native output bridge marks saves pending
before opening them and refreshes the index after compression and close.

AgentSCUMM may request an isolated save scope outside the normal library and
backup directories. Its scoped Sky launch can copy one legacy manual slot
before startup, preserving the original and any existing scoped save.

Run the save and menu regressions after changing either bridge.

```sh
node --test test/browser-saves.test.mjs test/continue-saves.test.mjs \
  test/native-save-completion.test.mjs test/hero-launch-actions.test.mjs \
  test/save-backups.test.mjs test/game-menu.test.mjs test/game-route-frame.test.mjs \
  test/player-controls.test.mjs
```

### Backing up and transferring saved progress

Close every game tab, then open **Settings → Saved games → Export all saves**.
The ZIP includes active and preserved saves. Saves live in the current browser
profile and clearing site data removes them. Backup and restore require Web
Locks for site-wide coordination.

On the destination device, add the matching game edition and choose **Import
backup**. ScummWEB matches the destination by game identity and, for local
copies where available, game-file fingerprint. Unmatched sets stay preserved
until you add the matching edition and select **Review and activate**.

By default, a conflict keeps your current set active and preserves the imported
set. **Use imported saves** switches sets after preserving the current one.
Companion files and timestamps move together. Identical files are skipped.
Older shared files with unknown ownership are grouped under **Other shared
saves**.

Backups use `scummweb-save-backup` v1 with file checksums in `manifest.json`
and files under `saves/`. Imports accept ScummWEB backups up to 64 MiB compressed
and expanded, 4,096 files, and 1,000 sets. Restoring can temporarily need space
for both save trees. Quota failure preserves the active tree.

### Installing the web app

Use **Install app** when offered. In Safari use **Add to Home Screen** on
iPhone or iPad or **Add to Dock** on macOS Sonoma and later.
ScummWEB opens in its own window after installation. Fullscreen follows the
same controls and device-specific rules as play in a browser tab.

The homepage captures early browser installation offers before hydration. It
loads the invitation stylesheet only after an eligible offer; keep the native
installation prompt inside the click handler. `pnpm test` covers early offers,
stylesheet failures, installation gestures, and persisted dismissal.

### Library and game files

Capture file-picker and drop handles in the original user event before loading
import processing. Keep saved-source restoration and permission requests eager.
Library transactions abort on synchronous write or clone failures, retaining the
original error and preventing partial saves or removals. `pnpm test` covers these
boundaries, chunk-load failure recovery, and temporary-file fallback.

For a direct ZIP link, URL-encode a direct HTTPS archive URL in the fragment.

```text
/local/play#zip=https%3A%2F%2Fexample.com%2Fgame.zip
```

The host must allow cross-origin GET requests. Hosted ZIPs are limited to
128 MiB compressed and 256 MiB unpacked. For early game recognition, support
byte ranges and expose `Content-Range` through CORS. Otherwise the player can
inspect the archive after downloading it once. If the host blocks access,
download the ZIP yourself and import it locally.

The browser downloads directly with credentials omitted, redirects rejected,
and no referrer. Validation rejects unsafe paths, symlinks, duplicate entries,
encrypted archives, and size or entry-count violations. The fragment stays
client-side. [ZIP recognition](../app/archive-game-presentation.mjs) selects
presentation by file signatures. ScummVM detects the actual game at startup.

The browser can retain up to four verified catalog or hosted installations,
keyed by the full archive URL. Saves are stored separately. Use a versioned
URL when replacing a hosted archive so cached launches pick up the new files.

### Intro checkpoints

Bundled **Skip intro** uses a native startup option or a checkpoint captured
before the first player decision. Preserve language, character, or control
selection when the original game requires it. An edition without a checkpoint
can use its engine's live intro action, shown only while that engine reports
an opening segment that can be skipped. Full Throttle's demo uses this path
because saving is unavailable before its first decision. Imported games offer **Skip intro**
while their engine exposes a supported opening segment. The action advances
through the game's original transition and preserves its menus and choices.
Continue omits the action. Gobliiins’ bundled interactive DOS demo uses the native
intro action and retains its original character controls; saving through the
ScummWEB game menu is unavailable for this edition. Gobliins 2’s interactive DOS
demo starts at its original clickable title and uses British English (`gb`) for
exact engine detection; it also has no saving through the ScummWEB game menu.
Goblins Quest 3’s English interactive demo likewise starts from a clickable title
and enters its ship scene directly, with no intro checkpoint or menu saving.

Gabriel Knight’s Day One demo retains its original Intro/Play menu. Choose Play
to enter the bookshop; native saves and restore are supported.

Freddy Pharkas’s voiced CD demo retains its original Windows package; ScummVM
identifies the shared game data as its English DOS CD demo. Saving and loading
are supported in this edition. Its bundled intro checkpoint starts at the first
playable town scene after the original narration, before any player action.

Space Quest 6’s voiced interactive demo retains its original title, instructions
and opening scenes. This edition explicitly disables saving and restoring, so
it has no intro checkpoint or Continue.

Myst’s Windows CD demo retains its original preview menu and interactive library.
Native Skip intro advances past the publisher opening while preserving the
Sneak Preview, Scenes from Myst and Making of Myst choices. Saving and loading
are disabled for this demo, so it has no checkpoint or Continue.

Humongous games can load legacy DXA conversions when the requested DAT or SMK
movie is absent. Existing original movies take precedence; a converted movie
does not replace a corrupt original or other missing game resources.

Keep bundled checkpoints in [`launcher/skip-intro/`](../scummvm-shell/launcher/skip-intro/)
and their edition-specific settings in
[`launcher-game-overrides.json`](../launcher-game-overrides.json). Use
`checkpointOnly` when a seeded launch opens directly at gameplay. Checkpoints
are loaded from memory and excluded from player save lists. Remove older saved
copies only when their bytes match a shipped checkpoint.

After editing metadata, regenerate the catalog and rebuild the shell.

```sh
node scripts/create_launcher_metadata.mjs scummvm-shell/scummvm.ini scummvm-shell/games.json
pnpm run build:scummvm --shell-only
```

## Local development

### Game pages and search discovery

[`app/recognized-games.mjs`](../app/recognized-games.mjs) projects catalog
and import recognition into game landing pages, play routes, and the sitemap.
Keep existing URLs and separate demo identities. Import-only pages require
a matching ZIP before play. Legacy bucket URLs forward to the current player
while preserving source and save identity. Unidentified games use `/local/play`.

Landing pages are canonical. Play routes reuse their share metadata and use
`noindex`. Use optional `shortTitle` for long search titles without changing
display titles or slugs. The editorial budgets are 65 characters for titles
and 160 for descriptions. Supply developer and publisher structured-data
credits only when verified independently of the generic `studio` field.

Full Throttle imports support legacy `MONSTER.SOF` FLAC speech as well as the
original `MONSTER.SOU`. The runtime reconstructs one mono 11025/22050-Hz speech
line at a time for digital iMUSE, preserving mouth animation and save restoration.
Legacy lossy FT speech and recompressed DIG/COMI bundles remain unsupported.

### Development commands

Follow the [README quickstart](../README.md#run-locally) for a credential-free
server. Development needs no private service credentials. `pnpm secrets:check` verifies credential absence without
retrieving source values.

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Check JavaScript and JSX syntax. |
| `pnpm test` | Run the Node tests. |
| `pnpm build` | Stage assets and build the app. |
| `pnpm run start --port auto` | Serve the production build. |
| `pnpm run record:preview` | Stream distinct preview frames as MPEG-TS. |
| `pnpm run verify` | Boot detected games with the Chrome/Chromium harness. |

The app stages the tracked `scummvm-shell/` into `public/`. Edit
`web-shell/` for browser-runtime changes. Keep the core and engine plugins
from the same build. Set the same project-relative `SCUMMWEB_DIST_DIR` for
build and start when an audit must coexist with another server.

`SCUMMVM_GAMES_ORIGIN` selects the game bucket and `NEXT_PUBLIC_SITE_URL`
sets canonical URLs. Game data downloads directly from the bucket. Local
verification can use `/games-proxy/*`. The Broken Sword Macintosh demo keeps
its complete upstream archive and has a 200 MiB download allowance with a
ten-minute timeout. Downloads up to 256 MiB use memory backing to avoid browser
temporary-file reservation failures; larger catalog ZIPs retain Blob backing.

Local builds skip Sentry source-map uploads. For startup reports, filter Sentry
by `component:scummvm-player` and narrow by `startup_stage`, `game_source`,
or `game_slug`. Imported-game reports omit private source details. The
[production workflow](production-delivery.md) handles deployment credentials.

For mobile changes, check the launcher, settings, gallery, and player at
320px and 390px portrait widths, short landscape, and tablet widths. Test
rotation, fullscreen refusal, audio, and touch input on physical Android and
iOS devices before claiming device coverage.

### Sentry issue reads

`pnpm sentry:issues -- --days 14 --limit 10` uses the process's explicitly configured
Sentry credentials, organization and project. It never opens dotenv files. Failed authentication stops the read.

## Maintaining game compatibility

[`data/game-compatibility.json`](../data/game-compatibility.json) is the
source for [game testing](game-testing.md) and the searchable compatibility
page. Each checked edition records its native `gameId`, `edition`,
`status`, and `observation`.

- `startup-verified` means the game reached a screen, menu, original prompt,
  or first scene. State how far testing went.
- `startup-warning` and `startup-failed` cover engine or browser-runtime
  problems. Set `issueScope` to `scummvm` or `scummweb`, including in
  historical checks. Keep copy-specific missing, corrupt, or mismatched file
  diagnostics in private QA. Omit editions where invalid files prevented a
  startup check.
- `not-tested` records a game without a checked edition. Its upstream rating
  comes from the pinned `upstreamReference`.

When retesting, preserve earlier observations in `history`, update the current
result, and set `recordedOn`. Regenerate the summary after changing the data.

```sh
node scripts/generate-compatibility-docs.mjs
node scripts/generate-compatibility-docs.mjs --check
```

## Evaluator telemetry

The host sets `__scummwebEvaluationEnabled` before launch to opt in.
`__scummwebEvaluationGame` exposes native game identity. Queen and SCUMM
publish room and variable data through bounded queues. Drain
`__scummwebEvaluationEvents` and `__scummwebEvaluationGameVariableEvents`
in place and handle each queue's overflow flag. Both hold at most 256 records.
Variable streams begin with a baseline. Loads reset that baseline, and SCUMM
also resets it on restart. Changes between engine ticks can be missed.
Keep raw evaluator data out of ordinary player observations.

### Querying game state

Append `?telemetry=1` to the play URL. In the game frame or its same-origin
parent, `window.scummwebTelemetry.read()` returns a detached
`{ identity, snapshot }` with each field initially `null`. The opt-in snapshot
stays in the frame. It uses `schema_version: 1`, `room_id`, optional
`room_name` and `room_ready`, monotonic `sample_time_ms`, and `banks`.
Banks contain up to 4,096 indexed or named values. Engines sample at update
boundaries, typically every 250 ms and on room changes.

[Patch 19](../patches/scummvm/19-query-engine-game-state.patch) defines the query
interface, and [patch 20](../patches/scummvm/20-extend-native-game-telemetry.patch)
adds engine providers. Use `ScummWebTelemetry::Sample` at a native
update boundary when adding a provider. Verify an initial sample and a change
in an actual game. For edition identity and story rules, see the
[map guide](game-progress.md).

## Rebuilding and upgrading ScummVM

Use `pnpm run build:scummvm --shell-only` for browser templates. It regenerates
the staged shell using the existing compiled runtime. Changes to native patches
or generated `scummvm.js` require the full build and a matching
[corresponding-source archive](../scummvm-shell/doc/scummvm-source.html).

Keep generated adapters in the staging path. Native unload signals must wait
for runtime initialization, including native constructors. Optional Web Speech
support may leave no voices; it must not abort startup or cleanup. Startup
resource reports identify only scripts created by the player, while runtime
exceptions and failures of those dependencies remain visible.

The startup watchdog reports slow launches while retaining the runtime frame
and prepared game files. A late, validated ready signal clears only that timeout and cancels its
watchdog; other startup failures remain visible. Exiting still releases the
selected game and cancels the launch.

Follow [the upgrade skill](../.codex/skills/scummweb_upgrade-scummvm/SKILL.md)
to change the engine or SDK pin. It owns the ordered patch procedure,
[patch ledger](../.codex/skills/scummweb_upgrade-scummvm/references/patches.json),
and [upgrade memory](../.codex/skills/scummweb_upgrade-scummvm/references/upgrade-memory.md).
For a native rebuild with the existing catalog, run from the repository root.

```sh
python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py --offline
SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm
pnpm test
```

The build verifies the pinned checkout and plugin coverage, then syncs
`dist/` to `scummvm-shell/`. Keep `runtime-assets.json` and
`runtime-version.json` with the staged bundle. Test a bundled game and a local
ZIP for startup, audio, input, save and resume. Confirm a catalog launch loads
only its selected engine plugin.

For launch diagnostics, use `?startupTrace=1` and inspect the
`[scummweb:startup]` console record. Compare cold, prepared-cache, and
legacy-cache runs. When comparing User Timing marks manually across frames,
add each frame's `performance.timeOrigin`.

### Classic freeware additions

Follow the [freeware release skill](../.codex/skills/scummweb_freeware-release/SKILL.md)
for redistribution checks, engine registration, fingerprints, publishing,
and verification. [`data/classic-freeware.json`](../data/classic-freeware.json)
pins the approved packages, upstream URLs, and SHA-256 values. Put exact
archives and required source files in `downloads/`. The additive build
preserves existing targets and writes packages to `dist/games/<gameId>.zip`.
For a catalog rebuild with The Secret of Monkey Island (Demo), use the
[English DOS EGA demo ZIP](https://downloads.scummvm.org/frs/demos/scumm/monkey1-dos-ega-demo-en.zip).
The God of Thunder engine is available for personal imports. The official
`gotfree.zip` remains excluded because its included license prohibits
redistribution.

Nippon Safes uses the official ScummVM freeware game data. In the browser,
its opening choice keeps the L/R mouse controls available: left click watches
the intro and right click starts the game. It does not offer a separate
**Skip intro** action.
The original **Saved Game** choice opens ScummWEB's **Load Game** drawer.
Closing it returns to the New Game/Saved Game choice; choosing a save restores
the saved story directly.
Its original manual-code screen is replaced with an interactive version of the
game's own portrait screen. Click Donna, Dough or Dino to start that character's
original reveal and story, including after completing a part. Hovering highlights
the portrait and displays its original name graphic. Keyboard users can select
with Tab or 1–3 (left to right), then confirm with Enter or Space. Escape and
clicks outside the portraits do not start a story. Language selection,
introductions and saved progress keep their original behavior. This applies to
Amiga and DOS imports; desktop ScummVM retains its own character-selection screen.

Build the Zork I–III packages with [ZILF 1.9](https://github.com/taradinoc/zilf/releases/tag/1.9)
and `python3 scripts/build_zork_packages.py /path/to/zilf/bin`. The packages
include the compiled stories and their license and source information.

To preview staged packages, run
`python3 -m http.server 0 --bind 127.0.0.1 --directory dist/games`.
Point `SCUMMVM_GAMES_ORIGIN` at that server and start
`pnpm run dev --port auto`. Publish and verify each ZIP before deploying
its catalog entry. See [game-library publishing](production-delivery.md#game-library-publishing).

## Game launch analytics

The catalog funnel emits each event at most once per play page visit. It
excludes local imports, direct ZIP links, and saved external launches.

| Event | When it fires |
| --- | --- |
| `game_launch_attempt` | The player starts preparing a catalog game. |
| `game_launch` | ScummVM renders the first frame. `load_time_ms` measures time since the attempt. |
| `game_launch_failed` | Startup fails or times out. `failure_reason` is `startup_error` or `first_frame_timeout`. |
| `game_play_30s` | The ready player accumulates 30 visible seconds with controls available. |
| `game_play_60s` | The ready player accumulates 60 visible seconds with controls available. |
| `game_play_milestone` | The ready player accumulates five visible minutes with controls available. `play_time_seconds` is 300. |

Events share `game_slug`, `entry_point` (`hero`, `library`, `game_detail`,
or `direct`), `launch_mode` (`fresh` or `continue`), and a random `launch_id`.
The ID identifies one catalog play-page visit, stays stable through failure
recovery and intro skips, and changes for another visit. It contains no user or
save identity. A visit can recover after a failure, so failure and success counts
are not mutually exclusive. Milestones use cumulative visible, ready time, pause
while hidden or controls are unavailable, and fire once per threshold. They do
not establish active input or puzzle progress. The existing five-minute event
retains its meaning; shorter milestones have distinct names.

Page locations sent to GA4 omit URL fragments; Vercel Analytics redacts direct
ZIP fragments. Do not include ZIP URLs, file names, saves, or input contents in
analytics fields.

### GA4 custom definitions

Sending a parameter alone does not make it available in standard reports.
In the production property's **Admin → Data display → Custom definitions**,
maintain these event-scoped definitions:

| Parameter | Definition | Reporting API name |
| --- | --- | --- |
| `game_slug` | Dimension: Game slug | `customEvent:game_slug` |
| `entry_point` | Dimension: Entry point | `customEvent:entry_point` |
| `launch_mode` | Dimension: Launch mode | `customEvent:launch_mode` |
| `failure_reason` | Dimension: Failure reason | `customEvent:failure_reason` |
| `play_time_seconds` | Dimension: Play milestone seconds | `customEvent:play_time_seconds` |
| `traffic_type` | Dimension: Traffic type | `customEvent:traffic_type` |
| `automation_reason` | Dimension: Automation reason | `customEvent:automation_reason` |
| `load_time_ms` | Metric: Load time, unit Milliseconds | `customEvent:load_time_ms` |

Use `averageCustomEvent:load_time_ms` for average startup latency; the unprefixed
custom metric sums durations. `play_time_seconds` is a milestone category, not a
measure to sum into total play time. Allow 24–48 hours for new custom definitions
to become reportable; do not assume historical values are backfilled. See
[Google's custom-definition guidance](https://support.google.com/analytics/answer/14240153).

Keep `launch_id` as a raw event parameter for DebugView or an already configured
event export. Do not register a unique-per-launch ID as a reporting dimension:
it can cause high-cardinality aggregation. Exact launch matching requires raw
events; aggregate Data API counts alone are not a matched funnel. These changes
do not configure an export or provision another service.

Validate these names through the property’s reporting API after registration.

### Artwork signing relay

The signing relay limits requests to the approved immutable artwork plan.
Access verification performs HEAD for one pinned existing object and reads no
object body. Publishing requires separate approval of the exact plan. Before
listening, the relay checks the active mapping hash, canonical nonlinked workspace,
content-addressed keys, MIME types, checksums and limits of 512 objects and 2 MiB
per object. The single-object route selects one exact logical entry and requires
its planned local bytes; its signer cannot access sibling entries.

Creates use `If-None-Match: *`; existing objects are verified without overwrites.
The publisher verifies bytes and immutable cache metadata after delivery. These
routes include no games, pruning, bucket administration or automatic activation.
Keep the signing policy private and credential rotation separate from publishing.
Failed authentication stops the operation.

Run synthetic signer and plan checks without provider access:

```sh
pnpm test:artwork-relay
```

### Generated heroes and card box art

Use the [game-assets skill](../.codex/skills/scummweb_game-assets/SKILL.md) and
its [generation reference](../.codex/skills/scummweb_game-assets/references/generation.md).
[`data/generated-artwork.json`](../data/generated-artwork.json) records
reference credits, dates, prompts, hashes, dimensions, and any approved
illustrated compositions. The game mappings retain source credits and
`heroImageMobilePosition` can adjust the narrow-screen crop.

Generate heroes from original promotional references. Faithfully restore
original box fronts for card covers. Keep gameplay screenshots as original
captures, with delivery resizing or lossless encoding only.

### Delivery encoding and sizing

Use full-resolution lossless WebP for PNG captures and lossless WebP for
smaller screenshot variants. Posters and heroes use WebP quality 80, effort 6.
Preserve aspect ratios and source objects. Avoid upscaling.

The explicit optimizer tests 4:4:4 AVIF at quality 70 or 60, effort 6. A
candidate must save at least 10% against WebP and reach 35 dB decoded RGB PSNR.
Inspect text, fine detail, gradients, and pixel art before publishing. Offer
AVIF only when it covers every WebP width. Match preload sizes and sources to
the visible hero so the browser can reuse its request.

## Branding

The [branding provenance](../image-assets/provenance.json) and
[export manifest](../public/brand/manifest.json) identify logo, social, and
icon sources. After replacing an icon source, update provenance and run
`node scripts/generate-favicon-assets.mjs` to refresh exports, manifests, and
content versions. The generated favicon SVG is an export.

When updating the homepage social JPEG, set the URL version in
[`lib/seo.mjs`](../lib/seo.mjs) to `v=sw-` plus the first 16 characters of
its SHA-256.

### Social preview assets

Run `pnpm generate:social-cards` after changing catalog copy or artwork.
Track [`data/social-cards.json`](../data/social-cards.json), which records the
inputs and checksums. The generated 1200×630 JPEGs are ignored build outputs.
The build regenerates missing, changed, or corrupt cards from verified local,
cached, or public artwork. Game metadata uses content-versioned static URLs.
Legacy game image routes rewrite to the same JPEG.

## Catalog fixtures and artwork

The baseline game is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`.
`/scummvm.html#sky` forwards to its current play page.

Maintain game metadata, logical artwork paths, and per-image credits in
[`app/game-presentation.js`](../app/game-presentation.js) and
[`app/retro-game-artwork.json`](../app/retro-game-artwork.json).
Give each recognized game a summary, studio, genre, and metadata sources.
Keep summaries, including mobile summaries, focused on the story and gameplay.
Put platform, language, voice support, media, and edition details in metadata
instead of descriptions; keep the `(Demo)` title suffix for demos.
Keep its specific `genre` description and set an explicit `category` from
`libraryCategories` in `app/home-shell/library-query.mjs` for library filtering
and sorting. Preserve the category when sharing metadata with demos and imports.
Use Sports for the Backyard sports games, Cards & board games for card and
board collections, Family & education for children's activities and adventures,
and Animation for the non-interactive Christmas cards. Genre inference remains
a fallback for older imports without a category.
Give every bundled target play-style and theme launch tags in
`app/game-player/launch-tags.mjs`; year and platform come from edition metadata.
Record unresolved credits in `metadataNote`. Keep remakes and demos distinct,
and share art across editions when it accurately represents the game.
Prefer three distinct gameplay captures showing locations, puzzles, or actions.
Preserve exact edition and source credits where available.

Earlier artwork sources whose exact credits are only recorded here include
Muttill's signed 1994 Flight of the Amazon Queen promotional art and the
following originals.

| Game | Box art | Gameplay |
| --- | --- | --- |
| The Secret of Monkey Island (Demo) | [Steve Purcell's DOS cover](https://gamesdb.launchbox-app.com/games/images/139-the-secret-of-monkey-island) | [DOS EGA demo](https://www.dosgamesarchive.com/download/the-secret-of-monkey-island) |
| Sfinx | [Box scan](https://gamesdb.launchbox-app.com/games/images/86024-sfinx) | [English DOS, images 2–4](https://www.scummvm.org/screenshots/lkavalon/) |
| Fate of Atlantis | [DOS box scan](https://gamesdb.launchbox-app.com/games/images/5386-indiana-jones-and-the-fate-of-atlantis) | [ScummVM gallery](https://www.scummvm.org/screenshots/lucasarts/indy/) |
| Last Crusade | [Amiga box scan](https://gamesdb.launchbox-app.com/games/images/18310-indiana-jones-and-the-last-crusade-the-graphic-adventure) | [ScummVM gallery](https://www.scummvm.org/screenshots/lucasarts/indy/) |
| Day of the Tentacle | [DOS cover](https://gamesdb.launchbox-app.com/games/images/3575-maniac-mansion-day-of-the-tentacle) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/tentacle/tentacle_dos_en_1_2_full.png) |
| Loom | [Original cover](https://gamesdb.launchbox-app.com/games/images/5391-loom) | [English DOS VGA](https://www.scummvm.org/data/screenshots/scumm/loom/loom_dos_en_2_2_full.png) |
| Maniac Mansion | [Amiga cover](https://gamesdb.launchbox-app.com/games/images/41172-maniac-mansion) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/maniac/) |
| Monkey Island 2 | [Original cover](https://gamesdb.launchbox-app.com/games/images/723-monkey-island-2-lechucks-revenge) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/monkey2/monkey2_dos_en_1_1_full.png) |
| Sam & Max Hit the Road | [DOS cover](https://gamesdb.launchbox-app.com/games/images/58-sam-max-hit-the-road) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/samnmax/samnmax_dos_en_1_3_full.png) |
| Zak McKracken and the Alien Mindbenders | [Amiga cover](https://openretro.org/amiga/zak-mckracken-and-the-alien-mindbenders) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/scumm:zak/) |

[Planète Aventure](https://www.planete-aventure.net/jeux.php?cat=screenshots&num_jeu=1822)
also supplied a supplemental capture.

## Package a local ScummVM collection

```sh
python3 scripts/package_retro_games.py --source /path/to/game-folders --output /path/to/game-archives
```

Run first to inventory the collection and check the output volume. Append
`--write` to package and verify the ZIPs. Matching outputs are reused,
conflicts are preserved, and source folders stay intact. Import the output
ZIPs through **Add a game**.

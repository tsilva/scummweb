# Maintaining ScummWEB

## Playing and importing games

Select a library or Recently Played card to navigate to the game’s slug route
and jump instantly to its hero, screenshots, metadata, game notices, and launch
options. Recognized platform, language, and edition variants share a card;
use the version selector below **Play** and **Browse Games** in the hero to select
a copy. The buttons share the first row, and the selector spans both columns on
desktop and mobile. Games
with one version show an edition badge beside their metadata instead of a selector.
The badge is hidden when multiple versions are available. Both positions reserve
their layout space so restoring versions does not move nearby controls or resize
the hero. ScummWEB remembers your selection and keeps demos separate from full games. Each imported version has
separate browser saves. Supported engines offer **Continue** and **Start from
beginning**; others load progress through their in-game menu. Older shared saves
remain stored in the browser.

Games default to their original save/load screens where the engine supports
them. The shell fills missing `originalsaveload`, `original_gui` (SCUMM), and
`original_menus` (MADS) application settings before engine startup, for bundled
games and personal imports alike. Existing application and per-game choices
take precedence. This also updates older browser configurations without
replacing game entries, save paths or other settings. Games without an original
screen option retain their engine's usual interface. Save queries do not change
these settings.

The player's **Open game menu** button appears only for explicitly supported
native menu shortcuts. It never sends Ctrl+F5 or falls back to ScummVM's global
menu. Current mappings cover the full versions of Beneath a Steel Sky (F5),
Flight of the Amazon Queen (F1, journal), and Broken Sword: The Shadow of the
Templars (F5). Demos, interview editions and unrecognized games omit the button;
their existing in-game controls remain available. Games can restrict menu access
during intros, cutscenes or scripted sequences.

Maintain the allowlist in `app/game-player/game-menu.mjs`, shared with the launch
verification harness. Match engine and game identity, check edition restrictions,
and trace the shortcut to the native interface in the pinned engine source before
adding support. Do not add shortcuts that can open ScummVM's menu depending on
saved settings or platform; SCUMM's F5 is one such shortcut. Run
`node --test test/game-menu.test.mjs test/game-route-frame.test.mjs` after changes.

Imports matching an included game's data use the bundled copy and do not add a
second version. The default for other editions also prefers the included copy;
an explicit choice of a distinct edition is remembered. Existing duplicate source
records and their isolated saves are retained for backup and transfer in Settings.
Old imports are compared using their saved fingerprint or, when read permission
already exists, by inspecting their ZIP directory. Older unverified imports of an
included title default to its bundled copy. Reimport the ZIP to verify a distinct
release and make it selectable again.

`data/bundled-game-files.json` records the published catalog ZIP directories and
their fingerprints. Regenerate it with `node scripts/generate-bundled-game-files.mjs`
after publishing changed game payloads. This command uses bounded public range
reads and requires no storage credentials. Comparisons use normalized data paths,
uncompressed lengths and CRC-32 values, ignoring manuals, licenses, DOS launchers
and configuration files. They do not rely on titles, ZIP filenames or compression.
Changed or additional game data remains a separate edition; these signatures
identify copies and are not an authenticity check for untrusted archives.

Continue uses the selected engine's native save listing and startup-load
capabilities. It appears only for an existing, nonempty player save, and selects
the latest file write time, including player autosaves. Continue checks again
at startup so a removed or replaced save cannot select a stale slot. Bundled
intro checkpoints, empty autosave placeholders, and Kyrandia restart checkpoints
and Groovie reserved slots do not count as player saves. **Start from beginning**
keeps existing saves.

AGOS, Composer, Parallaction, Sword25, Gob, MADE and Plumbers retain **Play**.
PreAGI titles also retain Play; Mohawk supports this flow for Myst and Riven,
excluding Myst demos and Making of Myst. Other demos or activities without
player saves naturally retain Play. Continue resumes saved progress, not an
unsaved session or a browser-wide memory snapshot.

The runtime records actual detected engine/target identities and native save
slots in a browser-local index. Launch actions read this index immediately:
valid cached progress offers Continue, otherwise Play stays available. Server
HTML uses Play; hydration reads browser metadata without a pending action.
Imported versions use their existing isolated save directory even when their
ZIP name is unrecognized. Individual indexed files are checked for existence,
size and modification time, so deleting the newest save can expose an older
valid one. Changed or previously unindexed games use a serialized background
native query. A launch cancels pending queries. An unrecognized import gains its
detected identity on launch. Queries use temporary configuration, never rewrite
player targets, and never start a game. Imported file access remains required;
checks on unrelated sources do not block the hero's selected launch action.

The native output owner records pending filenames before opening a save and
refreshes metadata after compression and filesystem close complete. This covers
original save menus, autosaves and engines that omit explicit finalization.
Failed or interrupted writes remain excluded, including after reload; a
successful overwrite or restored save set can replace them. Metadata-write
failures retry during play. Intro checkpoints are compared by their bytes after
changes. No final save scan depends on tab-close handlers. Browser storage can
still be cleared or evicted, and metadata does not make save-file writes atomic.

Run `node --test test/browser-saves.test.mjs test/continue-saves.test.mjs test/native-save-completion.test.mjs test/hero-launch-actions.test.mjs test/save-backups.test.mjs` for
latest-save ordering, checkpoint exclusion, missing files, native query scope,
version isolation, output completion/failure and engine exceptions. Patch 13 owns
native listing; patch 15 owns save completion. Rebuild the compiled runtime when
changing either. The native owner test uses a local C++ compiler when available.

### Player controls

Desktop top controls appear for three seconds once the boot presentation
finishes. Moving into the top 80 CSS pixels or outside the game canvas reveals
them. They stay visible while the pointer is outside the canvas, including its
letterbox margins or outside the browser viewport. Returning to gameplay below
the top reveal area starts a one-second delay followed by a short fade. Continued
movement within gameplay does not restart the delay. Hidden buttons do not intercept
pointer input and remain available through keyboard navigation. Focus within
the controls prevents idle hiding. Cursor capture clears toolbar focus so the
buttons can hide. Reduced-motion preferences disable the fade.

The visibility observer listens in the host and same-origin game documents,
reattaches after frame navigation, and releases listeners and timers on cleanup.
Pointer lock hides the controls, including when already active at observer
startup or frame navigation; releasing it or pressing **Esc** reveals them for
three seconds. Opening the game menu pins them until **Esc** or
cursor capture. Touch/mobile controls and bottom actions do not auto-hide.

### Mobile play

The player uses the visible viewport height and respects display safe areas.
Mobile canvases fit that height while preserving the game’s aspect ratio; narrower
viewports can crop the sides. Desktop canvases continue to fit within both dimensions.
The toolbar has no aspect-ratio toggle. The parent reapplies the viewport’s sizing
mode after frame navigation and when the mobile viewport classification changes.
**Play**, **Continue** and **Start from beginning** show the game's loading screen
from the launch gesture, before route loading or ZIP preparation. The launcher
uses the same boot presentation as the player and keeps it visible until the
player mounts. Failed ZIP preparation dismisses it so recovery actions remain
available; file-access and locate prompts do not show the loading screen.

These actions request fullscreen directly
from the launch gesture, then request landscape. Mobile catalog launches use
client navigation with the persistent document root in fullscreen. The fullscreen
toolbar button is available only in desktop mode. The player
shows no fullscreen or rotation modal; unsupported or refused requests leave
play and touch controls available in the current orientation. Exit requests
portrait while fullscreen is still active, then exits fullscreen and releases
the orientation lock. Browsers may reject locking or restore their own rotation
policy after fullscreen; physical rotation cannot be guaranteed on those devices.
File-access and locate actions keep their normal prompts without entering fullscreen.
Orientation follows the viewport rather than the physical screen, so split-screen
windows and tablets use the available space. Dragging moves the cursor; the
enlarged **Adjust** cursor pad offers smaller movements, the broad mouse-shaped
**L**/**R** buttons send clicks, and double-tapping
the game sends a left click. Loading screens scroll on short landscape viewports.

Check the launcher, game landing hero, screenshot viewer, compatibility search, settings and player at
320px and 390px portrait widths, a short landscape viewport and tablet widths.
Verify rotation, exit, menu, left/right clicks, cursor dragging, Start audio and
fullscreen refusal on physical Android and iOS devices before claiming device
coverage; desktop viewport checks do not emulate mobile browser APIs or touch.

### Backing up and transferring saved progress

Open the **Settings** gear icon to the right of GitHub in the header, then **Saved games**.
The drawer slides from the right, uses compact typography and prevents text selection.
It opens and closes immediately when reduced motion is enabled.
**Export all saves**
downloads a ScummWEB ZIP containing active progress and preserved save sets.
On another device, add the matching game edition and choose **Import backup**.
Review each destination before confirming. Local imports are matched by their
game-file fingerprint when possible; unmatched sets can be kept unassigned and
connected later through **Save sets → Review and activate**.

Different games are added without deleting existing progress. Identical files
are skipped. For conflicting progress in one game, the default keeps the current
set active and preserves the imported set. Choosing **Use imported saves**
preserves the current set before switching. Whole sets, including companion
files and timestamps, stay together; individual save slots are not combined.
Older shared saves with an unknown filename convention are backed up together
as **Other shared saves** to avoid splitting dependent files.

Close games in every tab before exporting, importing or switching sets. The
runtime holds an exclusive Web Lock while it uses the save filesystem; a second
game or backup operation must wait until it closes. Library tabs remain usable.
Browsers without Web Locks can play without cross-tab coordination, but cannot use
the backup actions. Current saves remain in BrowserFS localStorage; preserved
sets use IndexedDB. Both remain local to this site and browser profile until
exported, and clearing site data removes them. There is no automatic cloud sync.

Backups use format `scummweb-save-backup`, version `1`: `manifest.json` identifies
game destinations and lists logical filenames, timestamps, ZIP entry names and
SHA-256 checksums. Save bytes are stored separately under `saves/`. Imports are
limited to 64 MiB expanded and compressed, 4,096 save files and 1,000 sets, and
reject unsafe paths, unsupported versions, unexpected entries and failed
checksums. Export reserves space for the manifest within that limit. Restores
stage new BrowserFS nodes before atomically replacing the root inode; quota
failure preserves the active tree. Restoring can need temporary storage space
for both trees. This format does not accept arbitrary desktop ScummVM ZIPs.

Run `node --test test/save-backups.test.mjs` to check backup round-trips,
cross-device game matching, conflicts, legacy isolation, quota failures and
archive validation.

### Library and game files
The launch overlay uses status text without a progress bar.
During ZIP downloads, the launch status shows `Loading game (12.4 / 85.2 MB)…`
when the host provides a valid `Content-Length`; otherwise it shows the downloaded
megabytes, such as `Loading game (12.4 MB)…`. Sizes use decimal megabytes
(1 MB = 1,000,000 bytes), rounded to one decimal place.
After successful verification, catalog and remote games are saved as one atomic
record containing a file manifest and verified bytes. Repeat launches of the exact same
URL (including its query parameters) mount Blob slices without downloading,
unpacking, or checksumming every file again. Existing cached ZIPs migrate after
one local extraction. Up to four games are retained; adding a fifth removes the
oldest installation and its manifest. Saves are separate from this limit.
Persistence runs after verification without blocking startup; immediate restarts
can reuse its in-memory snapshot while the write finishes. Storage failures fall
back to caching the original ZIP when possible. Older open tabs retain a compatible
ZIP cache; successful migration removes the duplicate ZIP.
The cache is best effort: browsers may evict it, private sessions clear it when
they end, and blocked or full storage leaves ordinary downloads working.
To fetch a replacement ZIP published at the same URL, clear this site's cached
data or use a new URL, such as a version query parameter.
If a game ZIP fails to download or open, the failure screen keeps **Exit game**
available so you can return to the library, including games with intro skipping.

Archive preparation and ScummVM startup run concurrently. BrowserFS and the
selected catalog engine module load alongside the main runtime. The boot overlay
accepts a native game presentation, including a dark intro frame. The native
OpenGL signal excludes ScummVM's splash and GUI overlays; canvas draw observers
and the pixel detector remain fallbacks for other renderers. Intro skipping
remains an explicit action.
The native GUI's startup themes and translation prefix also prefetch in parallel;
later reads reuse their binary buffers. Range responses must match the requested
prefix and indexed file size, and failed hints retain the ordinary read path.
Prepared games prewarm small files asynchronously, preferring shallow paths,
within the same 8 MiB memory cache. Larger files remain backed by Blob slices.

The **Recently Played** strip shows only games you have launched, newest first,
including imported ZIPs. Different editions of a title share one card, and
selecting it opens the same version chooser as the library. Removed imports
disappear from the strip. The strip stays hidden until there is play history.

The sliders icon beside **Game Library** opens sorting by name, release year,
genre, or studio and genre filtering for both public and imported games. Select
**All genres** to remove the filter or **Name: A–Z** to restore alphabetical order.
Name order keeps numbered series in installment order, treating Roman and Arabic
numerals alike. Sort-only aliases in `lib/game-title-sort.mjs` place unnumbered
first games and irregularly named sequels with their series. These aliases also
apply to imported games and name tie-breaks, preserving displayed titles and URLs.
The **Compatibility** navigation link opens the compatibility page, with search
and filters for checked editions, warnings, failures, and untested games. See
[game testing](game-testing.md) for the same results and their limitations.

Select the **Add a game** card in the library to choose ZIPs, or drop one or
more ZIP files containing ScummVM games onto the homepage or a game's page.
The add card is first in the grid and remains available when filtering or sorting
the library. Mobile headers hide the Library, Compatibility, and ScummVM links
and align the brand and action buttons in one row, respecting the top safe area.
Keep the header tagline at a contrast ratio of at least 4.5:1 against the
navigation background, including on the compatibility page.
Mobile library-to-footer spacing uses reduced bottom and top padding.
Mobile layouts and devices with a coarse primary pointer show tap-to-choose
instructions; desktop layouts retain the drag-and-drop hint.
Put one game in each ZIP. Folders, loose game files, and other
archive formats are not supported.
The import dialog shows progress, added games, and errors; its final summary
also counts skipped games. Reimported games count as skipped with refreshed
file access. Scroll to review large batches, then select **Confirm** to close
the dialog and go to the new games.

Saved local sources are checked when the library opens and when you return to
the tab. Missing ZIP files show **Locate files** on their posters. When read
permission is needed, the affected version offers **Allow file access** with an
explanation before the browser prompt. Approving access changes the button to
**Play** or **Continue**; it does not launch the game automatically. Declining
keeps the permission action available to retry. Select **Locate ZIP** for missing
files. Dropping the same ZIPs again also refreshes access without adding duplicates.

Existing folder entries require a replacement ZIP through **Locate ZIP**;
reconnecting preserves their source ID and browser saves.

Local ZIP imports support up to 4 GiB, including their unpacked contents.
For large games, use ZIPs with compression disabled; see
[packaging a local collection](#package-a-local-scummvm-collection).
Extracted CD audio accepts physical track names such as `Track  2.flac` as well
as ScummVM's conventional `track1.flac` naming.

To play a ZIP from a link, open
`/local/play#zip=https%3A%2F%2Fexample.com%2Fgame.zip` on your ScummWEB site.
URL-encode the direct HTTPS ZIP address. The browser downloads it directly
from its host, which must allow cross-origin GET requests from your ScummWEB
site. Hosted ZIPs are limited to 128 MiB compressed and 256 MiB unpacked.
Before launching, ScummWEB inspects the ZIP's file list to identify recognized
games and show their title, metadata, and hero artwork. Archive names are not
used for this identification. Hosts supporting byte ranges and exposing
`Content-Range` through CORS allow identification before the full download.
Otherwise, identification happens after one full download, reused for launch.
Inspection is limited to 2 MiB and six seconds. A host that ignores ranges,
does not expose the required headers, rejects range requests, or has a directory
too large for the inspection budget falls back to one full download. Browsers
cannot distinguish a range-specific CORS failure from an unreachable host, so
an initial network/CORS error also allows one ordinary download attempt.
HTTP errors such as 403 or 404, HTML/JSON responses, oversized archives, invalid
ZIPs, unsafe entries, and inspection timeouts stop immediately without a full
download retry. Download-time errors use the same response checks.
Unknown or ambiguous contents retain the generic loading screen; ScummVM still
detects the game when it starts. This artwork lookup does not establish game
compatibility or infer language, platform, or edition.

The recognition rules in `app/archive-game-presentation.mjs` currently cover
Beneath a Steel Sky, Day of the Tentacle, Fate of Atlantis, Monkey Island 2,
and Sam & Max through distinctive data-file groups. Shared filenames use
size and CRC-32 signatures for Drascula, Lure of the Temptress, Flight of the
Amazon Queen, Nippon Safes, the English DOS EGA Monkey Island demo, and
the recognized Amiga Last Crusade data. New rules must reuse existing artwork,
avoid generic filenames without signatures, and leave multiple-game archives
unmatched. These ZIP directory signatures identify presentation only; normal
archive validation and ScummVM detection still apply.

If the host blocks access, download the ZIP and drop it onto the site instead.

Direct-link inspection, extraction, and game detection run in the user's browser.
The ZIP address stays in the URL fragment and game data downloads directly from
its host, without app-server processing. Requests omit credentials, reject
redirects, and send no referrer. Extracted files are data in ScummVM's browser
filesystem: ScummWEB does not render archived HTML, load archived JavaScript,
or launch archived programs on the operating system. Validation rejects unsafe
paths, symbolic links, duplicate paths, password-protected entries, and size
or entry-count violations. These safeguards are not antivirus scanning or a
guarantee against browser, ZIP-library, or emulator vulnerabilities.

## Local development

### Game pages and search discovery

Game landing pages and `/sitemap.xml` include the bundled catalog, every title
in `app/retro-game-artwork.json`, and the separate Sfinx recognizer. The shared
`app/recognized-games.mjs` projection deduplicates game families, keeps demos
separate, and preserves bundled game URLs. Original title parentheses remain
part of recognized titles and their slugs.

Import-only pages use existing artwork, game-specific metadata, structured data,
and generated social cards. They explain that copyright restrictions prevent
ScummWEB from providing game files and show **Game not included** until a matching
imported version is present in the browser library. Matching copies open the
existing version and file-access flow.
Every recognized game has a `/<game-slug>/play` route, whether its files are
bundled, imported from a local ZIP, or supplied through a hosted ZIP. The player
restores the browser library's selected available version and its save namespace.
When an import-only game's files are unavailable, the same route shows the game
and library controls to import a copy, reconnect its ZIP, or allow file access.
Game files remain on their original device or host. Adding recognition metadata
automatically adds its landing page, play route and sitemap entry on the next build.

`/local/play` remains an entry point for unidentified archives and direct ZIP
links. Once a recognized game is identified, it opens its game-specific play
route. Direct ZIP addresses remain in the URL fragment, including after this
navigation, so reopening the URL works without sending the ZIP address to the
app server. Old `/bucket/<target>/play` links also forward to the game's play
route while preserving their source and legacy saves.

Search and sharing titles identify import requirements and edition labels.
Optional `shortTitle` values in the artwork catalog provide concise names for
long titles without changing display titles, game matching, or public URLs.
The title formatter includes the site name when it fits the 65-character
editorial budget. Descriptions use the game's mobile summary or summary,
shortened at word boundaries to 160 characters with access requirements first.
These budgets guide copy; search engines choose their own snippet widths.
Player links reuse their landing page's Open Graph and Twitter card metadata
while retaining `noindex` and the landing-page canonical URL.

Structured data only emits developer/creator and publisher credits from explicit,
verified `developer` and `publisher` fields. The generic display `studio` credit
does not establish either role; omit uncertain credits rather than infer them.

The navigation and footer link to `/compatibility`, which includes ordinary links
to every recognized game page in its initial HTML. Edition-specific checks match
game pages by engine identity, with demos separate from full games. Recognized
games without a matching result appear as **Not yet tested**. The page provides
search and status filters and is itself included in the sitemap.

Social-card PNGs are generated from managed artwork during tests and builds.
Keep `data/social-cards.json` tracked; new generated PNGs are ignored and are
recreated when missing, so they do not need to be uploaded through Git.

### Development commands

Use [the README quickstart](../README.md#run-locally) for a local server that
does not require Infisical. The managed `pnpm run dev --port auto` launcher
uses the ScummWeb Development vault for the Sentry smoke test. The same vault
supplies the development token for `pnpm run sentry:issues`. The issues
launcher ignores private local Sentry env-file overrides.

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Check JavaScript and JSX syntax. |
| `pnpm test` | Run the Node test suite. |
| `pnpm build` | Stage shell assets, reconcile social cards, and build for production. |
| `pnpm generate:social-cards` | Generate changed/new social cards and remove obsolete generated PNGs. |
| `pnpm run generate:artwork` | Refresh smaller poster renditions from the managed originals. |
| `pnpm run start --port auto` | Stage shell assets and serve the production build. |
| `pnpm run verify` | Build, serve, and boot detected targets using a local Chrome or Chromium installation. |
| `pnpm run record:preview` | Stream distinct preview frames as a local MPEG-TS feed. |

The app validates and stages the tracked [ScummVM shell](../scummvm-shell/)
into `public/` before development, build, and start. Make changes to the
browser shell in [`web-shell/`](../web-shell/) and rebuild the managed bundle.
Keep the runtime and its `data/plugins/` directory from the same build. Catalog
launches select an engine by target. Local launches detect the game from its files.

Production serves game data directly from `SCUMMVM_GAMES_ORIGIN`. Local
verification can use `/games-proxy/*`. `NEXT_PUBLIC_SITE_URL` controls
metadata URLs, the sitemap, and robots. The sitemap includes the homepage and
catalog game pages. Player routes and the standalone emulator are excluded
from indexing.

Local builds skip Sentry source-map uploads. Hosted Vercel builds handle
uploads. Runtime capture uses `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_ENABLED`, and the project settings in
[`next.config.js`](../next.config.js).

Set `SCUMMWEB_DIST_DIR` to a separate project-relative directory when building
and serving an isolated production audit. Use the same value for both commands;
for example, `SCUMMWEB_DIST_DIR=.next-dev-audit pnpm build` followed by
`SCUMMWEB_DIST_DIR=.next-dev-audit pnpm start --port auto`. This keeps another
server or build from replacing the audit's runtime chunks. Vercel Web Analytics
loads only in Vercel builds, where its platform-provided endpoint exists;
Google Analytics remains enabled on other hosts.

For local artwork, `prepare` generates 320px and 640px WebP poster variants under
`scummvm-shell/launcher/responsive/` before staging the managed shell. The
generator retains each original, skips upscaling and larger encodings, and
records actual dimensions in `data/artwork-renditions.json`. Browser selection
preserves the existing cover crop and falls back to the full original for
larger displays or unknown/remote artwork. Derivatives inherit their original's
artwork provenance. Desktop hero titles fit within a reserved responsive heading
slot. A small document-head script fits the streamed heading before its first
paint; React maintains the fit during navigation and resizing. Mobile title fitting
is disabled by CSS from the initial render. Fonts use `display: optional`, and
font-download completion does not trigger another title resize. Desktop heroes
fill at least the first viewport, with a fixed action row
containing Play, version details or a selector, Browse Games and the license link
when available. Title, description and launch positions stay stable across
slideshow changes and saved-progress checks. A scroll link leads to the screenshot
gallery below the fold, where three large original captures fit across desktop
screens. Narrow screens show a horizontally scrollable gallery and use natural
content heights with a minimum of one viewport for the hero.
Game cards show full-color artwork at widths up to 48rem and on devices without
hover or with a coarse pointer. Desktop cards retain their grayscale-to-color
hover and keyboard-focus treatment.
Offscreen poster contents use native rendering containment with the existing
card height reserved. They remain searchable and available to assistive
technology; focused cards render normally so their focus outlines stay visible.

See [Production delivery](production-delivery.md) for deployments, secret
rotation, and manual game publishing. The sibling AgentSCUMM repository owns
agent gameplay experiments.

## Maintaining game compatibility

[`data/game-compatibility.json`](../data/game-compatibility.json) is the canonical
compatibility list (schema version 4). The compatibility page uses its flat
`entries` list to show recorded results. Each entry has a title, ScummVM `gameId`,
and a `status`:
`startup-verified`, `startup-warning`, and `startup-failed` represent one checked
`edition` with an `observation`. Warnings and failures describe ScummVM or
ScummWEB issues, with `issueScope` set to `scummvm` or `scummweb` on every warning
or failure, including historical checks. Warnings include support limitations
and runtime workarounds; failures record runtime issues that prevent startup.
Normal original game prompts count as startup verified; retain any limit on
gameplay verification in the observation. Optional `history`
records retain earlier checks with their `recordedOn`, `status`, and `observation`.
When a fix is verified, append the new check and update the entry's current status
and observation. Preserve runtime failure records when a fix is verified.
Do not publish missing-file warnings, corrupt or mismatched resources, or other
problems specific to supplied game files, including in observations or history.
Keep such diagnostics in ignored private QA evidence. If startup was observed,
retain that positive evidence without treating the copy's missing files as a
runtime limitation. If bad input prevented startup, omit that edition until a
valid copy is checked; do not turn it into a verified result or a runtime failure.
`not-tested` represents a game with no recorded edition and an `upstreamRating` from
the versioned `upstreamReference`. Upstream ratings are separate from ScummWEB
verification. Preserve edition-specific evidence and update `recordedOn` when
recording new results. Results apply to the checked edition and do not guarantee
behavior across every release or copy. Do not infer full-game support from a startup check.

After editing the data, run `node scripts/generate-compatibility-docs.mjs` to
refresh [game testing](game-testing.md). Use the same command with `--check`
to verify that the document is current; the test suite also checks this.

The runtime retains the detected language for Access games launched automatically.
Toltecs releases without `SAMPLE.AD` or `SAMPLE.OPL` use the standard AdLib
instrument bank after a warning; music remains enabled but differs from the
original instruments. Extracted CD audio supports spaced physical disc names
such as `Track  2.flac` for playback track 1, while preserving conventional
ScummVM names. Keep these behaviors in the corresponding upstream source patches.

The managed `audio-start-control.mjs` is installed before SDL input handlers.
It offers **Start audio** while the browser's audio context is suspended and
consumes the button gesture so movies do not interpret it as a skip command.
Maintain it in `web-shell/`; the staging script copies it into the managed bundle.

## Evaluator-only Queen telemetry

Native patch `16-report-queen-evaluation-variables.patch` provides a read-only
room provider for an external AgentSCUMM evaluator. It is inactive unless the
host sets `__scummwebEvaluationEnabled` before the engine starts. After display
updates it publishes `__scummwebEvaluationState` with protocol version,
`engine_id`, `room_id`, `room_name`, `room_ready`, and native monotonic time.
`room_ready` requires no pending room change and no running cutaway; it does not
assert that dialogue has finished. Room 71 is the hotel downstairs/laundry room
in the pinned Queen source; confirm its real arrival semantics before scoring a
new benchmark.

Room/ready transitions are retained in `__scummwebEvaluationEvents` until the
host consumes them. The queue holds at most 256 events and sets an explicit
overflow flag rather than silently losing arrivals. Keep all evaluator state
out of ordinary player observations. This provider is Queen-specific and needs
a native rebuild; regenerating browser shell templates alone cannot add it.

## Rebuilding and upgrading ScummVM

For browser-shell-only changes, run `pnpm run build:scummvm --shell-only`. This
regenerates `dist/` and the managed shell from `web-shell/`, reusing the compiled
engine and its source provenance. Native patches still require a full rebuild.
Hosted players intercept native launcher entry before it can draw and explicitly
signal successful engine termination. Keep both paths in
`14-exit-to-scummweb-before-launcher.patch`: the Emscripten keepalive runtime
can bypass `Module.quit` and `Module.onExit`. The shell hides the canvas as soon
as the exit signal arrives and returns to its same-origin `exitTo` destination,
including when the game exits without recent input or requests Return to Launcher.
Emscripten throws `ExitStatus` during termination. The shell ignores this signal
when its status is zero, or when the generated unload hook raises SIGINT
(status 130) during `beforeunload`. A capture listener marks teardown before
the generated hook runs. Both error events and unhandled rejections use this
check; other nonzero exits and unrelated exceptions retain error reporting. Keep
`test/runtime-errors.test.mjs` passing alongside the exit-bridge tests.
`prepare` and full runtime builds generate content fingerprints for the shell,
core runtime and engine data. Only a matching resource/version pair gets immutable
browser caching; application deployments refresh artwork without invalidating
unchanged runtime binaries. The HTML shell revalidates so hosting-injected scripts
stay fresh. Keep the generated `runtime-assets.json` and compact
`runtime-version.json` with the managed bundle.
Static cache rules live in `next.config.js`. The proxy matches only
`/scummvm.html` to preserve the standalone legacy launcher; game iframes and
inline fallback fetches use `localGame=1` to reach the runtime shell. Ordinary
pages, runtime binaries and artwork bypass the proxy.

For startup diagnosis, parent-frame Performance marks record `scummweb:runtime-requested`,
`scummweb:archive-prepared`, `scummweb:runtime-ready-for-files`,
`scummweb:archive-transferred`, and `scummweb:game-ready`. The shell also marks
`scummweb:wasm-ready`, `scummweb:filesystems-ready`, and `scummweb:first-game-frame`.
Compare timestamps using each frame's `performance.timeOrigin`; test cold,
prepared-cache and legacy-cache launches separately.
Append `?startupTrace=1` to a player URL to print one `[scummweb:startup]`
console record when its first frame is ready. It includes both frames' marks,
resource paths and timings, and the renderer when available. Request queries,
Blob identities, saves and game bytes are excluded; the report stays in the
local console. Omit the query to disable collection.
For prepared games, the report also totals local file reads, bytes and elapsed
read time without recording filenames.

`pnpm run build:scummvm` checks out the pinned release into
`vendor/scummvm-<tag>/`, applies the ScummWEB patches, builds WebAssembly and
its engine plugins, and syncs the deployable bundle from `dist/` into
`scummvm-shell/`. The build checks that it produced a plugin for every enabled
engine before syncing the bundle.

Use the repository skill
[`scummweb_upgrade-scummvm`](../.codex/skills/scummweb_upgrade-scummvm/SKILL.md)
to check the official stable release and perform an upgrade. Its checker has a
read-only default and an explicit pin-update mode. Its maintained patch ledger
records why every native patch and generated-runtime adapter exists, what must
survive, how to verify it, and when upstream support permits retirement.
New or changed patches must update that ledger and its hashes in the same change;
cross-cutting SDK/browser lessons belong in the skill's upgrade memory. Builds
and tests reject missing or stale entries. To validate without network or writes:

```sh
python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py --offline
```

The underlying deterministic build procedure remains:

1. Update the release tag, its upstream commit, and the matching Emscripten
   SDK in [`scripts/scummvm-version.sh`](../scripts/scummvm-version.sh).
2. Run `pnpm run build:scummvm --prepare-source`. It verifies the checkout
   against the pin and applies [`patches/scummvm/`](../patches/scummvm/) in filename
   order. If a patch fails, port its change against the new upstream source
   and refresh the diff with `git diff HEAD -- <path>` from the vendor checkout.
   A fully patched checkout can be reused. Keep personal edits outside it.
3. Maintain the browser UI and filesystem in [`web-shell/`](../web-shell/).
   The build stages those templates with the asset version and game bucket
   origin. They own BrowserFS save compatibility, the remote filesystem,
   and the app's boot and input integration. The native filesystem patch
   lets ScummVM see those mounts through its POSIX backend. The shell also
   adapts BrowserFS operations and error codes to Emscripten 4.
4. Run `SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm` to rebuild with the
   existing catalog. If the SDK changes the generated SDL audio glue, port
   [`scripts/patch_scummvm_audio.py`](../scripts/patch_scummvm_audio.py) and rebuild.
   The audio patch must succeed before the tracked bundle is replaced.
5. Run `pnpm test` and launch a catalog game and an imported ZIP in the browser.
   Check the first frame, audio, save and resume, and that the selected
   engine is the only engine plugin downloaded.

The regular play route downloads `<gameId>.zip` directly from the public game
bucket, then unpacks it using the same code as a dropped ZIP. It mounts the
files under the configured catalog path so target names and saves carry across.
Hosted standalone URLs such as `/scummvm.html#sky` forward to the ZIP-backed
play page. The verification harness opens the same play page and reads its
embedded canvas. The native build still uses an HTTP index for its local
catalog detection step and generates an index for deployed engine data.

### Classic freeware additions

[`data/classic-freeware.json`](../data/classic-freeware.json) pins the official
English Sołtys v1.0, Sfinx v1.1 and Mystery House archives, source URLs and SHA-256
checksums. Download those exact files into `downloads/` before rebuilding with
`SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm`. The build installs available
packages, retains their licenses, registers their targets and regenerates launcher
metadata without redetecting or removing existing catalog games. A mismatched
archive fails the build. Missing optional archives leave the existing catalog
unchanged. Publish and verify the resulting game ZIPs before deploying new targets.
The normalized ZIPs are written to `dist/games/<gameId>.zip`. Use a file-only
scoped upload (`--game soltys.zip`, `--game sfinx.zip`, `--game hires1.zip`)
so an additive catalog rebuild never replaces the remote root filesystem index
with an incomplete directory inventory. Prepare matching fingerprints before
publication with `node scripts/generate-bundled-game-files.mjs --local-dir dist/games`;
it reads available local ZIPs and uses bounded public directory reads for the
remaining catalog games. Re-run without the option after publication to verify
the actual hosted ZIPs.

The ADL plugin supports the original Apple II Mystery House disk image; its
keyboard text commands remain part of gameplay. The GOT plugin supports personal
God of Thunder ZIP imports. The official `gotfree.zip` is currently excluded from
public bundling because its included `LICENSE.TXT` prohibits redistribution,
despite the download page describing it as freeware. Clarify the applicable
redistribution permission before adding a public game package. Keep the original
notice intact.

## Game launch analytics

On `scummweb.tsilva.eu`, GA4 tracks the following events for catalog games,
at most once per play page visit for each event.

| Event | When it fires |
| --- | --- |
| `game_launch_attempt` | The play page starts preparing the game, including looking for a browser save when Continue was requested. |
| `game_launch` | ScummVM confirms the first rendered game frame. `load_time_ms` measures time since the attempt began. |
| `game_launch_failed` | The player observes a startup error or ScummVM reports a first-frame timeout before success. `failure_reason` is `startup_error` or `first_frame_timeout`. |
| `game_play_milestone` | The ready player accumulates five minutes in the visible tab with the game controls available. `play_time_seconds` is `300`. |

The events share `game_slug`, `entry_point` (`hero`, `library`, `game_detail`, or
`direct`), and `launch_mode` (`fresh` or requested `continue`). Intro skips stay
within the same visit. The play timer pauses while the game reloads or the tab
is hidden. A visit can report a failure and later recover. Leaving before
the player reports an outcome appears as a drop-off in the funnel.
Local files, direct ZIP links, and previously saved external bucket launches
are outside this catalog funnel. Direct play links use the `zip` parameter in
the `/local/play` URL fragment, so the server never receives the ZIP address
as part of the page request. Google Analytics and Vercel Analytics page
locations omit that fragment. The client downloads the archive directly with
credentials omitted.

The catalog player downloads and unpacks the game ZIP before starting
WebAssembly. ZIP launches fetch only the engine data index.
To diagnose a launch locally, inspect the iframe's User Timing marks in the
browser's Performance panel. `scummweb:wasm-ready` marks the start of filesystem
setup, `scummweb:index:games` and `scummweb:index:data` mark completion of each
index fetch, and `scummweb:filesystems-ready` marks when ScummVM can start.
`scummweb:first-game-frame` marks the first detected rendered frame for catalog
launches. These marks use the iframe's navigation as their time origin.

In GA4 Explorations, build a closed funnel from `game_launch_attempt` to
`game_launch` to `game_play_milestone` to compare users at each step. For
counts by play page visit, report **Event count** by event name. Use
**Page path** to focus on a game and **Session source / medium** to break down
acquisition. Analyze `game_launch_failed` separately. To report on the custom fields, register
`game_slug`, `entry_point`, `launch_mode`, and `failure_reason` as event-scoped
custom dimensions and `load_time_ms` as a custom metric.

## Artwork storage and publishing

[`data/artwork-storage.json`](../data/artwork-storage.json) controls game image
delivery. With `published: false`, images remain local. With `published: true`,
the browser loads registered images directly from the existing R2 bucket at
`https://scummvm-games.tsilva.eu/artwork/<sha256>/<filename>`. There is no app
proxy. Each record retains its logical path, SHA-256, size, MIME type and image
dimensions. Changed bytes get a new URL; retain older objects for older deployments.
The optional `images` map selects a WebP fallback and ordered WebP/AVIF variants
for each logical source path. Activation publishes this delivery map and the
object records together, so the app cannot reference unpublished variants.

The Beneath a Steel Sky hero at
`/launcher/sky-scummweb-generated-2026-11-05-r1-hero.webp` is an ImageGen
reinterpretation of the original game's promotional artwork, whose characters
and designs belong to Revolution Software and their respective creators. It
retains the inked comic composition and orange/blue palette, with a quieter
left side for the page title. The original `/launcher/sky-hero.webp` remains
available. The revised hero uses verified immutable R2 objects and responsive delivery
variants.

Flight of the Amazon Queen uses
`/launcher/queen-scummweb-generated-2026-11-05-r1-hero.webp`, an ImageGen
reinterpretation of its original painted promotional artwork. Original artwork
is credited to Muttill (1994), as signed on the source image; characters and
designs remain with their respective creators and rights holders. The revised
composition retains the pilot, companion, temple and crashed aircraft, with
shaded masonry behind the page title. The original `/launcher/queen-hero.webp`
remains available. This revision uses verified R2 delivery variants.

The other six bundled games also use their registered dated ImageGen
heroes: Drascula, DreamWeb, Lure of the Temptress, The Secret of Monkey Island
(Demo), Nippon Safes, Inc., and Broken Sword 2.5. Their original promotional
artwork references, generation dates and hashes are retained in
`data/generated-artwork.json`. Characters and original designs remain with their
respective creators and rights holders. These mappings use 1600×960 WebP exports with verified responsive R2 delivery.
Original hero objects, card covers and gameplay screenshots remain available.

The library uses generated heroes for all 160 recognized games, including
personal imports and the eleven bundled games. The first 146 banner sets
recompose original box or promotional artwork. Fourteen additional heroes are
original setting-based compositions that follow the games’ palettes, drawing
styles and motifs; they are not official promotional images. The registry marks
these with `creativeBasis: "original-setting-scene"` and records the reviewed
references, exact prompts, generation dates and master/export hashes.

For Hugo’s House of Horrors, Hugo III, Road, Fun Seeker’s Guide, Ms. Astro Chicken,
Bear Stormin’ and Chivalry is Not Dead, original gameplay captures supply visual
style, setting and character-design references for new promotional scenes.
The captures themselves remain unchanged. The other seven new scenes emphasize
scenery and objects inspired by their original box artwork. Each new export is
1600×960, with verified responsive R2 delivery. Logical hero mappings and source
credits remain in `app/retro-game-artwork.json`; full generation provenance is in
`data/generated-artwork.json`. Card box fronts retain their separate provenance.
Import recognition uses the same hero and focal position as the corresponding
catalog presentation. The optional `heroImageMobilePosition` overrides the shared
narrow-screen crop for artwork whose main subject would otherwise fall outside
the visible area.

Game mappings and source credits stay in `app/game-presentation.js`,
`app/retro-game-artwork.json`, and this guide. Responsive width mappings remain
in `data/artwork-renditions.json`. The Road source capture is included; branding,
runtime notices, and skip-intro saves stay in Git. Source paths in provenance
records are logical identifiers after migration, resolved through the storage manifest.

To migrate or update artwork:

Concurrent artwork operations should use separate private plans. Set
`SCUMMWEB_ARTWORK_WORKSPACE` to the same short lowercase slug for every optimizer,
plan, publish, verify, activate and retirement command in one operation. It selects
an ignored directory under `.internal/evidence/`, never a different bucket or
credential scope. The default remains `artwork-migration`.

1. Place new or revised originals in `scummvm-shell/launcher/`, update game mappings
   and source credits, and run `pnpm run generate:artwork`. Upload inputs are ignored
   for new files; existing tracked originals remain until the initial migration completes.
   For a complete delivery optimization pass, run `pnpm run optimize:artwork`.
   It reads verified cached or public originals, preserves them, and prepares
   responsive images plus a private delivery map for the next upload plan.
2. Run `pnpm run artwork:plan`. This retains the active manifest, creates a private
   upload plan, and preserves content-addressed copies of every local image.
   Published mappings without local originals are retained for subsequent updates.
   Plans record the current storage fingerprint; activation rejects a stale plan
   so concurrent artwork updates must be merged before switching delivery.
3. Through a reviewed publishing credential route, run `pnpm run publish:artwork`.
   The existing launcher uses the pinned ScummWEB Development R2 pair and bucket;
   agents require explicit authorization for that raw credential operation until
   a compatible broker is reviewed. The uploader never loads dotenv, overwrites
   an existing object, prunes objects, or changes bucket settings. Every object
   is read back and checked for its exact bytes and HTTP metadata.
4. Run `pnpm run artwork:verify`, then `pnpm run artwork:activate`. Activation
   independently checks every public image's SHA-256, length, MIME type and
   immutable cache metadata before writing the tracked storage manifest.
5. Run `pnpm run artwork:retire-local` to verify delivery again, preserve exact
   private copies, and remove the registered image binaries from the shell,
   public staging directory, and existing dist staging directory. It rejects
   changed local originals. Notices and skip-intro saves are preserved.
6. Run `pnpm run prepare`, `pnpm run lint`, `pnpm test`, and a production build.
   Check covers, heroes and galleries in the browser before publishing the change.

Normal builds need no storage credentials. Social-card generation uses verified
local or cached image bytes, downloading checksum-verified originals from the
public bucket when necessary. A fresh checkout therefore needs network access
to R2 during generation. Responsive variants are published images, so their
existing width mappings survive builds without local originals.

Game publishing with `--prune` preserves the reserved `artwork/` namespace.
Artwork retirement does not rewrite Git history. Old image revisions remain
in earlier commits.

### Generated heroes and card box art

Use [`scummweb_game-assets`](../.codex/skills/scummweb_game-assets/SKILL.md)
and its [generation procedure](../.codex/skills/scummweb_game-assets/references/generation.md)
for original-reference hero banners and portrait card covers. For heroes, existing
original hero/banner art is the first reference; official box art or promotional
artwork is the fallback. Card covers must faithfully regenerate the original box
front to improve quality, preserving its artwork, original title typography,
branding, layout and palette. Use the actual original box front as the primary
reference; never substitute reimagined hero art. Remove scan damage and extraneous
stickers without redesigning the cover. Report missing original box references.
Screenshots always remain original gameplay captures; never generate or repaint them.

The eleven bundled card covers use ImageGen restorations of their original box
fronts: Beneath a Steel Sky, Broken Sword 2.5, Drascula, DreamWeb, Flight of the
Amazon Queen, Mystery House, Lure of the Temptress, Nippon Safes, Inc., Sfinx,
Sołtys and The Secret of Monkey Island (Demo). The original full-game Monkey
Island cover is retained; the application supplies the demo label separately.
All cover exports are 900×1200 WebP at quality 80, effort 6, with smaller card
renditions. The registry retains original reference URLs and hashes, generation
dates and prompts. Original artwork, lettering and brands remain the property
of their respective creators and rights holders. These revisions use verified immutable R2 objects and responsive delivery
variants.

Restored box fronts also cover 135 additional recognized games. Together with the
eleven bundled covers, 146 of the 160 recognized games use generated restorations.
Eight retain their original images where a verified box-front reference or an
acceptable faithful restoration was unavailable. Restored covers
preserve original title lettering, artwork and branding; selected printed screenshot
insets are removed where a clean version preserves the cover's identity. Gameplay
galleries remain original captures. Source references, prompts and every generated
revision remain in the registry.

Six explicitly approved illustrated redesigns cover Road, Bear Stormin', Blue's
Treasure Hunt, Chivalry is Not Dead, Hugo's House of Horrors and Hugo III: Jungle
of Doom. These are new promotional compositions inspired by the games' visual
styles and characters, rather than restorations of official packaging. Their
registry entries use `creativeBasis: "original-illustrated-cover"` and retain
the original box-art or gameplay references, exact prompts and source hashes.
Gameplay references guide style and setting only; the original captures remain
unchanged. These covers use the same 900×1200 export and verified R2 delivery
pipeline as restored covers. This approved set is an exception to the default
box-front restoration requirement above.

`data/generated-artwork.json` records each generated revision's date, role,
reference sources, prompt or historical prompt summary, source/export hashes,
decoded dimensions and readiness. Resizing/encoding alone does not make an
original image creatively generated. Current default final exports are 1600×960
(5:3) heroes and 900×1200 (3:4) card covers; check the current consumers and actual
decoded pixels before export. The initial quality-90 hero candidates remain
previews until their final dimension and delivery optimization gates pass.

New generated filenames use
`<slug>-scummweb-generated-YYYY-MM-DD-r<N>-hero.webp` or `-cover.webp`.
The role must remain at the end of the stem so rendition/AVIF discovery works.
Existing mapped names remain valid through their registry records. The registry,
live logical mapping and matching bytes determine provenance; names alone do not.

To inventory the bundled catalog without generating or publishing anything:

```sh
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --role hero --missing
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --role cover --missing
node .codex/skills/scummweb_game-assets/scripts/inventory-bundled.mjs --needs-apply
```

`--missing` excludes matching saved candidates as well as applied generated art;
`--needs-apply` identifies saved generations whose live mapping is still original
or unknown. Recover unavailable candidate bytes rather than assuming a registry
entry means the image is available. For new sources, publish/activate originals
before running the existing optimizer, which reads published manifest records;
then publish/activate its verified responsive delivery map. Preserve old live
mappings until replacement objects are verified. Generation and local preview
requests do not themselves authorize publication or deployment.

### Delivery encoding and sizing

PNG screenshots receive full-resolution lossless WebP copies, verified against
their decoded source pixels. Smaller screenshot variants use lossless WebP;
posters and promotional heroes use WebP quality 80, effort 6. Resizing preserves
aspect ratio and never upscales. Original source objects and credits remain intact.

AVIF candidates use 4:4:4 chroma, effort 6, and quality 70 or 60. A candidate
must save at least 10% against its WebP counterpart and meet a decoded RGB PSNR
floor of 35 dB. These are screening limits, not a guarantee of perceptual quality;
inspect representative text, fine detail, gradients, and pixel-art framing before
publication. Offer an AVIF picture source only when it covers every WebP width;
otherwise retain WebP delivery so a browser cannot select an undersized AVIF.
AVIF encoding runs only in the explicit optimizer, outside normal builds.

Posters advertise source sizes from the auto-fit 10rem grid, 1rem gaps, capped
100rem container, current result count, crop and zoom. Keep this calculation in
sync with the grid CSS. Hero sizes account for viewport height and cover cropping;
gallery images preserve their original proportions. Variant width descriptors
come from the decoded image dimensions. Hero preloading uses the same picture
sources as visible images to avoid downloading both format alternatives.

## Branding

The README uses the Adventure Terminal [logo](../logo.png). The original
ImageGen artwork lives in [`image-assets/sources/`](../image-assets/sources/).
The [provenance record](../image-assets/provenance.json) records source and
export hashes, and the [web asset manifest](../public/brand/manifest.json)
lists the exports and their dimensions.

The homepage serves the Adventure Terminal social card at `/opengraph-image`.
Game pages use their individual social cards. The shell finalizer copies the
browser and install icons from [`public/brand/web-seo/`](../public/brand/web-seo/)
into the managed shell during ScummVM rebuilds.

Browser tabs and installed apps use the Emerald Cartridge icon: a green **S** and
silver-grey **W** on a beveled emerald tile with a recessed cartridge groove.
The untouched generated source is
[`image-assets/sources/icon-source.png`](../image-assets/sources/icon-source.png).
Run `node scripts/generate-favicon-assets.mjs` after replacing it and updating its
generation evidence in the provenance record. The command derives 16/32/48px
PNGs, an ICO, a compact SVG embedding the 64px rendition, 192/512px install icons,
an opaque 180px Apple touch icon, and the 1024px branding icon. The SVG at
`image-assets/sources/favicon-source.svg` is a generated compatibility export,
not an editable vector source. The command updates the branding, managed shell,
staged public files, both web manifests, export fingerprints and
`image-assets/icon-versions.json`. App metadata uses these content versions to
refresh favicon, manifest and Apple touch icon URLs when artwork changes.
Install icons use the standard `any` purpose; they are not designed for maskable
cropping. Existing installations may refresh their icons on the platform's own
schedule or require reinstalling after deployment.

### Social preview assets

Game cards are rendered by `pnpm generate:social-cards`, also run by
`prepare` before development, production builds, and start. The generator uses
the same bundled catalog and presentation copy as game pages, embeds verified artwork bytes,
and writes 1200×630 PNGs under `public/social-cards/`. Cards prefer hero artwork,
falling back to spotlight or poster art when no hero is configured. The artwork
uses 50% opacity beneath the dark gradient; brighter text and dark text shadows
keep the title, description, and credits readable. It never requests a deployed
site or an image rendering service. Published source images are downloaded from R2
when absent from the local build cache. The homepage continues using its existing branding PNG.

`data/social-cards.json` records each card's rendered inputs and artwork hash,
output filename, and PNG checksum. Unchanged inputs reuse the existing file
without rewriting it. Changes to displayed copy, selected artwork bytes, the
template, or rendering dependency versions regenerate affected cards. Deployment
IDs, asset query versions, and unrelated catalog fields do not invalidate them.
New games receive cards; removed games and earlier revisions are pruned from the
generated directory. Missing or corrupted PNGs are repaired. Missing source
artwork or a failed render fails the command, preserving the last valid manifest.

After editing catalog copy or artwork, run the generator and commit the resulting
manifest with the source changes. PNG outputs are ignored build artifacts;
clean CI and Vercel builds regenerate missing cards from their verified sources.
Builds reconcile again to catch missed changes. Rendering uses the
pinned Next.js image renderer and Sharp; it needs no service credentials.

Metadata points directly to content-versioned PNG URLs with immutable caching.
Both `/<game-slug>/social-card.png` and `/<game-slug>/opengraph-image` remain static
rewrites to the corresponding PNG. Unknown and removed slugs have no image
rewrite. Image requests also bypass Proxy. There are no per-game image Functions
or request-time rendering.

## Catalog fixtures and artwork

- The playable baseline is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`,
  launched through `/scummvm.html#sky`.
- To include The Secret of Monkey Island (Demo) in a catalog rebuild, place the
  [English DOS EGA demo ZIP](https://downloads.scummvm.org/frs/demos/scumm/monkey1-dos-ega-demo-en.zip)
  in `downloads/` as `monkey1-dos-ega-demo-en.zip`.
- Catalog hero banners, covers, and screenshots are delivered directly from R2.
  Their logical paths and object checksums are recorded in
  [`data/artwork-storage.json`](../data/artwork-storage.json). New upload inputs
  temporarily use `scummvm-shell/launcher/` as described in the publishing procedure.
  The banners use ImageGen-restored promotional art. Screenshot galleries retain
  the original captures.
- The Secret of Monkey Island (Demo) uses
  [Steve Purcell's DOS box art](https://gamesdb.launchbox-app.com/games/images/139-the-secret-of-monkey-island)
  and [DOS EGA demo screenshots](https://www.dosgamesarchive.com/download/the-secret-of-monkey-island).
- Sfinx ZIPs use the CGE2 engine. Artwork comes from the
  [original box front scan](https://gamesdb.launchbox-app.com/games/images/86024-sfinx)
  and [ScummVM gameplay captures](https://www.scummvm.org/screenshots/lkavalon/).
- Imported Indiana Jones games use the SCUMM engine. The importer recognizes
  the full titles in ZIP names and shares art across platform,
  language, and edition labels in parentheses. Their posters come from the
  [Fate of Atlantis DOS box scan](https://gamesdb.launchbox-app.com/games/images/5386-indiana-jones-and-the-fate-of-atlantis)
  and [Last Crusade Amiga box scan](https://gamesdb.launchbox-app.com/games/images/18310-indiana-jones-and-the-last-crusade-the-graphic-adventure).
  Gameplay images come from the [ScummVM screenshot gallery](https://www.scummvm.org/screenshots/lucasarts/indy/).
  The web build includes checksum-pinned [Xiph FLAC](https://www.xiph.org/downloads/)
  for CD speech archives such as Fate of Atlantis’s `monster.sof`.
- These personal SCUMM imports share one set of artwork across editions:

  | Game | Box scan | Gameplay capture |
  | --- | --- | --- |
  | Day of the Tentacle | [DOS cover](https://gamesdb.launchbox-app.com/games/images/3575-maniac-mansion-day-of-the-tentacle) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/tentacle/tentacle_dos_en_1_2_full.png) |
  | Loom | [Original cover](https://gamesdb.launchbox-app.com/games/images/5391-loom) | [English DOS VGA](https://www.scummvm.org/data/screenshots/scumm/loom/loom_dos_en_2_2_full.png) |
  | Maniac Mansion | [Amiga cover](https://gamesdb.launchbox-app.com/games/images/41172-maniac-mansion) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/maniac/) |
  | Monkey Island 2: LeChuck’s Revenge | [Original cover](https://gamesdb.launchbox-app.com/games/images/723-monkey-island-2-lechucks-revenge) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/monkey2/monkey2_dos_en_1_1_full.png) |
  | Sam & Max Hit the Road | [DOS cover](https://gamesdb.launchbox-app.com/games/images/58-sam-max-hit-the-road) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/samnmax/samnmax_dos_en_1_3_full.png) |
  | Zak McKracken and the Alien Mindbenders | [Amiga cover](https://openretro.org/amiga/zak-mckracken-and-the-alien-mindbenders) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/scumm:zak/) |

  The larger personal collection uses the per-title artwork and source links in
  [`app/retro-game-artwork.json`](../app/retro-game-artwork.json). It includes
  original box scans, gameplay captures, and title cards where a cover was
  unavailable. Platform and language variants can point to the same files, but
  originals and remakes must have separate artwork sets and matching gameplay
  captures. Keep remake labels in `editionLabel`, separate from the canonical title
  and recognition aliases. King's Quest 1 uses **SCI Remake** (its remake is EGA);
  Leisure Suit Larry 1, Police Quest 1, Quest for Glory 1, and Space Quest 1 use
  **VGA Remake**. Preserve their separate engine/game identities and URLs.
  Leisure Suit Larry 1, Police Quest 1, and Space Quest 1 remake covers come from the edition-specific
  Libretro box scans; Quest for Glory 1 uses the original Hero's Quest scan for
  the original game and a LaunchBox remake scan. Exact image URLs and the
  corresponding ScummVM remake gallery links are retained in the artwork JSON.
  Canonical titles shared by originals and remakes remain ambiguous; only a
  unique title or recognized edition alias selects a game family. An ambiguous
  ZIP name keeps generic metadata until it can be identified.
  Galleries contain three distinct captures for catalog games, Sfinx, and most
  recognized personal imports. Road retains one verified capture and Fun Seeker's
  Guide to Eastern Madera County has two until additional matching screenshots
  are available. Keep those gaps explicit; do not duplicate
  images or substitute captures from another game.
  Added captures retain their original framing and use lossless WebP encoding.
  Per-image source URLs are recorded in the artwork JSON. Most come from the
  [ScummVM screenshot gallery](https://www.scummvm.org/screenshots/); supplementary
  captures come from the original Myst Masterpiece and Big Thinkers Steam store
  galleries, [OldGames](https://www.oldgames.sk/en/game/big-red-adventure-the/screenshots),
  [Old-Games.RU](https://www.old-games.ru/game/7755.html),
  [Planète Aventure](https://www.planete-aventure.net/jeux.php?cat=screenshots&num_jeu=1822),
  and the [DOSBox Staging Passport to Adventure guide](https://www.dosbox-staging.org/0.83/getting-started/passport-to-adventure/).
  Ms. Astro Chicken uses its [GamersCreed gallery](https://www.gamerscreed.com/resources/ms-astro-chicken-flight-of-the-pullet.151/).
  Fun Seeker's Guide includes its original introduction screen from Libretro's
  ScummVM title-screen collection.
  Sfinx's three captures are English DOS images 2–4 from its ScummVM gallery.
  The Simon the Sorcerer's Puzzle Pack gallery includes Jumble and Swampy
  Adventures, both included in the collection.
  The homepage uses a game's landscape artwork or gameplay capture as its
  slideshow backdrop. Heroes share save-aware Play, Continue, Start from beginning
  and reconnect actions. One known edition shows a metadata badge; multiple
  editions show an inline Version selector instead. Both slots retain their space
  while hidden, so restoring local editions does not move the action row or
  change the hero's height. Hidden slots contain no focusable controls.
  Continue refreshes after browser saves change or the page is restored.
  Play or Continue appears immediately from cached browser metadata while stale
  records are reconciled in the background. Background native queries yield to
  launch clicks, and unrelated source checks do not block the hero action.
  Player exits return to the game's slug route when available. Unrecognized
  imports retain `/#slide=<encoded group key>` and resolve when saved sources
  finish loading. Unknown selections fall back to the featured game; direct ZIP
  launches without library metadata return to the homepage.
  Slug routes render the selected game's hero and screenshots on the server,
  retaining the canonical metadata and structured data for sharing and search.
  Within the mounted library, game cards and slideshow arrows update selection
  using the native History API without fetching a new route. The library stays
  mounted, including imports and browsing controls; Back and Forward restore
  the hero and selected card. Title, canonical URL, social metadata and structured
  data follow the selected route. Links outside this library use Next.js routing.
  Slideshow arrows navigate to the previous or next game's route and pause
  rotation. The desktop homepage rotates every eight seconds; game routes and explicit
  imported-game selections open paused until resumed. Hover and focus pause rotation over hero content,
  while the slideshow controls let it continue. Hidden tabs suspend rotation,
  and reduced-motion preferences disable automatic rotation until resumed.
  The hero preloads and decodes the next three backdrops and one previous
  backdrop, wrapping around at either end. `HERO_PRELOAD_AHEAD` in
  `app/home-shell/hero-images.mjs` controls the forward window. Preloads use
  the visible hero's responsive sources and sizes with low fetch priority,
  share identical artwork, and retain image references only for the current
  window. A failed preload does not prevent slideshow navigation.
  At widths up to 48rem, the hero is static with no slideshow controls or animation.
  The homepage keeps its server-rendered featured game on mobile, avoiding a
  post-load random replacement of the artwork, text and screenshot gallery.
  Responsive desktop and mobile copy is present in the initial HTML; CSS selects
  the visible version before hydration. Direct routes and `#slide=` selections take
  precedence. The selected game stays stable while local sources restore, and mobile
  only preloads its current backdrop. Desktop retains its normal slideshow behavior.
  Mobile uses full-width artwork, natural-height mixed-case titles, compact summaries
  and metadata, stacked full-width action buttons, and an unlabeled screenshot strip.
  Artwork starts at the compact header's bottom edge, including its safe-area inset;
  the hero keeps 2rem of space below its content before the screenshot strip.
  Detailed facts and the license link are hidden in the mobile hero. Original gameplay
  captures remain unchanged and the screenshot viewer stays accessible by keyboard.
  Saved sources are checked on library load, window focus, tab return, and
  restoration from the browser's back/forward cache. Local checks use saved
  handles with existing read permission; they do not request permission or
  download game contents. Missing ZIP files retain their library entries
  and show a missing-file badge. Permission failures use an explicit
  `Allow file access` action with explanatory text in the hero,
  without adding a poster badge. Only this action requests browser permission;
  launching rechecks existing permission. Other check failures remain unverified.
  ZIP imports list each archive with waiting, checking, added, and error states
  visible during processing. Skipped rows are hidden during scanning and in the
  final list, but included in the summary count. The progress bar sits below the
  dialog heading, and the latest scanned ZIP appears first. Added and error rows
  stay visible until the batch result replaces the progress list.
  Reimporting ZIPs reuses their saved source IDs and refreshes file access.
  These existing games count as skipped; failed imports count as errors.
  The final dialog counts each attempted item once in its scanned total and
  shows separate added, skipped, and error counts. Unsupported drops report an
  error without stopping other ZIPs in the batch.
  Matching prefers file-handle identity, then a saved fingerprint of ZIP member
  paths, sizes and CRCs. Fingerprints ignore enclosing folders and member order.
  Legacy ZIP entries without fingerprints and missing entries can reconnect by
  a unique name; ambiguous legacy names require selecting the specific poster.
  Stale handle comparisons do not prevent matching replacement ZIPs. Remote URL
  sources are excluded from local matching. Old folder entries remain in the
  library for explicit replacement with a ZIP, preserving their save identity;
  they are never opened as directories.
  Desktop hero titles fit their full text into a fixed three-line title area, resizing
  after viewport or font changes. Summary and metadata slots have fixed heights,
  with their full text available in tooltips. Keep action rows stable across
  slides so long titles and labels do not move the controls or the library.
  The desktop hero's primary action reserves a fixed button width. All layouts
  retain save-aware Play/Continue and file-access actions; mobile buttons span
  the available width with a minimum 3rem height.
  Hero status badges omit library-wide game counts; game slides show only
  status information for the displayed game.

  Every recognized title in the asset pack must include a game-specific
  `summary`, `studio`, and `genre`. Keep metadata references in
  `sources.metadata` and describe unresolved credits in `metadataNote`.
  Slideshow heroes and library-card tooltips read the same record, including
  entries imported before a metadata update. Keep the library grid limited to
  cover cards and titles; show detailed metadata in the slideshow heroes and
  inline screenshot gallery. Catalog cards and the recent-games rail navigate
  to the game's slug route with an instant scroll to the top. Recognized imports
  use the same canonical route; unrecognized imports use a homepage selection
  fragment. Library cards and slideshow entries group recognized versions using
  engine/game identity, with demos separated from full releases. Unrecognized
  sources stay separate. Version counts remain on cards; the hero's
  Version dropdown uses `Language · Platform · Media · Graphics · Revision` for
  all games, omitting unknown fields. Normalize platform and language names,
  preserve disc counts such as `2CD`, and retain revision precision. Graphics
  appear only when multiple known modes distinguish editions on the same platform;
  one edition or identical modes omit graphics. Hero edition badges use the same
  formatted metadata. Identical labels receive `Copy 1`, `Copy 2` suffixes without
  exposing filenames; source IDs, launch actions and saves remain unchanged.
  Beneath a Steel Sky CD imports identify
  revisions v0.0368 and v0.0372 from the inspected `sky.dnr` and `sky.dsk` sizes
  using ScummVM's detection table, overriding incomplete or stale filename labels.
  Unknown file pairs retain filename metadata without guessing a revision.
  Structured media, graphics and revision fields are separate; legacy `edition`
  and `extra` fields remain parsing fallbacks.
  Use a numbered version label when no details are available; never infer a
  language from the game title alone. Remember the last selected available version,
  otherwise prefer an available copy matching the browser language. File access
  and launch always apply to that selection. Missing sources use the primary
  file-location action. The hero omits filenames, auxiliary file-management
  links, save-folder hints, and legacy-save controls. Generic presentation uses the
  genre as its heading label and omits release metadata when the year is unknown.
  All selected editions use save-aware launch buttons in the hero. Imported
  versions use a deterministic SHA-256 source-ID save folder passed through
  ScummVM’s `--savepath`; Continue looks only inside that version’s folder and
  retains the supported-engine filename rules in `browser-saves.mjs`. Other engines
  load saves through their in-game menu. Older shared saves remain stored without
  an exposed legacy launch control. Removing a version leaves its browser saves
  untouched; a reimport with a new source ID does not automatically reconnect them.
  On desktop the hero and compact screenshot strip occupy at least the initial
  viewport, placing the library below the fold. Screenshot thumbnails are 12rem
  wide on desktop. Mobile uses natural content height and fits two thumbnails
  across the screen, with horizontal overflow and uncropped original images.
  Library covers retain a 3:4 portrait box-art shape. At widths of 64rem and up,
  the library uses exactly five columns; narrower layouts keep their responsive grid.
  The screenshot strip renders
  without deferred content sizing so changing games does not move later sections.
  Selecting a thumbnail expands a viewer inline. Previous/next and arrow keys
  browse the screenshots; Close screenshot or Escape collapses the viewer and
  restores focus to the thumbnail. Game changes reset the expanded image.
  Game details do not open a modal or lock background scrolling.
  The library's sliders icon opens the sorting and genre controls. The button
  has an accessible label and no visible text. It sorts the
  combined catalog and saved-source cards by name, release year, genre, or
  studio, with name order as the default. Release years come from presentation
  metadata; unknown years sort last. Genre selection updates immediately and
  remains active when the controls are collapsed or a game card changes the route
  within the same tab. Sort, genre and panel visibility reset on a full reload.
  Select All genres to remove
  the genre filter. The panel contains no search, year or source filters, or
  reset action. Dropdown arrows have a 1rem inset and reserved text padding.
  Genre facets, filtering, and sorting share `libraryGenre` grouping into 11
  categories: Adventure, Action & arcade, Comedy, Family & education, Fantasy,
  Horror, Mystery & thriller, Puzzle, Role-playing, Science fiction, and Simulation.
  Matching ignores case and repeated whitespace. Hybrid genres use the ordered
  rules in `genreGroups`: family and education, role-playing, action and arcade,
  simulation, horror, science fiction, fantasy, mystery and thriller, comedy,
  then puzzle. Other named genres use Adventure; missing metadata uses Unknown.
  For example, educational time travel is Family & education, horror RPGs are
  Role-playing, and science-fiction comedy is Science fiction. Original
  presentation metadata remains available in game heroes. Keep
  future grouping changes in this shared normalizer so catalog and imported
  games match the same option.
  ScummVM's developer pages provide the
  primary references; genre labels and summaries are editorial descriptions.
  The fan game Road has an unverified creator credit and a description based
  on its locally verified gameplay.

## Package a local ScummVM collection

Run `python3 scripts/package_retro_games.py --source /path/to/game-folders --output /path/to/game-archives`
to inventory the editions and check the output volume. Append `--write` to
package and verify the archives. Existing matching archives are reused, and
conflicting files are preserved. The script keeps the original game folders
intact. Select the output ZIP files and drop them into the ScummWEB library.

The packager stores the members of large ZIPs without compression. ScummWEB
reads those ZIPs directly from disk in small blocks instead of loading every
file into memory. Local imports support up to 4 GiB; ZIPs over 128 MiB or over 256 MiB unpacked must use the store method.
Hosted ZIPs retain the separate download and unpacking limits.

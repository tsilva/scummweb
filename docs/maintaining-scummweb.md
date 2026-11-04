# Maintaining ScummWEB

## Local development

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

See [Production delivery](production-delivery.md) for deployments, secret
rotation, and manual game publishing. The sibling AgentSCUMM repository owns
agent gameplay experiments.

## Maintaining game compatibility

[`data/game-compatibility.json`](../data/game-compatibility.json) is the canonical
compatibility list (schema version 3). The top-bar modal reads its flat `entries`
list directly. Each entry has a title, ScummVM `gameId`, and a `status`:
`startup-verified`, `startup-warning`, and `startup-failed` represent one checked
`edition` with an `observation`. Warnings include workarounds, audio limitations,
and original game prompts; failures record a startup error. Optional `history`
records retain earlier checks with their `recordedOn`, `status`, and `observation`.
When a fix is verified, append the new check and update the entry's current status
and observation. Preserve the failure record instead of erasing it.
`not-tested` represents a game with no recorded edition and an `upstreamRating` from
the versioned `upstreamReference`. Upstream ratings are separate from ScummWEB
verification. Preserve edition-specific evidence and update `recordedOn` when
recording new results. Do not infer full-game support from a startup check.

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

## Rebuilding and upgrading ScummVM

`pnpm run build:scummvm` checks out the pinned release into
`vendor/scummvm-<tag>/`, applies the ScummWEB patches, builds WebAssembly and
its engine plugins, and syncs the deployable bundle from `dist/` into
`scummvm-shell/`. The build checks that it produced a plugin for every enabled
engine before syncing the bundle.

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

### Social preview assets

Game cards are generated offline by `pnpm generate:social-cards`, also run by
`prepare` before development, production builds, and start. The generator uses
the same bundled catalog and presentation copy as game pages, embeds local artwork,
and writes 1200×630 PNGs under `public/social-cards/`. It never requests a deployed
site or an image service. The homepage continues using its existing branding PNG.

`data/social-cards.json` records each card's rendered inputs and artwork hash,
output filename, and PNG checksum. Unchanged inputs reuse the existing file
without rewriting it. Changes to displayed copy, selected artwork bytes, the
template, or rendering dependency versions regenerate affected cards. Deployment
IDs, asset query versions, and unrelated catalog fields do not invalidate them.
New games receive cards; removed games and earlier revisions are pruned from the
generated directory. Missing or corrupted PNGs are repaired. Missing source
artwork or a failed render fails the command, preserving the last valid manifest.

After editing catalog copy or artwork, run the generator and commit the resulting
manifest and PNG additions/deletions with the source changes. Keeping these files
in Git allows clean CI and Vercel builds to reuse cards rather than rerendering
every image. Builds reconcile again to catch missed changes. Rendering uses the
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
- Catalog hero banners live in [`scummvm-shell/launcher/`](../scummvm-shell/launcher/).
  The banners use ImageGen-restored promotional art. Screenshot galleries retain
  the original captures.
- The Secret of Monkey Island (Demo) uses
  [Steve Purcell's DOS box art](https://gamesdb.launchbox-app.com/games/images/139-the-secret-of-monkey-island)
  and [DOS EGA demo screenshots](https://www.dosgamesarchive.com/download/the-secret-of-monkey-island).
- Sfinx ZIPs use the CGE2 engine. Artwork comes from the
  [original box front scan](https://gamesdb.launchbox-app.com/games/images/86024-sfinx)
  and [ScummVM gameplay captures](https://www.scummvm.org/screenshots/lkavalon/).
- Imported Indiana Jones games use the SCUMM engine. The importer recognizes
  the full titles in ZIP and folder names and shares art across platform,
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
  unavailable. Different editions can point to the same files.
  The homepage uses a game's landscape artwork or gameplay capture as its
  slideshow backdrop. Imported slides use the same Play and reconnect actions
  as their library cards.
  The hero preloads and decodes the next three backdrops and one previous
  backdrop, wrapping around at either end. `HERO_PRELOAD_AHEAD` in
  `app/home-shell/hero-images.mjs` controls the forward window. Preloads use
  the visible hero's responsive sources and sizes with low fetch priority,
  share identical artwork, and retain image references only for the current
  window. A failed preload does not prevent slideshow navigation.
  Saved sources are checked on library load, window focus, tab return, and
  restoration from the browser's back/forward cache. Local checks use saved
  handles with existing read permission; they do not request permission or
  download game contents. Missing files and folders retain their library entries
  and show a missing-file or missing-folder badge. Permission failures show
  `File access needed`; other check failures remain unverified.
  Directory imports list each archive by its relative path, with waiting,
  checking, added, and error states visible during processing. Skipped rows are
  hidden during scanning and in the final list, but included in the summary count.
  The progress bar sits below the dialog heading. During scanning, container
  folders are hidden and file rows appear without nesting, latest scanned first.
  Unpacked game folders list their individual data files as they are read.
  Added and error rows stay visible until the batch result replaces the progress list.
  Reimporting local games reuses their saved source IDs and refreshes file access.
  These existing games count as skipped; failed imports count as errors.
  The final dialog counts each attempted game once in its scanned total and
  shows separate added, skipped, and error counts. Loose data-file rows are
  details of their game folder and do not increase these counts.
  Matching prefers file-handle identity, then a saved fingerprint of ZIP member
  paths, sizes and CRCs, or unpacked file paths, sizes and modification times.
  Fingerprints ignore enclosing folders and scan order. Legacy entries without
  fingerprints and missing entries can reconnect by a unique name and source kind;
  ambiguous legacy names require selecting the specific poster. Stale handle
  comparisons do not prevent matching the replacement files. Remote URL sources
  are excluded from local matching.
  Hero titles fit their full text into a fixed three-line title area, resizing
  after viewport or font changes. Summary and metadata slots have fixed heights,
  with their full text available in tooltips. Keep action rows stable across
  slides so long titles and labels do not move the controls or the library.
  The hero's primary action always reads `Play` and uses a fixed 10rem by
  3.4rem button, including imported games and games with a browser save.
  Hero status badges omit library-wide game counts; game slides show only
  status information for the displayed game.

  Every recognized title in the asset pack must include a game-specific
  `summary`, `studio`, and `genre`. Keep metadata references in
  `sources.metadata` and describe unresolved credits in `metadataNote`.
  Slideshow heroes and library-card tooltips read the same record, including
  entries imported before a metadata update. Keep the library grid limited to
  cover cards and titles; show detailed metadata in the slideshow heroes and
  game detail modals. Catalog cards and the recent-games rail open hash-linked
  details. Library cards and slideshow entries group recognized versions using
  engine/game identity, with demos separated from full releases. Unrecognized
  sources stay separate. A version count opens a single details panel with a
  Version dropdown showing platform, language, edition, and source type; unknown
  metadata stays explicitly unknown. Remember the last selected available version,
  otherwise prefer an available copy matching the browser language. File access
  and launch always apply to that selection. Missing sources use the primary
  file-location action. The details panel omits filenames, auxiliary file-management
  links, save-folder hints, and legacy-save controls. Generic presentation uses the
  genre as its heading label and omits release metadata when the year is unknown.
  Catalog details use the same save-aware launch buttons as the hero. Imported
  versions use a deterministic SHA-256 source-ID save folder passed through
  ScummVM’s `--savepath`; Continue looks only inside that version’s folder and
  retains the supported-engine filename rules in `browser-saves.mjs`. Other engines
  load saves through their in-game menu. Older shared saves remain stored without
  an exposed legacy launch control. Removing a version leaves its browser saves
  untouched; a reimport with a new source ID does not automatically reconnect them.
  Details use a native modal dialog for focus containment and Escape
  dismissal, restore focus to the opener, and prevent background scrolling.
  The library's sliders icon opens the sorting and genre controls. The button
  has an accessible label and no visible text. It sorts the
  combined catalog and saved-source cards by name, release year, genre, or
  studio, with name order as the default. Release years come from presentation
  metadata; unknown years sort last. Genre selection updates immediately and
  remains active when the controls are collapsed. Select All genres to remove
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
  presentation metadata remains available in game details and heroes. Keep
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
intact. Drop the output folder or individual ZIPs into the ScummWEB library.

The packager stores the members of large ZIPs without compression. ScummWEB
reads those games and large unpacked folders directly from disk in small
blocks instead of loading every file into memory. Local imports support up to
4 GiB; ZIPs over 128 MiB or over 256 MiB unpacked must use the store method.
Hosted ZIPs retain the separate download and unpacking limits.

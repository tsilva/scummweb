# Maintaining ScummWEB

## Playing and importing games

Select a library card to view screenshots, metadata, game notices, and launch
options. Recognized platform, language, and edition variants share a card;
choose **Version** in its details to select a copy. ScummWEB remembers your
selection and keeps demos separate from full games. Each imported version has
separate browser saves. Supported engines offer **Continue** and **Start from
beginning**; others load progress through their in-game menu. Older shared saves
remain stored in the browser.
During ZIP downloads, the launch status shows `Downloading game ZIP (42%)…`
when the host provides a valid `Content-Length`; otherwise it keeps the download
status without a percentage until the download completes.
After successful extraction, catalog and remote game ZIPs are saved in a
browser cache. Repeat launches of the exact same URL (including its query
parameters) show `Opening cached game ZIP…` and unpack it locally, without a ZIP
request or remote inspection. Up to four archives are retained; adding a fifth removes
the oldest stored archive. Saves are separate and are not removed by this limit.
The cache is best effort: browsers may evict it, private sessions clear it when
they end, and blocked or full storage leaves ordinary downloads working.
To fetch a replacement ZIP published at the same URL, clear this site's cached
data or use a new URL, such as a version query parameter.

The **Recently Played** strip shows only games you have launched, newest first,
including imported ZIPs. Different editions of a title share one card, and
selecting it opens the same version chooser as the library. Removed imports
disappear from the strip. The strip stays hidden until there is play history.

The sliders icon beside **Game Library** opens sorting by name, release year,
genre, or studio and genre filtering for both public and imported games. Select
**All genres** to remove the filter or **Name: A–Z** to restore alphabetical order.
The top-bar checklist opens **Game compatibility**, with search and filters for
checked editions, warnings, failures, and untested games. See
[game testing](game-testing.md) for the same results and their limitations.

Select the **Add a game** card in the library to choose ZIPs, or drop one or
more ZIP files containing ScummVM games onto the homepage or a game's page.
The add card remains available when filtering the library.
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
Only bundled games have public `/<game-slug>/play` routes; import-only games use
the local player after import. Adding recognition metadata automatically adds
its landing page and sitemap entry on the next build.

The navigation and footer link to `/compatibility`, which includes ordinary links
to every recognized game page in its initial HTML. Edition-specific checks match
game pages by engine identity, with demos separate from full games. Recognized
games without a matching result appear as **Not yet tested**. The page shares
search, status filters, and result presentation with the checklist modal, and
the compatibility page itself is included in the sitemap.

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

`prepare` generates 320px and 640px WebP poster variants under
`scummvm-shell/launcher/responsive/` before staging the managed shell. The
generator retains each original, skips upscaling and larger encodings, and
records actual dimensions in `data/artwork-renditions.json`. Browser selection
preserves the existing cover crop and falls back to the full original for
larger displays or unknown/remote artwork. Derivatives inherit their original's
artwork provenance. Headline fitting also runs before first paint, then remains
active for slideshow and viewport changes.
Offscreen poster contents use native rendering containment with the existing
card height reserved. They remain searchable and available to assistive
technology; focused cards render normally so their focus outlines stay visible.

See [Production delivery](production-delivery.md) for deployments, secret
rotation, and manual game publishing. The sibling AgentSCUMM repository owns
agent gameplay experiments.

## Maintaining game compatibility

[`data/game-compatibility.json`](../data/game-compatibility.json) is the canonical
compatibility list (schema version 4). The top-bar modal reads its flat `entries`
list directly. Each entry has a title, ScummVM `gameId`, and a `status`:
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

The browser favicon is a green **SW** monogram with a charcoal outline, inspired
by the [ScummVM favicon](https://www.scummvm.org/favicon-32x32.png). Its editable
source is [`image-assets/sources/favicon-source.svg`](../image-assets/sources/favicon-source.svg).
Run `node scripts/generate-favicon-assets.mjs` after editing it to regenerate the
SVG, 16/32/48px PNGs, and ICO in the branding, managed shell, and staged public
directories. Browser tabs use this monogram; install icons retain the Adventure
Terminal artwork.

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
  unavailable. Different editions can point to the same files.
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
  slideshow backdrop. Imported slides use the same Play and reconnect actions
  as their library cards.
  Player exits return to `/#slide=<encoded group key>`, selecting the played
  game's family in the homepage slideshow. Imported selections resolve when
  saved sources finish loading. Unknown selections fall back to the first slide;
  direct ZIP launches without library metadata return to the homepage.
  Game landing pages remain the canonical pages for game information and sharing.
  Slideshow arrows restart the eight-second countdown while preserving the
  current play/pause setting. Hover and focus pause rotation over hero content,
  while the slideshow controls let it continue. Hidden tabs suspend rotation,
  and reduced-motion preferences disable automatic rotation until resumed.
  The hero preloads and decodes the next three backdrops and one previous
  backdrop, wrapping around at either end. `HERO_PRELOAD_AHEAD` in
  `app/home-shell/hero-images.mjs` controls the forward window. Preloads use
  the visible hero's responsive sources and sizes with low fetch priority,
  share identical artwork, and retain image references only for the current
  window. A failed preload does not prevent slideshow navigation.
  Saved sources are checked on library load, window focus, tab return, and
  restoration from the browser's back/forward cache. Local checks use saved
  handles with existing read permission; they do not request permission or
  download game contents. Missing ZIP files retain their library entries
  and show a missing-file badge. Permission failures use an explicit
  `Allow file access` action with explanatory text in game details and the hero,
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
intact. Select the output ZIP files and drop them into the ScummWEB library.

The packager stores the members of large ZIPs without compression. ScummWEB
reads those ZIPs directly from disk in small blocks instead of loading every
file into memory. Local imports support up to 4 GiB; ZIPs over 128 MiB or over 256 MiB unpacked must use the store method.
Hosted ZIPs retain the separate download and unpacking limits.

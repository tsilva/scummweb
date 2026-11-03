<p align="center">
  <img src="scummvm-shell/logo-nav.png" alt="ScummWEB" width="320" />
  <br />
  <!-- repo-tagline:start -->
  <strong>🕹️ Classic point-and-click adventures, playable instantly in your browser 🕹️</strong>
  <!-- repo-tagline:end -->
</p>

[Live Demo](https://scummweb.tsilva.eu)

ScummWEB is a Next.js launcher for a curated ScummVM WebAssembly game collection. It builds static catalog pages, game detail pages, metadata routes, and a browser player that embeds the managed ScummVM shell.

The app keeps the deployable shell in this repo, while large game payloads are uploaded separately and fetched directly from a bucket origin in production. Agent interaction and gameplay experiments belong to [AgentSCUMM](https://github.com/tsilva/agentscumm); ScummWEB supplies the browser game runtime.

## Install

```bash
git clone https://github.com/tsilva/scummweb.git
cd scummweb
pnpm install
pnpm run dev --port auto
```

Open the URL printed by the server.

On the homepage, use **Play a local ZIP** to drop or choose an archive containing
one ScummVM game. The browser unpacks it and launches the first game it detects.
Put the game files at the root of the ZIP or inside a single enclosing folder.
Archives can be up to 128 MiB compressed and 256 MiB unpacked. The game files
stay in browser memory until you close the player or leave the page.

Open **Settings** using the gear icon in the top-right bar to connect a public
HTTPS R2 or S3 bucket. Upload one game per ZIP at the bucket root using the
exact names in the filename glossary. Allow cross-origin `HEAD` and `GET` requests
from your ScummWEB site. Select **Check bucket**, then **Use this bucket** to save
the URL and matches in this browser. The Library restores bucket cards from those
saved matches when you return. Recheck the bucket after adding or removing ZIPs.

Click a matched Library card to download its ZIP directly from the bucket and
play it with the same size limits as local ZIPs. Connecting the official
ScummWEB bucket shows the games in its existing index and keeps the standard
Library cards and player. For the English DOS EGA demo of The Secret of Monkey
Island, upload the [ScummVM demo](https://www.scummvm.org/demos/) as `monkey-demo.zip`.

## Commands

```bash
pnpm run dev             # validate/sync scummvm-shell/ into public/ and start Next.js
pnpm run build           # prepare managed shell assets and build production output
pnpm run start           # prepare managed shell assets and start the production server
pnpm run lint            # check JavaScript and JSX syntax with Next.js SWC
pnpm run test            # run the Node test suite
pnpm run verify          # build, serve, and boot detected targets through Chromium
pnpm run build:scummvm   # rebuild the ScummVM WebAssembly shell and game metadata
pnpm run publish:games   # upload dist/games payloads to Cloudflare R2
pnpm run record:preview  # stream distinct preview frames as a local MPEG-TS feed
pnpm run sentry:issues   # list recent Sentry issues from local env credentials
```

## Notes

- Local builds skip Sentry source-map uploads. Hosted Vercel builds handle uploads.
- Use `pnpm`; `package.json` rejects other package managers during install.
- `scummvm-shell/` is the tracked source of truth for managed ScummVM shell assets.
- `public/` is generated staging. Do not hand-edit staged shell files when the source lives in `scummvm-shell/`.
- Game hero banners live in `scummvm-shell/launcher/`. The current banners use ImageGen-restored promotional art; the gameplay screenshot galleries keep their original captures.
- The playable baseline is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- For games that support loading a save at launch, **Continue** opens the most recent save in this browser. **Start from beginning** opens a fresh session. Nippon Safes and Broken Sword 2.5 load saves from their in-game menus.
- Production game payloads are served from `SCUMMVM_GAMES_ORIGIN`; localhost can use `/games-proxy/*` for verification.
- `pnpm run verify` runs `scripts/verify_scummvm_web.sh` and needs a local Chrome or Chromium install.
- `pnpm run build:scummvm` clones or reuses `vendor/scummvm` at ScummVM `v2.9.1`, applies local patches, regenerates `dist/`, and syncs the shell back into `scummvm-shell/`.
- For an engine or shell rebuild using the existing catalog, run `SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm`. This preserves the tracked game list and skips preparing game payloads and detecting the catalog.
- Catalog games and local ZIPs share the ScummVM WebAssembly runtime. The runtime uses the catalog target or detects the game from the local files, then loads the matching engine from `data/plugins/`. The homepage loads the ZIP decoder when you choose a file.
- The build includes detection for the bundled engines. Engine plugins are staged alongside the runtime with the managed shell assets. Keep them together when rebuilding or deploying so the runtime and its plugins come from the same build.
- `pnpm run publish:games` loads only `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from the pinned ScummWeb Infisical Development vault using the existing human CLI login. It replaces inherited AWS credentials, blocks dotenv fallback, and pins the `scummvm-games` bucket and account endpoint. No credential export or `.env` edit is needed. Build the game payloads first, or set `SCUMMVM_GAMES_UPLOAD_DIR` to their directory.
- Publishing accepts `--game <target-or-folder>`, `--force`, and `--prune`. `--force` overwrites files; scoped uploads also refresh ancestor manifests. `--prune` deletes remote files absent locally and spans the whole bucket without `--game`. Use these flags deliberately. Website builds/deployments and existing public game delivery do not need this publishing credential.
- Sentry is optional. Runtime capture uses `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENABLED`, and the Sentry project settings in `next.config.js`.
- `NEXT_PUBLIC_SITE_URL` controls public metadata, sitemap, robots, and Open Graph URLs.
- The homepage hero rotates through the installed games. The ring around the pause control shows how long until the next game. Pausing freezes the countdown. Use the chevrons to choose a game. The Play button launches the game shown in the hero.
- The library’s poster cards link to each game’s detail page. Browser-Playable Classics cards open quick-play dialogs. The sitemap lists the homepage and game detail pages. The player routes and standalone emulator send noindex directives.

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
Local ZIP and external bucket launches are outside this catalog funnel.

In GA4 Explorations, build a closed funnel from `game_launch_attempt` to
`game_launch` to `game_play_milestone` to compare users at each step. For
counts by play page visit, report **Event count** by event name. Use
**Page path** to focus on a game and **Session source / medium** to break down
acquisition. Analyze `game_launch_failed` separately. To report on the custom fields, register
`game_slug`, `entry_point`, `launch_mode`, and `failure_reason` as event-scoped
custom dimensions and `load_time_ms` as a custom metric.

## Architecture

![ScummWEB architecture diagram](./architecture.png)

## License

No repository-level license file is currently included.

`pnpm sentry:issues -- --help` uses the managed development token. Private tokens in local Sentry env files are ignored.

Production delivery runs on pushes to `main` and supports manual secret rotations. See [production delivery](docs/production-delivery.md) for destinations, access boundaries and failure behavior.

Production secrets are delivered through the pinned shared GitHub Actions workflow. The standalone signed Infisical relay triggers synchronization and deployment; see [production delivery](docs/production-delivery.md) for scope and recovery.

Production delivery keeps Vercel secret isolation enabled and distinguishes public configuration from private credentials; see [production delivery](docs/production-delivery.md).

<p align="center">
  <img src="scummvm-shell/logo-nav.png" alt="ScummWEB" width="320" />
  <br />
  <!-- repo-tagline:start -->
  <strong>🕹️ Classic point-and-click adventures, playable instantly in your browser 🕹️</strong>
  <!-- repo-tagline:end -->
</p>

[Live Demo](https://scummweb.tsilva.eu)

ScummWEB is a Next.js launcher for a curated ScummVM WebAssembly game collection. It builds static catalog pages, game detail pages, metadata routes, and a browser player that embeds the managed ScummVM shell.

The app keeps the deployable shell in this repo, while large game payloads are uploaded separately and fetched directly from a bucket origin in production.

## Install

```bash
git clone https://github.com/tsilva/scummweb.git
cd scummweb
pnpm install
pnpm run dev --port auto
```

Open the URL printed by the server.

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
- The playable baseline is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- Production game payloads are served from `SCUMMVM_GAMES_ORIGIN`; localhost can use `/games-proxy/*` for verification.
- `pnpm run verify` runs `scripts/verify_scummvm_web.sh` and needs a local Chrome or Chromium install.
- `pnpm run build:scummvm` clones or reuses `vendor/scummvm` at ScummVM `v2.9.1`, applies local patches, regenerates `dist/`, and syncs the shell back into `scummvm-shell/`.
- R2 uploads require `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and the `SCUMMVM_R2_*` settings used by `scripts/upload_games_to_r2.py`.
- Sentry is optional. Runtime capture uses `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENABLED`, and the Sentry project settings in `next.config.js`.
- `NEXT_PUBLIC_SITE_URL` controls public metadata, sitemap, robots, and Open Graph URLs.
- The library links to each game’s detail page and keeps quick play in the card dialogs. The sitemap lists the homepage and game detail pages. The player routes and standalone emulator send noindex directives.

## Game launch analytics

On `scummweb.tsilva.eu`, GA4 tracks the following events for catalog games,
at most once per play page visit for each event.

| Event | When it fires |
| --- | --- |
| `game_launch_attempt` | The play page starts loading the game. |
| `game_launch` | ScummVM confirms the first rendered game frame. `load_time_ms` measures time since the attempt began. |
| `game_launch_failed` | The player observes a startup error or ScummVM reports a first-frame timeout before success. `failure_reason` is `startup_error` or `first_frame_timeout`. |
| `game_play_milestone` | The ready player accumulates five minutes in the visible tab with the game controls available. `play_time_seconds` is `300`. |

The events share `game_slug`, `entry_point` (`hero`, `library`, `game_detail`, or
`direct`), and `launch_mode`. The current catalog UI starts fresh. Intro skips stay
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

Production delivery keeps Vercel secret isolation enabled and distinguishes public configuration from private credentials; see [production delivery](docs/production-delivery.md).

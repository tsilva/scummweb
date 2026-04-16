<p align="center">
  <img alt="ScummWEB" src="scummvm-shell/logo-nav.png" width="320">
</p>

<p align="center">
  <a href="https://scummweb.tsilva.eu">Live Demo</a> &middot;
  <a href="https://github.com/tsilva/scummweb">GitHub</a> &middot;
  <a href="https://www.scummvm.org/">ScummVM</a>
</p>

<p align="center">
  <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-black">
  <img alt="React 18" src="https://img.shields.io/badge/React-18-149eca">
  <img alt="ScummVM 2.9.1" src="https://img.shields.io/badge/ScummVM-2.9.1-1a4d1a">
  <img alt="pnpm 10" src="https://img.shields.io/badge/pnpm-10-f69220">
</p>

**🕹️ Classic point-and-click adventures, playable instantly in your browser 🕹️**

## Overview

### The Punchline

ScummWEB turns a curated ScummVM collection into static game pages with one-click browser play. The live app highlights each title with poster art, screenshots, metadata, Open Graph cards, and a dedicated `/play` route that embeds the ScummVM runtime.

### The Pain

ScummVM WebAssembly builds are useful but awkward to ship as a polished web product. The runtime shell, launcher metadata, game archives, generated filesystem indexes, R2 payload uploads, and verification path all have to stay in sync.

### The Solution

This repo separates the managed browser shell from the game payloads. `scummvm-shell/` is tracked as the source of truth for deployable runtime assets, `public/` is generated staging for Next.js, and the large game files are uploaded separately to R2 so production browsers fetch them directly.

### The Result

The site can ship as a lightweight Next.js app while still launching a real ScummVM runtime in the browser. Local development gets a `/games-proxy/*` fallback for verification, while production uses the configured games origin directly.

## At A Glance

| Fact | Current value |
| --- | --- |
| Live site | <https://scummweb.tsilva.eu> |
| Built-in catalog | 7 freeware adventure targets |
| Featured baseline | Beneath a Steel Sky from `downloads/bass-cd-1.2.zip` |
| Runtime shell | ScummVM `v2.9.1` WebAssembly shell |
| Main verification | `pnpm run verify` boots detected targets through Chromium |

## Features

- **Instant browser play:** Launches configured ScummVM targets from `/[gameSlug]/play` with the correct hash and return route.
- **Curated adventure library:** Ships metadata and presentation art for Beneath a Steel Sky, DreamWeb, Flight of the Amazon Queen, Lure of the Temptress, Drascula, Nippon Safes, and Broken Sword 2.5.
- **Managed ScummVM shell:** Validates and stages `scummvm.html`, `scummvm.js`, `scummvm.wasm`, `scummvm_fs.js`, data files, docs, manifest assets, and launcher art from `scummvm-shell/`.
- **Remote game payloads:** Patches the ScummVM filesystem layer so production game data comes from `SCUMMVM_GAMES_ORIGIN` instead of being proxied through the app server.
- **Skip-intro support:** Includes save-slot based intro skipping for supported targets, with matching launcher assets under `scummvm-shell/launcher/skip-intro/`.
- **Game-friendly player controls:** Provides exit, fullscreen, ScummVM menu, mobile landscape, touch cursor, and touch click affordances around the embedded runtime.
- **SEO-ready catalog pages:** Generates static game pages, canonical metadata, per-game Open Graph images, sitemap entries, robots output, and JSON-LD.
- **Operational tooling:** Includes scripts for rebuilding the WebAssembly shell, normalizing archives, generating metadata, uploading R2 payloads, recording previews, querying Sentry, and browser verification.

## Quick Start

### Play Online

Open the live launcher:

```text
https://scummweb.tsilva.eu
```

Choose a game from the library, open its detail view, and press Play. Recent plays are stored in browser local storage and float to the front of the rail on later visits.

### Local Development

Use pnpm from the repo root:

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` runs `pnpm run prepare` first. That validates the managed shell in `scummvm-shell/`, syncs it into `public/`, validates the staged copy, then starts Next.js.

Open the local app:

```text
http://localhost:3000
```

### Build And Start

```bash
pnpm run build
pnpm run start
```

Both commands run the same managed-shell preparation step before invoking Next.js.

### Fast Checks

```bash
pnpm run test
```

The Node test suite covers catalog routing, managed asset validation, shell normalization, SEO metadata, preview recording, skip-intro config, and ScummVM play harness helpers.

## Usage

### Player Controls

| Control | Behavior |
| --- | --- |
| Exit | Leaves the iframe and returns to the game detail page or home route |
| Fullscreen | Enters or exits fullscreen when the browser allows it |
| ScummVM menu | Sends the ScummVM menu key sequence for engines that expose the menu safely |
| Skip intro | Reloads supported games from the configured save slot |
| Mobile overlay | Requests landscape orientation and the tap needed for mobile fullscreen |
| Touch buttons | Sends left and right click events for mobile play |

### Catalog Routes

| Route | Purpose |
| --- | --- |
| `/` | Static launcher homepage with the full game catalog |
| `/[gameSlug]` | Static game detail page with art, metadata, screenshots, and launch action |
| `/[gameSlug]/play` | Non-indexed browser player route for the selected ScummVM target |
| `/games-proxy/*` | Localhost fallback proxy to the games origin for verification |
| `/api/sentry-smoke` | Token-protected intentional Sentry smoke-test endpoint |

## Game Catalog

The runtime catalog lives in `scummvm-shell/games.json` and is staged to `public/games.json` during preparation. The current targets are:

| Target | Title | Engine | Intro skip |
| --- | --- | --- | --- |
| `dreamweb-cd` | DreamWeb | `dreamweb` | yes |
| `drascula` | Drascula: The Vampire Strikes Back | `drascula` | yes |
| `lure` | Lure of the Temptress | `lure` | yes |
| `nippon-amiga` | Nippon Safes, Inc. | `parallaction` | no |
| `queen` | Flight of the Amazon Queen | `queen` | yes |
| `sky` | Beneath a Steel Sky | `sky` | yes |
| `sword25` | Broken Sword 2.5 | `sword25` | no |

The metadata contract is:

```json
{
  "primaryTarget": "dreamweb-cd",
  "games": []
}
```

`game.json` is intentionally not part of the runtime contract.

## Rebuild The ScummVM Shell

Use this when launcher assets, generated ScummVM shell files, runtime patches, or game archive inputs need to change:

```bash
pnpm run build:scummvm
```

The build script:

1. Clones or reuses `vendor/scummvm` at ScummVM `v2.9.1`.
2. Bootstraps the Emscripten SDK and codec libraries.
3. Applies local engine and runtime patches.
4. Extracts detected game archives from `downloads/`.
5. Regenerates `games.json`, `source-info.json`, filesystem indexes, launcher pages, and patched runtime files.
6. Writes disposable output to `dist/`.
7. Syncs the managed shell back into `scummvm-shell/`.

The required playable baseline is `downloads/bass-cd-1.2.zip`. Optional freeware archives can be added to `downloads/` and will be detected during the build.

## Upload Game Payloads

After a shell rebuild, upload the generated game payloads to R2:

```bash
pnpm run publish:games
```

Scoped uploads are supported:

```bash
python3 ./scripts/upload_games_to_r2.py --game queen
python3 ./scripts/upload_games_to_r2.py --game lure
python3 ./scripts/upload_games_to_r2.py --game drascula
```

By default the uploader skips remote objects that already exist. Use `--force` to overwrite and `--prune` to remove remote objects outside the local upload scope.

## Verification

Run unit-level checks first:

```bash
pnpm run test
```

Run the full browser launch verification when Chrome or Chromium and the ScummVM Emscripten toolchain are available locally:

```bash
pnpm run verify
```

`scripts/verify_scummvm_web.sh` builds the app, starts a local Next.js server on an open port, launches Chromium through Playwright, verifies the launcher, and boots each detected target. The final launch screenshot is written to `artifacts/verify-launch.png`.

## Sentry Utilities

Runtime Sentry initialization is centralized in `sentry.runtime.config.js`. Browser capture uses `NEXT_PUBLIC_SENTRY_DSN`, while server and edge capture use `SENTRY_DSN` or fall back to the browser DSN.

Query recent issues with:

```bash
pnpm run sentry:issues -- --days 7 --limit 5
```

The issue script reads `.env` by default and falls back to `.env.sentry-mcp` for older local setups. A live smoke test can be triggered with a `POST` to `/api/sentry-smoke` using the `x-sentry-smoke-token` header; the route captures a tagged exception and returns the generated `eventId`.

## Project Structure

| Path | Role |
| --- | --- |
| `app/` | Next.js App Router pages, player shell, SEO routes, proxy route, and UI styling |
| `lib/` | Shared catalog, SEO, site config, and managed asset contracts |
| `scripts/` | Build, patching, normalization, upload, verification, Sentry, and preview tooling |
| `scummvm-shell/` | Tracked managed ScummVM WebAssembly shell and launcher assets |
| `public/` | Generated staging copy used by Next.js during local dev and build |
| `test/` | Node test suite for catalog, shell assets, SEO, harnesses, and scripts |
| `downloads/` | Local input archives for shell rebuilds; not the production delivery path |
| `dist/` | Disposable ScummVM build output and game payload upload source |
| `vendor/` | Disposable ScummVM checkout and Emscripten toolchain |

## Environment

Copy `.env.example` when local credentials are needed:

```bash
cp .env.example .env
```

| Variable | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Required for R2 uploads |
| `AWS_SECRET_ACCESS_KEY` | Required for R2 uploads |
| `SCUMMVM_R2_BUCKET` | Optional R2 bucket override; defaults to `scummvm-games` |
| `SCUMMVM_R2_ENDPOINT` | Optional R2 endpoint override |
| `SCUMMVM_R2_CACHE_CONTROL` | Optional cache header for uploaded payload files |
| `SCUMMVM_R2_INDEX_CACHE_CONTROL` | Optional cache header for uploaded index manifests |
| `SCUMMVM_GAMES_ORIGIN` | Production games origin used by runtime filesystem mounts |
| `SCUMMVM_GAMES_UPLOAD_DIR` | Optional upload source; defaults to `dist/games/` |
| `SCUMMVM_ASSET_VERSION` | Optional asset cache key override |
| `EMSDK_VERSION` | Optional Emscripten SDK version override |
| `NEXT_PUBLIC_SITE_URL` | Public site URL for metadata, sitemap, robots, and Open Graph URLs |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser runtime DSN |
| `NEXT_PUBLIC_SENTRY_ENABLED` | Optional local override for browser Sentry capture |
| `SENTRY_DSN` | Server and edge runtime DSN; falls back to `NEXT_PUBLIC_SENTRY_DSN` |
| `SENTRY_AUTH_TOKEN` | Sentry source map upload and issue query token |
| `SENTRY_ORG` | Sentry organization; defaults to `tsilva` where supported |
| `SENTRY_PROJECT` | Sentry project; defaults to `scummweb` where supported |
| `SENTRY_BASE_URL` | Optional Sentry API base URL |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional tracing sample-rate override |
| `SENTRY_ENVIRONMENT` | Optional explicit Sentry environment name |
| `SENTRY_SMOKE_TEST_TOKEN` | Secret header token for `/api/sentry-smoke` |

`BUCKET_DSN` and `BUCKET_URL` are kept in `.env.example` for local compatibility, but the current upload script uses the `SCUMMVM_R2_*` and AWS credential variables above.

## Tech Stack

- [Next.js](https://nextjs.org/) for the static launcher, game routes, metadata routes, proxy fallback, and production build.
- [React](https://react.dev/) for the launcher UI, game player controls, recent-play ordering, and mobile overlays.
- [ScummVM](https://www.scummvm.org/) for the WebAssembly runtime that actually boots the adventure games.
- [Cloudflare R2](https://developers.cloudflare.com/r2/) for direct browser delivery of large game payloads.
- [Playwright](https://playwright.dev/) for headless browser launch verification.
- [Sentry](https://sentry.io/) for optional runtime capture, release artifacts, issue queries, and smoke testing.
- [pnpm](https://pnpm.io/) for package management; the repo rejects non-pnpm installs.

## Operational Notes

- `scummvm-shell/` is tracked and deployable. Treat it as the source of truth for managed shell assets.
- `public/` is generated staging. Do not hand-edit staged shell files when the corresponding source lives in `scummvm-shell/`.
- Game payloads should be accessed through the bucket origin in production, not proxied through the app server.
- `/games-proxy/*` exists for localhost verification and forwards range/cache headers to the configured games origin.
- `source-info.json` records the project and vendored ScummVM revisions used to build the current shell.
- Production and preview builds need hosted environment variables for Sentry release uploads and runtime capture.
- The root layout loads Google Analytics with `G-60XHS2QKX7`.
- Deployments only need the managed shell assets; large game payloads stay in R2.

## Support

Open an issue or pull request on [GitHub](https://github.com/tsilva/scummweb) if you find a broken launcher asset, bad game metadata, or a runtime regression. A small repro with the target name, browser, and route is enough to start.

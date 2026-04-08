# scummweb

Browser launcher for a managed ScummVM WebAssembly shell with game payloads hosted separately in Cloudflare R2.

This repo treats the ScummVM shell and game payloads as two different products:

- `scummvm-shell/` is the tracked source of truth for the managed browser shell.
- `public/` is generated staging for those managed shell assets during `prepare`.
- `dist/` is disposable build output.
- Game payloads live in R2 and should be fetched directly by the browser in production.

## Workflow

### 1. Local Dev

```bash
pnpm install
pnpm run dev
```

`pnpm run prepare` validates the tracked managed ScummVM shell in `scummvm-shell/`, stages it into `public/`, and validates the staged output.

Open [http://localhost:3000](http://localhost:3000).

### 2. Rebuild The ScummVM Shell

```bash
pnpm run build:scummvm
```

`pnpm run build:scummvm` does the full shell rebuild:

1. Clones or reuses `vendor/scummvm`
2. Bootstraps emsdk and codec libs
3. Builds the ScummVM web target
4. Extracts detected game archives into `build-emscripten/games`
5. Regenerates `games.json`, `source-info.json`, launcher assets, and patched runtime files
6. Syncs the managed shell back into `scummvm-shell/`

### 3. Upload Game Payloads

```bash
pnpm run publish:games
```

That uploads `dist/games/` to the configured Cloudflare R2 bucket. Scoped upload examples:

```bash
python3 ./scripts/upload_games_to_r2.py --game queen
python3 ./scripts/upload_games_to_r2.py --game lure
python3 ./scripts/upload_games_to_r2.py --game drascula
```

## Verification

Run the main verification path:

```bash
pnpm run verify
```

`scripts/verify_scummvm_web.sh` validates that `scummvm-shell/` exists, builds the app, launches Chromium through Playwright, verifies the launcher, and boots each detected target.

## Generated Files Policy

Tracked source inputs:

- `app/`
- `scummvm-shell/`
- `scripts/`
- `launcher-game-overrides.json`
- config and docs

Disposable generated state:

- `dist/`
- `vendor/`
- `.next/`
- `.next-dev-*`
- `artifacts/`

`scummvm-shell/` is tracked and deployable. `public/` is generated staging. Prefer regenerating managed shell files through the build scripts instead of hand-editing the staged `public/` copy, then commit the resulting `scummvm-shell/` changes directly.

## Metadata Contract

The generated launcher library lives in `scummvm-shell/games.json`, `public/games.json`, and `dist/games.json` with this shape:

```json
{
  "primaryTarget": "sky",
  "games": []
}
```

`game.json` is no longer part of the runtime contract.

## Runtime Notes

- Production game delivery should use `SCUMMVM_GAMES_ORIGIN` directly.
- `/games-proxy/*` exists only as a localhost fallback for verification and should not be treated as the production path.
- `source-info.json` records the project and vendored ScummVM revisions used to build the current shell.

## Commands

```bash
pnpm run prepare
pnpm run build:scummvm
pnpm run publish:games
pnpm run verify
pnpm run sentry:issues -- --help
```

## Environment

| Variable | Purpose |
| --- | --- |
| `EMSDK_VERSION` | Override the emsdk version used by the ScummVM web build |
| `AWS_ACCESS_KEY_ID` | R2 upload credential |
| `AWS_SECRET_ACCESS_KEY` | R2 upload credential |
| `SCUMMVM_R2_BUCKET` | Override the default R2 bucket name |
| `SCUMMVM_R2_ENDPOINT` | Override the default R2 endpoint |
| `SCUMMVM_GAMES_ORIGIN` | Override the production games origin used by generated metadata and runtime mounts |
| `SCUMMVM_GAMES_UPLOAD_DIR` | Override the upload source directory; defaults to `dist/games/` |
| `NEXT_PUBLIC_SITE_URL` | Override the production site URL used for metadata, sitemap, and robots |
| `NEXT_PUBLIC_SENTRY_ENABLED` | Optional override to force Sentry on or off locally (`true` or `false`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser runtime DSN; required in production for client-side event capture |
| `SENTRY_DSN` | Optional server and edge runtime DSN; falls back to `NEXT_PUBLIC_SENTRY_DSN` when unset |
| `SENTRY_AUTH_TOKEN` | Build-time auth token used for Sentry release creation and source map upload |
| `SENTRY_ORG` | Optional override for the Sentry organization; defaults to `tsilva` |
| `SENTRY_PROJECT` | Optional override for the Sentry project; defaults to `scummweb` |
| `SENTRY_BASE_URL` | Optional base URL for Sentry API tooling; defaults to `https://sentry.io` |
| `SENTRY_TRACES_SAMPLE_RATE` | Optional tracing sample rate override; defaults to `0.1` |
| `SENTRY_ENVIRONMENT` | Optional explicit Sentry environment name |
| `SENTRY_SMOKE_TEST_TOKEN` | Secret header token used by `/api/sentry-smoke` for intentional live verification |

## Sentry

- Runtime Sentry init is centralized in `sentry.runtime.config.js`.
- Runtime event capture stays off unless the relevant runtime DSN is present; there is no hardcoded DSN fallback.
- Local defaults live in `.env`, with `.env.example` as the committed template.
- Production and preview builds need hosted Vercel env vars for `SENTRY_AUTH_TOKEN`, `SENTRY_DSN`, and `NEXT_PUBLIC_SENTRY_DSN`.
- Issue queries use `.env` by default, and still fall back to `.env.sentry-mcp` for older local setups:

```bash
pnpm run sentry:issues -- --days 7 --limit 5
```

- A live smoke test can be triggered with a `POST` to `/api/sentry-smoke` using the `x-sentry-smoke-token` header. The route captures a tagged Sentry event and returns `200` with the generated `eventId`.

## Notes

- The required playable baseline is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`.
- Optional freeware archives can be added in `downloads/` and will be detected during `pnpm run build:scummvm`.
- Deployments only need the shell assets; the large game payloads stay in R2.

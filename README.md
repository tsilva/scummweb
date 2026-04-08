# scummweb

Browser launcher for a managed ScummVM WebAssembly shell with game payloads hosted separately in Cloudflare R2.

This repo treats the ScummVM shell and game payloads as two different products:

- `bundle/scummvm-public.zip` is the source of truth for the managed browser shell.
- `public/` is a disposable restored workspace, not a hand-edited source directory.
- `dist/` is disposable build output.
- Game payloads live in R2 and should be fetched directly by the browser in production.

## Workflow

### 1. Local Dev

```bash
pnpm install
pnpm run prepare
pnpm run dev
```

`pnpm run prepare` restores the managed ScummVM shell from `bundle/scummvm-public.zip` into `public/`.

Open [http://localhost:3000](http://localhost:3000).

### 2. Rebuild The ScummVM Shell

```bash
pnpm run build:bundle
pnpm run archive:bundle
```

`pnpm run build:bundle` does the full shell rebuild:

1. Clones or reuses `vendor/scummvm`
2. Bootstraps emsdk and codec libs
3. Builds the ScummVM web target
4. Extracts detected game archives into `build-emscripten/games`
5. Regenerates `games.json`, `source-info.json`, launcher assets, and patched runtime files
6. Syncs the managed shell back into `public/`

`pnpm run archive:bundle` refreshes `bundle/scummvm-public.zip` from the current managed shell in `public/`.

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

`scripts/verify_bass_web.sh` restores the bundle, builds the app, launches Chromium through Playwright, verifies the launcher, and boots each detected target.

## Generated Files Policy

Tracked source inputs:

- `app/`
- `scripts/`
- `bundle/scummvm-public.zip`
- `launcher-game-overrides.json`
- config and docs

Disposable generated state:

- `public/`
- `dist/`
- `vendor/`
- `.next/`
- `.next-dev-*`
- `artifacts/`

Do not hand-edit files restored into `public/`. Regenerate them through the build scripts and refresh the bundle archive instead.

## Metadata Contract

The generated launcher library lives in `public/games.json` and `dist/games.json` with this shape:

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
pnpm run build:bundle
pnpm run archive:bundle
pnpm run publish:games
pnpm run verify
pnpm run sentry:issues -- --help
```

Legacy aliases are still available:

```bash
pnpm run bundle:prepare
pnpm run bundle:build
pnpm run bundle:archive
pnpm run games:upload
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
| `SENTRY_TRACES_SAMPLE_RATE` | Optional tracing sample rate override; defaults to `0.1` |
| `SENTRY_ENVIRONMENT` | Optional explicit Sentry environment name |

## Sentry

- Runtime Sentry init is centralized in `sentry.runtime.config.js`.
- Runtime event capture stays off unless the relevant runtime DSN is present; there is no hardcoded DSN fallback.
- Production builds load `.env.sentry-build-plugin` so source map upload uses the ignored token file the repo already keeps locally.
- Issue queries use `.env.sentry-mcp` through:

```bash
pnpm run sentry:issues -- --days 7 --limit 5
```

- Use `.env.sentry-mcp.example` and `.env.sentry-build-plugin.example` as the committed templates.

## Notes

- The required playable baseline is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`.
- Optional freeware archives can be added in `downloads/` and will be detected during `pnpm run build:bundle`.
- Deployments only need the shell assets; the large game payloads stay in R2.

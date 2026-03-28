# scummvm-web

Run the Beneath a Steel Sky CD release in the browser with ScummVM's
upstream Emscripten target.

## What this repo does

- Fetches upstream ScummVM into `vendor/scummvm`
- Builds a browser-targeted ScummVM with only the `sky` engine enabled
- Unpacks the local `downloads/bass-cd-1.2.zip` payload into the web bundle
- Copies the built ScummVM assets into `public/` for Next.js static serving
- Exposes a small Next.js App Router shell at `/`
- Verifies launch with Playwright against the Next.js server

## Prerequisites

- macOS with `git`, `curl`, `python3`, `clang`, `make`, `unzip`
- `downloads/bass-cd-1.2.zip` in the repo

The build uses the Emscripten SDK bundled by ScummVM, so no global `node`,
`npm`, or `emcc` install is required.

## Build ScummVM Assets

```sh
./scripts/build_bass_web.sh
```

The generated deployable assets are written to `public/`.

## Run Next.js

```sh
./scripts/serve_dist.sh
```

Then open:

- `http://127.0.0.1:8000/`

## Verify

```sh
./scripts/verify_bass_web.sh
```

This builds and serves the Next.js app locally, then uses Playwright against it
and saves a screenshot to
`artifacts/verify-launch.png`.

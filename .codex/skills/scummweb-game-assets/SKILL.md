---
name: scummweb-game-assets
description: Use when working in the scummweb repo and the user asks to add, replace, refresh, or verify game artwork, cover art, posters, hero images, screenshots, or dashboard assets for one or more games. This skill covers sourcing appropriate online art, storing it locally, wiring it into the dashboard metadata, preserving the repo's managed ScummVM bundle workflow, and verifying the result with Playwright.
---

# scummweb Game Assets

## Overview

Use this skill for artwork changes in `scummweb`, especially requests like "add assets to game X", "replace the cover art", or "make the dashboard art better". The goal is to source good art online, store it locally in the repo, wire it into the UI correctly, and verify both the dashboard and launcher flow.

## Workflow

1. Confirm the current game targets in `public/games.json`.
2. Read `app/page.js` to see how `artByTarget` maps hero, landscape, poster, and spotlight assets.
3. Read `app/globals.css` before changing art behavior. Tone-specific background rules can accidentally override and hide the image layer.
4. Source art online. Prefer high-quality box fronts, poster art, or official/promotional art that crops well for the dashboard.
5. Store assets locally under `public/launcher/`. Do not hotlink remote URLs in the app.
6. Wire the selected local files into `app/page.js`.
7. Verify visually with Playwright and run the repo's launcher smoke test.
8. If launcher assets changed and should survive future bundle refreshes, refresh the archive with `npm run archive:scummvm-bundle`.

## Asset Sourcing Rules

- Prefer local repo assets over screenshots pulled at runtime.
- Prefer portrait cover art for:
  `posterImage`, `spotlightImage`, and often `landscapeImage` if no better wide art exists.
- Prefer wide, readable art for:
  `heroImage` when the game is likely to be featured.
- For `Beneath a Steel Sky`, the existing screenshot-based hero can be better than the sparse box cover. Use judgment.
- Good source types:
  LaunchBox Games DB, MobyGames cover scans, GOG metadata art, official publisher/developer pages.
- Avoid tiny scans unless there is no better option.
- Download to a temp location first, inspect dimensions, then resize into `public/launcher/`.

## Local File Conventions

- Put dashboard art in `public/launcher/`.
- Prefer names like:
  `public/launcher/<game>-cover.jpg`
- Keep file sizes reasonable. A practical default is:
  `sips -Z 1400 ... --out public/launcher/<name>.jpg`
- Check dimensions with:

```bash
sips -g pixelWidth -g pixelHeight public/launcher/<name>.jpg
```

## Wiring Rules

Update `artByTarget` in `app/page.js`.

- Use explicit fields when possible:
  `heroImage`, `landscapeImage`, `posterImage`, `spotlightImage`
- Keep `screenshots` only when those actual screenshots are still wanted.
- If a game lacks an `artByTarget` entry, add one.

`app/page.js` should use CSS custom properties for art layers. Keep the helper that sets:

- `--hero-art-image`
- `--card-art-image`
- `--poster-art-image`
- `--spotlight-art-image`

## CSS Pitfall

The `tone-dreamweb` and `tone-default` overrides in `app/globals.css` must keep the image layer in their `background` shorthand. If those overrides omit the image layer, the game silently falls back to gradients only.

When editing these sections:

- Keep the image layer present in tone-specific overrides.
- Keep per-layer `background-size` so the actual art layer stays `cover`.
- Re-check `.hero-backdrop`, `.landscape-card`, `.poster-media`, and `.spotlight-media`.

## Verification

Use the local Node install if `npm` is not on `PATH`:

```bash
export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"
```

Start the dev server:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Quick visual verification with Playwright:

```bash
node --input-type=module <<'EOF'
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = path.join(process.cwd(), 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
await page.locator('#library').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(outDir, 'dashboard-art-check.png'), fullPage: true });
await browser.close();
EOF
```

Launcher verification:

```bash
node scripts/verify_game_launch.mjs \
  http://127.0.0.1:3000/ \
  artifacts/verify-launch-art.png
```

## Repo-Specific Constraints

- `bundle/scummvm-public.zip` is the source of truth for managed scummweb assets.
- `npm run dev`, `npm run build`, and `npm run start` restore the bundle into `public/`.
- If launcher assets need to persist as part of the managed bundle, run:

```bash
npm run archive:scummvm-bundle
```

- Avoid deleting unrelated changes in `public/` and `bundle/`.
- Game payload assets are served from the bucket origin, not proxied through the app server.

## Expected Outcome

After completing the task:

- every intended dashboard card uses a real local asset URL
- the dashboard screenshot looks materially better than the gradient fallback state
- the launcher smoke test still passes

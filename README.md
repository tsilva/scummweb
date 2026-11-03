<p align="center">
  <img src="logo.png" alt="ScummWEB" width="240" />
  <br />
  <!-- repo-tagline:start -->
  <strong>🕹️ Play classic adventures in your browser 🖱️</strong>
  <!-- repo-tagline:end -->
</p>

<p align="center">
  <a href="https://github.com/tsilva/scummweb/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/tsilva/scummweb/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI on main" /></a>
  <a href="https://github.com/tsilva/scummweb/actions/workflows/production-delivery.yml?query=branch%3Amain"><img src="https://github.com/tsilva/scummweb/actions/workflows/production-delivery.yml/badge.svg?branch=main" alt="Production delivery on main" /></a>
  <a href="scummvm-shell/source-info.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftsilva%2Fscummweb%2Fmain%2Fscummvm-shell%2Fsource-info.json&amp;query=%24.scummvm.version&amp;label=ScummVM&amp;color=2e7d32" alt="Bundled ScummVM version" /></a>
  <a href=".github/workflows/ci.yml"><img src="https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&amp;logoColor=white" alt="Tested with Node.js 22" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/ScummWEB-0BSD-blue" alt="ScummWEB code license: 0BSD" /></a>
</p>

ScummWEB brings classic point-and-click games to your browser. It uses
ScummVM to run a library of free adventures and demos. You can also play
compatible games from your own collection.

## Play online

Start with [Beneath a Steel Sky](https://scummweb.tsilva.eu/beneath-a-steel-sky/play),
a freeware cyberpunk adventure. The player downloads and unpacks the game ZIP in your browser.
When the opening scene appears, you’re ready to play. For more games,
[browse the ScummWEB library](https://scummweb.tsilva.eu).
Game details link to each title’s bundled readme or license.

## Add your games

- **From your device** — Drop game ZIPs or folders anywhere on the homepage.
  ScummWEB looks for ZIPs in subfolders and treats a folder without ZIPs as
  one unpacked game. Files stay on your device. Use **Locate ZIP** or
  **Locate folder** if access is lost.
- **From a link** — Open
  `/local/play#zip=https%3A%2F%2Fexample.com%2Fgame.zip` on your ScummWEB site.
  URL-encode the direct HTTPS ZIP address. The browser downloads and unpacks
  the ZIP directly from its host, which must allow cross-origin GET requests
  from your ScummWEB site. If the host blocks access, download the ZIP
  yourself and drop it onto the homepage.

The drop overlay shows import progress and lists the added and skipped files
when the batch finishes.
Scroll inside the dialog to review a large batch. When processing finishes,
select **Confirm** to close it. The library then scrolls to the first new
poster. New posters briefly brighten and show color as they come into view.
To remove an imported game, hover over its poster and select the pink **×**
on the top-left edge. The button also appears when it receives keyboard focus and
stays visible on touch-only devices.

Put one game per ZIP, with its files at the root or in a single enclosing
folder. ZIPs can be up to 128 MiB compressed and 256 MiB unpacked. Select a
game's poster to play it. Use **Continue** where available, or load saves from
the game's menu.

## Run locally

Use Node.js 22 and pnpm 10.27.0.

```bash
git clone https://github.com/tsilva/scummweb.git
cd scummweb
pnpm install --frozen-lockfile
pnpm run dev:app --port auto
```

Open the URL printed by the server and select **Play Beneath a Steel Sky**.
This setup needs no Infisical login.

## Maintainer guides

- [Development, ScummVM rebuilds, and analytics](docs/maintaining-scummweb.md)
- [Production delivery and game publishing](docs/production-delivery.md)

## License

- Original ScummWEB code is available under the [Zero-Clause BSD license](LICENSE).
- The bundled ScummVM engine and patches to ScummVM are covered by the
  [ScummVM GPL license](scummvm-shell/doc/COPYING). Bundled third-party
  components carry their own notices in the [ScummVM documentation](scummvm-shell/doc/).
- Each game and its associated artwork have their own terms. See the
  game-specific notices in the [ScummWEB catalog](https://scummweb.tsilva.eu#library).

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

ScummWEB maintains an asset and metadata pack with artwork, descriptions,
studio credits, and genres for recognized games. The public playable catalog
lists games alphabetically by title and uses freeware and demos offered on the
ScummVM website. Import your own game
files to build a personal dashboard.

Use the sliders icon on the right of the Game Library heading to sort by
name, release year, genre, or studio, and filter by genre. The controls apply to both the public catalog
and your imported games. Genre options merge capitalization, spacing, and
equivalent labels, such as Comic adventure and Comedy adventure. Select **All genres**
to show every genre, or **Name: A–Z** to restore alphabetical order.

See [game testing](docs/game-testing.md) for recorded startup results
and games not yet tested in ScummWEB.

## Play online

Start with [Beneath a Steel Sky](https://scummweb.tsilva.eu/beneath-a-steel-sky/play),
a freeware cyberpunk adventure. The player downloads and unpacks the game ZIP in your browser.
When the opening scene appears, you’re ready to play. For more games,
[browse the ScummWEB library](https://scummweb.tsilva.eu).
Select a game card to open its details, with hero artwork, screenshots, metadata,
and a Play button. Compatible browser saves add **Continue** and **Start from
beginning** choices. Game details also link to each title’s bundled readme or license.
The homepage slideshow prepares the next three backdrops and the previous one
in advance for smooth switching.

## Add your games

- **From your device** — Drop game ZIPs or folders anywhere on the homepage or a game’s landing page.
  ScummWEB looks for ZIPs in subfolders and treats a folder without ZIPs as
  one unpacked game. Files stay on your device. If your browser loses access
  after a reload, select the game’s poster to restore access or drop the same folder again.
  Dropping the same library again refreshes existing games’ file access without
  adding duplicate catalog entries, including games marked as missing.
  The homepage slideshow includes imported games and uses gameplay artwork for
  recognized titles. Platform, language, and edition variants can share the same art.
  For a large local game, drop its unpacked folder or create a ZIP with
  compression disabled. Local games can be up to 4 GiB.
- **From a link** — Open
  `/local/play#zip=https%3A%2F%2Fexample.com%2Fgame.zip` on your ScummWEB site.
  URL-encode the direct HTTPS ZIP address. The browser downloads and unpacks
  the ZIP directly from its host, which must allow cross-origin GET requests
  from your ScummWEB site. If the host blocks access, download the ZIP
  yourself and drop it onto either page.

The drop overlay lists each ZIP in a dropped directory, including its relative
path, while it waits, imports, or finishes. Completed and skipped files stay
visible as the remaining files are processed. For an unpacked game folder,
it lists each data file as it is checked. The final list shows the added and
skipped files.
Scroll inside the dialog to review a large batch. When processing finishes,
select **Confirm** to close it. The library then scrolls to the first new
poster. New posters briefly brighten and show color as they come into view.
To remove an imported game, hover over its poster and select the pink **×**
on the top-left edge. The button also appears when it receives keyboard focus and
stays visible on touch-only devices.

Saved games are checked whenever the library opens and when you return to its
tab or window. Missing local files and folders are flagged on their posters.
If the browser requires permission before checking, the poster shows
**File access needed** instead. Select the poster to restore access or locate
the game again.

Put one game per ZIP, with its files at the root or in a single enclosing
folder. ZIPs can be up to 128 MiB compressed and 256 MiB unpacked. Select a
game's poster to view its details, then choose **Play** (or locate its files when
needed). Imported games load saves from the game's menu after launching.

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

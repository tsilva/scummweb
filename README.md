<p align="center">
  <img src="logo.png" alt="ScummWEB" width="240" />
  <br />
  <!-- repo-tagline:start -->
  <strong>🕹️ Play classic adventures in your browser 🖱️</strong>
  <!-- repo-tagline:end -->
</p>

<p align="center">
  <a href="https://github.com/tsilva/scummweb/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/tsilva/scummweb/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI on main" /></a>
  <a href="https://github.com/tsilva/scummweb/actions/workflows/production-delivery.yml?query=branch%3Amain"><img src="https://img.shields.io/github/actions/workflow/status/tsilva/scummweb/production-delivery.yml?branch=main&amp;label=Deploy" alt="Deploy workflow status on main" /></a>
  <a href="scummvm-shell/source-info.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Ftsilva%2Fscummweb%2Fmain%2Fscummvm-shell%2Fsource-info.json&amp;query=%24.scummvm.version&amp;label=ScummVM&amp;color=2e7d32" alt="Bundled ScummVM version" /></a>
  <a href=".github/workflows/ci.yml"><img src="https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&amp;logoColor=white" alt="Tested with Node.js 22" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-0BSD-blue" alt="License: 0BSD (original ScummWEB code)" /></a>
</p>

ScummWEB is an independent browser frontend for [ScummVM](https://www.scummvm.org/).
It is not affiliated with, endorsed by, or sponsored by the ScummVM project.

Play classic point-and-click adventures in your browser. Choose freeware and
demos from the public library, or import compatible
games from your own collection. Recognized games include artwork, descriptions,
and studio credits. Game details show three screenshots where matching captures
are available.
Originals and remakes keep separate cards, with remake labels and artwork that
matches each game. Platform and language variants share artwork within that edition.

Every recognized title has its own searchable game page with artwork and details.
Games outside the public library show **Game not included** and explain that
copyright restrictions prevent ScummWEB from providing their files. If you own
a copy, drop its ZIP onto the page to add it and enable its launch options.

## Play online

[Browse the library](https://scummweb.tsilva.eu), or start with
[Beneath a Steel Sky](https://scummweb.tsilva.eu/beneath-a-steel-sky/play),
a freeware cyberpunk adventure. The game downloads and unpacks in your browser;
when the opening scene appears, you’re ready to play.
The bundled classics also include the English freeware editions of **Sołtys**
and **Sfinx**, and the original Apple II **Mystery House** public-domain release.
**God of Thunder** is supported through personal ZIP imports; its game files
are not included.
The launch screen shows loading status text without a progress bar. ZIP downloads
show a percentage in that text when the host provides the total file size.
Successfully opened games are cached in your browser, so playing the same
URL again skips downloading and unpacking the ZIP. The cache holds up to four
games; clearing site data or ending an incognito session removes them.
If the game ZIP fails to download, use **Exit game** to return to the library.
Dark opening scenes play as soon as the game is ready; use **Skip intro**, when
offered, to jump ahead.

Select a game card for details and **Play**. If sound or an intro is paused,
select **Start audio** inside the game. Supported games offer **Continue** when
a player save exists, loading the most recently written save directly. This
also works for personal imports, with progress kept separate for each version.
Intro checkpoints do not enable Continue. Other games stay on **Play** and load
progress through their in-game menu.

Launch actions offer **Play** or **Continue** immediately from browser save
metadata. Older or restored saves are checked in the background; **Continue**
appears when valid progress is found. Saves update this metadata during play,
so closing the tab after a completed save retains it. One game can run at a time
in browsers with Web Locks; library tabs remain available.

Games default to their original save/load screens wherever ScummVM supports
them. Existing saved preferences take precedence; games without an original
screen option keep their usual interface.

On desktop, the top controls fade away during play. Move the pointer into the
top 80 pixels to reveal them, or press **Esc** to release a captured cursor and
show them briefly. Keyboard focus keeps controls visible. Opening the game
menu keeps them visible until **Esc** or the game captures the cursor again.
Touch controls stay visible.

On phones, landscape gives the largest game view. You can also choose **Play in
portrait** or **Play in browser** without fullscreen. Drag on the game or cursor
pad to move the pointer; use **L** and **R** for left and right clicks. Double-tap
the game for a left click. The top controls exit to the library and, for supported
games, open the game's own menu. The menu button never opens ScummVM's global menu.

Open the **Settings** gear icon to the right of GitHub to slide in the settings panel.
Choose **Saved games** to export a backup ZIP or import one on another
device. Review imports before applying them; different progress for the same
game is kept as separate save sets. **Save sets** lets you choose which set is
active. Close games in all tabs first. Backups contain progress, not game files.

The Recently Played strip shows games you have launched, newest first, including
your imported ZIPs. It appears after your first launch.

Use the library’s sliders icon to sort and filter games. These choices remain
active while navigating between game pages. Choose **Version** in
the hero to switch platform, language, or edition. Select **Compatibility**
in the navigation to open the
[compatibility page](https://scummweb.tsilva.eu/compatibility), or read the
[compatibility results](docs/game-testing.md), for tested editions and known
ScummVM or ScummWEB limitations. Problems specific to missing or mismatched
game files are excluded. Startup checks do not establish full-game compatibility.

Select a library or Recently Played card to open the game’s shareable page and
jump instantly to its hero. The artwork, description, launch actions, screenshots
and URL update in the current page without a route fetch or library reload. Browser
Back and Forward restore the selection, and direct links still open that game.
The hero and screenshots fill the opening view, with the library below the fold
and compact portrait box-art cards. Reserved text and action areas keep the slideshow stable.
Select a screenshot to expand it inline; use the arrows to browse and Escape to close it.

The homepage slideshow advances every eight seconds; use the pause button to stop
automatic rotation. Previous and next select a game and navigate to its page.
Game pages open with rotation paused. Exiting a catalog game returns to its game
page; unrecognized imports return to the homepage with their game selected.
For a single-version game with a supported player save, select **Continue** there
to resume, or **Start from beginning** to start fresh.
Quitting inside a game or choosing ScummVM’s **Return to Launcher** also returns
to ScummWEB without opening ScummVM’s game-selection menu.

## Add your games

Click **Add a game** in the library to choose ZIPs, or drop ScummVM game ZIPs
onto the homepage or a game’s page, then select a
poster to play. Local game files stay on your device. Put one game in each
ZIP, with its data files at the root or in one enclosing folder.
When an original and remake share a title, use a recognized filename with its
edition label; an ambiguous name keeps generic metadata rather than choosing a remake.

Only ZIP files are supported. Local games can be up to 4 GiB. For large games,
use a ZIP with compression disabled. If the browser needs file access again,
select the poster and **Allow file access**, then approve the browser prompt.
The button becomes **Play** or **Continue** once access is granted. Use **Locate ZIP**
for missing files, or drop the same ZIPs again to refresh entries without duplicates.
Imports are compared with the included games by their data files. Matching copies
use the bundled game instead of adding another version; distinct releases remain
available. Older unverified copies of included titles also default to the bundled
game; reimport their ZIP to compare them. Existing imported saves remain available
in **Settings → Saved games**.

See [playing and importing games](docs/maintaining-scummweb.md#playing-and-importing-games)
for direct ZIP links, download limits, saves, and file-access help.
Direct ZIP links inspect the game files to show matching metadata and hero
artwork, including when the archive has been renamed. Recognition covers a
limited set of file signatures; other games retain the generic loading screen.
Bad HTTP responses, web pages, and invalid archives fail without retrying a
full download. Inspection and extraction run in your browser; archived scripts
and programs are treated as game data, never executed as web scripts or
operating-system programs.

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

Game artwork loads directly from R2 using the tracked
[`data/artwork-storage.json`](data/artwork-storage.json) manifest. Game mappings
and source credits remain in Git. See the
[artwork publishing procedure](docs/maintaining-scummweb.md#artwork-storage-and-publishing)
for the verified migration and update workflow.
Delivery variants use responsive WebP images and AVIF alternatives where they
reduce transfer size at the selected quality; original captures remain available.
Use the [game-assets skill](.codex/skills/scummweb_game-assets/SKILL.md) to generate
heroes from original game artwork or restore original box fronts for portrait
cards, preserving their original artwork, title typography and layout. Generation dates and
source/export hashes are tracked in [`data/generated-artwork.json`](data/generated-artwork.json).
The bundled catalog's restored box fronts preserve their original cover designs.
Restored covers and recomposed heroes use verified R2 delivery variants.
Gameplay screenshots remain original captures and are never AI-generated.

For production builds and Lighthouse checks alongside a running server, see
the [isolated audit setup](docs/maintaining-scummweb.md#development-commands).
For engine upgrades, use the
[ScummVM upgrade skill](.codex/skills/scummweb_upgrade-scummvm/SKILL.md), which
checks stable releases and preserves the documented local patch requirements.

## Further reading

- [Development, ScummVM rebuilds, and analytics](docs/maintaining-scummweb.md)
- [Production delivery and game publishing](docs/production-delivery.md)

## License

- Original ScummWEB code is available under the [Zero-Clause BSD license](LICENSE).
- The bundled ScummVM engine and patches to ScummVM are covered by the
  [ScummVM GPL license](scummvm-shell/doc/COPYING). Bundled third-party
  components carry their own notices in the [ScummVM documentation](scummvm-shell/doc/).
- Each game and its associated artwork have their own terms. See the
  game-specific notices in the [ScummWEB catalog](https://scummweb.tsilva.eu#library).

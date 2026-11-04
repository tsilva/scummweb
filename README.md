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

ScummWEB brings classic point-and-click adventures to your browser, powered by
ScummVM. Play freeware and demos from the public library, or import compatible
games from your own collection. Recognized games include artwork, descriptions,
and studio credits.

## Play online

[Browse the library](https://scummweb.tsilva.eu), or start with
[Beneath a Steel Sky](https://scummweb.tsilva.eu/beneath-a-steel-sky/play),
a freeware cyberpunk adventure. The game downloads and unpacks in your browser;
when the opening scene appears, you’re ready to play.

Select a game card for details and **Play**. If sound or an intro is paused,
select **Start audio** inside the game. Compatible saves offer **Continue**;
other games load progress through their in-game menu.

Use the library’s sliders icon to sort and filter games. Choose **Version** in
a game’s details to switch platform, language, or edition. Open **Game
compatibility** from the top-bar checklist icon, or read the
[compatibility results](docs/game-testing.md), for tested editions and known
limitations. Startup checks do not establish full-game compatibility.

## Add your games

Drop game ZIPs or folders onto the homepage or a game’s page, then select a
poster to play. Local game files stay on your device. Put one game in each
ZIP, with its data files at the root or in one enclosing folder.

Local games can be up to 4 GiB. For large games, use an unpacked folder or a
ZIP with compression disabled. If the browser loses file access, select the
poster to reconnect it or drop the same library again; existing entries are
refreshed without duplicates.

See [playing and importing games](docs/maintaining-scummweb.md#playing-and-importing-games)
for direct ZIP links, download limits, saves, and file-access help.

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

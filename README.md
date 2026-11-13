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

ScummWEB is an independent browser frontend powered by
[ScummVM](https://www.scummvm.org/). Play freeware and demos from the library
or import compatible graphical and text adventures from your own collection.

## Play online

[Browse the library](https://scummweb.tsilva.eu) or play
[Beneath a Steel Sky](https://scummweb.tsilva.eu/beneath-a-steel-sky/play).
Wait for the opening scene and select **Start audio** if prompted. Phones and
tablets have touch controls.

Saves stay in your browser. Before clearing site data or moving devices, export
them through **Settings → Saved games**. See
[save backups and transfers](docs/maintaining-scummweb.md#backing-up-and-transferring-saved-progress).

## Add your games

Choose **Add a game** or drop a ZIP onto the page. Put one game in each ZIP,
with its data at the root or in one folder. Local game files stay on your
device. See [import limits and file access](docs/maintaining-scummweb.md#playing-and-importing-games)
and [compatibility results](https://scummweb.tsilva.eu/compatibility).

## Run locally

Use Node.js 22 (the CI-tested version) and pnpm 10.27.0.

```bash
git clone https://github.com/tsilva/scummweb.git
cd scummweb
pnpm install --frozen-lockfile
pnpm run dev --port auto
```

Open the printed URL and select **Beneath a Steel Sky → Play**.

## Further reading

- [Player guide and maintenance](docs/maintaining-scummweb.md)
- [Game testing](docs/game-testing.md) and [story progress](docs/game-progress.md)
- [Production delivery and game publishing](docs/production-delivery.md)

## License

- Original ScummWEB code uses the [Zero-Clause BSD license](LICENSE).
- The bundled engine and patches use the [ScummVM GPL license](scummvm-shell/doc/COPYING).
  See the [live source offer](https://scummweb.tsilva.eu/doc/scummvm-source.html)
  or this checkout's [build-source ZIP](scummvm-shell/doc/scummvm-source.zip)
  and [third-party notices](scummvm-shell/doc/).
- Games and artwork have their own terms. See the
  game-specific notices in the [catalog](https://scummweb.tsilva.eu#library).

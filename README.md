<p align="center">
  <img src="scummvm-shell/logo-nav.png" alt="ScummWEB" width="320" />
  <br />
  <!-- repo-tagline:start -->
  <strong>🕹️ Classic point-and-click adventures, playable instantly in your browser 🕹️</strong>
  <!-- repo-tagline:end -->
</p>

[Play ScummWEB](https://scummweb.tsilva.eu)

Start with **Beneath a Steel Sky**, a freeware cyberpunk adventure, or add
your own ScummVM games to the library.

## Add your games

- **From your device** — Drop game ZIPs or folders on the homepage, or use
  **Choose ZIPs** or **Choose folder**. ScummWEB looks for ZIPs in subfolders
  and treats a folder without ZIPs as one unpacked game. The library shows
  progress while it checks your files. Your files stay on your device.
  Use **Locate ZIP** or **Locate folder** if access is lost.
- **From the web** — Select **Add from web** and enter a public HTTPS ZIP URL
  or an R2 or S3 bucket URL. Put one ZIP per game at the bucket root using
  the filenames in the **Bucket ZIP guide**. Allow cross-origin `HEAD` and
  `GET` requests from your ScummWEB site.

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

Open the URL printed by the server and look for **Beneath a Steel Sky** in the
library. This setup needs no Infisical login.

## Maintainer guides

- [Development, ScummVM rebuilds, and analytics](docs/maintaining-scummweb.md)
- [Production delivery and game publishing](docs/production-delivery.md)

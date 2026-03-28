import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";

async function getGameMetadata() {
  const metadataPath = path.join(process.cwd(), "public", "game.json");
  const content = await fs.readFile(metadataPath, "utf8");
  return JSON.parse(content);
}

export default async function HomePage() {
  const game = await getGameMetadata();
  const launchHref = `/scummvm.html#${game.target}`;

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Next.js + ScummVM</p>
        <h1>Beneath a Steel Sky</h1>
        <p className="lede">
          This deployment serves the prebuilt ScummVM WebAssembly bundle through Next.js
          so the app can ship cleanly on Vercel without rebuilding the engine during deploy.
        </p>

        <div className="meta-grid">
          <div>
            <span className="meta-label">Detected target</span>
            <strong>{game.target}</strong>
          </div>
          <div>
            <span className="meta-label">Game data</span>
            <strong>{game.path}</strong>
          </div>
        </div>

        <LaunchButton href={launchHref} />

        <p className="footnote">
          The root page redirects into ScummVM automatically. If the redirect is blocked,
          use the launch button.
        </p>
      </section>
    </main>
  );
}

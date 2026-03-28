import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";

async function getGameMetadata() {
  const metadataPath = path.join(process.cwd(), "public", "game.json");
  const content = await fs.readFile(metadataPath, "utf8");
  return JSON.parse(content);
}

async function getSourceInfo() {
  const infoPath = path.join(process.cwd(), "public", "source-info.json");
  const content = await fs.readFile(infoPath, "utf8");
  return JSON.parse(content);
}

export default async function HomePage() {
  const game = await getGameMetadata();
  const sourceInfo = await getSourceInfo();
  const launchHref = `/scummvm.html#${game.target}`;
  const screenshots = [
    "/launcher/bass-shot-1.png",
    "/launcher/bass-shot-2.png",
    "/launcher/bass-shot-3.png",
  ];
  const sourceLinks = [
    { href: "/source.html", label: "Corresponding Source" },
    { href: "/doc/COPYING", label: "GPL-3.0 License" },
    { href: "/games/bass-cd-1.2/readme.txt", label: "Game Readme" },
  ];

  return (
    <main className="page-shell">
      <section className="launcher-window">
        <header className="launcher-titlebar">
          <div className="launcher-brand">
            <img alt="ScummVM" className="launcher-logo" src="/logo.svg" />
            <div>
              <p className="window-kicker">ScummVM Web Launcher</p>
              <h1>Installed Games</h1>
            </div>
          </div>
          <div className="window-status">
            <span>Target `{game.target}` detected</span>
            <span>WebAssembly bundle ready</span>
          </div>
        </header>

        <div className="launcher-body">
          <aside className="launcher-sidebar">
            <nav className="launcher-nav" aria-label="Launcher sections">
              <span className="nav-chip is-active">Games</span>
              <span className="nav-chip">Mass Add</span>
              <span className="nav-chip">Options</span>
              <span className="nav-chip">About</span>
            </nav>

            <div className="sidebar-panel">
              <p className="panel-label">Library</p>
              <strong>1 game installed</strong>
              <p>
                The library is trimmed to a single playable entry for now. More titles can be
                added later without changing the launcher layout.
              </p>
            </div>

            <div className="sidebar-panel">
              <p className="panel-label">Build</p>
              <dl className="sidebar-stats">
                <div>
                  <dt>Engine</dt>
                  <dd>{game.target.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>Game data</dt>
                  <dd>{game.path}</dd>
                </div>
                <div>
                  <dt>Project rev</dt>
                  <dd>{sourceInfo.project.commit || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>ScummVM rev</dt>
                  <dd>{sourceInfo.scummvm.commit || "Unavailable"}</dd>
                </div>
              </dl>
            </div>
          </aside>

          <div className="launcher-workspace">
            <div className="workspace-heading">
              <div>
                <p className="panel-label">Launcher</p>
                <h2>Choose a game to launch</h2>
                <p className="workspace-copy">
                  Styled after ScummVM’s launcher chrome, but focused on a single ready-to-run
                  BASS install. Clicking the tile boots straight into the game.
                </p>
              </div>
              <LaunchButton href={launchHref} label="Launch BASS" />
            </div>

            <div className="status-strip" aria-label="Current selection">
              <div>
                <span className="meta-label">Selected Game</span>
                <strong>Beneath a Steel Sky</strong>
              </div>
              <div>
                <span className="meta-label">Edition</span>
                <strong>CD / DOS Freeware</strong>
              </div>
              <div>
                <span className="meta-label">Runtime</span>
                <strong>ScummVM WebAssembly</strong>
              </div>
            </div>

            <div className="launcher-main">
              <div className="game-grid">
                <a className="game-tile" href={launchHref}>
                  <div
                    className="tile-art"
                    style={{ "--tile-art": `url(${screenshots[2]})` }}
                  >
                    <span className="tile-badge">Ready</span>
                    <div className="tile-hero-copy">
                      <p>Revolution Software</p>
                      <h3>Beneath a Steel Sky</h3>
                      <span>Launches ScummVM directly into the installed `sky` target.</span>
                    </div>
                  </div>

                  <div className="tile-strip" aria-hidden="true">
                    {screenshots.map((screenshot, index) => (
                      <span
                        key={screenshot}
                        className={`tile-shot tile-shot-${index + 1}`}
                        style={{ "--shot-image": `url(${screenshot})` }}
                      />
                    ))}
                  </div>

                  <div className="tile-body">
                    <div>
                      <span className="meta-label">Installed Path</span>
                      <strong>{game.path}</strong>
                    </div>
                    <div>
                      <span className="meta-label">Launch Action</span>
                      <strong>Open `/scummvm.html#{game.target}`</strong>
                    </div>
                  </div>
                </a>
              </div>

              <aside className="selection-panel">
                <p className="panel-label">Selected Entry</p>
                <h3>{game.title}</h3>
                <p>
                  This front page behaves like a launcher screen rather than a plain landing page.
                  The BASS tile is the primary control, and the button below mirrors the same
                  launch target.
                </p>
                <ul className="selection-list">
                  <li>Whole tile is clickable.</li>
                  <li>Uses captured in-game screenshots for the preview strip.</li>
                  <li>Source and license links stay visible on the launcher screen.</li>
                </ul>
                <LaunchButton href={launchHref} label="Start Game" className="launch-button-secondary" />
              </aside>
            </div>

            <footer className="compliance-dock">
              <div>
                <p className="panel-label">Source and License</p>
                <p className="compliance-copy">
                  The ScummVM bundle, source offer, GPL text, and bundled game readme remain
                  exposed from the launcher for distribution compliance.
                </p>
              </div>
              <div className="compliance-actions">
                {sourceLinks.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </footer>
          </div>
        </div>
      </section>
    </main>
  );
}

import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";

const artByTarget = {
  sky: {
    eyebrow: "Revolution Software",
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
  },
};

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

async function getGameLibrary() {
  const publicDir = path.join(process.cwd(), "public");
  const libraryPath = path.join(publicDir, "games.json");

  try {
    const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
    return {
      games: library.games || [],
      primaryTarget: library.primaryTarget || library.games?.[0]?.target || "",
    };
  } catch {
    const primaryGame = JSON.parse(await fs.readFile(path.join(publicDir, "game.json"), "utf8"));
    return {
      games: [primaryGame],
      primaryTarget: primaryGame.target,
    };
  }
}

async function getSourceInfo() {
  const infoPath = path.join(process.cwd(), "public", "source-info.json");
  const content = await fs.readFile(infoPath, "utf8");
  return JSON.parse(content);
}

export default async function HomePage() {
  const { games, primaryTarget } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();
  const primaryGame = games.find((game) => game.target === primaryTarget) || games[0];

  if (!primaryGame) {
    throw new Error("No installed game metadata found");
  }

  const launchHref = `/scummvm.html#${primaryGame.target}`;
  const engineSummary = Array.from(
    new Set(games.map((game) => game.engineId).filter(Boolean))
  )
    .map((engineId) => engineId.toUpperCase())
    .join(", ");
  const sourceLinks = [
    { href: "/source.html", label: "Corresponding Source" },
    { href: "/doc/COPYING", label: "GPL-3.0 License" },
    ...games
      .filter((game) => game.readmeHref)
      .map((game) => ({
        href: game.readmeHref,
        label: `${getDisplayTitle(game.title)} Readme`,
      })),
  ].filter(
    (link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index
  );

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
            <span>{games.length} target(s) detected</span>
            <span>{engineSummary || "ScummVM"} engine bundle ready</span>
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
              <strong>{formatGameCount(games.length)}</strong>
              <p>
                The launcher reads detected ScummVM targets from the generated bundle metadata, so
                new installs appear here without changing the shell layout.
              </p>
            </div>

            <div className="sidebar-panel">
              <p className="panel-label">Build</p>
              <dl className="sidebar-stats">
                <div>
                  <dt>Primary target</dt>
                  <dd>{primaryGame.target}</dd>
                </div>
                <div>
                  <dt>Data path</dt>
                  <dd>{primaryGame.path}</dd>
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
                  Styled after ScummVM’s launcher chrome, with each detected install exposed as a
                  one-click tile that jumps straight into the matching runtime target.
                </p>
              </div>
              <LaunchButton
                href={launchHref}
                label={`Launch ${getDisplayTitle(primaryGame.title)}`}
              />
            </div>

            <div className="status-strip" aria-label="Current selection">
              <div>
                <span className="meta-label">Primary Game</span>
                <strong>{getDisplayTitle(primaryGame.title)}</strong>
              </div>
              <div>
                <span className="meta-label">Library Size</span>
                <strong>{games.length} ready target(s)</strong>
              </div>
              <div>
                <span className="meta-label">Runtime</span>
                <strong>ScummVM WebAssembly</strong>
              </div>
            </div>

            <div className="launcher-main">
              <div className="game-grid">
                {games.map((game) => {
                  const art = artByTarget[game.target] || {};
                  const screenshots = art.screenshots || [];
                  const launchAction = `/scummvm.html#${game.target}`;

                  return (
                    <a key={game.target} className="game-tile" href={launchAction}>
                      <div
                        className={`tile-art${screenshots.length === 0 ? " tile-art-fallback" : ""}`}
                        style={
                          screenshots.length > 0
                            ? { "--tile-art": `url(${screenshots[screenshots.length - 1]})` }
                            : undefined
                        }
                      >
                        <span className="tile-badge">Ready</span>
                        <div className="tile-hero-copy">
                          <p>{art.eyebrow || game.engineId?.toUpperCase() || "ScummVM"}</p>
                          <h3>{getDisplayTitle(game.title)}</h3>
                          <span>
                            Launches ScummVM directly into the installed `{game.target}` target.
                          </span>
                        </div>
                      </div>

                      {screenshots.length > 0 ? (
                        <div className="tile-strip" aria-hidden="true">
                          {screenshots.map((screenshot, index) => (
                            <span
                              key={screenshot}
                              className={`tile-shot tile-shot-${index + 1}`}
                              style={{ "--shot-image": `url(${screenshot})` }}
                            />
                          ))}
                        </div>
                      ) : null}

                      <div className="tile-body">
                        <div>
                          <span className="meta-label">Installed Path</span>
                          <strong>{game.path}</strong>
                        </div>
                        <div>
                          <span className="meta-label">Engine</span>
                          <strong>{game.engineId?.toUpperCase() || "Unknown"}</strong>
                        </div>
                        <div>
                          <span className="meta-label">Launch Action</span>
                          <strong>Open `{launchAction}`</strong>
                        </div>
                        <div>
                          <span className="meta-label">Readme</span>
                          <strong>{game.readmeHref || "Not bundled"}</strong>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>

              <aside className="selection-panel">
                <p className="panel-label">Primary Entry</p>
                <h3>{primaryGame.title}</h3>
                <p>
                  The front page behaves like a launcher screen rather than a plain landing page.
                  Each tile is a direct boot target, and the primary button stays pinned to the
                  first detected install.
                </p>
                <ul className="selection-list">
                  {games.map((game) => (
                    <li key={game.target}>
                      {getDisplayTitle(game.title)} uses `{game.target}` from `{game.path}`.
                    </li>
                  ))}
                </ul>
                <LaunchButton
                  href={launchHref}
                  label="Start Primary Game"
                  className="launch-button-secondary"
                />
              </aside>
            </div>

            <footer className="compliance-dock">
              <div>
                <p className="panel-label">Source and License</p>
                <p className="compliance-copy">
                  The ScummVM bundle, source offer, GPL text, and bundled game readmes remain
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

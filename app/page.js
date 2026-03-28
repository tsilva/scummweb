import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";

const artByTarget = {
  sky: {
    eyebrow: "Featured Classic",
    summary:
      "Beneath a Steel Sky drops you into a polluted cyberpunk sprawl full of conspiracies, missing memories, and dry British wit. This browser build jumps straight into the CD release bundled with the ScummVM archive.",
    genre: "Cyberpunk",
    studio: "Revolution Software",
    year: "1994",
    mood: "Industrial noir",
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
  },
  "dreamweb-cd": {
    eyebrow: "Installed Archive",
    summary:
      "DreamWeb brings a harsher strain of point-and-click science fiction into the browser: rain-soaked city blocks, cult paranoia, and a murder plot spiraling through a diseased megacity.",
    genre: "Noir thriller",
    studio: "Empire Interactive",
    year: "1994",
    mood: "Rainy dystopia",
    screenshots: [],
  },
};

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "Unavailable";
}

function getGameMeta(game) {
  const art = artByTarget[game.target] || {};

  return {
    ...game,
    art,
    displayTitle: getDisplayTitle(game.title),
    href: `/scummvm.html#${game.target}`,
    eyebrow: art.eyebrow || "Installed Target",
    summary:
      art.summary ||
      `Launch ${getDisplayTitle(game.title)} directly from the generated ScummVM WebAssembly bundle.`,
    genre: art.genre || game.engineId?.toUpperCase() || "ScummVM",
    studio: art.studio || "ScummVM Bundle",
    year: art.year || "Archive",
    mood: art.mood || "Ready to play",
    screenshots: art.screenshots || [],
  };
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

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGameMeta);
  const featuredGame =
    catalog.find((game) => game.target === "sky") ||
    catalog.find((game) => game.target === primaryTarget) ||
    catalog[0];
  const heroImage = featuredGame.screenshots[1] || featuredGame.screenshots[0] || "";
  const engineSummary = Array.from(
    new Set(games.map((game) => game.engineId).filter(Boolean))
  )
    .map((engineId) => engineId.toUpperCase())
    .join(" / ");
  const sourceLinks = [
    { href: "/source.html", label: "Corresponding Source", detail: "Project archive" },
    { href: "/doc/COPYING", label: "GPL-3.0 License", detail: "Distribution terms" },
    { href: "/doc/COPYRIGHT", label: "Copyright Notes", detail: "Attribution bundle" },
    ...catalog
      .filter((game) => game.readmeHref)
      .map((game) => ({
        href: game.readmeHref,
        label: `${game.displayTitle} Readme`,
        detail: game.target,
      })),
  ].filter(
    (link, index, links) => links.findIndex((candidate) => candidate.href === link.href) === index
  );
  const infoHref = featuredGame.readmeHref || "/source.html";
  const footerLinks = sourceLinks.slice(0, 4);

  return (
    <main className="cinema-page">
      <header className="topbar">
        <a className="brandmark" href="#browse">
          <img alt="ScummVM" className="brandmark-logo" src="/logo.svg" />
          <span>Archivist</span>
        </a>

        <nav className="topnav" aria-label="Main">
          <a href="#browse">Browse</a>
          <a href="#library">Library</a>
          <a href="#archive">Archive</a>
        </nav>

        <div className="topbar-tools" aria-label="Build status">
          <span className="tool-pill">{formatGameCount(catalog.length)}</span>
          <span className="tool-pill">{engineSummary || "ScummVM"}</span>
        </div>
      </header>

      <section className="hero" id="browse">
        <div className="hero-media">
          {heroImage ? (
            <img
              alt={`${featuredGame.displayTitle} gameplay still`}
              className="hero-backdrop"
              src={heroImage}
            />
          ) : (
            <div className="hero-backdrop hero-backdrop-fallback" aria-hidden="true" />
          )}
          <div className="hero-scrim" />
          <div className="hero-side-glow" />
        </div>

        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow">{featuredGame.eyebrow}</p>
            <h1>{featuredGame.displayTitle}</h1>
            <p className="hero-summary">{featuredGame.summary}</p>

            <div className="hero-actions">
              <LaunchButton
                href={featuredGame.href}
                label={`Launch ${featuredGame.displayTitle}`}
              />
              <a className="glass-button" href={infoHref}>
                Open Game Notes
              </a>
            </div>

            <dl className="hero-meta">
              <div>
                <dt>Studio</dt>
                <dd>{featuredGame.studio}</dd>
              </div>
              <div>
                <dt>Genre</dt>
                <dd>{featuredGame.genre}</dd>
              </div>
              <div>
                <dt>Runtime</dt>
                <dd>ScummVM WebAssembly</dd>
              </div>
            </dl>
          </div>

          <aside className="hero-panel" aria-label="Featured bundle details">
            <div className="hero-panel-card hero-panel-feature">
              <p className="panel-kicker">Now Playable</p>
              <h2>{featuredGame.displayTitle}</h2>
              <p>
                Direct boot target <code>{featuredGame.target}</code> from{" "}
                <code>{featuredGame.path}</code>.
              </p>
            </div>

            <div className="hero-shot-grid">
              {(featuredGame.screenshots.length > 0
                ? featuredGame.screenshots
                : catalog.flatMap((game) => game.screenshots).slice(0, 3)
              ).map((screenshot, index) => (
                <div key={screenshot} className={`hero-shot hero-shot-${index + 1}`}>
                  <img alt="" src={screenshot} />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="content-section" id="library">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ready To Launch</p>
            <h2>Installed adventures</h2>
          </div>
          <p className="section-copy">
            Every tile is a direct runtime target generated from the current bundle metadata. The
            page keeps the streaming-style presentation, but the actions still map one-to-one to
            real ScummVM launch hashes.
          </p>
        </div>

        <div className="feature-rail">
          {catalog.map((game) => (
            <a
              key={game.target}
              className={`feature-card${game.screenshots.length === 0 ? " is-fallback" : ""}`}
              href={game.href}
              style={
                game.screenshots[0] ? { "--card-art": `url(${game.screenshots[0]})` } : undefined
              }
            >
              <div className="feature-card-copy">
                <p>{game.eyebrow}</p>
                <h3>{game.displayTitle}</h3>
                <span>{game.summary}</span>
              </div>
              <div className="feature-card-meta">
                <strong>{game.genre}</strong>
                <span>{game.year}</span>
                <span>{game.target}</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated Library</p>
            <h2>Launch catalog</h2>
          </div>
          <a className="section-link" href={featuredGame.href}>
            Start featured game
          </a>
        </div>

        <div className="poster-grid">
          {catalog.map((game) => (
            <article
              key={game.target}
              className={`poster-card${game.screenshots.length === 0 ? " is-fallback" : ""}`}
              style={
                game.screenshots[game.screenshots.length - 1]
                  ? { "--poster-art": `url(${game.screenshots[game.screenshots.length - 1]})` }
                  : undefined
              }
            >
              <div className="poster-card-media" />
              <div className="poster-card-copy">
                <p className="poster-overline">{game.mood}</p>
                <h3>{game.displayTitle}</h3>
                <p>{game.summary}</p>
                <div className="poster-card-footer">
                  <span>{game.studio}</span>
                  <a href={game.href}>Launch</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Archive Deck</p>
            <h2>Source, license, and bundle notes</h2>
          </div>
          <p className="section-copy">
            Compliance remains visible from the landing page: bundled docs, source offer, and the
            exact revisions used to prepare the current public archive.
          </p>
        </div>

        <div className="archive-grid">
          <article className="archive-card archive-card-build">
            <p className="panel-kicker">Runtime Build</p>
            <h3>Prepared from the current working tree</h3>
            <dl className="archive-metrics">
              <div>
                <dt>Project rev</dt>
                <dd>{shortCommit(sourceInfo.project.commit)}</dd>
              </div>
              <div>
                <dt>ScummVM rev</dt>
                <dd>{shortCommit(sourceInfo.scummvm.commit)}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{sourceInfo.generated_at_utc.slice(0, 10)}</dd>
              </div>
              <div>
                <dt>Primary launch</dt>
                <dd>{featuredGame.target}</dd>
              </div>
            </dl>
          </article>

          {sourceLinks.map((link) => (
            <a key={link.href} className="archive-card archive-link-card" href={link.href}>
              <p className="panel-kicker">{link.detail}</p>
              <h3>{link.label}</h3>
              <span>Open document</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div>
          <strong>ScummVM Archivist</strong>
          <p>
            Editorial landing page for the generated web bundle, with launch targets and
            compliance docs exposed in one place.
          </p>
        </div>

        <div className="footer-links">
          {footerLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>
      </footer>
    </main>
  );
}

import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";

const artByTarget = {
  sky: {
    eyebrow: "Featured Classic",
    summary:
      "Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and the kind of dry wit that only 90s cyberpunk adventures could get away with.",
    genre: "Cyberpunk Adventure",
    studio: "Revolution Software",
    year: "1994",
    badge: "CD Release",
    tag: "Industrial noir",
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
    tone: "tone-sky",
  },
  "dreamweb-cd": {
    eyebrow: "Night Shift Pick",
    summary:
      "DreamWeb trades bright heroics for rain, cult dread, and a killer drifting through a diseased future city. It is still one of the strangest things you can boot from ScummVM.",
    genre: "Noir Thriller",
    studio: "Empire Interactive",
    year: "1994",
    badge: "CD Edition",
    tag: "Rain-soaked dystopia",
    screenshots: [],
    tone: "tone-dreamweb",
  },
};

const defaultArt = {
  eyebrow: "Installed Adventure",
  genre: "ScummVM Adventure",
  studio: "ScummVM Runtime",
  year: "Archive",
  badge: "Playable Now",
  tag: "Ready to launch",
  screenshots: [],
  tone: "tone-default",
};

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function dedupeByHref(links) {
  return links.filter(
    (link, index, allLinks) => allLinks.findIndex((candidate) => candidate.href === link.href) === index
  );
}

function getGameMeta(game) {
  const art = { ...defaultArt, ...(artByTarget[game.target] || {}) };
  const displayTitle = getDisplayTitle(game.title);

  return {
    ...game,
    ...art,
    displayTitle,
    href: `/scummvm.html#${game.target}`,
    infoHref: game.readmeHref || "/source.html",
    summary:
      art.summary ||
      `Launch ${displayTitle} directly from the generated ScummVM web bundle and jump into the configured target immediately.`,
    heroImage: art.screenshots[1] || art.screenshots[0] || "",
    landscapeImage: art.screenshots[0] || "",
    posterImage: art.screenshots[art.screenshots.length - 1] || art.screenshots[0] || "",
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

function Icon({ name, filled = false }) {
  const commonProps = {
    "aria-hidden": "true",
    className: "icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...commonProps}>
          <path d="M6.5 16.5h11l-1.3-1.8V10a4.2 4.2 0 0 0-8.4 0v4.7Z" />
          <path d="M10 19a2.2 2.2 0 0 0 4 0" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-1.8-1l-.3-2.5h-4l-.3 2.5a8.2 8.2 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11A7 7 0 0 0 5 12c0 .3 0 .7.1 1l-2 1.5 2 3.4 2.4-1a8.2 8.2 0 0 0 1.8 1l.3 2.5h4l.3-2.5a8.2 8.2 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 10.2v5.1" />
          <path d="M12 7.7h.01" />
        </svg>
      );
    case "share":
      return (
        <svg {...commonProps}>
          <circle cx="18" cy="5.5" r="2.4" />
          <circle cx="6" cy="12" r="2.4" />
          <circle cx="18" cy="18.5" r="2.4" />
          <path d="m8.2 11 7.2-4.1" />
          <path d="m8.2 13 7.2 4.1" />
        </svg>
      );
    case "help":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M9.6 9.1a2.7 2.7 0 1 1 4.6 2c-.9.8-1.7 1.3-1.7 2.7" />
          <path d="M12 17.4h.01" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps} fill={filled ? "currentColor" : "none"}>
          <path d="m12 4.7 2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.4-4.5 2.4.9-4.9-3.6-3.5 5-.7Z" />
        </svg>
      );
    default:
      return null;
  }
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
  const engineSummary = Array.from(
    new Set(catalog.map((game) => game.engineId).filter(Boolean))
  )
    .map((engineId) => engineId.toUpperCase())
    .join(" / ");
  const footerLinks = dedupeByHref([
    { href: "/source.html", label: "Source" },
    { href: "/doc/COPYING", label: "License" },
    { href: "/doc/COPYRIGHT", label: "Copyright" },
    ...catalog
      .filter((game) => game.readmeHref)
      .map((game) => ({ href: game.readmeHref, label: `${game.displayTitle} Readme` })),
  ]).slice(0, 4);
  const buildStamp = `${shortCommit(sourceInfo.project.commit)} / ${shortCommit(
    sourceInfo.scummvm.commit
  )}`;

  return (
    <>
      <nav className="dashboard-nav">
        <div className="nav-cluster nav-cluster-left">
          <a className="nav-brand" href="#browse">
            ScummVM
          </a>

          <div className="nav-links" aria-label="Main">
            <a className="is-active" href="#browse">
              Browse
            </a>
            <a href="#library">Library</a>
            <a href="#archive">Archive</a>
          </div>
        </div>

        <div className="nav-tools" aria-label="Actions">
          <a className="nav-icon-button" href="#library" aria-label="Browse games">
            <Icon name="search" />
          </a>
          <a className="nav-icon-button" href="#archive" aria-label="Open archive notes">
            <Icon name="bell" />
          </a>
          <a className="nav-icon-button" href="/source.html" aria-label="Open source offer">
            <Icon name="settings" />
          </a>
          <a className="nav-avatar" href={featuredGame.href} aria-label={`Launch ${featuredGame.displayTitle}`}>
            {featuredGame.displayTitle.slice(0, 2).toUpperCase()}
          </a>
        </div>
      </nav>

      <main className="page-shell">
        <section
          className={`hero-stage ${featuredGame.tone}`}
          id="browse"
          style={featuredGame.heroImage ? { "--hero-art": `url(${featuredGame.heroImage})` } : undefined}
        >
          <div className="hero-backdrop" />
          <div className="hero-gradient" />

          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">{featuredGame.eyebrow}</p>
              <h1>{featuredGame.displayTitle}</h1>
              <p className="hero-summary">{featuredGame.summary}</p>

              <div className="hero-actions">
                <LaunchButton href={featuredGame.href} label="Start Adventure" />
                <a className="secondary-button" href={featuredGame.infoHref}>
                  <Icon name="info" />
                  <span>Game Info</span>
                </a>
              </div>

              <dl className="hero-metadata">
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
                  <dd>{engineSummary || "ScummVM"}</dd>
                </div>
              </dl>

              <div className="hero-status">
                <span>{formatGameCount(catalog.length)}</span>
                <span>{featuredGame.target}</span>
                <span>{featuredGame.badge}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="section-stack">
          <section className="content-band" id="library">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Recently Played
              </h2>
            </div>

            <div className="landscape-rail">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`landscape-card ${game.tone}`}
                  href={game.href}
                  style={
                    game.landscapeImage ? { "--card-art": `url(${game.landscapeImage})` } : undefined
                  }
                >
                  <div className="landscape-overlay">
                    <h3>{game.displayTitle}</h3>
                    <div className="landscape-meta">
                      <span>{game.genre}</span>
                      <span>{game.studio}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section className="content-band">
            <div className="section-header section-header-split">
              <h2>
                <span className="section-mark" />
                Installed Library
              </h2>
              <a className="section-link" href={featuredGame.href}>
                Launch Featured
              </a>
            </div>

            <div className="poster-grid">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`poster-card ${game.tone}`}
                  href={game.href}
                  style={game.posterImage ? { "--poster-art": `url(${game.posterImage})` } : undefined}
                >
                  <div className="poster-media" />
                  <div className="poster-overlay">
                    <p>{game.displayTitle}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section className="content-band" id="archive">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Adventure Deck
              </h2>
            </div>

            <div className="spotlight-rail">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`spotlight-card ${game.tone}`}
                  href={game.href}
                  style={
                    game.landscapeImage ? { "--spotlight-art": `url(${game.landscapeImage})` } : undefined
                  }
                >
                  <div className="spotlight-media" />
                  <div className="spotlight-copy">
                    <div>
                      <span className="spotlight-kicker">{game.tag}</span>
                      <h3>{game.displayTitle}</h3>
                      <p>{game.summary}</p>
                    </div>
                    <div className="spotlight-badge">
                      <Icon name="star" filled />
                      <span>{game.badge}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-copy">
          <strong>ScummVM Archivist</strong>
          <p>
            Bundle built {sourceInfo.generated_at_utc.slice(0, 10)} from {buildStamp}. Launcher
            targets still point directly at the detected ScummVM entries in this archive.
          </p>
        </div>

        <div className="footer-links">
          {footerLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </div>

        <div className="footer-tools">
          <a className="footer-icon-button" href="/source.html" aria-label="Share source offer">
            <Icon name="share" />
          </a>
          <a className="footer-icon-button" href="/doc/README.md" aria-label="Open ScummVM readme">
            <Icon name="help" />
          </a>
        </div>
      </footer>
    </>
  );
}

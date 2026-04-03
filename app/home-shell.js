import LaunchButton from "./launch-button";
import RecentGamesRail from "./recent-games-rail";

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function DecorativeImage({
  className,
  fetchPriority,
  loading = "lazy",
  src,
  style,
}) {
  if (!src) {
    return null;
  }

  const resolvedFetchPriority = fetchPriority || (loading === "lazy" ? "low" : undefined);

  return (
    <img
      alt=""
      className={className}
      decoding="async"
      fetchPriority={resolvedFetchPriority}
      loading={loading}
      src={src}
      style={style}
    />
  );
}

function Icon({ name }) {
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
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 10.2v5.1" />
          <path d="M12 7.7h.01" />
        </svg>
      );
    case "github":
      return (
        <svg
          {...commonProps}
          fill="currentColor"
          stroke="none"
          viewBox="0 0 24 24"
        >
          <path d="M12 2C6.48 2 2 6.58 2 12.22c0 4.51 2.87 8.33 6.84 9.68.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.21-3.37-1.21-.46-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.15-4.56-5.1 0-1.13.39-2.05 1.04-2.78-.11-.26-.45-1.31.1-2.72 0 0 .85-.28 2.78 1.06A9.4 9.4 0 0 1 12 6.89c.85 0 1.71.12 2.51.36 1.93-1.34 2.78-1.06 2.78-1.06.55 1.41.21 2.46.1 2.72.65.73 1.04 1.65 1.04 2.78 0 3.96-2.35 4.84-4.59 5.09.36.32.69.94.69 1.91 0 1.38-.01 2.49-.01 2.83 0 .27.18.6.69.49A10.24 10.24 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z" />
        </svg>
      );
    default:
      return null;
  }
}

function getDialogId(game) {
  return `game-${game.slug || game.target}`;
}

function getDialogLinkProps(href) {
  if (!href.startsWith("http://") && !href.startsWith("https://")) {
    return {};
  }

  return {
    rel: "noreferrer",
    target: "_blank",
  };
}

function getHeroImageStyle(position) {
  if (!position) {
    return undefined;
  }

  return {
    objectPosition: position,
  };
}

const installedLibraryOrder = [
  "sky",
  "queen",
  "dreamweb-cd",
  "lure",
  "sword25",
  "drascula",
  "nippon-amiga",
];

export default function HomeShell({
  catalog,
  featuredGame,
  logoSrc,
  scummvmVersion,
  scummvmOfficialSite,
  sourceInfoDate,
}) {
  const featuredDialogId = getDialogId(featuredGame);
  const installedCatalog = [...catalog].sort((left, right) => {
    const leftIndex = installedLibraryOrder.indexOf(left.target);
    const rightIndex = installedLibraryOrder.indexOf(right.target);
    const normalizedLeftIndex = leftIndex === -1 ? installedLibraryOrder.length : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? installedLibraryOrder.length : rightIndex;

    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }

    return left.displayTitle.localeCompare(right.displayTitle);
  });

  return (
    <>
      <nav className="dashboard-nav">
          <div className="nav-cluster nav-cluster-left">
            <div className="nav-brand-group">
              <div className="nav-brand-stack">
                <a className="nav-brand" href="#browse" aria-label="scummweb">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="nav-brand-logo"
                    decoding="async"
                    height="372"
                    loading="eager"
                    src={logoSrc}
                    width="1884"
                  />
                </a>
                <p className="nav-brand-tagline">Unofficial ScummVM WASM port</p>
              </div>
            </div>

          <div className="nav-links" aria-label="Main">
            <a href="#library">Library</a>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              ScummVM
            </a>
          </div>
        </div>

        <div className="nav-actions">
          <a
            aria-label="View scummweb on GitHub"
            className="nav-icon-link"
            href="https://github.com/tsilva/scummweb"
            rel="noreferrer"
            target="_blank"
          >
            <Icon name="github" />
          </a>
        </div>
      </nav>

      <main className="page-shell">
        <section className={`hero-stage ${featuredGame.tone}`} id="browse">
          <div className="hero-backdrop">
            <DecorativeImage
              className="hero-backdrop-image"
              fetchPriority="high"
              loading="eager"
              src={featuredGame.heroImage}
              style={getHeroImageStyle(featuredGame.heroImagePosition)}
            />
          </div>
          <div className="hero-gradient" />

          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">{featuredGame.eyebrow}</p>
              <h1>{featuredGame.displayTitle}</h1>
              <p className="hero-summary">{featuredGame.summary}</p>

              <div className="hero-actions">
                <LaunchButton href={featuredGame.href} label="Start Adventure" />
                <a className="secondary-button" href={`#${featuredDialogId}`}>
                  <Icon name="info" />
                  <span>More Info</span>
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

            <RecentGamesRail catalog={catalog} />
          </section>

          <section className="content-band">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Installed Library
              </h2>
            </div>

            <div className="poster-grid">
              {installedCatalog.map((game) => (
                <a
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`poster-card ${game.tone}`}
                  data-game-target={game.target}
                  href={`#${getDialogId(game)}`}
                >
                  <div className="poster-media">
                    <DecorativeImage className="poster-media-image" src={game.posterImage} />
                  </div>
                  <div className="poster-overlay">
                    <p>{game.displayTitle}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>

        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-copy">
          <strong>ScummWEB</strong>
          <p>
            Bundle built {sourceInfoDate}. ScummVM version {scummvmVersion}.
          </p>
        </div>
      </footer>

      {catalog.map((game) => {
        const dialogId = getDialogId(game);
        const modalImage = game.heroImage || game.landscapeImage || game.posterImage;

        return (
          <div className="game-detail-modal" id={dialogId} key={game.target}>
            <a
              aria-label={`Close details for ${game.displayTitle}`}
              className="game-detail-backdrop"
              href="#browse"
            />
            <div
              aria-labelledby={`${dialogId}-title`}
              aria-modal="true"
              className={`game-detail-panel ${game.tone}`}
              role="dialog"
            >
              <div className="game-detail-visual">
                <DecorativeImage
                  className="game-detail-visual-image"
                  loading="eager"
                  src={modalImage}
                  style={getHeroImageStyle(game.heroImagePosition)}
                />
                <a
                  aria-label={`Close details for ${game.displayTitle}`}
                  className="game-detail-close"
                  href="#browse"
                >
                  ×
                </a>
                <div className="game-detail-visual-copy">
                  <p className="hero-kicker">{game.eyebrow}</p>
                  <h2 id={`${dialogId}-title`}>{game.displayTitle}</h2>
                  <div className="game-detail-visual-meta">
                    <span>{game.year}</span>
                    <span>{game.genre}</span>
                    <span>{game.badge}</span>
                  </div>
                  <p className="game-detail-summary">{game.summary}</p>

                  <div className="game-detail-actions">
                    <LaunchButton href={game.href} label="Launch Game" />
                  </div>
                </div>
              </div>

              <div className="game-detail-copy">
                <dl className="game-detail-metadata">
                  <div>
                    <dt>Studio</dt>
                    <dd>{game.studio}</dd>
                  </div>
                  <div>
                    <dt>Release</dt>
                    <dd>{game.year}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{game.target}</dd>
                  </div>
                  <div>
                    <dt>Collection</dt>
                    <dd>{game.tag}</dd>
                  </div>
                </dl>

                {game.screenshots.length > 0 ? (
                  <div className="game-detail-strip" aria-label={`${game.displayTitle} screenshots`}>
                    {game.screenshots.map((shot, index) => (
                      <div
                        key={shot}
                        className="game-detail-shot"
                        title={`${game.displayTitle} screenshot ${index + 1}`}
                      >
                        <DecorativeImage className="game-detail-shot-image" src={shot} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

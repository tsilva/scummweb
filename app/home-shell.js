import LaunchButton from "./launch-button";

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function DecorativeImage({
  className,
  fetchPriority,
  loading = "lazy",
  src,
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
    />
  );
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
    case "star":
      return (
        <svg {...commonProps} fill={filled ? "currentColor" : "none"}>
          <path d="m12 4.7 2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.4-4.5 2.4.9-4.9-3.6-3.5 5-.7Z" />
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

export default function HomeShell({
  buildStamp,
  catalog,
  featuredGame,
  logoSrc,
  projectRepositoryUrl,
  scummvmOfficialSite,
  sourceHref,
  sourceInfoDate,
}) {
  const featuredDialogId = getDialogId(featuredGame);

  return (
    <>
      <nav className="dashboard-nav">
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <a className="nav-brand" href="#browse" aria-label="ScummVM Web">
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
          </div>

          <div className="nav-links" aria-label="Main">
            <a className="is-active" href="#browse">
              Browse
            </a>
            <a href="#library">Library</a>
            <a href="#archive">Archive</a>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              Original Project
            </a>
          </div>
        </div>

        <div className="nav-tools" aria-label="Actions">
          <a
            className="nav-icon-button"
            href={projectRepositoryUrl}
            aria-label="View project on GitHub"
            rel="noreferrer"
            target="_blank"
          >
            <Icon name="github" />
          </a>
          <a className="nav-icon-button" href="#library" aria-label="Browse games">
            <Icon name="search" />
          </a>
          <a className="nav-icon-button" href="#archive" aria-label="Open archive notes">
            <Icon name="bell" />
          </a>
          <a className="nav-icon-button" href={sourceHref} aria-label="Open source offer">
            <Icon name="settings" />
          </a>
          <a
            aria-label={`Open details for ${featuredGame.displayTitle}`}
            aria-haspopup="dialog"
            className="nav-avatar"
            data-game-target={featuredGame.target}
            href={`#${featuredDialogId}`}
          >
            {featuredGame.displayTitle.slice(0, 2).toUpperCase()}
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

            <div className="landscape-rail">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`landscape-card ${game.tone}`}
                  data-game-target={game.target}
                  href={`#${getDialogId(game)}`}
                >
                  <DecorativeImage className="landscape-card-image" src={game.landscapeImage} />
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
              <a
                aria-haspopup="dialog"
                className="section-link"
                data-game-target={featuredGame.target}
                href={`#${featuredDialogId}`}
              >
                Open Featured
              </a>
            </div>

            <div className="poster-grid">
              {catalog.map((game) => (
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
                  aria-haspopup="dialog"
                  className={`spotlight-card ${game.tone}`}
                  data-game-target={game.target}
                  href={`#${getDialogId(game)}`}
                >
                  <div className="spotlight-media">
                    <DecorativeImage className="spotlight-media-image" src={game.spotlightImage} />
                  </div>
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
          <strong>ScummVM Web</strong>
          <p>
            Bundle built {sourceInfoDate} from {buildStamp}. Launcher routes now boot directly into
            the detected ScummVM entries in this archive.
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
                <DecorativeImage className="game-detail-visual-image" src={modalImage} />
                <div className="game-detail-visual-copy">
                  <p className="hero-kicker">{game.eyebrow}</p>
                  <h2 id={`${dialogId}-title`}>{game.displayTitle}</h2>
                  <div className="game-detail-visual-meta">
                    <span>{game.year}</span>
                    <span>{game.genre}</span>
                    <span>{game.badge}</span>
                  </div>
                </div>
              </div>

              <div className="game-detail-copy">
                <a
                  aria-label={`Close details for ${game.displayTitle}`}
                  className="game-detail-close"
                  href="#browse"
                >
                  ×
                </a>

                <p className="game-detail-summary">{game.summary}</p>

                <div className="game-detail-actions">
                  <LaunchButton href={game.href} label="Launch Game" />
                  <a
                    className="secondary-button"
                    href={game.infoHref}
                    {...getDialogLinkProps(game.infoHref)}
                  >
                    <Icon name="info" />
                    <span>Read Notes</span>
                  </a>
                </div>

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

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
  scummvmOfficialSite,
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
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              Original Project
            </a>
          </div>
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
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Installed Library
              </h2>
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

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getLinkProps(href) {
  if (!href.startsWith("http://") && !href.startsWith("https://")) {
    return {};
  }

  return {
    rel: "noreferrer",
    target: "_blank",
  };
}

function getCardImage(game) {
  return game.landscapeImage || game.posterImage || game.heroImage || game.screenshots[0] || "";
}

export default function HomeShell({
  buildStamp,
  catalog,
  featuredGame,
  projectRepositoryUrl,
  scummvmOfficialSite,
  sourceHref,
  sourceInfoDate,
}) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="/">
            ScummVM Web
          </a>

          <nav className="site-nav" aria-label="Primary">
            <a href="#library">Library</a>
            <a href="#build-info">Build</a>
            <a href={sourceHref}>Source</a>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              ScummVM
            </a>
          </nav>
        </div>
      </header>

      <main className="home-page" id="main-content">
        <section className="hero-shell">
          <div className="hero-copy-simple">
            <p className="hero-kicker">Browser-ready freeware adventures</p>
            <h1>Play ScummVM classics instantly from a static web shell.</h1>
            <p className="hero-summary">
              This launcher ships a prebuilt ScummVM WebAssembly bundle, points game payloads at
              the bucket origin, and exposes the matching source and license materials for the
              hosted build.
            </p>

            <div className="hero-actions">
              <a className="launch-button" href={featuredGame.href}>
                Play {featuredGame.displayTitle}
              </a>
              <a className="secondary-button" href={sourceHref}>
                Source And Licenses
              </a>
            </div>

            <ul className="hero-stats" role="list">
              <li>{formatGameCount(catalog.length)}</li>
              <li>{featuredGame.target}</li>
              <li>{featuredGame.badge}</li>
            </ul>
          </div>

          <aside className="hero-panel-simple">
            <img
              alt="ScummVM Web logo"
              className="hero-logo"
              decoding="async"
              height="88"
              src="/logo.svg"
              width="88"
            />

            <div className="hero-panel-block">
              <p className="eyebrow-label">Featured Route</p>
              <strong>{featuredGame.displayTitle}</strong>
              <p>{featuredGame.summary}</p>
            </div>

            <div className="hero-panel-block">
              <p className="eyebrow-label">Build</p>
              <strong>{sourceInfoDate}</strong>
              <p>{buildStamp}</p>
            </div>
          </aside>
        </section>

        <section className="legal-banner" aria-labelledby="project-status-title">
          <div>
            <p className="eyebrow-label" id="project-status-title">
              Project Status
            </p>
            <p>
              This is not the official ScummVM website or a stock ScummVM release. It is an
              unofficial browser deployment that keeps the upstream project and bundled materials
              visible from the live site.
            </p>
          </div>

          <div className="legal-actions">
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              Visit ScummVM.org
            </a>
            <a href={sourceHref}>Review source offer</a>
          </div>
        </section>

        <section className="catalog-section" id="library">
          <div className="section-header-simple">
            <div>
              <p className="eyebrow-label">Installed Library</p>
              <h2>Launch any detected target directly.</h2>
            </div>
            <a className="section-link-simple" href={projectRepositoryUrl} rel="noreferrer" target="_blank">
              View repository
            </a>
          </div>

          <ul className="catalog-grid" role="list">
            {catalog.map((game) => {
              const cardImage = getCardImage(game);

              return (
                <li className="game-card-simple" key={game.target}>
                  <a
                    aria-label={`Launch ${game.displayTitle}`}
                    className="game-card-media"
                    href={game.href}
                  >
                    {cardImage ? (
                      <img
                        alt={`Artwork for ${game.displayTitle}`}
                        decoding="async"
                        fetchPriority="low"
                        height="540"
                        loading="lazy"
                        src={cardImage}
                        width="960"
                      />
                    ) : (
                      <span aria-hidden="true" className="game-card-fallback" />
                    )}
                  </a>

                  <div className="game-card-body">
                    <p className="game-card-badge">{game.badge}</p>
                    <h3>
                      <a href={game.href}>{game.displayTitle}</a>
                    </h3>
                    <p className="game-card-summary">{game.summary}</p>

                    <dl className="game-card-meta">
                      <div>
                        <dt>Genre</dt>
                        <dd>{game.genre}</dd>
                      </div>
                      <div>
                        <dt>Studio</dt>
                        <dd>{game.studio}</dd>
                      </div>
                      <div>
                        <dt>Released</dt>
                        <dd>{game.year}</dd>
                      </div>
                      <div>
                        <dt>Target</dt>
                        <dd>{game.target}</dd>
                      </div>
                    </dl>

                    <div className="game-card-actions">
                      <a className="launch-button" href={game.href}>
                        Play Now
                      </a>
                      <a
                        className="secondary-button"
                        href={game.infoHref}
                        {...getLinkProps(game.infoHref)}
                      >
                        Notes
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="build-grid" id="build-info">
          <article className="info-card">
            <p className="eyebrow-label">Deployment Shape</p>
            <h2>Static launcher, versioned shell assets, bucket-backed games.</h2>
            <p>
              The landing page is pre-rendered. The ScummVM shell is served from immutable,
              versioned routes, and the game files stay on the bucket origin instead of crossing
              the app server.
            </p>
          </article>

          <article className="info-card">
            <p className="eyebrow-label">Verification Path</p>
            <h2>Desktop and mobile audits are run against the live domain.</h2>
            <p>
              Playwright is used for visual checks, and Lighthouse is run against the production URL
              after deploy so the final result matches the actual site users receive.
            </p>
          </article>
        </section>
      </main>

      <footer className="site-footer home-footer">
        <div className="footer-copy">
          <strong>ScummVM Web</strong>
          <p>
            Bundle built {sourceInfoDate} from {buildStamp}. Hosted launcher routes boot directly
            into the detected ScummVM entries in this archive.
          </p>
        </div>

        <div className="footer-links">
          <a href={projectRepositoryUrl} rel="noreferrer" target="_blank">
            GitHub
          </a>
          <a href={sourceHref}>Source Offer</a>
          <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
            Original Project
          </a>
        </div>
      </footer>
    </>
  );
}

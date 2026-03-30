"use client";

import { useEffect, useState } from "react";
import LaunchButton from "./launch-button";
import ProjectNoticeModal from "./project-notice-modal";

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getArtStyle(prefix, image, options = {}) {
  if (!image) {
    return undefined;
  }

  const style = {
    [`--${prefix}-art-image`]: `url(${image})`,
  };

  if (options.position) {
    style[`--${prefix}-art-position`] = options.position;
  }

  if (options.size) {
    style[`--${prefix}-art-size`] = options.size;
  }

  if (options.repeat) {
    style[`--${prefix}-art-repeat`] = options.repeat;
  }

  return style;
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
  projectRepositoryUrl,
  scummvmOfficialSite,
  sourceHref,
  sourceInfoDate,
}) {
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    if (!selectedGame) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setSelectedGame(null);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedGame]);

  function openGameDetails(game) {
    setSelectedGame(game);
  }

  return (
    <>
      <ProjectNoticeModal officialHref={scummvmOfficialSite} sourceHref={sourceHref} />

      <nav className="dashboard-nav">
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <a className="nav-brand" href="#browse">
              ScummVM Web
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
          <button
            aria-label={`Open details for ${featuredGame.displayTitle}`}
            aria-haspopup="dialog"
            className="nav-avatar"
            data-game-target={featuredGame.target}
            onClick={() => openGameDetails(featuredGame)}
            type="button"
          >
            {featuredGame.displayTitle.slice(0, 2).toUpperCase()}
          </button>
        </div>
      </nav>

      <main className="page-shell">
        <section
          className={`hero-stage ${featuredGame.tone}`}
          id="browse"
          style={getArtStyle("hero", featuredGame.heroImage)}
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
                <button
                  className="secondary-button"
                  onClick={() => openGameDetails(featuredGame)}
                  type="button"
                >
                  <Icon name="info" />
                  <span>More Info</span>
                </button>
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
                <button
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`landscape-card ${game.tone}`}
                  data-game-target={game.target}
                  onClick={() => openGameDetails(game)}
                  style={getArtStyle("card", game.landscapeImage)}
                  type="button"
                >
                  <div className="landscape-overlay">
                    <h3>{game.displayTitle}</h3>
                    <div className="landscape-meta">
                      <span>{game.genre}</span>
                      <span>{game.studio}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="content-band">
            <div className="section-header section-header-split">
              <h2>
                <span className="section-mark" />
                Installed Library
              </h2>
              <button
                aria-haspopup="dialog"
                className="section-link"
                data-game-target={featuredGame.target}
                onClick={() => openGameDetails(featuredGame)}
                type="button"
              >
                Open Featured
              </button>
            </div>

            <div className="poster-grid">
              {catalog.map((game) => (
                <button
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`poster-card ${game.tone}`}
                  data-game-target={game.target}
                  onClick={() => openGameDetails(game)}
                  style={getArtStyle("poster", game.posterImage)}
                  type="button"
                >
                  <div className="poster-media" />
                  <div className="poster-overlay">
                    <p>{game.displayTitle}</p>
                  </div>
                </button>
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
                <button
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`spotlight-card ${game.tone}`}
                  data-game-target={game.target}
                  onClick={() => openGameDetails(game)}
                  style={getArtStyle("spotlight", game.spotlightImage)}
                  type="button"
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
                </button>
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

      {selectedGame ? (
        <div
          aria-labelledby="game-detail-title"
          className="game-detail-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="game-detail-backdrop" onClick={() => setSelectedGame(null)} />
          <div className={`game-detail-panel ${selectedGame.tone}`}>
            <div
              className="game-detail-visual"
              style={getArtStyle(
                "modal",
                selectedGame.heroImage || selectedGame.landscapeImage || selectedGame.posterImage
              )}
            >
              <div className="game-detail-visual-copy">
                <p className="hero-kicker">{selectedGame.eyebrow}</p>
                <h2 id="game-detail-title">{selectedGame.displayTitle}</h2>
                <div className="game-detail-visual-meta">
                  <span>{selectedGame.year}</span>
                  <span>{selectedGame.genre}</span>
                  <span>{selectedGame.badge}</span>
                </div>
              </div>
            </div>

            <div className="game-detail-copy">
              <button
                aria-label={`Close details for ${selectedGame.displayTitle}`}
                className="game-detail-close"
                onClick={() => setSelectedGame(null)}
                type="button"
              >
                ×
              </button>

              <p className="game-detail-summary">{selectedGame.summary}</p>

              <div className="game-detail-actions">
                <LaunchButton href={selectedGame.href} label="Launch Game" />
                <a
                  className="secondary-button"
                  href={selectedGame.infoHref}
                  {...getDialogLinkProps(selectedGame.infoHref)}
                >
                  <Icon name="info" />
                  <span>Read Notes</span>
                </a>
              </div>

              <dl className="game-detail-metadata">
                <div>
                  <dt>Studio</dt>
                  <dd>{selectedGame.studio}</dd>
                </div>
                <div>
                  <dt>Release</dt>
                  <dd>{selectedGame.year}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{selectedGame.target}</dd>
                </div>
                <div>
                  <dt>Collection</dt>
                  <dd>{selectedGame.tag}</dd>
                </div>
              </dl>

              {selectedGame.screenshots.length > 0 ? (
                <div className="game-detail-strip" aria-label={`${selectedGame.displayTitle} screenshots`}>
                  {selectedGame.screenshots.map((shot, index) => (
                    <div
                      key={shot}
                      className="game-detail-shot"
                      style={getArtStyle("shot", shot)}
                      title={`${selectedGame.displayTitle} screenshot ${index + 1}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

import GameDetailModal from "./home-shell/game-detail-modal";
import GameBucket from "./home-shell/game-bucket";
import LibraryCards from "./home-shell/library-cards";
import Icon from "./home-shell/shell-icon";
import HeroStage from "./home-shell/hero-stage";
import HomeHero from "./home-shell/home-hero";
import LocalGame from "./home-shell/local-game";
import RecentGamesRail from "./recent-games-rail";
import { getGamesOrigin } from "../lib/site-config.mjs";

export default function HomeShell({
  catalog,
  featuredGame,
  logoSrc,
  pageMode = "game",
  scummvmVersion,
  scummvmOfficialSite,
  sourceInfoDate,
}) {
  const isHomePage = pageMode === "home";
  const recentHeading = "Browser-Playable Classics";
  const libraryHeading = "Freeware Adventure Library";

  return (
    <>
      <nav className="dashboard-nav">
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <div className="nav-brand-stack">
              <a className="nav-brand" href="#browse" aria-label="ScummWEB">
                <img
                  alt=""
                  aria-hidden="true"
                  className="nav-brand-logo"
                  decoding="async"
                  fetchPriority="low"
                  height="54"
                  loading="eager"
                  src={logoSrc}
                  width="273"
                />
              </a>
              <p className="nav-brand-tagline">Classic adventures in your browser</p>
            </div>
          </div>

          <div className="nav-links" aria-label="Main">
            <a href="#library">Library</a>
            {isHomePage && <a href="#local-game-heading">Local ZIP</a>}
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
        {isHomePage ? (
          <HomeHero catalog={catalog} featuredGame={featuredGame} />
        ) : (
          <HeroStage featuredGame={featuredGame} gameCount={catalog.length} />
        )}
        <div className="section-stack">
          {!isHomePage ? (
            <section className="content-band game-play-guide" aria-labelledby="game-play-guide">
              <div className="section-header">
                <h2 id="game-play-guide">
                  <span className="section-mark" />
                  How to play {featuredGame.displayTitle}
                </h2>
              </div>
              <p><strong>Browser edition</strong> · {featuredGame.title}</p>
              <p>
                Use the button above to launch ScummVM in your browser. The player loads the game
                files automatically.
              </p>
              <p>
                Use your mouse to point and click. On touch devices, use the player’s on-screen
                mouse buttons for left and right clicks.
              </p>
              {featuredGame.infoHref ? (
                <a className="game-details-link" href={featuredGame.infoHref}>
                  Readme or license for {featuredGame.displayTitle}
                </a>
              ) : null}
            </section>
          ) : null}

          <section className="content-band" id="library">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                {recentHeading}
              </h2>
            </div>

            <RecentGamesRail catalog={catalog} />
          </section>

          {isHomePage && <LocalGame />}

          <section className="content-band">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                {libraryHeading}
              </h2>
            </div>

            {isHomePage ? (
              <GameBucket catalog={catalog} officialUrl={getGamesOrigin()} />
            ) : (
              <LibraryCards games={catalog} />
            )}
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

      {catalog.map((game) => (
        <GameDetailModal game={game} key={game.target} />
      ))}
    </>
  );
}

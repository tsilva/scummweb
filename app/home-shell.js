import GameDetailModal from "./home-shell/game-detail-modal";
import { SettingsButton } from "./home-shell/game-bucket";
import LibraryCards from "./home-shell/library-cards";
import Icon from "./home-shell/shell-icon";
import HeroStage from "./home-shell/hero-stage";
import HomeHero from "./home-shell/home-hero";
import SourceLibrary from "./home-shell/source-library";
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
  const libraryHeading = isHomePage ? "Game Library" : "Freeware Adventure Library";

  return (
    <>
      <nav className={isHomePage ? "dashboard-nav dashboard-nav-home" : "dashboard-nav"}>
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
          {isHomePage && <SettingsButton />}
        </div>
      </nav>

      <main className="page-shell">
        {isHomePage ? (
          <HomeHero catalog={catalog} featuredGame={featuredGame} />
        ) : (
          <HeroStage featuredGame={featuredGame} gameCount={catalog.length} />
        )}
        <div className="section-stack">
          <section className="content-band">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                {recentHeading}
              </h2>
            </div>

            <RecentGamesRail catalog={catalog} />
          </section>

          <section className="content-band" id="library">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                {libraryHeading}
              </h2>
            </div>

            {isHomePage ? (
              <SourceLibrary catalog={catalog} officialUrl={getGamesOrigin()} />
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

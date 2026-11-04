import CompatibilityModal from "./home-shell/compatibility-modal";
import Icon from "./home-shell/shell-icon";
import SourceLibrary from "./home-shell/source-library";
import { getGamesOrigin } from "../lib/site-config.mjs";

export default function HomeShell({
  catalog,
  featuredGame,
  logoSrc,
  pageMode = "game",
  scummvmVersion,
  scummvmOfficialSite,
  sourceInfoDate,
  children,
}) {
  const isHomePage = pageMode === "home";
  const libraryHeading = isHomePage ? "Game Library" : "Freeware Adventure Library";

  return (
    <>
      <nav className={isHomePage ? "dashboard-nav dashboard-nav-home" : "dashboard-nav"}>
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <div className="nav-brand-stack">
              <a className="nav-brand" href={pageMode === "compatibility" ? "/" : "#browse"} aria-label="ScummWEB">
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
            <a href={pageMode === "compatibility" ? "/#library" : "#library"}>Library</a>
            <a href="/compatibility" aria-current={pageMode === "compatibility" ? "page" : undefined}>Compatibility</a>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              ScummVM
            </a>
          </div>
        </div>

        <div className="nav-actions">
          <CompatibilityModal />
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
        {children ?? <SourceLibrary
          catalog={catalog}
          featuredGame={featuredGame}
          isHomePage={isHomePage}
          libraryHeading={libraryHeading}
          officialUrl={getGamesOrigin()}
        />}
      </main>

      <footer className="site-footer">
        <div className="footer-copy">
          <strong>ScummWEB</strong>
          <p>
            Bundle built {sourceInfoDate}. ScummVM version {scummvmVersion}.
          </p>
        </div>
        <div className="footer-links"><a href="/compatibility">Game compatibility</a></div>
      </footer>

    </>
  );
}

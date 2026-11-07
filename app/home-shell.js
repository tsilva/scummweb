import Link from "next/link";
import Icon from "./home-shell/shell-icon";
import SourceLibrary from "./home-shell/source-library";
import SettingsPanel from "./home-shell/settings-panel";
import { getGamesOrigin } from "../lib/site-config.mjs";
import { artworkStorage } from "../lib/artwork-storage.mjs";
import assetConfig from "../lib/scummvm-shell-assets";

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
  const BrandLink = isHomePage ? "a" : Link;
  const libraryHeading = "Game Library";

  return (
    <>
      {artworkStorage.published && <link rel="preconnect" href={artworkStorage.origin} />}
      <nav className={pageMode === "compatibility" ? "dashboard-nav" : "dashboard-nav dashboard-nav-home"}>
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <div className="nav-brand-stack">
              <BrandLink className="nav-brand" href={isHomePage ? "#top" : "/"} aria-label="ScummWEB home">
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
              </BrandLink>
              <p className="nav-brand-tagline">Classic adventures in your browser</p>
            </div>
          </div>

          <div className="nav-links" aria-label="Main">
            <Link href={pageMode === "compatibility" ? "/#library" : "#library"}>Library</Link>
            <Link href="/compatibility" aria-current={pageMode === "compatibility" ? "page" : undefined}>Compatibility</Link>
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
          <SettingsPanel catalog={catalog} officialUrl={getGamesOrigin()} scummvmVersion={scummvmVersion} sourceInfoDate={sourceInfoDate} />
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
            ScummWEB is an independent browser frontend for ScummVM. It is not affiliated with, endorsed by, or sponsored by the ScummVM project.
          </p>
          <p>
            Bundle built {sourceInfoDate}. ScummVM version {scummvmVersion}.{" "}
            <a href={assetConfig.sourceOfferPage}>ScummVM source and licenses</a>
          </p>
        </div>
      </footer>

    </>
  );
}

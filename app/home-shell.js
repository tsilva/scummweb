import Link from "next/link";
import { Fragment } from "react";
import { getVersionedSiteAssetPath } from "./asset-paths";
import Icon from "./home-shell/shell-icon";
import SourceLibrary from "./home-shell/source-library";
import SettingsPanel from "./home-shell/settings-panel";
import InstallPrompt from "./home-shell/install-prompt";
import DirectionalNavigation from "./home-shell/directional-navigation";
import GalleryOrientation from "./home-shell/GalleryOrientation";
import { getGamesOrigin } from "../lib/site-config.mjs";
import { artworkDelivery, artworkStorage } from "../lib/artwork-storage.mjs";
import assetConfig from "../lib/scummvm-shell-assets";

const repositoryUrl = "https://github.com/tsilva/scummweb";

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
  const LibraryLink = pageMode === "compatibility" ? Link : "a";
  const libraryHeading = "Game Library";
  const Shell = pageMode === "compatibility" ? Fragment : GalleryOrientation;
  const galleryUrl = isHomePage && artworkStorage.published
    ? getVersionedSiteAssetPath("/gallery-artwork.json") : null;
  const artworkGames = featuredGame ? [...catalog, featuredGame] : catalog;
  const artwork = children == null ? artworkDelivery(galleryUrl
    ? artworkGames.map((game) => game === featuredGame ? game : { ...game, screenshots: [] })
    : artworkGames) : null;

  return (
    <Shell>
      <DirectionalNavigation initialFocus={pageMode === "compatibility" ? undefined : "play"} />
      {artworkStorage.published && <link rel="preconnect" href={artworkStorage.origin} />}
      <nav className={pageMode === "compatibility" ? "dashboard-nav" : "dashboard-nav dashboard-nav-home"}>
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
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
                srcSet={`${getVersionedSiteAssetPath("/brand/logo/logo-nav-142.png")} 1x, ${logoSrc} 2x`}
                width="273"
              />
              <p className="nav-brand-tagline">Classic adventures in your browser</p>
            </BrandLink>
          </div>

          <div className="nav-links" aria-label="Main">
            <LibraryLink className="nav-library-link" href={pageMode === "compatibility" ? "/#library" : "#library"}>Library</LibraryLink>
            <Link href="/compatibility" prefetch={isHomePage ? false : undefined} aria-current={pageMode === "compatibility" ? "page" : undefined}>Compatibility</Link>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              ScummVM
            </a>
          </div>
        </div>

        <div className="nav-actions">
          <a
            aria-label="View scummweb on GitHub"
            className="nav-icon-link nav-github-link"
            href={repositoryUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Icon name="github" />
          </a>
          <SettingsPanel catalog={catalog} officialUrl={getGamesOrigin()} scummvmVersion={scummvmVersion} sourceInfoDate={sourceInfoDate} />
        </div>
      </nav>

      {isHomePage && <InstallPrompt />}

      <main className="page-shell">
        {children ?? <SourceLibrary
          artwork={galleryUrl ? { ...artwork, galleryUrl } : artwork}
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
          <p className="footer-github">
            <a href={repositoryUrl} rel="noreferrer" target="_blank">ScummWEB on GitHub</a>
          </p>
        </div>
      </footer>

    </Shell>
  );
}

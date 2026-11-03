import GameBucket from "./home-shell/game-bucket";
import LibraryCards from "./home-shell/library-cards";
import { getGamesOrigin } from "../lib/site-config.mjs";
import LaunchButton from "./launch-button";
import GameDetailModal from "./home-shell/game-detail-modal";
import DecorativeImage from "./home-shell/decorative-image";
import Icon from "./home-shell/shell-icon";
import RecentGamesRail from "./recent-games-rail";
import { getGameDialogId, getHeroImageStyle } from "./home-shell/shared";
import {
  HOME_BROWSE_LABEL,
  HOME_HERO_KICKER,
  HOME_HERO_SUMMARY,
  HOME_HERO_TITLE,
} from "./seo";

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

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
  const featuredDialogId = getGameDialogId(featuredGame);
  const heroKicker = isHomePage ? HOME_HERO_KICKER : featuredGame.eyebrow;
  const heroTitle = isHomePage ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = isHomePage ? HOME_HERO_SUMMARY : featuredGame.summary;
  const heroBackdropSrcSet = featuredGame.heroImageMobile
    ? `${featuredGame.heroImageMobile} 960w, ${featuredGame.heroImage} 2564w`
    : undefined;
  const primaryActionLabel = isHomePage ? `Play ${featuredGame.displayTitle}` : "Play";
  const secondaryActionHref = isHomePage ? "#library" : `#${featuredDialogId}`;
  const secondaryActionLabel = isHomePage ? HOME_BROWSE_LABEL : "More Info";
  const heroMetadata = isHomePage
    ? [
        { label: "Flagship classic", value: featuredGame.displayTitle },
        { label: "Collection", value: "Freeware adventures" },
      ]
    : [
        { label: "Studio", value: featuredGame.studio },
        { label: "Genre", value: featuredGame.genre },
      ];
  const heroStatus = isHomePage
    ? [formatGameCount(catalog.length), "Freeware classics", "Instant browser play"]
    : [formatGameCount(catalog.length), featuredGame.target, featuredGame.badge];
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
              sizes="100vw"
              src={featuredGame.heroImage}
              srcSet={heroBackdropSrcSet}
              style={getHeroImageStyle(featuredGame.heroImagePosition)}
            />
          </div>
          <div className="hero-gradient" />

          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">{heroKicker}</p>
              <h1>
                {isHomePage ? (
                  heroTitle
                ) : (
                  <a
                    href={featuredGame.href}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {heroTitle}
                  </a>
                )}
              </h1>
              <p className="hero-summary">{heroSummary}</p>

              <div className="hero-actions">
                <LaunchButton href={featuredGame.playHref} entryPoint={isHomePage ? "hero" : "game_detail"} label={primaryActionLabel} />
                <a className="secondary-button" href={secondaryActionHref}>
                  {!isHomePage ? <Icon name="info" /> : null}
                  <span>{secondaryActionLabel}</span>
                </a>
              </div>

              <dl className="hero-metadata">
                {heroMetadata.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="hero-status">
                {heroStatus.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
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
                Select Play above to launch ScummVM in your browser. The player loads the game
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

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

const installedLibraryOrder = [
  "sky",
  "queen",
  "dreamweb-cd",
  "lure",
  "sword25",
  "drascula",
  "nippon-amiga",
];

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
  const installedCatalog = [...catalog].sort((left, right) => {
    const leftIndex = installedLibraryOrder.indexOf(left.target);
    const rightIndex = installedLibraryOrder.indexOf(right.target);
    const normalizedLeftIndex = leftIndex === -1 ? installedLibraryOrder.length : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? installedLibraryOrder.length : rightIndex;

    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }

    return left.displayTitle.localeCompare(right.displayTitle);
  });
  const heroKicker = isHomePage ? HOME_HERO_KICKER : featuredGame.eyebrow;
  const heroTitle = isHomePage ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = isHomePage ? HOME_HERO_SUMMARY : featuredGame.summary;
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
                  height="372"
                  loading="eager"
                  src={logoSrc}
                  width="1884"
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
              src={featuredGame.heroImage}
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
                <LaunchButton href={featuredGame.playHref} label={primaryActionLabel} />
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

            <div className="poster-grid">
              {installedCatalog.map((game) => (
                <a
                  key={game.target}
                  aria-haspopup="dialog"
                  className={`poster-card ${game.tone}`}
                  data-game-target={game.target}
                  href={`#${getGameDialogId(game)}`}
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

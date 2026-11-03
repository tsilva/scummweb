import LaunchButton from "../launch-button";
import { HOME_BROWSE_LABEL, HOME_HERO_KICKER, HOME_HERO_SUMMARY, HOME_HERO_TITLE } from "../seo";
import DecorativeImage from "./decorative-image";
import Icon from "./shell-icon";
import { getGameDialogId, getHeroImageStyle } from "./shared";

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

export default function HeroStage({
  carouselProps,
  controls,
  featuredGame,
  gameCount,
  isHomePage = false,
  isInitialSlide = true,
}) {
  const featuredDialogId = getGameDialogId(featuredGame);
  const heroKicker = isHomePage ? HOME_HERO_KICKER : featuredGame.eyebrow;
  const heroTitle = isHomePage ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = isHomePage && isInitialSlide ? HOME_HERO_SUMMARY : featuredGame.summary;
  const heroBackdropSrcSet = featuredGame.heroImageMobile
    ? `${featuredGame.heroImageMobile} 960w, ${featuredGame.heroImage} 1832w`
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
    ? [formatGameCount(gameCount), "Freeware classics", "Instant browser play"]
    : [formatGameCount(gameCount), featuredGame.target, featuredGame.badge];

  return (
    <section className={`hero-stage ${featuredGame.tone}`} id="browse" {...carouselProps}>
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
            <LaunchButton
              game={featuredGame}
              entryPoint={isHomePage ? "hero" : "game_detail"}
              label={primaryActionLabel}
              continueLabel={isHomePage ? `Continue ${featuredGame.displayTitle}` : "Continue"}
            />
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
      {controls}
    </section>
  );
}

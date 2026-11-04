import LaunchButton from "../launch-button";
import { HOME_BROWSE_LABEL, HOME_HERO_KICKER, HOME_HERO_SUMMARY, HOME_HERO_TITLE } from "../seo";
import DecorativeImage from "./decorative-image";
import Icon from "./shell-icon";
import HeroTitle from "./hero-title";
import { getHeroImageProps } from "./hero-images.mjs";
import { getGameDialogId, getHeroImageStyle } from "./shared";

export default function HeroStage({
  carouselProps,
  controls,
  featuredGame,
  isHomePage = false,
  isInitialSlide = true,
  sourceAction,
}) {
  const featuredDialogId = getGameDialogId(featuredGame);
  const showHomeIntro = isHomePage && isInitialSlide;
  const heroKicker = showHomeIntro ? HOME_HERO_KICKER : sourceAction ? "Your game library" : featuredGame.eyebrow;
  const heroTitle = showHomeIntro ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = showHomeIntro ? HOME_HERO_SUMMARY : featuredGame.summary;
  const secondaryActionHref = isHomePage ? "#library" : `#${sourceAction?.dialogId || featuredDialogId}`;
  const secondaryActionLabel = isHomePage ? HOME_BROWSE_LABEL : "More Info";
  const heroMetadata = showHomeIntro
    ? [
        { label: "Flagship classic", value: featuredGame.displayTitle },
        { label: "Collection", value: "Freeware adventures" },
      ]
    : [
        { label: "Studio", value: featuredGame.studio },
        { label: "Genre", value: featuredGame.genre },
      ];
  const heroStatus = showHomeIntro
    ? ["Freeware classics", "Instant browser play"]
    : [sourceAction ? null : featuredGame.target, featuredGame.badge].filter(Boolean);

  return (
    <section className={`hero-stage ${featuredGame.tone}`} id="browse" {...carouselProps}>
      <div className="hero-backdrop">
        <DecorativeImage
          className="hero-backdrop-image"
          fetchPriority={isInitialSlide ? "high" : undefined}
          loading="eager"
          {...getHeroImageProps(featuredGame)}
          style={getHeroImageStyle(featuredGame.heroImagePosition)}
        />
      </div>
      <div className="hero-gradient" />

      <div className="hero-inner">
        <div className="hero-copy">
          <p className="hero-kicker">{heroKicker}</p>
          <HeroTitle title={heroTitle}>
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
          </HeroTitle>
          <p className="hero-summary" title={heroSummary}>{heroSummary}</p>

          <div className="hero-actions">
            {sourceAction ? (
              <button type="button" className="launch-button" title={sourceAction.label} disabled={sourceAction.disabled} onClick={sourceAction.onClick}
                aria-describedby={sourceAction.needsAccess ? "hero-file-access-help" : undefined}
                aria-haspopup={sourceAction.dialogId ? "dialog" : undefined} aria-controls={sourceAction.dialogId}>
                {sourceAction.buttonLabel || "Play"}
              </button>
            ) : (
              <LaunchButton
                game={featuredGame}
                entryPoint={isHomePage ? "hero" : "game_detail"}
                label="Play"
                continueLabel="Play"
              />
            )}
            <a className="secondary-button" href={secondaryActionHref}>
              {!isHomePage ? <Icon name="info" /> : null}
              <span>{secondaryActionLabel}</span>
            </a>
          </div>
          {featuredGame.importRequired && !sourceAction && <p className="file-access-help">
            This game is not included due to copyright restrictions. If you own a copy, drop its ZIP onto this page to add it to your library.
          </p>}
          {sourceAction?.needsAccess && <p className="file-access-help" id="hero-file-access-help">
            Allow access in the browser prompt so ScummWEB can read this game’s ZIP.
            Your game files stay on your device.
          </p>}

          <dl className="hero-metadata">
            {heroMetadata.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd title={item.value}>{item.value}</dd>
              </div>
            ))}
          </dl>

          <div className="hero-status">
            {heroStatus.map((item) => (
              <span key={item} title={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>
      {controls}
    </section>
  );
}

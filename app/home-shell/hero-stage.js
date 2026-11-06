import { ChevronDown } from "lucide-react";
import LaunchButton from "../launch-button";
import SourceLaunchActions from "./source-launch-actions";
import { HOME_BROWSE_LABEL, HOME_HERO_KICKER, HOME_HERO_SUMMARY, HOME_HERO_TITLE } from "../seo";
import DecorativeImage from "./decorative-image";
import HeroTitle from "./hero-title";
import GameScreenshots from "./game-screenshots";
import { getHeroImageProps } from "./hero-images.mjs";
import { getDialogLinkProps, getHeroImageStyle } from "./shared";

export default function HeroStage({
  carouselProps,
  controls,
  featuredGame,
  isHomePage = false,
  isInitialSlide = true,
  isMobile = false,
  sourceAction,
  sourceVersion,
  versions = [],
  selectedVersionKey,
  onVersionChange,
  onLaunch,
  notice,
}) {
  const showHomeIntro = isHomePage && isInitialSlide && !isMobile;
  const heroKicker = showHomeIntro ? HOME_HERO_KICKER : featuredGame.eyebrow;
  const heroTitle = showHomeIntro ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = showHomeIntro ? HOME_HERO_SUMMARY : featuredGame.summary;
  const metadata = [featuredGame.studio, featuredGame.year, featuredGame.genre].filter(Boolean);
  const selectedVersion = versions.find(({ key }) => key === selectedVersionKey) || versions[0];
  const versionLabel = selectedVersion?.label || featuredGame.badge || "Included version";

  return (
    <div className="game-showcase">
      <section className={`hero-stage hero-stage-library ${featuredGame.tone}`} id="browse" {...carouselProps}>
        <div className="hero-backdrop">
          <DecorativeImage className="hero-backdrop-image"
            decoding={isInitialSlide ? "sync" : "async"}
            fetchPriority={isInitialSlide ? "high" : undefined} loading="eager"
            {...getHeroImageProps(featuredGame)} style={getHeroImageStyle(featuredGame.heroImagePosition, featuredGame.heroImageMobilePosition)} />
        </div>
        <div className="hero-gradient" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">{heroKicker}</p>
            <HeroTitle title={heroTitle} fit={!isMobile}>{heroTitle}</HeroTitle>
            <p className="hero-mobile-facts">{[featuredGame.studio, featuredGame.year].filter(Boolean).join(" · ")}</p>
            <p className="hero-summary">{isMobile ? featuredGame.mobileSummary || heroSummary : heroSummary}</p>
            <ul className="hero-facts" aria-label="Game information">
              {metadata.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}
            </ul>
          </div>
          <div className="hero-launch">
            <div className="hero-actions">
              {sourceVersion ? (
                <SourceLaunchActions key={sourceVersion.key} version={sourceVersion} onLaunch={onLaunch}
                  helpId="hero-file-access-help" showAccessHelp={false} />
              ) : sourceAction ? (
                <button type="button" className="launch-button" title={sourceAction.label}
                  disabled={sourceAction.disabled} onClick={sourceAction.onClick}>
                  {sourceAction.buttonLabel || "Play"}
                </button>
              ) : <LaunchButton game={featuredGame} entryPoint={isHomePage ? "hero" : "game_detail"}
                label="Play" onLaunch={onLaunch} />}
              <div className="hero-version-control">
                {versions.length > 1 ? <label className="library-select">
                  <span className="hero-version-label">Version</span>
                  <select value={selectedVersionKey} aria-label="Game version" title={versionLabel}
                    onChange={(event) => onVersionChange(event.target.value)}>
                    {versions.map((version, index) => <option key={version.key} value={version.key}>
                      {version.label || `Version ${index + 1}`}
                    </option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </label> : <span className="hero-version-value" title={versionLabel}>{versionLabel}</span>}
              </div>
              <a className="secondary-button hero-browse" href="#library">{HOME_BROWSE_LABEL}</a>
              {featuredGame.infoHref && <a className="hero-license" href={featuredGame.infoHref}
                {...getDialogLinkProps(featuredGame.infoHref)}>Readme / License</a>}
            </div>
            {notice ? <p className="file-access-help hero-notice" id="hero-file-access-help"
              role="status" data-tone={notice.tone}>{notice.message}</p>
              : (sourceVersion?.action.needsAccess || sourceAction?.needsAccess) && <p className="file-access-help" id="hero-file-access-help">
              Allow access in the browser prompt so ScummWEB can read this game’s ZIP.
              Your game files stay on your device.
            </p>}
            {!notice && featuredGame.importRequired && !sourceVersion && !sourceAction && <p className="file-access-help">
              This game is not included due to copyright restrictions. If you own a copy, drop its ZIP onto this page to add it to your library.
            </p>}
          </div>
        </div>
        {featuredGame.screenshots?.length > 0 && <a className="hero-scroll-cue" href="#game-screenshots">
          <ChevronDown size={20} aria-hidden="true" />Scroll for screenshots
        </a>}
        {controls}
      </section>
      <GameScreenshots key={featuredGame.screenshots?.join("|") || featuredGame.displayTitle} game={featuredGame} />
    </div>
  );
}

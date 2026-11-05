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
  sourceAction,
  sourceVersion,
  versions = [],
  selectedVersionKey,
  onVersionChange,
  onLaunch,
  notice,
}) {
  const showHomeIntro = isHomePage && isInitialSlide;
  const heroKicker = showHomeIntro ? HOME_HERO_KICKER : featuredGame.eyebrow;
  const heroTitle = showHomeIntro ? HOME_HERO_TITLE : featuredGame.displayTitle;
  const heroSummary = showHomeIntro ? HOME_HERO_SUMMARY : featuredGame.summary;
  const metadata = [featuredGame.studio, featuredGame.year, featuredGame.genre].filter(Boolean);

  return (
    <div className="game-showcase">
      <section className={`hero-stage hero-stage-library ${featuredGame.tone}`} id="browse" {...carouselProps}>
        <div className="hero-backdrop">
          <DecorativeImage className="hero-backdrop-image"
            decoding={isInitialSlide ? "sync" : "async"}
            fetchPriority={isInitialSlide ? "high" : undefined} loading="eager"
            {...getHeroImageProps(featuredGame)} style={getHeroImageStyle(featuredGame.heroImagePosition)} />
        </div>
        <div className="hero-gradient" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="hero-kicker">{heroKicker}</p>
            <HeroTitle title={heroTitle}>{heroTitle}</HeroTitle>
            <p className="hero-summary">{heroSummary}</p>
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
                <a className="secondary-button" href="#library">{HOME_BROWSE_LABEL}</a>
                {featuredGame.infoHref && <a className="hero-license" href={featuredGame.infoHref}
                  {...getDialogLinkProps(featuredGame.infoHref)}>Readme / License</a>}
              </div>
              <ul className="hero-facts" aria-label="Game information">
                {metadata.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}
                {featuredGame.badge && <li className="hero-edition">{featuredGame.badge}</li>}
              </ul>
              {versions.length > 1 && <label className="hero-version-control">Version
                <span className="library-select">
                  <select value={selectedVersionKey} onChange={(event) => onVersionChange(event.target.value)}>
                    {versions.map((version) => <option key={version.key} value={version.key}>
                      {version.label}{version.source && !["available", "session"].includes(version.status)
                        ? ` — ${version.status === "checking" ? "Checking files" : version.locate ? version.locateLabel : "Check file access"}` : ""}
                    </option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </label>}
              {featuredGame.importRequired && !sourceVersion && !sourceAction && <p className="file-access-help">
                This game is not included due to copyright restrictions. If you own a copy, drop its ZIP onto this page to add it to your library.
              </p>}
              {(sourceVersion?.action.needsAccess || sourceAction?.needsAccess) && <p className="file-access-help" id="hero-file-access-help">
                Allow access in the browser prompt so ScummWEB can read this game’s ZIP.
                Your game files stay on your device.
              </p>}
            </div>
            {notice && <p className="hero-notice" role="status">{notice}</p>}
          </div>
        </div>
        {controls}
      </section>
      <GameScreenshots key={featuredGame.screenshots?.join("|") || featuredGame.displayTitle} game={featuredGame} />
    </div>
  );
}

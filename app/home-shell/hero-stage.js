import { ChevronDown } from "lucide-react";
import LaunchButton from "../launch-button";
import SourceLaunchActions from "./source-launch-actions";
import { HOME_HERO_KICKER, HOME_HERO_SUMMARY, HOME_HERO_TITLE } from "../seo";
import DecorativeImage from "./decorative-image";
import HeroTitle from "./hero-title";
import HeroScrollCue from "./hero-scroll-cue";
import GameScreenshots from "./game-screenshots";
import { getHeroImageProps } from "./hero-images.mjs";
import { getDialogLinkProps, getHeroImageStyle } from "./shared";
import { initialActionsMarkup } from "./initial-actions.mjs";
import { formatVersionLabel } from "../game-versions.mjs";

export default function HeroStage({
  carouselProps,
  controls,
  featuredGame,
  actionsReady = true,
  initialActions,
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
  const selectedVersion = versions.find(({ key }) => key === selectedVersionKey) || versions[0];
  const versionLabel = selectedVersion?.label || featuredGame.badge || "Included version";
  const editionLabel = formatVersionLabel(featuredGame, { showRevision: false })
    || (featuredGame.importRequired && featuredGame.badge) || "Included version";
  const hasMultipleVersions = versions.length > 1;

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
            <p className="hero-kicker">{showHomeIntro ? <>
              <span className="hero-desktop-copy">{heroKicker}</span>
              <span className="hero-mobile-copy">{featuredGame.eyebrow}</span>
            </> : heroKicker}</p>
            <HeroTitle title={heroTitle}>{showHomeIntro ? <>
              <span className="hero-desktop-copy">{heroTitle}</span>
              <span className="hero-mobile-copy">{featuredGame.displayTitle}</span>
            </> : heroTitle}</HeroTitle>
            <p className="hero-mobile-facts">
              <span>{[featuredGame.studio, featuredGame.year].filter(Boolean).join(" · ")}</span>
              <span className="hero-edition" title={editionLabel}>{editionLabel}</span>
            </p>
            <p className="hero-summary">
              <span className="hero-desktop-copy">{heroSummary}</span>
              <span className="hero-mobile-copy">{featuredGame.mobileSummary || featuredGame.summary}</span>
            </p>
            <ul className="hero-facts" aria-label="Game information">
              {metadata.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}
              <li className="hero-edition" title={editionLabel}>{editionLabel}</li>
            </ul>
          </div>
          <div className="hero-launch">
            {!actionsReady && initialActions && <div className="hero-actions hero-initial-actions"
              data-initial-actions={JSON.stringify(initialActions)}
              data-entry-point={isHomePage ? "hero" : "game_detail"}
              suppressHydrationWarning dangerouslySetInnerHTML={{ __html: initialActionsMarkup }} />}
            {!actionsReady && <div className="hero-actions-placeholder" role="status" aria-label="Loading play options">
              <span /><span />
            </div>}
            <div className="hero-actions" data-ready={actionsReady ? undefined : "false"}>
              {sourceVersion ? (
                <SourceLaunchActions key={sourceVersion.key} version={sourceVersion} onLaunch={onLaunch}
                  helpId="hero-file-access-help" showAccessHelp={false} browseHref="#library" />
              ) : sourceAction ? (
                <>
                  <button type="button" className="launch-button" title={sourceAction.label}
                    disabled={sourceAction.disabled} onClick={sourceAction.onClick}>
                    {sourceAction.buttonLabel || "Play"}
                  </button>
                  <a className="secondary-button browse-games-button" href="#library">Browse Games</a>
                </>
              ) : <LaunchButton game={featuredGame} entryPoint={isHomePage ? "hero" : "game_detail"}
                label="Play" onLaunch={onLaunch} browseHref="#library" />}
              <div className="hero-version-control" data-reserved={!hasMultipleVersions || undefined}
                aria-hidden={!hasMultipleVersions || undefined}>
                {hasMultipleVersions && <label className="library-select">
                  <span className="hero-version-label">Version</span>
                  <span className="hero-version-value" aria-hidden="true">{versionLabel}</span>
                  <select value={selectedVersionKey} aria-label="Game version" title={versionLabel}
                    onChange={(event) => onVersionChange(event.target.value)}>
                    {versions.map((version, index) => <option key={version.key} value={version.key}>
                      {version.label || `Version ${index + 1}`}
                    </option>)}
                  </select>
                  <ChevronDown size={16} aria-hidden="true" />
                </label>}
              </div>
              <a className="hero-license" href={featuredGame.infoHref || undefined}
                data-reserved={!featuredGame.infoHref || undefined} aria-hidden={!featuredGame.infoHref || undefined}
                {...(featuredGame.infoHref ? getDialogLinkProps(featuredGame.infoHref) : {})}>Readme / License</a>
            </div>
            <noscript><style>{`.hero-actions[data-ready="false"] { visibility: visible; }
              .hero-actions-placeholder { display: none; }`}</style></noscript>
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
        {featuredGame.screenshots?.length > 0 && <HeroScrollCue />}
        {controls}
      </section>
      <GameScreenshots key={featuredGame.screenshots?.join("|") || featuredGame.displayTitle} game={featuredGame} />
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { preload } from "react-dom";
import { HeroPrivacyControls } from "../../lib/privacy-consent/controls";
import LaunchButton from "../launch-button";
import SourceLaunchActions from "./source-launch-actions";
import GameHeroScene from "../game-player/GameHeroScene";
import HeroScrollCue from "./hero-scroll-cue";
import GameScreenshots from "./game-screenshots";
import { getHeroImageProps } from "./hero-images.mjs";
import { useArtworkDelivery } from "./artwork-delivery";
import { getDialogLinkProps } from "./shared";
import { initialActionsMarkup } from "./initial-actions.mjs";

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
  const selectedVersion = versions.find(({ key }) => key === selectedVersionKey) || versions[0];
  const versionLabel = selectedVersion?.label || featuredGame.badge || "Included version";
  const hasMultipleVersions = versions.length > 1;
  const browseHref = hasMultipleVersions ? undefined : "#library";
  const hasScreenshots = featuredGame.screenshots?.length > 0;
  const backdrop = getHeroImageProps(featuredGame, useArtworkDelivery(), "hero");
  // React automatically preloads the eager WebP <img>, but skips images in <picture>.
  if (isInitialSlide && backdrop.avifSrcSet) {
    preload(backdrop.avifSrcSet.split(" ", 1)[0], {
      as: "image", type: "image/avif", fetchPriority: "high",
      imageSrcSet: backdrop.avifSrcSet, imageSizes: backdrop.sizes,
    });
  }

  return (
    <div className="game-showcase">
      <section className={`hero-stage hero-stage-library ${featuredGame.tone}`} id="browse" {...carouselProps}>
        <GameHeroScene game={featuredGame} isInitialSlide={isInitialSlide} footer={
          (hasScreenshots || controls || isHomePage) ? <div className="hero-footer" data-consent={isHomePage || undefined}>
            {hasScreenshots && <HeroScrollCue />}
            {isHomePage && <HeroPrivacyControls className="hero-privacy" />}
            {controls}
          </div> : null
        }>
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
                  helpId="hero-file-access-help" showAccessHelp={false} browseHref={browseHref} primaryOnly={hasMultipleVersions} />
              ) : sourceAction ? (
                <>
                  <button type="button" className="launch-button" title={sourceAction.label}
                    disabled={sourceAction.disabled} onClick={sourceAction.onClick}>
                    {sourceAction.buttonLabel || "Play"}
                  </button>
                  {browseHref && <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a>}
                </>
              ) : <LaunchButton game={featuredGame} entryPoint={isHomePage ? "hero" : "game_detail"}
                label="Play" onLaunch={onLaunch} browseHref={browseHref} primaryOnly={hasMultipleVersions} />}
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
              {notice ? <p className="file-access-help hero-notice" id="hero-file-access-help"
                role="status" data-tone={notice.tone}>{notice.message}</p>
                : (sourceVersion?.action.needsAccess || sourceAction?.needsAccess) && <p className="file-access-help" id="hero-file-access-help">
                Allow access in the browser prompt so ScummWEB can read this game’s ZIP or ISO.
                Your game files stay on your device.
              </p>}
              {!notice && featuredGame.importRequired && !sourceVersion && !sourceAction && <p className="file-access-help hero-import-help">
                This game is not included due to copyright restrictions. If you own a copy, drop its ZIP or ISO onto this page to add it to your library.
              </p>}
            </div>
            <noscript><style>{`.hero-actions[data-ready="false"] { visibility: visible; }
              .hero-actions-placeholder { display: none; }`}</style></noscript>
          </div>
        </GameHeroScene>
      </section>
      <GameScreenshots key={featuredGame.screenshots?.join("|") || featuredGame.displayTitle} game={featuredGame} />
    </div>
  );
}

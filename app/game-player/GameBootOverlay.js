import { useArtworkDelivery } from "../home-shell/artwork-delivery";
import DecorativeImage from "../home-shell/decorative-image";
import { getHeroImageProps } from "../home-shell/hero-images.mjs";
import { getHeroImageStyle } from "../home-shell/shared";
import { getBundledLaunchTags } from "./launch-tags.mjs";

export default function GameBootOverlay({
  archiveBytes,
  bootStatusText,
  game,
  hasBootFailed,
  showBootOverlay,
  showBundledTags = true,
  title,
}) {
  const artwork = useArtworkDelivery();
  const backdrop = game ? getHeroImageProps(game, artwork, "hero") : null;
  const tags = showBundledTags ? getBundledLaunchTags(game) : null;

  return (
    <div
      aria-hidden={showBootOverlay ? undefined : "true"}
      className={`game-route-boot-overlay ${showBootOverlay ? "is-visible" : "is-hidden"} ${
        hasBootFailed ? "is-error" : ""
      } ${game?.tone || "tone-default"}`}
      data-launch-overlay="true"
      data-launch-overlay-state={hasBootFailed ? "error" : showBootOverlay ? "visible" : "hidden"}
      data-launch-archive-bytes={archiveBytes}
    >
      {backdrop?.src ? (
        <DecorativeImage
          {...backdrop}
          className="game-route-boot-backdrop"
          decoding="sync"
          fetchPriority="high"
          loading="eager"
          style={getHeroImageStyle(game.heroImagePosition, game.heroImageMobilePosition)}
        />
      ) : null}
      <div className="game-route-boot-scrim" />
      <div className="game-route-boot-content">
        <div className={`game-route-boot-card ${hasBootFailed ? "is-error" : ""}`}>
          {game?.eyebrow ? (
            <p className="game-route-boot-kicker">{game.eyebrow}</p>
          ) : null}
          <h1 className="game-route-boot-title">{game?.displayTitle || title}</h1>
          <div className="game-route-boot-meta">
            {tags ? tags.map((tag) => <span key={tag}>{tag}</span>) : <>
              {game?.target ? <span>{game.target}</span> : null}
              {game?.year ? <span>{game.year}</span> : null}
              {game?.badge ? <span>{game.badge}</span> : null}
            </>}
          </div>
          {game?.summary ? (
            <p className="game-route-boot-summary">{game.summary}</p>
          ) : null}
          <div className="game-route-boot-status-block">
            <p className="game-route-boot-status-label">
              {hasBootFailed ? "Launch failed" : "Launching"}
            </p>
            <p className="game-route-boot-status-text" data-launch-status="true">
              {bootStatusText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

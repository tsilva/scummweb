import { LoaderCircle, TriangleAlert } from "lucide-react";
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
  const metadata = [game?.year, ...(tags ? tags.slice(1).filter((tag) => tag !== game?.year) : [game?.badge])].filter(Boolean);
  const StatusIcon = hasBootFailed ? TriangleAlert : LoaderCircle;

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
      <div className="game-route-boot-artwork">
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
        <span aria-hidden="true" className="game-route-boot-brand">ScummWEB</span>
      </div>
      <div className="game-route-boot-dock">
        {!hasBootFailed ? <div aria-hidden="true" className="game-route-boot-progress" /> : null}
        <div className="game-route-boot-details">
          <h1 className="game-route-boot-title">{game?.displayTitle || title}</h1>
          {metadata.length ? (
            <div className="game-route-boot-meta">
              {metadata.map((tag, index) => <span key={`${index}:${tag}`}>{tag}</span>)}
            </div>
          ) : null}
        </div>
        <div className="game-route-boot-status-block" role={hasBootFailed ? "alert" : "status"} aria-atomic="true">
          <StatusIcon aria-hidden="true" className="game-route-boot-status-icon" size={30} strokeWidth={2} />
          <div>
            {hasBootFailed ? <p className="game-route-boot-status-label">Launch failed</p> : null}
            <p className="game-route-boot-status-text" data-launch-status="true">
              {bootStatusText || "Loading game…"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { GAME_LOADING_STATUS } from "../game-loading-status.mjs";
import GameHeroScene from "./GameHeroScene";

export default function GameBootOverlay({
  archiveBytes,
  bootStatusText,
  game,
  hasBootFailed,
  showBootOverlay,
  title,
}) {
  const StatusIcon = hasBootFailed ? TriangleAlert : LoaderCircle;

  return (
    <div
      aria-hidden={showBootOverlay ? undefined : "true"}
      className={`game-route-boot-overlay ${showBootOverlay ? "is-visible" : "is-hidden"} ${hasBootFailed ? "is-error" : ""}`}
      data-launch-overlay="true"
      data-launch-overlay-state={hasBootFailed ? "error" : showBootOverlay ? "visible" : "hidden"}
      data-launch-archive-bytes={archiveBytes}
    >
      <GameHeroScene game={game} title={title}>
        <div className="game-hero-loading" role={hasBootFailed ? "alert" : "status"} aria-atomic="true">
          {!hasBootFailed ? <div aria-hidden="true" className="game-hero-progress" /> : null}
          <div className="game-hero-loading-message">
            <StatusIcon aria-hidden="true" className="game-hero-status-icon" size={28} strokeWidth={2} />
            <div>
              {hasBootFailed ? <p className="game-hero-status-label">Launch failed</p> : null}
              <p className="game-hero-status-text" data-launch-status="true">{bootStatusText || GAME_LOADING_STATUS}</p>
            </div>
          </div>
        </div>
      </GameHeroScene>
    </div>
  );
}

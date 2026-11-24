import { LoaderCircle, TriangleAlert } from "lucide-react";
import { GAME_LOADING_STATUS } from "../game-loading-status.mjs";
import GameHeroScene from "./GameHeroScene";

export default function GameBootOverlay({
  archiveBytes,
  bootStatusText,
  game,
  graphicsRecovery,
  hasBootFailed,
  onRestart,
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
        <div className={`game-hero-loading${graphicsRecovery ? " has-restart" : ""}`}>
          {!hasBootFailed ? <div aria-hidden="true" className="game-hero-progress" /> : null}
          <div className="game-hero-loading-message" role={hasBootFailed ? "alert" : "status"} aria-atomic="true">
            <StatusIcon aria-hidden="true" className="game-hero-status-icon" size={28} strokeWidth={2} />
            <div>
              {hasBootFailed ? <p className="game-hero-status-label">{graphicsRecovery ? "Game graphics interrupted" : "Launch failed"}</p> : null}
              <p className="game-hero-status-text" data-launch-status="true">{bootStatusText || GAME_LOADING_STATUS}</p>
            </div>
          </div>
          {graphicsRecovery ? (
            <button className="secondary-button game-hero-restart" disabled={graphicsRecovery === "restarting"} onClick={onRestart} type="button">
              {graphicsRecovery === "restarting" ? "Restarting…" : "Restart game"}
            </button>
          ) : null}
        </div>
      </GameHeroScene>
    </div>
  );
}

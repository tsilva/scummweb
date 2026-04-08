import { getHeroImageStyle } from "../home-shell/shared";

export default function GameBootOverlay({
  bootProgressPercent,
  bootStatusText,
  game,
  hasBootFailed,
  showBootOverlay,
  showBootProgress,
  title,
}) {
  return (
    <div
      aria-hidden={showBootOverlay ? undefined : "true"}
      className={`game-route-boot-overlay ${showBootOverlay ? "is-visible" : "is-hidden"} ${
        hasBootFailed ? "is-error" : ""
      } ${game?.tone || "tone-default"}`}
      data-launch-overlay="true"
      data-launch-overlay-state={hasBootFailed ? "error" : showBootOverlay ? "visible" : "hidden"}
    >
      {game?.heroImage ? (
        <img
          alt=""
          className="game-route-boot-backdrop"
          decoding="async"
          fetchPriority="high"
          loading="eager"
          src={game.heroImage}
          style={getHeroImageStyle(game.heroImagePosition)}
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
            {game?.target ? <span>{game.target}</span> : null}
            {game?.year ? <span>{game.year}</span> : null}
            {game?.badge ? <span>{game.badge}</span> : null}
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
            {showBootProgress ? (
              <div className="game-route-boot-progress-shell">
                <div className="game-route-boot-progress-track" aria-hidden="true">
                  <div
                    className="game-route-boot-progress-fill"
                    style={{ width: `${bootProgressPercent}%` }}
                  />
                </div>
                <span className="game-route-boot-progress-value">{bootProgressPercent}%</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

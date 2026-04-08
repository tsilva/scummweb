import LaunchButton from "../launch-button";
import DecorativeImage from "./decorative-image";
import Icon from "./shell-icon";
import { getDialogLinkProps, getGameDialogId, getHeroImageStyle } from "./shared";

export default function GameDetailModal({ game }) {
  const dialogId = getGameDialogId(game);
  const modalImage = game.heroImage || game.landscapeImage || game.posterImage;

  return (
    <div className="game-detail-modal" id={dialogId}>
      <a
        aria-label={`Close details for ${game.displayTitle}`}
        className="game-detail-backdrop"
        href="#browse"
      />
      <div
        aria-labelledby={`${dialogId}-title`}
        aria-modal="true"
        className={`game-detail-panel ${game.tone}`}
        role="dialog"
      >
        <div className="game-detail-visual">
          <DecorativeImage
            className="game-detail-visual-image"
            fetchPriority="low"
            loading="lazy"
            src={modalImage}
            style={getHeroImageStyle(game.heroImagePosition)}
          />
          <a
            aria-label={`Close details for ${game.displayTitle}`}
            className="game-detail-close"
            href="#browse"
          >
            ×
          </a>
          <div className="game-detail-visual-copy">
            <p className="hero-kicker">{game.eyebrow}</p>
            <h2 id={`${dialogId}-title`}>{game.displayTitle}</h2>
            <div className="game-detail-visual-meta">
              <span>{game.year}</span>
              <span>{game.genre}</span>
              <span>{game.badge}</span>
            </div>
            <p className="game-detail-summary">{game.summary}</p>

            <div className="game-detail-actions">
              <LaunchButton href={game.playHref} label="Play" />
              {game.infoHref ? (
                <a
                  className="secondary-button"
                  href={game.infoHref}
                  {...getDialogLinkProps(game.infoHref)}
                >
                  <Icon name="info" />
                  <span>Readme / License</span>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="game-detail-copy">
          <dl className="game-detail-metadata">
            <div>
              <dt>Studio</dt>
              <dd>{game.studio}</dd>
            </div>
            <div>
              <dt>Release</dt>
              <dd>{game.year}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{game.target}</dd>
            </div>
            <div>
              <dt>Collection</dt>
              <dd>{game.tag}</dd>
            </div>
          </dl>

          {game.screenshots.length > 0 ? (
            <div className="game-detail-strip" aria-label={`${game.displayTitle} screenshots`}>
              {game.screenshots.map((shot, index) => (
                <div
                  key={shot}
                  className="game-detail-shot"
                  title={`${game.displayTitle} screenshot ${index + 1}`}
                >
                  <DecorativeImage className="game-detail-shot-image" src={shot} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

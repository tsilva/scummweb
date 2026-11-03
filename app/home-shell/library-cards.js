import DecorativeImage from "./decorative-image";

export function GamePoster({ title, image }) {
  return (
    <>
      <span className="poster-media">
        {image ? (
          <DecorativeImage className="poster-media-image" src={image} />
        ) : (
          <span className="bucket-poster-placeholder" aria-hidden="true">☠</span>
        )}
      </span>
      <span className="poster-overlay"><span className="poster-title">{title}</span></span>
    </>
  );
}

export default function LibraryCards({ games, children }) {
  return (
    <div className="poster-grid">
      {children}
      {games.map((game) => (
        <div className="poster-entry" key={game.target}>
          <a className={`poster-card ${game.tone}`} data-game-target={game.target} href={game.href}>
            <GamePoster title={game.displayTitle} image={game.posterImage} />
          </a>
        </div>
      ))}
    </div>
  );
}

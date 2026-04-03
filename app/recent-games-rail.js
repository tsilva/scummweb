"use client";

import { useEffect, useState } from "react";
import { getRecentGameTargets, sortGamesByRecentPlay } from "./recent-games";

function DecorativeImage({ src }) {
  if (!src) {
    return null;
  }

  return <img alt="" className="landscape-card-image" decoding="async" loading="lazy" src={src} />;
}

function getDialogId(game) {
  return `game-${game.slug || game.target}`;
}

export default function RecentGamesRail({ catalog }) {
  const [recentTargets, setRecentTargets] = useState([]);

  useEffect(() => {
    setRecentTargets(getRecentGameTargets());
  }, []);

  const sortedCatalog = sortGamesByRecentPlay(catalog, recentTargets);

  return (
    <div className="landscape-rail">
      {sortedCatalog.map((game) => (
        <a
          key={game.target}
          aria-haspopup="dialog"
          className={`landscape-card ${game.tone}`}
          data-game-target={game.target}
          href={`#${getDialogId(game)}`}
        >
          <DecorativeImage src={game.landscapeImage} />
          <div className="landscape-overlay">
            <h3>{game.displayTitle}</h3>
            <div className="landscape-meta">
              <span>{game.genre}</span>
              <span>{game.studio}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

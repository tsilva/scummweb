"use client";

import { useEffect, useState } from "react";
import DecorativeImage from "./home-shell/decorative-image";
import { getArtworkImageProps } from "./home-shell/artwork-image-props.mjs";
import { useArtworkDelivery } from "./home-shell/artwork-delivery";
import { getRecentGameTargets, getRecentlyPlayedGames, recentGamesUpdatedEvent } from "./recent-games";
import GameSelectionLink from "./home-shell/game-selection-link";
import { chosenGameVersionUpdatedEvent, readPreferredGameVersion } from "./game-versions.mjs";
import { getCachedBrowserSaveContents } from "./browser-saves.mjs";
import useBrowserSave from "./use-browser-save";
import { getQueenSaveProgress } from "./game-player/queen-save-progress.mjs";

function RecentSaveProgress({ versions, groupKey }) {
  const version = readPreferredGameVersion(versions, groupKey);
  if (version.key !== "catalog:queen" || version.game.importRequired) return null;
  return <QueenSaveProgress game={version.game} />;
}

function QueenSaveProgress({ game }) {
  const contents = useBrowserSave(game, true, getCachedBrowserSaveContents);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (contents === null) return;
    let current = true;
    void getQueenSaveProgress(contents).then((percent) => {
      if (current) setResult({ contents, percent });
    });
    return () => { current = false; };
  }, [contents]);
  const percent = result?.contents === contents ? result.percent : null;
  return percent !== null && <progress className="recent-save-progress" aria-label="Saved story progress"
    title={`${percent}% story progress`} max={100} value={percent} />;
}

export default function RecentGamesRail({ groups }) {
  const artwork = useArtworkDelivery();
  const [recentTargets, setRecentTargets] = useState([]);

  useEffect(() => {
    const update = () => setRecentTargets(getRecentGameTargets());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("storage", update);
    window.addEventListener(recentGamesUpdatedEvent, update);
    window.addEventListener(chosenGameVersionUpdatedEvent, update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("storage", update);
      window.removeEventListener(recentGamesUpdatedEvent, update);
      window.removeEventListener(chosenGameVersionUpdatedEvent, update);
    };
  }, []);

  const recentGames = getRecentlyPlayedGames(groups, recentTargets);
  if (!recentGames.length) return null;

  return (
    <section className="content-band" aria-labelledby="recently-played-heading">
      <div className="section-header">
        <h2 id="recently-played-heading"><span className="section-mark" />Recently Played</h2>
      </div>
      <div className="landscape-rail">
        {recentGames.map(({ key, game, versions }) => (
          <GameSelectionLink
            key={key}
            game={game}
            aria-label={game.displayTitle}
            className={`landscape-card ${game.tone}`}
            data-game-target={game.target}
          >
            <DecorativeImage className="landscape-card-image" {...getArtworkImageProps(game.landscapeImage, "landscape", artwork)} />
            <div className="landscape-overlay">
              <h3>{game.displayTitle}</h3>
            </div>
            {versions.some(({ key }) => key === "catalog:queen") && <RecentSaveProgress versions={versions} groupKey={key} />}
          </GameSelectionLink>
        ))}
      </div>
    </section>
  );
}

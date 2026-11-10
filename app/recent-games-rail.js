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
import { getStoryProgressRevision, readStoryProgress } from "./game-player/story-progress.mjs";
import storyProgressIndex from "../public/game-progress/index.json";

function RecentStoryProgress({ versions, groupKey }) {
  const version = readPreferredGameVersion(versions, groupKey);
  const { slug, importRequired } = version.game;
  const revision = getStoryProgressRevision(storyProgressIndex, slug, !version.source && !importRequired);
  if (!revision) return null;
  const percent = readStoryProgress(window, version.key, slug, revision);
  if (version.key === "catalog:queen" && !importRequired) {
    return <QueenSaveProgress game={version.game} revision={revision} fallback={percent} />;
  }
  return <StoryProgressBar percent={percent} />;
}

function QueenSaveProgress({ game, revision, fallback }) {
  const contents = useBrowserSave(game, true, getCachedBrowserSaveContents);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (contents === null) return;
    let current = true;
    void getQueenSaveProgress(contents, revision).then((percent) => {
      if (current) setResult({ contents, revision, percent });
    });
    return () => { current = false; };
  }, [contents, revision]);
  const saved = result?.contents === contents && result.revision === revision ? result.percent : null;
  return <StoryProgressBar percent={saved ?? fallback} saved={saved !== null} />;
}

function StoryProgressBar({ percent, saved }) {
  return percent !== null && <progress className="recent-story-progress"
    aria-label={saved ? "Saved story progress" : "Story progress reached"}
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
            <RecentStoryProgress versions={versions} groupKey={key} />
          </GameSelectionLink>
        ))}
      </div>
    </section>
  );
}

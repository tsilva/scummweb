"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import DecorativeImage from "./home-shell/decorative-image";
import { getPosterImageProps } from "./home-shell/poster-images.mjs";
import { useArtworkDelivery } from "./home-shell/artwork-delivery";
import { getRecentGameTargets, getRecentlyPlayedGames, recentGamesUpdatedEvent } from "./recent-games";
import GameSelectionLink from "./home-shell/game-selection-link";
import { chosenGameVersionUpdatedEvent, readPreferredGameVersion, rememberGameVersion } from "./game-versions.mjs";
import LaunchButton from "./launch-button";
import SourceLaunchActions from "./home-shell/source-launch-actions";
import { formatLastPlayed, formatPlayedTime, playHistoryUpdatedEvent, readPlayHistory } from "./game-player/play-history.mjs";
import { getCachedBrowserSaveContents } from "./browser-saves.mjs";
import useBrowserSave from "./use-browser-save";
import { getQueenSaveProgress } from "./game-player/queen-save-progress.mjs";
import { getStoryProgressRevision, readStoryProgress } from "./game-player/story-progress.mjs";
import storyProgressIndex from "../public/game-progress/index.json";

function RecentStoryProgress({ version }) {
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
  return percent !== null && <span className="recent-progress-value">
    <progress className="recent-story-progress"
      aria-label={saved ? "Saved story progress" : "Story progress reached"}
      title={`${percent}% ${saved ? "saved story progress" : "story progress reached"}`} max={100} value={percent} />
    <span>{percent}% {saved ? "complete" : "reached"}</span>
  </span>;
}

function RecentGameCard({ group, now }) {
  const artwork = useArtworkDelivery();
  const { key, versions, recentVersionKey } = group;
  const version = versions.find((version) => version.key === recentVersionKey)
    || readPreferredGameVersion(versions, key);
  const { game } = version;
  const history = readPlayHistory(window, version.key);
  const onLaunch = () => rememberGameVersion(key, version.key);
  return <article className={`recent-game-card ${game.tone}`} data-game-target={game.target} aria-label={game.displayTitle}>
    <div className="recent-game-details">
      {game.posterImage ? <DecorativeImage className="recent-game-cover"
        {...getPosterImageProps(game.posterImage, false, 12, artwork)} sizes="96px" /> : <span className="recent-game-cover" />}
      <div className="recent-game-summary">
        <GameSelectionLink game={game} onClick={onLaunch} className="recent-game-title"><h3>{game.displayTitle}</h3></GameSelectionLink>
        <div className="recent-game-progress"><RecentStoryProgress version={version} /></div>
        <dl className="recent-game-stats">
          <div><dt>Played</dt><dd>{formatPlayedTime(history?.playedMs)}</dd></div>
          <div><dt>Last played</dt><dd><time dateTime={history ? new Date(history.lastPlayedAt).toISOString() : undefined}
            title={history ? new Date(history.lastPlayedAt).toLocaleString() : undefined}>
            {formatLastPlayed(history?.lastPlayedAt, now)}</time></dd></div>
        </dl>
      </div>
    </div>
    <div className="recent-game-actions">
      {version.source ? <SourceLaunchActions version={version} onLaunch={onLaunch} primaryOnly showAccessHelp={false} />
        : <LaunchButton game={game} entryPoint="library" onLaunch={onLaunch} primaryOnly />}
    </div>
  </article>;
}

export default function RecentGamesRail({ groups }) {
  const [recentTargets, setRecentTargets] = useState([]);
  const [now, setNow] = useState(null);
  const railRef = useRef(null);
  const [scrollable, setScrollable] = useState({ previous: false, next: false });

  useEffect(() => {
    const update = () => { setRecentTargets(getRecentGameTargets()); setNow(Date.now()); };
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("storage", update);
    window.addEventListener(recentGamesUpdatedEvent, update);
    window.addEventListener(chosenGameVersionUpdatedEvent, update);
    window.addEventListener(playHistoryUpdatedEvent, update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("storage", update);
      window.removeEventListener(recentGamesUpdatedEvent, update);
      window.removeEventListener(chosenGameVersionUpdatedEvent, update);
      window.removeEventListener(playHistoryUpdatedEvent, update);
    };
  }, []);

  const recentGames = getRecentlyPlayedGames(groups, recentTargets);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => {
      const previous = rail.scrollLeft > 1;
      const next = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;
      setScrollable((current) => current.previous === previous && current.next === next
        ? current : { previous, next });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    for (const card of rail.children) observer.observe(card);
    rail.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", update);
    };
  }, [groups, recentTargets]);

  function scrollGames(direction) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.firstElementChild;
    const step = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap) : rail.clientWidth;
    rail.scrollBy({ left: direction * step,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  if (!recentGames.length) return null;

  return (
    <section className="content-band" aria-labelledby="recently-played-heading">
      <div className="section-header recent-games-header">
        <h2 id="recently-played-heading"><span className="section-mark" />Recently Played</h2>
        {(scrollable.previous || scrollable.next) && <div className="recent-rail-controls">
          <button type="button" aria-label="Previous recently played games" title="Previous games"
            aria-controls="recently-played-rail" disabled={!scrollable.previous} onClick={() => scrollGames(-1)}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next recently played games" title="Next games"
            aria-controls="recently-played-rail" disabled={!scrollable.next} onClick={() => scrollGames(1)}>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>}
      </div>
      <div className="landscape-rail recent-games-rail" id="recently-played-rail" ref={railRef}>
        {recentGames.map((group) => <RecentGameCard key={group.key} group={group} now={now} />)}
      </div>
    </section>
  );
}

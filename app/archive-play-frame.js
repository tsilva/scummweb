"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { prepareRemoteGameArchive } from "./remote-game-archive.mjs";
import { gameLoadingStatus } from "./game-loading-status.mjs";
import GameRouteFrame from "./game-route-frame";
import GameBootOverlay from "./game-player/GameBootOverlay";
import { withGameTelemetry } from "./game-player/telemetry.mjs";
import { buildZipGamePlayerUrl } from "./home-shell/zip-game-player";
import { buildGameExitHref } from "./home-shell/hero-selection.mjs";
import { getGamePlayHref } from "./game-play-source.mjs";
import { selectGameArchive } from "./local-game-archive.mjs";
import { getRecognizedGames } from "./recognized-games.mjs";
import { loadArtworkStorage } from "../lib/artwork-storage.mjs";

const noRecognizedGames = [];

export function ArchivePlayer({ game, loadArchive, remote = false }) {
  return (
    <GameRouteFrame
      archiveLoadingText={remote ? "Loading game…" : "Opening game files…"}
      game={game}
      target={game?.target}
      loadArchive={loadArchive}
      src={buildZipGamePlayerUrl(buildGameExitHref(game), { saveNamespace: game?.saveNamespace })}
      title={game?.displayTitle ?? "ScummVM game"}
    />
  );
}

export function RemoteArchivePlayer({ zip, catalog = noRecognizedGames }) {
  const router = useRouter();
  const [archive, setArchive] = useState(null);
  const [status, setStatus] = useState("Identifying game…");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function prepare() {
      await loadArtworkStorage().catch(() => {});
      controller.signal.throwIfAborted();
      return prepareRemoteGameArchive(zip, {
        signal: controller.signal,
        onDownloading: () => setStatus("Loading game…"),
        onProgress: (_progress, details) => {
          if (!controller.signal.aborted) {
            setStatus(gameLoadingStatus(details));
          }
        },
      });
    }
    prepare().then((result) => {
      if (controller.signal.aborted) return;
      const recognizedGames = getRecognizedGames(catalog);
      const href = getGamePlayHref(result.game, recognizedGames);
      const route = recognizedGames.find((game) => game.playHref === href);
      const resolved = { ...result, game: result.game ? { ...result.game, ...route, skipIntro: null } : null };
      if (window.location.pathname !== href) {
        if (resolved.game) selectGameArchive(resolved.loadArchive, resolved.game);
        router.replace(withGameTelemetry(`${href}${window.location.hash}`, window.location.href));
      } else {
        setArchive(resolved);
      }
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [zip, catalog, router]);

  if (archive) return <ArchivePlayer {...archive} remote />;
  return (
    <div className="game-route-shell">
      <div className="game-route-controls">
        <div className="game-route-control-group is-left">
          <a className="game-route-control-button is-exit" href="/" aria-label="Exit game" title="Exit game">
            <LogOut aria-hidden="true" size={17} strokeWidth={2} />
          </a>
        </div>
      </div>
      <GameBootOverlay
        title="ScummVM game"
        bootStatusText={error || status}
        hasBootFailed={Boolean(error)}
        showBootOverlay
      />
    </div>
  );
}

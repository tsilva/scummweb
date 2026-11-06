"use client";

import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { prepareRemoteGameArchive } from "../../remote-game-archive.mjs";
import { gameLoadingStatus } from "../../game-loading-status.mjs";
import GameRouteFrame from "../../game-route-frame";
import GameBootOverlay from "../../game-player/GameBootOverlay";
import { buildZipGamePlayerUrl } from "../../home-shell/zip-game-player";
import { buildGameExitHref } from "../../home-shell/hero-selection.mjs";
import { getSelectedGamePresentation, openSelectedGameArchive } from "../../local-game-archive.mjs";

function ArchivePlayer({ game, loadArchive, remote = false }) {
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

function SelectedArchivePlayer() {
  const [game] = useState(getSelectedGamePresentation);
  return <ArchivePlayer game={game} loadArchive={openSelectedGameArchive} />;
}

function RemoteArchivePlayer({ zip }) {
  const [archive, setArchive] = useState(null);
  const [status, setStatus] = useState("Identifying game…");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    prepareRemoteGameArchive(zip, {
      signal: controller.signal,
      onDownloading: () => setStatus("Loading game…"),
      onProgress: (_progress, details) => {
        if (!controller.signal.aborted) {
          setStatus(gameLoadingStatus(details));
        }
      },
    }).then((result) => {
      if (!controller.signal.aborted) setArchive(result);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [zip]);

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

export default function LocalPlayFrame() {
  const [hash, setHash] = useState(null);

  useEffect(() => {
    function readHash() {
      setHash(window.location.hash);
    }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  if (hash === null) return null;
  // A direct link lives in the fragment so its ZIP address stays out of the page request.
  const zip = new URLSearchParams(hash.slice(1)).get("zip");
  return zip === null ? <SelectedArchivePlayer key={hash} /> : <RemoteArchivePlayer key={hash} zip={zip} />;
}

"use client";

import { useEffect, useState } from "react";
import { readRemoteGameArchive } from "../../game-bucket.mjs";
import GameRouteFrame from "../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../home-shell/zip-game-player";
import { getSelectedGamePresentation, openSelectedGameArchive } from "../../local-game-archive.mjs";

function ArchivePlayer({ zip }) {
  const [game] = useState(() => zip === null ? getSelectedGamePresentation() : null);
  const [loadArchive] = useState(() => zip === null
    ? openSelectedGameArchive
    : (signal) => readRemoteGameArchive(zip, { signal }));

  return (
    <GameRouteFrame
      archiveLoadingText={zip === null ? "Opening game files…" : "Downloading game ZIP…"}
      game={game}
      target={game?.target}
      loadArchive={loadArchive}
      src={buildZipGamePlayerUrl("/#library", { saveNamespace: game?.saveNamespace })}
      title={game?.displayTitle ?? "ScummVM game"}
    />
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
  return <ArchivePlayer key={hash} zip={zip} />;
}

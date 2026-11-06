"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchivePlayer, RemoteArchivePlayer } from "../../archive-play-frame";
import { getGamePlayHref } from "../../game-play-source.mjs";
import { getSelectedGamePresentation, openSelectedGameArchive } from "../../local-game-archive.mjs";
import { getRecognizedGames } from "../../recognized-games.mjs";

function SelectedArchivePlayer({ recognizedGames }) {
  const router = useRouter();
  const [game] = useState(getSelectedGamePresentation);
  const href = getGamePlayHref(game, recognizedGames);
  useEffect(() => {
    if (href !== "/local/play") router.replace(`${href}${window.location.hash}`);
  }, [href, router]);
  if (href !== "/local/play") return null;
  return <ArchivePlayer game={game} loadArchive={openSelectedGameArchive} />;
}

export default function LocalPlayFrame({ catalog }) {
  const recognizedGames = useMemo(() => getRecognizedGames(catalog), [catalog]);
  const [hash, setHash] = useState(null);

  useEffect(() => {
    function readHash() { setHash(window.location.hash); }
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  if (hash === null) return null;
  const zip = new URLSearchParams(hash.slice(1)).get("zip");
  return zip === null ? <SelectedArchivePlayer key={hash} recognizedGames={recognizedGames} />
    : <RemoteArchivePlayer key={hash} zip={zip} recognizedGames={recognizedGames} />;
}

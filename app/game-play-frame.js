"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ArchivePlayer, RemoteArchivePlayer } from "./archive-play-frame";
import { checkGameSource, readGameSources } from "./game-sources.mjs";
import { getMatchingGameSources, getSourceGamePresentation, prepareGameSourcePlayer } from "./game-play-source.mjs";
import { chooseGameVersion, getGameFamilyKey, readChosenVersion } from "./game-versions.mjs";
import { getSelectedGamePresentation, openSelectedGameArchive } from "./local-game-archive.mjs";
import { getRecognizedGames } from "./recognized-games.mjs";
import { withGameTelemetry } from "./game-player/telemetry.mjs";
import { loadArtworkStorage } from "../lib/artwork-storage.mjs";

const SourceLibrary = dynamic(() => import("./home-shell/source-library"));

function subscribeToHash(onChange) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function readGameZip() {
  return new URLSearchParams(window.location.hash.slice(1)).get("zip");
}
const serverGameZip = () => undefined;

export default function GamePlayFrame({ game, catalog, artwork, officialUrl, children }) {
  const [selection, setSelection] = useState(null);
  const zip = useSyncExternalStore(subscribeToHash, readGameZip, serverGameZip);

  useEffect(() => {
    if (zip === undefined) return;
    const controller = new AbortController();
    const select = (value) => setSelection({ ...value, zip });
    const pending = getSelectedGamePresentation();
    if (pending && getGameFamilyKey(pending) === getGameFamilyKey(game)) {
      select({ game: pending, loadArchive: openSelectedGameArchive });
      return () => controller.abort();
    }
    if (zip !== null) {
      select({ remote: true });
      return () => controller.abort();
    }

    async function restore() {
      const remembered = readChosenVersion(getGameFamilyKey(game));
      if (!game.importRequired && !remembered?.startsWith("source:")) return select({ bundled: true });
      const sources = getMatchingGameSources(game, await readGameSources(catalog, officialUrl), catalog);
      if (sources.length) await loadArtworkStorage().catch(() => {});
      if (controller.signal.aborted) return;
      const recognizedGames = sources.length ? getRecognizedGames(catalog) : catalog;
      const versions = await Promise.all(sources.map(async (source) => ({
        key: `source:${source.id}`, source, status: await checkGameSource(source),
        game: getSourceGamePresentation(source, catalog, recognizedGames),
      })));
      if (!game.importRequired) versions.unshift({ key: `catalog:${game.target}`, game });
      const version = chooseGameVersion(versions, remembered);
      if (controller.signal.aborted) return;
      if (!version?.source) return select(game.importRequired ? { missing: true } : { bundled: true });
      if (version.status !== "available") return select({ missing: true });
      const archive = await prepareGameSourcePlayer(version.source, version.game);
      if (!controller.signal.aborted) select(archive);
    }
    restore().catch(() => {
      if (!controller.signal.aborted) select(game.importRequired ? { missing: true } : { bundled: true });
    });
    return () => controller.abort();
  }, [game, catalog, officialUrl, zip]);

  function playArchive(selectedGame, resume) {
    if (getGameFamilyKey(selectedGame) !== getGameFamilyKey(game)) return false;
    const destination = `${game.playHref}${resume ? "#continue" : ""}`;
    window.history.replaceState(null, "", withGameTelemetry(destination, window.location.href));
    setSelection({ game: selectedGame, loadArchive: openSelectedGameArchive, zip: null });
    return true;
  }

  if (!selection || selection.zip !== zip) return <p role="status" className="page-shell">Opening {game.displayTitle}…</p>;
  if (selection.remote) return <RemoteArchivePlayer key={zip} zip={zip} catalog={catalog} />;
  if (selection.bundled) return children;
  if (selection.missing) return <div className="page-shell">
    <a href={game.href}>Return to {game.displayTitle}</a>
    <SourceLibrary catalog={catalog} artwork={artwork} featuredGame={game} isHomePage={false} officialUrl={officialUrl}
      libraryHeading="Game Library" onPlayArchive={playArchive} playerRoute />
  </div>;
  return <ArchivePlayer game={selection.game} loadArchive={selection.loadArchive} />;
}

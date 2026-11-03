"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { buildVersionedAssetPath } from "../asset-paths";

const playerUrl = buildVersionedAssetPath("/scummvm.html", {
  searchParams: { localGame: "1" },
  hash: "--path=/local-game --auto-detect",
});

export function useZipGamePlayer() {
  const player = useRef(null);
  const pendingFiles = useRef(null);
  const busy = useRef(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [status, setStatus] = useState("");

  const [opening, setOpening] = useState(false);

  useLayoutEffect(() => {
    if (!showPlayer) return;

    function failPlayer(message) {
      pendingFiles.current = null;
      busy.current = false;
      setShowPlayer(false);
      setStatus(message);
    }

    const timeout = window.setTimeout(() => {
      failPlayer("ScummVM took too long to start. Try opening the ZIP again.");
    }, 90000);

    function handleMessage(event) {
      if (!busy.current || event.origin !== window.location.origin ||
          event.source !== player.current?.contentWindow) return;
      const { type, status: result } = event.data ?? {};
      if (type === "scummweb:local-game-ready" && pendingFiles.current) {
        const files = pendingFiles.current;
        event.source.postMessage(
          { type: "scummweb:local-game-files", files },
          window.location.origin,
          files.map(({ data }) => data.buffer)
        );
        pendingFiles.current = null;
      }
      if (type === "scummweb:local-game-status") {
        window.clearTimeout(timeout);
        if (result === "running") {
          setStatus("Game detected.");
          player.current?.focus();
        } else if (result === "undetected") {
          failPlayer("ScummVM could not detect a supported game. Check that the ZIP contains its game data.");
        } else {
          failPlayer("ScummVM could not start this game. Try another ZIP.");
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    };
  }, [showPlayer]);

  async function openArchive(loadArchive, openingMessage = "Opening ZIP…") {
    if (busy.current) return;
    busy.current = true;
    setOpening(true);
    setStatus(openingMessage);
    try {
      pendingFiles.current = await loadArchive();
      setStatus("Starting ScummVM…");
      setShowPlayer(true);
    } catch (error) {
      busy.current = false;
      setStatus(error.message);
    } finally {
      setOpening(false);
    }
  }

  function closePlayer() {
    pendingFiles.current = null;
    busy.current = false;
    setShowPlayer(false);
    setStatus("");
  }

  return { player, showPlayer, opening, status, openArchive, closePlayer };
}

export function ZipGameFrame({ player, title }) {
  return (
    <iframe
      className="local-game-player"
      ref={player}
      src={playerUrl}
      title={title}
      allow="autoplay; fullscreen"
    />
  );
}

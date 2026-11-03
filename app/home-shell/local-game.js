"use client";

import { useRef, useState } from "react";
import { useZipGamePlayer, ZipGameFrame } from "./zip-game-player";
import { readLocalGameArchive } from "../local-game-archive.mjs";

export default function LocalGame() {
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const { player, showPlayer, opening, status, openArchive, closePlayer } = useZipGamePlayer();

  function openFiles(files) {
    if (opening || showPlayer) return;
    if (files.length !== 1) {
      setSelectionError("Choose one game ZIP at a time.");
      return;
    }
    setSelectionError("");
    openArchive(() => readLocalGameArchive(files[0]));
  }

  return (
    <section className="content-band" aria-labelledby="local-game-heading">
      <div className="section-header">
        <h2 id="local-game-heading"><span className="section-mark" />Play a local ZIP</h2>
      </div>
      <div
        className={`local-game-drop${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = opening || showPlayer ? "none" : "copy";
          setDragging(!opening && !showPlayer);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
            setDragging(false);
          }
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          openFiles(event.dataTransfer.files);
        }}
      >
        <p>Drop one ScummVM game ZIP here. Your game files stay on this device.</p>
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            if (event.target.files.length) openFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {showPlayer ? (
          <button
            type="button"
            className="secondary-button"
            onClick={closePlayer}
          >
            Close player
          </button>
        ) : (
          <button
            type="button"
            className="secondary-button"
            disabled={opening}
            onClick={() => fileInput.current.click()}
          >
            Choose ZIP
          </button>
        )}
      </div>
      <p className="local-game-status" role="status">{selectionError || status}</p>
      {showPlayer && (
        <ZipGameFrame player={player} title="Local ScummVM game" />
      )}
    </section>
  );
}

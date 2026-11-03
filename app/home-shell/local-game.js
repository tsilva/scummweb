"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { selectLocalGameArchive } from "../local-game-archive.mjs";

export default function LocalGame() {
  const fileInput = useRef(null);
  const router = useRouter();
  const [opening, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  function openFiles(files) {
    if (opening) return;
    if (files.length !== 1) {
      setSelectionError("Choose one game ZIP at a time.");
      return;
    }
    setSelectionError("");
    selectLocalGameArchive(files[0]);
    startTransition(() => router.push("/local/play"));
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
          event.dataTransfer.dropEffect = opening ? "none" : "copy";
          setDragging(!opening);
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
        <button
          type="button"
          className="secondary-button"
          disabled={opening}
          onClick={() => fileInput.current.click()}
        >
          Choose ZIP
        </button>
      </div>
      <p className="local-game-status" role="status">{opening ? "Opening player…" : selectionError}</p>
    </section>
  );
}

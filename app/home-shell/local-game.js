"use client";

import { useState } from "react";
import { AddWebGamesButton } from "./game-bucket";

export async function chooseZipHandle() {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: "Game ZIP", accept: { "application/zip": [".zip"] } }],
  });
  return handle;
}

export default function LocalGame({ addLocal, chooseZip, disabled }) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      id="local-game-heading"
      className={`local-game-drop${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        setDragging(!disabled);
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
        if (disabled) return;

        const { files, items } = event.dataTransfer;
        if (files.length !== 1) {
          addLocal(() => { throw new Error("Drop one game ZIP at a time."); });
          return;
        }
        const file = files[0];
        // Capture the handle before leaving the drop event's synchronous turn.
        const item = [...items].find(({ kind }) => kind === "file");
        addLocal(async () => {
          const handle = await item?.getAsFileSystemHandle?.().catch(() => null);
          return { handle, file };
        });
      }}
    >
      <p>Drop a ScummVM game ZIP here. Your game files stay on this device.</p>
      <div className="game-source-actions">
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => chooseZip()}>
          Choose ZIP
        </button>
        <AddWebGamesButton disabled={disabled} />
      </div>
    </div>
  );
}

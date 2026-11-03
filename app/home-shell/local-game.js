"use client";

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { captureGameDrop } from "../local-game-import.mjs";
import { AddWebGamesButton } from "./game-bucket";

export function chooseZipHandles(multiple) {
  return window.showOpenFilePicker({
    multiple,
    types: [{ description: "Game ZIP", accept: { "application/zip": [".zip"] } }],
  });
}

export default function LocalGame({ importRoots, chooseZip, chooseFolder, disabled }) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const isFileDrag = (event) => event.dataTransfer?.types.includes("Files");
    function over(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      setDragging(!disabled);
    }
    function enter(event) {
      if (!isFileDrag(event)) return;
      dragDepth.current++;
      over(event);
    }
    function leave(event) {
      if (!isFileDrag(event) && !dragDepth.current) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) clear();
    }
    function clear() {
      dragDepth.current = 0;
      setDragging(false);
    }
    function drop(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      clear();
      if (disabled) return;
      const roots = captureGameDrop(event.dataTransfer);
      document.getElementById("library")?.scrollIntoView({ behavior: "instant" });
      void importRoots(roots);
    }

    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragend", clear);
    window.addEventListener("blur", clear);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragend", clear);
      window.removeEventListener("blur", clear);
      window.removeEventListener("drop", drop);
    };
  }, [disabled, importRoots]);

  return (
    <div id="local-game-heading" className="local-game-drop">
      <p>Drop game ZIPs or folders anywhere on this page. Your files stay on this device.</p>
      <div className="game-source-actions">
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => chooseZip()}>
          Choose ZIPs
        </button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => chooseFolder()}>
          Choose folder
        </button>
        <AddWebGamesButton disabled={disabled} />
      </div>
      {dragging && (
        <div className="game-drop-overlay" role="status">
          <div className="game-drop-message">
            <Download aria-hidden="true" size={32} />
            <strong>Drop to add games to your library</strong>
            <span>Game ZIPs and folders stay on this device.</span>
          </div>
        </div>
      )}
    </div>
  );
}

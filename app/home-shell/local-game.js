"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { captureGameDrop } from "../local-game-import.mjs";

export function chooseZipHandles(multiple) {
  return window.showOpenFilePicker({
    multiple,
    types: [{ description: "Game ZIP", accept: { "application/zip": [".zip"] } }],
  });
}

export default function GameDropOverlay({ importRoots, disabled }) {
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

  if (!dragging) return null;

  return createPortal(
    <div className="game-drop-overlay" role="status">
      <div className="game-drop-message">
        <Download aria-hidden="true" size={32} />
        <strong>Drop to add games to your library</strong>
        <span>Game ZIPs and folders stay on this device.</span>
      </div>
    </div>,
    document.body,
  );
}

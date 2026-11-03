"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Download, File, TriangleAlert } from "lucide-react";
import { captureGameDrop } from "../local-game-import.mjs";

export function chooseZipHandles(multiple) {
  return window.showOpenFilePicker({
    multiple,
    types: [{ description: "Game ZIP", accept: { "application/zip": [".zip"] } }],
  });
}

export default function GameDropOverlay({ importRoots, disabled, pending, result, onConfirm }) {
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

  if (result || pending.length) {
    return createPortal(<GameImportDialog pending={pending} result={result} onConfirm={onConfirm} />, document.body);
  }

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

function GameImportDialog({ pending, result, onConfirm }) {
  const dialog = useRef(null);
  const confirm = useRef(null);
  const complete = Boolean(result);

  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useLayoutEffect(() => {
    if (complete) confirm.current?.focus();
  }, [complete]);

  const saved = result?.savedIds.size ?? 0;
  const skipped = result?.errors.length ?? 0;
  const title = !result ? "Importing games…"
    : !saved ? "No games added"
    : result.replacing ? "Game reconnected"
    : saved === 1 ? "1 game added" : `${saved} games added`;
  const Icon = !result ? Download : skipped ? TriangleAlert : CircleCheck;

  return (
    <dialog
      ref={dialog}
      className="game-import-dialog"
      aria-labelledby="game-import-title"
      aria-describedby="game-import-summary"
      onCancel={(event) => {
        event.preventDefault();
        if (complete) onConfirm();
      }}
    >
      <div className="game-import-heading">
        <Icon aria-hidden="true" size={28} className={skipped ? "game-import-warning" : undefined} />
        <div>
          <h2 id="game-import-title">{title}</h2>
          <p id="game-import-summary">{result ? (skipped ? `${skipped} ${skipped === 1 ? "item" : "items"} skipped` : "Ready to play")
            : "Checking files on this device."}</p>
        </div>
      </div>
      <div className="game-import-details" key={complete ? "result" : "progress"}
        role="region" aria-label="Import details" tabIndex={0}>
        {result ? (
          <>
            {skipped > 0 && (
              <ul className="game-import-items">
                {result.errors.map(({ label, message }, index) => (
                  <li key={index}>
                    <File aria-hidden="true" size={22} />
                    <div><strong>{label}</strong><p>{message}</p></div>
                  </li>
                ))}
              </ul>
            )}
            {result.temporary > 0 && <p>Some games are only available in this tab.</p>}
            {result.needsSelection > 0 && <p>Your browser may ask you to locate the files again after reload.</p>}
          </>
        ) : (
          <ul className="game-import-items" aria-live="polite">
            {pending.map(({ index, label, message, value, total }, position) => (
              <li key={index}>
                <File aria-hidden="true" size={22} />
                <div>
                  <strong>{label}</strong><p>{message}</p>
                  {position === 0 && <progress aria-label={`Importing ${label}`} value={value} max={total} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {complete && <button ref={confirm} className="game-import-confirm" type="button" onClick={onConfirm}>Confirm</button>}
    </dialog>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleMinus, CircleX, Download, File } from "lucide-react";
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

const gameCount = (count) => `${count} ${count === 1 ? "game" : "games"}`;

export function GameImportDialog({ pending, result, onConfirm }) {
  const dialog = useRef(null);
  const details = useRef(null);
  const confirm = useRef(null);
  const complete = Boolean(result);
  const active = pending.find((item) => !item.complete && !item.status);
  const latestScan = Math.max(0, ...pending.flatMap((item) =>
    item.files?.length ? item.files.map((file) => file.scanOrder ?? 0) : [item.scanOrder ?? 0]));

  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useLayoutEffect(() => {
    if (complete) confirm.current?.focus();
  }, [complete]);

  useLayoutEffect(() => {
    if (!complete && details.current) details.current.scrollTop = 0;
  }, [complete, latestScan]);

  const added = result?.items.filter((item) => item.status === "added").length ?? 0;
  const skipped = result?.items.filter((item) => item.status === "skipped").length ?? 0;
  const errors = result?.items.filter((item) => item.status === "error").length ?? 0;
  const title = result ? `${gameCount(result.items.length)} scanned` : "Importing games…";
  const summary = result
    ? `${gameCount(added)} added · ${gameCount(skipped)} skipped · ${errors} ${errors === 1 ? "error" : "errors"}`
    : null;
  const Icon = !result ? Download : errors ? CircleX : added ? CircleCheck : CircleMinus;
  const iconClass = errors ? "game-import-error" : result && !added ? "game-import-warning" : undefined;

  return (
    <dialog
      ref={dialog}
      className="game-import-dialog"
      aria-labelledby="game-import-title"
      aria-describedby={complete ? "game-import-summary" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (complete) onConfirm();
      }}
    >
      <div className="game-import-heading">
        <Icon aria-hidden="true" size={28} className={iconClass} />
        <div>
          <h2 id="game-import-title">{title}</h2>
          {complete ? <p id="game-import-summary">{summary}</p> : (
            <progress aria-label="Importing games" value={active?.value} max={active?.total} />
          )}
        </div>
      </div>
      <div ref={details} className="game-import-details" key={complete ? "result" : "progress"}
        role="region" aria-label="Import details" tabIndex={0}>
        {result ? (
          <>
            <GameImportItems items={result.items} complete />
            {result.temporary > 0 && <p>Some games are only available in this tab.</p>}
          </>
        ) : (
          <GameImportItems items={pending} showProgress />
        )}
      </div>
      {complete && <button ref={confirm} className="game-import-confirm" type="button" onClick={onConfirm}>Confirm</button>}
    </dialog>
  );
}

export function GameImportItems({ items, complete = false, showProgress = false }) {
  const rows = items.flatMap((item, index) => {
    if (showProgress && item.files?.length) {
      return item.files.map((file, fileIndex) => ({ ...file, key: `${index}:${fileIndex}` }));
    }
    if (showProgress && item.container && !item.status) return [];
    return [{ ...item, key: String(index) }];
  });
  if (showProgress) rows.sort((a, b) => (b.scanOrder ?? 0) - (a.scanOrder ?? 0));
  else rows.reverse();
  return (
    <ul className="game-import-items" aria-live={showProgress ? "polite" : undefined}>
      {rows.filter((item) => item.status !== "skipped").map(({ key, label, message, status, complete: checked, files }) => {
        const error = status === "error";
        const success = status === "added" || complete || checked;
        const StatusIcon = error ? CircleX : success ? CircleCheck : File;
        return (
          <li key={key}>
            <StatusIcon aria-hidden="true" size={22}
              className={error ? "game-import-error" : success ? "game-import-success" : undefined} />
            <div>
              <strong>{label}</strong><p>{error ? `Error. ${message}` : message}</p>
              {!showProgress && files?.length > 0 && <GameImportItems items={files} complete={complete} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

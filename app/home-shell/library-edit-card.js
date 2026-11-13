"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { createLibraryHold } from "./library-removal.mjs";

export default function LibraryEditCard({ children, item, editing, disabled, onEdit, onRemove }) {
  const blockedClick = useRef(false);
  const pointerType = useRef(null);
  const hold = useRef(null);
  if (!hold.current) hold.current = createLibraryHold(() => {
    blockedClick.current = true;
    onEdit();
  });

  useEffect(() => {
    const gesture = hold.current;
    window.addEventListener("scroll", gesture.cancel, true);
    window.addEventListener("blur", gesture.cancel);
    return () => {
      gesture.cancel();
      window.removeEventListener("scroll", gesture.cancel, true);
      window.removeEventListener("blur", gesture.cancel);
    };
  }, []);

  function blockNavigation(event) {
    if (!event.target.closest(".poster-card")) return;
    if (editing || blockedClick.current) {
      event.preventDefault();
      event.stopPropagation();
      blockedClick.current = false;
    }
  }

  return <div className="poster-entry library-edit-card" data-editing={editing || undefined}
    data-library-source-ids={JSON.stringify(item.versions.flatMap(({ source }) => source ? [source.id] : []))}
    onPointerDown={(event) => {
      blockedClick.current = false;
      pointerType.current = event.pointerType;
      if (!editing && !disabled && event.target.closest(".poster-card")) hold.current.start(event);
      else hold.current.cancel();
    }}
    onPointerMove={(event) => hold.current.move(event)}
    onPointerUp={() => hold.current.cancel()} onPointerCancel={() => hold.current.cancel()}
    onPointerLeave={() => hold.current.cancel()}
    onDragStart={(event) => { event.preventDefault(); hold.current.cancel(); }}
    onContextMenu={(event) => {
      if (editing || blockedClick.current || pointerType.current === "touch") event.preventDefault();
      else hold.current.cancel();
    }}
    onClickCapture={blockNavigation} onAuxClickCapture={blockNavigation}>
    {children}
    {editing && <button type="button" className="library-remove" data-library-remove
      aria-label={`Remove ${item.title} from library`} title={`Remove ${item.title} from library`}
      disabled={disabled} onClick={() => onRemove(item)}>
      <X size={20} aria-hidden="true" />
    </button>}
  </div>;
}

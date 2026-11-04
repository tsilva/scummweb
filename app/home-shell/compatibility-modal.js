"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import compatibility from "../../data/game-compatibility.json";
import CompatibilityView from "../compatibility/compatibility-view";

export default function CompatibilityModal() {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const panel = dialog.current;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (panel.open) panel.close();
    };
  }, [isOpen]);

  function open() {
    dialog.current.showModal();
    setIsOpen(true);
  }

  function close() {
    dialog.current.close();
  }

  return (
    <>
      <button ref={trigger} type="button" className="nav-icon-link" aria-label="Game compatibility"
        title="Game compatibility" aria-haspopup="dialog" aria-controls="game-compatibility" onClick={open}>
        <ListChecks className="icon" aria-hidden="true" />
      </button>
      <dialog ref={dialog} id="game-compatibility" className="compatibility-modal"
        aria-labelledby="compatibility-title" aria-describedby="compatibility-description"
        onClose={() => { setIsOpen(false); trigger.current?.focus({ preventScroll: true }); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <CompatibilityView entries={compatibility.entries} recordedOn={compatibility.recordedOn}
          upstreamReference={compatibility.upstreamReference} active={isOpen} onClose={close} />
      </dialog>
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";

export default function LibraryVersionRemoval({ item, disabled, notice, onRemove, onClose }) {
  const dialog = useRef(null);
  const [versions, setVersions] = useState(item.versions);
  const [pending, setPending] = useState(false);
  const [fadingKey, setFadingKey] = useState(null);
  const busy = disabled || pending || fadingKey !== null;
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    if (fadingKey === null) return;
    // Match the row's fade/collapse, including when animations are reduced.
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320;
    const timer = setTimeout(() => {
      const index = versions.findIndex(({ key }) => key === fadingKey);
      setVersions((current) => current.filter(({ key }) => key !== fadingKey));
      setFadingKey(null);
      requestAnimationFrame(() => {
        const buttons = dialog.current?.querySelectorAll("[data-version-remove]");
        (buttons?.[Math.min(index, buttons.length - 1)] || dialog.current?.querySelector("[data-removal-close]"))?.focus({ preventScroll: true });
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [fadingKey, versions]);

  async function removeVersion(version, button) {
    if (busy) return;
    setPending(true);
    try {
      if (await onRemove(item, [version])) setFadingKey(version.key);
      else requestAnimationFrame(() => button.focus({ preventScroll: true }));
    } finally {
      setPending(false);
    }
  }

  return <dialog ref={dialog} className="library-version-removal" aria-labelledby="library-removal-title"
    aria-describedby="library-removal-description"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === dialog.current && !busy) onClose(); }}>
    <div className="library-removal-heading">
      <h2 id="library-removal-title">Remove {item.title}</h2>
      <button type="button" className="secondary-button" data-removal-close aria-label="Close version chooser" disabled={busy} onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <p id="library-removal-description">Choose an imported version to remove. Included games, your files and saved games stay.</p>
    {notice?.tone === "error" && <p role="alert">{notice.message}</p>}
    <ul>{versions.map((version) => <li key={version.key} data-removing={fadingKey === version.key || undefined}>
      <div className="library-removal-row">
        <span>{version.label}{version.source && <small>{version.source.name}</small>}</span>
        {version.source ? <button type="button" className="secondary-button library-version-trash" disabled={busy}
          data-version-remove aria-label={`Remove ${version.label}`} title={`Remove ${version.label}`}
          onClick={(event) => removeVersion(version, event.currentTarget)}><Trash2 size={20} aria-hidden="true" /></button>
          : <span>Included</span>}
      </div>
    </li>)}</ul>
    {versions.length === 0 && <p role="status">No imported versions remain.</p>}
  </dialog>;
}

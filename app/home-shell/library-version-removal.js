"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { removableLibraryVersions } from "./library-removal.mjs";

export default function LibraryVersionRemoval({ item, disabled, notice, onRemove, onClose }) {
  const removable = removableLibraryVersions(item);
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  return <dialog ref={dialog} className="library-version-removal" aria-labelledby="library-removal-title"
    aria-describedby="library-removal-description"
    onCancel={(event) => { event.preventDefault(); if (!disabled) onClose(); }}
    onClick={(event) => { if (event.target === dialog.current && !disabled) onClose(); }}>
    <div className="library-removal-heading">
      <h2 id="library-removal-title">Remove {item.title}</h2>
      <button type="button" className="secondary-button" aria-label="Close version chooser" disabled={disabled} onClick={onClose}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <p id="library-removal-description">Choose an imported version to remove. Included games, your files and saved games stay.</p>
    {notice?.tone === "error" && <p role="alert">{notice.message}</p>}
    <ul>{item.versions.map((version) => <li key={version.key}>
      <span>{version.label}{version.source && <small>{version.source.name}</small>}</span>
      {version.source ? <button type="button" className="secondary-button" disabled={disabled}
        aria-label={`Remove ${version.label}`} onClick={() => onRemove(item, [version])}>Remove</button>
        : <span>Included</span>}
    </li>)}</ul>
    {removable.length > 0 && <button type="button" className="secondary-button" disabled={disabled}
      onClick={() => onRemove(item, removable)}>{removable.length === item.versions.length
        ? "Remove all versions" : "Remove imported versions"}</button>}
  </dialog>;
}

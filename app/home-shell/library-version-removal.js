"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function LibraryVersionRemoval({ item, disabled, notice, onRemove, onClose }) {
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
    <p id="library-removal-description">Choose a version to remove. Your files and saved games stay.</p>
    {notice?.tone === "error" && <p role="alert">{notice.message}</p>}
    <ul>{item.versions.map((version) => <li key={version.key}>
      <span>{version.label}{version.source && <small>{version.source.name}</small>}</span>
      <button type="button" className="secondary-button" disabled={disabled}
        aria-label={`Remove ${version.label}`} onClick={() => onRemove(item, [version])}>Remove</button>
    </li>)}</ul>
    <button type="button" className="secondary-button" disabled={disabled}
      onClick={() => onRemove(item, item.versions)}>Remove all versions</button>
  </dialog>;
}

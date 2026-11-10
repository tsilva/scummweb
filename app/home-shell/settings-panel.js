"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, X } from "lucide-react";

export default function SettingsPanel(props) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const working = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [SettingsContent, setSettingsContent] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.showModal();
    panel.querySelector(".settings-close")?.focus({ preventScroll: true });
    return () => {
      panel.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  function showSettings() {
    setOpen(true);
    if (SettingsContent) return;
    setLoadFailed(false);
    void import("./settings-content").then(
      ({ default: Content }) => setSettingsContent(() => Content),
      () => setLoadFailed(true),
    );
  }

  function close() {
    if (!working.current) setOpen(false);
  }

  return <>
    <button ref={trigger} type="button" className="nav-icon-link settings-trigger" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open}
      aria-controls="site-settings" onClick={showSettings}>
      <Settings className="icon" aria-hidden="true" />
    </button>
    <dialog ref={dialog} id="site-settings" className="settings-drawer" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <div className="settings-content">
        <header className="settings-heading"><h2 id="settings-title">Settings</h2>
          <span className="settings-progress" role="status">{busy ? "Working…" : ""}</span>
          <button type="button" className="settings-close" aria-label="Close settings" aria-disabled={busy || undefined} onClick={close}><X size={24} /></button>
        </header>
        {open && (SettingsContent
          ? <SettingsContent {...props} working={working} busy={busy} setBusy={setBusy} />
          : <p className="settings-status" role={loadFailed ? "alert" : "status"}>
            {loadFailed ? "Could not load settings. Reload this page to try again." : "Loading settings…"}
          </p>)}
      </div>
    </dialog>
  </>;
}

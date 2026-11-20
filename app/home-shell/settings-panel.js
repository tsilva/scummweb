"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Settings, X } from "lucide-react";

function SettingsSpinner({ className, size, children }) {
  return <span className={`settings-spinner ${className}`} role="status">
    <LoaderCircle size={size} aria-hidden="true" />
    <span>{children}</span>
  </span>;
}

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

  const loadingIndicator = <SettingsSpinner className="settings-loader" size={28}>Loading settings…</SettingsSpinner>;

  return <>
    <button ref={trigger} type="button" className="nav-icon-link settings-trigger" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open}
      aria-controls="site-settings" onClick={showSettings}>
      <Settings className="icon" aria-hidden="true" />
    </button>
    <dialog ref={dialog} id="site-settings" className="settings-drawer" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === dialog.current) close(); }}>
      <div className="settings-content">
        <header className="settings-heading"><h2 id="settings-title">Settings</h2>
          {busy && <SettingsSpinner className="settings-header-loader" size={20}>Transferring saves…</SettingsSpinner>}
          <button type="button" className="settings-close" aria-label="Close settings" aria-disabled={busy || undefined} onClick={close}><X size={24} /></button>
        </header>
        <div className="settings-body">
          {open && (SettingsContent
            ? <SettingsContent {...props} working={working} busy={busy} setBusy={setBusy} loadingIndicator={loadingIndicator} />
            : loadFailed
              ? <p className="settings-status" role="alert">Could not load settings. Reload this page to try again.</p>
              : loadingIndicator)}
        </div>
      </div>
    </dialog>
  </>;
}

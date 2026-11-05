"use client";

import { useEffect, useState } from "react";
import { scummvmAssetVersion } from "../asset-paths";
import { getLatestBrowserSave } from "../browser-saves.mjs";

export default function SourceLaunchActions({ version, onLaunch, helpId = "game-file-access-help", showAccessHelp = true }) {
  const [savedVersion, setSavedVersion] = useState(null);
  useEffect(() => {
    let active = true;
    let request = 0;
    function refresh() {
      const current = ++request;
      void getLatestBrowserSave(version.game, scummvmAssetVersion).then((slot) => {
        if (active && current === request) setSavedVersion(slot === null ? null : version.key);
      });
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("scummweb:saves-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("scummweb:saves-changed", refresh);
    };
  }, [version.key, version.game]);
  const needsAccess = version.action.needsAccess;
  const canContinue = savedVersion === version.key && !version.locate && !needsAccess;
  return <>
    {needsAccess && showAccessHelp && <p className="file-access-help" id={helpId}>
      To play, ScummWEB needs to read this game’s ZIP on your device. Choose Allow file access,
      then allow access in the browser prompt. Your game files stay on your device.
    </p>}
    <button type="button" className="launch-button" disabled={version.action.disabled}
      aria-describedby={needsAccess ? helpId : undefined}
      onClick={() => { onLaunch?.(); (canContinue ? version.action.onContinue : version.action.onClick)(); }}>
      {version.locate ? version.locateLabel : needsAccess ? "Allow file access" : canContinue ? "Continue" : "Play"}
    </button>
    {canContinue && <button type="button" className="secondary-button start-fresh-button"
      disabled={version.action.disabled} onClick={() => { onLaunch?.(); version.action.onClick(); }}>Start from beginning</button>}
  </>;
}

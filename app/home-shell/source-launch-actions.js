"use client";

import useBrowserSave from "../use-browser-save";
import { cancelBrowserSaveQueries } from "../browser-saves.mjs";

export default function SourceLaunchActions({ version, onLaunch, helpId = "game-file-access-help", showAccessHelp = true }) {
  const slot = useBrowserSave(version.game);
  const needsAccess = version.action.needsAccess;
  const canContinue = slot !== undefined && slot !== null && !version.locate && !needsAccess;
  return <>
    {needsAccess && showAccessHelp && <p className="file-access-help" id={helpId}>
      To play, ScummWEB needs to read this game’s ZIP on your device. Choose Allow file access,
      then allow access in the browser prompt. Your game files stay on your device.
    </p>}
    <button type="button" className="launch-button" disabled={version.action.disabled}
      aria-describedby={needsAccess ? helpId : undefined}
      onClick={() => { cancelBrowserSaveQueries(); onLaunch?.(); (canContinue ? version.action.onContinue : version.action.onClick)(); }}>
      {version.locate ? version.locateLabel : needsAccess ? "Allow file access" : canContinue ? "Continue" : "Play"}
    </button>
    {canContinue && <button type="button" className="secondary-button start-fresh-button"
      disabled={version.action.disabled} onClick={() => { cancelBrowserSaveQueries(); onLaunch?.(); version.action.onClick(); }}>Start from beginning</button>}
  </>;
}

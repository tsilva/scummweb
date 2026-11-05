"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import LaunchButton from "../launch-button";
import { scummvmAssetVersion } from "../asset-paths";
import { getLatestBrowserSave } from "../browser-saves.mjs";
import { chooseGameVersion, readChosenVersion, rememberGameVersion } from "../game-versions.mjs";
import GameDetailModal from "./game-detail-modal";

export function SourceLaunchActions({ version, onLaunch }) {
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
    window.addEventListener("scummweb:saves-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("scummweb:saves-changed", refresh);
    };
  }, [version.key, version.game]);
  const needsAccess = version.action.needsAccess;
  const canContinue = savedVersion === version.key && !version.locate && !needsAccess;
  return <>
    {needsAccess && <p className="file-access-help" id="game-file-access-help">
      To play, ScummWEB needs to read this game’s ZIP on your device. Choose Allow file access,
      then allow access in the browser prompt. Your game files stay on your device.
    </p>}
    <button type="button" className="launch-button" disabled={version.action.disabled}
      aria-describedby={needsAccess ? "game-file-access-help" : undefined}
      onClick={() => { onLaunch(); (canContinue ? version.action.onContinue : version.action.onClick)(); }}>
      {version.locate ? version.locateLabel : needsAccess ? "Allow file access" : canContinue ? "Continue" : "Play"}
    </button>
    {canContinue && <button type="button" className="secondary-button start-fresh-button"
      disabled={version.action.disabled} onClick={() => { onLaunch(); version.action.onClick(); }}>Start from beginning</button>}
  </>;
}

export default function VersionedGameDetails({ group, notice, onClose, openerElement }) {
  const [selectedKey, setSelectedKey] = useState(() => chooseGameVersion(group.versions,
    readChosenVersion(group.key), new Intl.DisplayNames(["en"], { type: "language" }).of(navigator.language.split("-")[0]))?.key);
  const version = group.versions.find(({ key }) => key === selectedKey) || chooseGameVersion(group.versions);
  const remember = () => rememberGameVersion(group.key, version.key);

  return <GameDetailModal game={version.game} dialogId={group.dialogId} notice={notice} onClose={onClose} openerElement={openerElement}
    controls={group.versions.length > 1 ? <div className="game-version-controls">
      <label>Version
        <span className="library-select">
          <select value={version.key} onChange={(event) => {
            setSelectedKey(event.target.value);
            rememberGameVersion(group.key, event.target.value);
          }}>
            {group.versions.map((item) => <option key={item.key} value={item.key}>
              {item.label}{item.source && !["available", "session"].includes(item.status) ? ` — ${item.status === "checking" ? "Checking files" : item.locate ? item.locateLabel : "Check file access"}` : ""}
            </option>)}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </label>
    </div> : null}
    actions={version.source ? <SourceLaunchActions key={version.key} version={version} onLaunch={remember} />
      : <LaunchButton key={version.key} game={version.game} entryPoint="library" onLaunch={remember} />}
  />;
}

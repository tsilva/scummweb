"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import LaunchButton from "../launch-button";
import { scummvmAssetVersion } from "../asset-paths";
import { getLatestBrowserSave } from "../browser-saves.mjs";
import { chooseGameVersion, readChosenVersion, rememberGameVersion } from "../game-versions.mjs";
import GameDetailModal from "./game-detail-modal";

function SourceLaunchActions({ version, onLaunch }) {
  const [savedVersion, setSavedVersion] = useState(null);
  useEffect(() => {
    let active = true;
    void getLatestBrowserSave(version.game, scummvmAssetVersion).then((slot) => {
      if (active) setSavedVersion(slot === null ? null : version.key);
    });
    return () => { active = false; };
  }, [version.key, version.game]);
  const canContinue = savedVersion === version.key && !version.locate;
  return <>
    <button type="button" className="launch-button" disabled={version.action.disabled}
      onClick={() => { onLaunch(); (canContinue ? version.action.onContinue : version.action.onClick)(); }}>
      {version.locate ? version.locateLabel : canContinue ? "Continue" : "Play"}
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
    controls={<div className="game-version-controls">
      {group.versions.length > 1 && <label>Version
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
      </label>}
      {version.source && <>
        <p className="game-version-file">{version.source.name}</p>
        <div className="game-version-management">
          {!version.source.url && <button type="button" disabled={version.action.disabled}
            onClick={version.action.onLocate}>Locate files</button>}
          <button type="button" disabled={version.action.disabled} onClick={version.action.onRemove}>Remove this version</button>
        </div>
        <p className="game-detail-save-hint">Saves stay with this version. If Continue is unavailable, load progress from the game’s menu.</p>
        <details className="game-version-legacy">
          <summary>Older saves</summary>
          <p>Played this version before? Its older saves remain in the previous shared folder and may belong to another edition.</p>
          <button type="button" className="secondary-button" disabled={version.action.disabled || version.locate}
            onClick={() => { remember(); version.action.onLegacy(); }}>Play with older saves</button>
        </details>
      </>}
    </div>}
    actions={version.source ? <SourceLaunchActions key={version.key} version={version} onLaunch={remember} />
      : <LaunchButton key={version.key} game={version.game} entryPoint="library" onLaunch={remember} />}
  />;
}

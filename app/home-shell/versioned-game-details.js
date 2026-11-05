"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import LaunchButton from "../launch-button";
import { chooseGameVersion, readChosenVersion, rememberGameVersion } from "../game-versions.mjs";
import GameDetailModal from "./game-detail-modal";
import SourceLaunchActions from "./source-launch-actions";

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

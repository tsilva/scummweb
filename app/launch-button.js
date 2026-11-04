"use client";

import { useEffect, useState } from "react";
import { scummvmAssetVersion } from "./asset-paths";
import { getLatestBrowserSave } from "./browser-saves.mjs";

export default function LaunchButton({ game, entryPoint, label = "Play", continueLabel = "Continue", className = "", onLaunch }) {
  const classes = ["launch-button", className].filter(Boolean).join(" ");
  const [savedTarget, setSavedTarget] = useState(null);
  const canContinue = savedTarget === game.target;
  const href = entryPoint ? `${game.playHref}?launch_from=${entryPoint}` : game.playHref;

  useEffect(() => {
    let cancelled = false;
    let request = 0;

    async function refreshSave() {
      const currentRequest = ++request;
      const slot = await getLatestBrowserSave(game, scummvmAssetVersion);
      if (!cancelled && currentRequest === request) setSavedTarget(slot === null ? null : game.target);
    }

    void refreshSave();
    window.addEventListener("storage", refreshSave);
    window.addEventListener("pageshow", refreshSave);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", refreshSave);
      window.removeEventListener("pageshow", refreshSave);
    };
  }, [game]);

  return (
    <>
      <a className={classes} href={canContinue ? `${href}#continue` : href} onClick={onLaunch}>
        {canContinue ? continueLabel : label}
      </a>
      {canContinue ? (
        <a className="secondary-button start-fresh-button" href={href} onClick={onLaunch}>Start from beginning</a>
      ) : null}
    </>
  );
}

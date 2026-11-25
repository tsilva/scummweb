"use client";

import { beginGameLaunch } from "../game-player/immersive-mode.mjs";
import useLaunchFeedback from "../game-player/useLaunchFeedback";
import useBrowserSave from "../use-browser-save";
import useSaveLaunchBlock from "../use-save-launch-block";
import LaunchPending from "../launch-pending";
import { cancelBrowserSaveQueries } from "../browser-saves.mjs";
import useCloudSave from "../dropbox/use-cloud-save";

export default function SourceLaunchActions({ version, onLaunch, showAccessHelp = true,
  helpId = showAccessHelp ? "game-file-access-help" : undefined, browseHref, primaryOnly = false }) {
  const launchFeedback = useLaunchFeedback({ showBundledTags: false });
  const slot = useBrowserSave(version.game);
  const needsAccess = version.action.needsAccess;
  const cloudSave = useCloudSave(version.game);
  const canContinue = (slot != null || cloudSave) && !version.locate && !needsAccess;
  const updating = useSaveLaunchBlock(version.game, !version.locate && !needsAccess);
  const launch = (action) => {
    if (updating) return;
    const isPlay = !version.locate && !needsAccess;
    if (isPlay) launchFeedback.show(version.game);
    cancelBrowserSaveQueries();
    onLaunch?.();
    if (isPlay) beginGameLaunch();
    try {
      return Promise.resolve(action()).then((navigated) => {
        if (isPlay && !navigated) launchFeedback.dismiss();
      }, () => launchFeedback.dismiss());
    } catch (error) {
      launchFeedback.dismiss();
      throw error;
    }
  };
  return <>
    {needsAccess && showAccessHelp && <p className="file-access-help" id={helpId}>
      To play, ScummWEB needs to read this game’s ZIP or ISO on your device. Choose Allow file access,
      then allow access in the browser prompt. Your game files stay on your device.
    </p>}
    {updating ? <LaunchPending /> : <button type="button" className="launch-button" disabled={version.action.disabled}
      aria-describedby={needsAccess ? helpId : undefined}
      onClick={() => { void launch(canContinue ? version.action.onContinue : version.action.onClick); }}>
      {version.locate ? version.locateLabel : needsAccess ? "Allow file access" : canContinue ? "Continue" : "Play"}
    </button>}
    {canContinue && !primaryOnly && <button type="button" className="secondary-button start-fresh-button"
      disabled={updating || version.action.disabled} onClick={() => { void launch(version.action.onClick); }}>Start from beginning</button>}
    {!canContinue && browseHref && <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a>}
    {launchFeedback.overlay}
  </>;
}

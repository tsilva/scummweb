export function observeRemoteBack(host, { onBack, onFullscreenExit }) {
  const { document, navigation } = host;
  const fullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  let wasFullscreen = fullscreen();

  function onFullscreenChange() {
    const active = fullscreen();
    const exited = wasFullscreen && !active;
    wasFullscreen = active;
    // Android Chrome handles Back itself while fullscreen.
    if (exited && !document.hidden) onFullscreenExit();
  }

  function onNavigate(event) {
    if (event.navigationType !== "traverse" || !event.userInitiated || !event.cancelable ||
      !event.destination.sameDocument || event.destination.index >= navigation.currentEntry.index) return;
    event.preventDefault();
    onBack();
  }

  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);
  navigation?.addEventListener("navigate", onNavigate);
  return () => {
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    navigation?.removeEventListener("navigate", onNavigate);
  };
}

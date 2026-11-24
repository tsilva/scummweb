// Only return fixed step names. Frame URLs and game data must stay out of
// timeout reports, including when a player launches a personal archive.
export function getStartupTimeoutStep(iframe, { receiver, transferred }) {
  try {
    const documentUrl = iframe?.contentDocument?.URL;
    const frame = iframe?.contentWindow;
    if (!documentUrl || documentUrl === "about:blank" || !frame) return "shell-navigation";
    if (!transferred && receiver === frame) return "archive-handoff";
    const hasMark = (name) => frame.performance.getEntriesByName(`scummweb:${name}`, "mark").length > 0;
    if (!hasMark("wasm-ready")) return "runtime-initialization";
    if (!transferred) return "filesystem-before-handoff";
    if (!hasMark("filesystems-ready")) return "filesystem-after-handoff";
    switch (frame.__scummwebReadyState?.state) {
      case "ready": return "ready-message";
      case "launch-detected":
      case "awaiting-frame": return "first-frame";
      default: return "native-startup";
    }
  } catch {
    return "unavailable";
  }
}

// Opt-in console diagnostics. No game bytes, saves, or request queries are collected.
export function collectStartupDiagnostics(parent, frame) {
  const describe = (performance) => ({
    timeOrigin: performance.timeOrigin,
    marks: performance.getEntriesByType("mark")
      .filter(({ name }) => name.startsWith("scummweb:"))
      .map(({ name, startTime }) => ({ name, ms: Math.round(startTime) })),
    resources: performance.getEntriesByType("resource").map((entry) => ({
      path: entry.name.startsWith("blob:") ? "blob:" : new URL(entry.name).pathname,
      type: entry.initiatorType,
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      bytes: entry.transferSize,
    })),
  });
  return {
    parent: describe(parent.performance),
    frame: describe(frame.performance),
    phase: frame.__scummwebReadyState?.state,
    reason: frame.__scummwebReadyState?.reason,
    renderer: frame.document?.getElementById("canvas")?.dataset.scummwebRenderer || null,
    presentation: frame.document?.getElementById("canvas")?.dataset.scummwebPresentation || null,
    localGameIO: frame.__scummwebLocalGameIO ? { ...frame.__scummwebLocalGameIO } : null,
  };
}

export function observeStartupDiagnostics(parent, frameRef) {
  if (new URLSearchParams(parent.location.search).get("startupTrace") !== "1") return;
  let reportedFrame;
  const timer = parent.setInterval(() => {
    try {
      const frame = frameRef.current?.contentWindow;
      if (!frame || frame === reportedFrame || frame.__scummwebReadyState?.state !== "ready") return;
      // Allow the native frame's postMessage to reach the parent's mark first.
      if (Date.now() - frame.__scummwebReadyState.emittedAt < 250) return;
      parent.console.debug("[scummweb:startup] " + JSON.stringify(collectStartupDiagnostics(parent, frame)));
      reportedFrame = frame;
    } catch { /* A pending or cross-origin frame has no readable timings. */ }
  }, 120);
  return () => parent.clearInterval(timer);
}

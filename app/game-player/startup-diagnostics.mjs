// Opt-in, local-only diagnostics. No game bytes, saves, or request queries are
// collected, and nothing is sent to an analytics endpoint.
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

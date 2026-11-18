const firstRetryMs = 3_000;
const maxRetryMs = 30_000;

export function startArchiveRecovery({ document, getSources, checkSource, isBusy }) {
  let delay = firstRetryMs;
  let nextFolder = 0;
  const nextProbes = new Map();
  const recoveryHits = new Set();
  let timer;
  let running = false;
  let stopped = false;

  function canCheck() {
    return !stopped && !document.hidden && !isBusy();
  }

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    if (stopped || document.hidden || running || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void retry();
    }, delay);
  }

  function selectProbe(sources) {
    const folders = new Map();
    for (const source of sources) {
      const folderId = source.archiveFolderId;
      if (!folders.has(folderId)) folders.set(folderId, []);
      folders.get(folderId).push(source);
    }
    // Give each folder a turn, then rotate its probe in case one file was moved.
    const folderIndex = nextFolder % folders.size;
    nextFolder = folderIndex + 1;
    const [folderId, archives] = [...folders][folderIndex];
    const archiveIndex = (nextProbes.get(folderId) ?? 0) % archives.length;
    nextProbes.set(folderId, archiveIndex + 1);
    return archives[archiveIndex];
  }

  async function retry() {
    if (!canCheck()) return schedule();
    running = true;
    try {
      const sources = getSources();
      if (!sources.length) return;

      if (!recoveryHits.size) {
        const probe = selectProbe(sources);
        if (await checkSource(probe) === "available") recoveryHits.add(probe);
      }

      delay = recoveryHits.size ? firstRetryMs : Math.min(delay * 2, maxRetryMs);
      if (recoveryHits.size) {
        const recovered = new Set(recoveryHits);
        recoveryHits.clear();
        // Keep the older ungrouped archives together for best-effort recovery.
        const folders = new Set([...recovered].map(({ archiveFolderId }) => archiveFolderId));
        for (const source of getSources()) {
          if (!canCheck()) break;
          if (folders.has(source.archiveFolderId) && !recovered.has(source)) await checkSource(source);
        }
      }
    } finally {
      running = false;
      schedule();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) clearTimer();
    else {
      delay = firstRetryMs;
      schedule();
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  schedule();

  return {
    archiveAvailable(source) {
      if (!canCheck()) return;
      recoveryHits.add(source);
      if (running) return;
      clearTimer();
      void retry();
    },
    stop() {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

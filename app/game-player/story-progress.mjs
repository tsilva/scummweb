export const storyProgressPrefix = "scummweb.story-progress.v1:";
const sampleIntervalMs = 250;

export async function createStoryTracker(slug, revision) {
  const url = `/game-progress/v1.mjs?v=${revision}`;
  const { createTracker } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
  return createTracker(slug, revision);
}

export function getStoryProgressRevision(index, slug, bundled) {
  const map = index.games[slug];
  return bundled || map?.edition_specific ? map?.revision : undefined;
}

export function readStoryProgress(scope, version, slug, revision) {
  const entry = readStoryProgressRecord(scope, version);
  return entry && entry.slug === slug && entry.revision === revision ? entry.percent : null;
}

export function readStoryProgressRecord(scope, version) {
  try {
    const entry = JSON.parse(scope.localStorage.getItem(storyProgressPrefix + version));
    if (typeof entry?.slug === "string" && typeof entry.revision === "string" &&
        Number.isInteger(entry.percent) && entry.percent >= 0 && entry.percent <= 100) {
      return entry;
    }
  } catch { /* Story progress is optional when browser storage is unavailable. */ }
  return null;
}

export function observeStoryProgress(scope, frame, { version, slug, revision }, createTracker = createStoryTracker) {
  let stopped = false;
  let timer;
  let lastSampleTime;
  let tracker;
  let checkpointProgress;
  const player = frame.contentWindow;
  const checkpointSample = () => {
    sample();
    return checkpointProgress ?? null;
  };
  const resetCheckpointSample = () => { checkpointProgress = undefined; lastSampleTime = undefined; };
  if (player) {
    player.__scummwebReadAutosaveProgress = checkpointSample;
    player.__scummwebAutosaveAfterLoad = resetCheckpointSample;
  }

  function sample() {
    try {
      const { identity, snapshot } = frame.contentWindow?.scummwebTelemetry?.read() ?? {};
      if (!identity || snapshot?.schema_version !== 1 || snapshot.sample_time_ms === lastSampleTime) return;
      lastSampleTime = snapshot.sample_time_ms;
      tracker.acceptSnapshot(identity, snapshot);
      const report = tracker.report();
      checkpointProgress = report.state === "tracked" ? { slug, revision, percent: report.percent } : undefined;
      const storage = scope.localStorage;
      const previous = readStoryProgress(scope, version, slug, revision);
      if (report.state === "tracked" && (previous === null || report.percent > previous)) {
        storage.setItem(storyProgressPrefix + version, JSON.stringify({ slug, revision, percent: report.percent }));
      } else if (previous !== null && (report.reason === "engine_mismatch" ||
          (report.reason === "edition_mismatch" && identity.index_md5))) {
        // A reconnected library entry may now point at a different edition.
        storage.removeItem(storyProgressPrefix + version);
      }
    } catch { /* A disappearing iframe or inaccessible storage cannot affect play. */ }
  }

  void createTracker(slug, revision).then((result) => {
    if (stopped) return;
    tracker = result;
    sample();
    timer = scope.setInterval(sample, sampleIntervalMs);
    scope.addEventListener("pagehide", sample);
  }).catch(() => {});

  return () => {
    stopped = true;
    try {
      if (player?.__scummwebReadAutosaveProgress === checkpointSample) delete player.__scummwebReadAutosaveProgress;
      if (player?.__scummwebAutosaveAfterLoad === resetCheckpointSample) delete player.__scummwebAutosaveAfterLoad;
    } catch { /* The frame may have navigated. */ }
    if (tracker) {
      scope.clearInterval(timer);
      scope.removeEventListener("pagehide", sample);
    }
  };
}

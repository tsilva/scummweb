export const bugReportLimits = Object.freeze({
  message: 4000,
  saveBytes: 2 * 1024 * 1024,
  bodyBytes: 3 * 1024 * 1024,
  files: 16,
});

export const captureStatuses = new Set(["captured", "unavailable", "timeout", "failed"]);

export function reportGameIdentity(game, native = {}) {
  const identity = { source: game?.source === "catalog" ? "catalog" : "local" };
  for (const key of ["engineId", "gameId", "extra", "language", "platform"]) {
    const value = native[key] || game?.[key];
    if (typeof value === "string" && value.length <= 160) identity[key] = value;
  }
  if (identity.source === "catalog") identity.target = game.target;
  return identity;
}

export function reportPlayerSettings(settings) {
  return { volume: settings.volume, speed: settings.speed, subtitles: settings.subtitles };
}

export function validReportFilename(name) {
  return typeof name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(name);
}

export function gameLoadingStatus({ loaded, total, cached = false } = {}) {
  if (cached) return "Opening cached game…";
  if (!Number.isFinite(loaded) || loaded < 0) return "Loading game…";
  const done = (loaded / 1_000_000).toFixed(1);
  const size = Number.isFinite(total) && total > 0 ? ` / ${(total / 1_000_000).toFixed(1)}` : "";
  return `Loading game (${done}${size} MB)…`;
}

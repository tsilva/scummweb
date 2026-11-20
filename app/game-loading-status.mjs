export const GAME_LOADING_STATUS = "Loading game…";

const downloadStatus = "Downloading game…";
const megabytes = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

export function gameLoadingStatus({ downloading, loaded, total } = {}) {
  if (!downloading) return GAME_LOADING_STATUS;
  if (!Number.isFinite(loaded) || loaded < 0) return downloadStatus;
  const hasTotal = Number.isFinite(total) && total > 0 && total >= loaded;
  if (!hasTotal && loaded === 0) return downloadStatus;
  const done = megabytes.format(loaded / 1_000_000);
  const size = hasTotal ? ` of ${megabytes.format(total / 1_000_000)}` : "";
  return `${downloadStatus} ${done}${size} MB`;
}

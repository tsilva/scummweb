export const maxArchiveSize = 128 * 1024 * 1024;
export const maxExpandedSize = 256 * 1024 * 1024;
export const maxLocalGameSize = 4 * 1024 * 1024 * 1024;
export const maxGameEntries = 8192;

export class ArchiveError extends Error {}

// Hand the ZIP loader to the player route through this tab's memory.
let selectedArchive;

export function selectGameArchive(loadArchive, game) {
  selectedArchive = { loadArchive, game };
}

export function getSelectedGamePresentation() {
  return selectedArchive?.game ?? null;
}

export async function openSelectedGameArchive(signal, onProgress) {
  // Let React cancel any superseded effect before taking the selection.
  await Promise.resolve();
  signal.throwIfAborted();
  const archive = selectedArchive;
  selectedArchive = undefined;
  if (!archive) {
    throw new ArchiveError("Choose a game from the Library to play it here.");
  }
  return archive.loadArchive(signal, onProgress);
}

export function validateGameZip(file, archiveLimit = maxArchiveSize) {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new ArchiveError("Choose a ZIP containing one ScummVM game.");
  }
  if (file.size > archiveLimit) {
    throw new ArchiveError(`Choose a ZIP of ${archiveLimit / (1024 * 1024)} MiB or less.`);
  }
}

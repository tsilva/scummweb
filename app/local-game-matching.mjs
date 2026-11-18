export async function gameFileFingerprint(kind, files) {
  const manifest = JSON.stringify([kind, files.slice().sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
  )]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(manifest));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isSameLocalArchive(first, second) {
  if (!first || !second || first.kind !== second.kind) return false;
  try {
    return await first.isSameEntry(second);
  } catch {
    // Removed files and disconnected drives can leave unusable handles.
    return false;
  }
}

export async function findLocalGameSource(game, sources, reconnectable = new Set()) {
  const local = [...sources].filter((source) => !source.url && (source.kind ?? "zip") === game.kind);
  if (game.handle) {
    for (const source of local) {
      if (await isSameLocalArchive(game.handle, source.handle)) return source;
    }
  }
  const fingerprint = game.fingerprint && local.find((source) => source.fingerprint === game.fingerprint);
  if (fingerprint) return fingerprint;

  // Entries imported before fingerprints were saved can still be repaired.
  // A missing source may also be replaced with a more complete copy.
  const candidates = local.filter((source) => source.name === game.name &&
    (!source.fingerprint || reconnectable.has(source.id)));
  if (candidates.length > 1) {
    throw new Error("Several library entries match this name. Select the missing game's poster to locate its files.");
  }
  return candidates[0] ?? null;
}

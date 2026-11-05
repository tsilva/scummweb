// Shared by the player shell and the library. Only native-listed, nonempty
// files enter this index; an index never substitutes for the files themselves.
export const saveIndexPrefix = "scummweb.continue.v1:";
export const defaultSavePath = "/home/web_user/.local/share/scummvm/saves";
const supportedEngines = new Set("access adl agi bbvs cge cge2 cine cruise draci drascula dreamweb gnap got groovie hopkins hugo kyra lab lure mads mohawk neverhood ngi pegasus queen saga sci scumm sherlock sky sword1 sword2 teenagent tinsel titanic toltecs tony toon touche tsage tucker voyeur wintermute".split(" "));

export function supportsContinue(engineId, gameId, extra = "") {
  return supportedEngines.has(engineId)
    && !(engineId === "agi" && ["mickey", "winnie", "troll"].includes(gameId))
    && !(engineId === "mohawk" && (!["myst", "riven"].includes(gameId) || /demo/i.test(extra)));
}

export function saveIndexKey(namespace, target) {
  return saveIndexPrefix + (namespace || `catalog:${target}`);
}

export function saveRevision(files) {
  return JSON.stringify(files.map(({ name, size, modifiedAt }) => [name, size, modifiedAt])
    .sort(([a], [b]) => a.localeCompare(b)));
}

export function latestPlayerSave(index, files) {
  if (index?.schemaVersion !== 1 || !index.supported || !supportsContinue(index.engineId, index.gameId, index.extra)
    || !Array.isArray(index.saves) || (index.pending != null && !Array.isArray(index.pending))) return null;
  const byName = new Map(files.map((file) => [file.name, file]));
  const saves = index.saves.filter((save) => {
    const file = byName.get(save.name);
    return !index.pending?.includes(save.name) && Number.isInteger(save.slot) && save.slot >= 0 && save.slot <= 999
      && file?.size > 0 && Number.isFinite(file.modifiedAt)
      && file.size === save.size && file.modifiedAt === save.modifiedAt;
  });
  saves.sort((a, b) => b.modifiedAt - a.modifiedAt || a.slot - b.slot);
  return saves[0] || null;
}

export function installContinueSaves({ scope, FS, Module, launchUrl, assetUrl }) {
  const params = launchUrl.searchParams;
  const namespace = params.get("saveNamespace") || "";
  if (namespace && !/^version-[a-f0-9]{64}$/.test(namespace)) throw new Error("Invalid save namespace");
  const savePath = defaultSavePath + (namespace ? `/${namespace}` : "");
  let snapshot;
  let lastRevision;
  let timer;
  const checkpoints = new Map();
  const pending = new Set();
  const writers = new Map();
  const ioFailures = new Set();
  let restoredPending = false;
  let needsPublish = false;
  let scannedFiles;
  let resumeReported = false;

  function files() {
    try {
      return FS.readdir(savePath).filter((name) => name !== "." && name !== "..").flatMap((name) => {
        const stat = FS.stat(`${savePath}/${name}`);
        return FS.isFile(stat.mode) ? [{ name, size: stat.size, modifiedAt: Number(stat.mtime) }] : [];
      });
    } catch { return []; }
  }

  const validName = (name) => typeof name === "string" && name.length > 0 && !/[\\/\x00-\x1f]/.test(name);
  const indexKey = () => saveIndexKey(namespace, params.get("catalogGame") || snapshot?.target);
  function persist() {
    if (!snapshot) return false;
    snapshot.pending = [...pending];
    snapshot.revision = saveRevision(files());
    try {
      scope.localStorage.setItem(indexKey(), JSON.stringify(snapshot));
      lastRevision = snapshot.revision;
      needsPublish = false;
      return true;
    } catch {
      needsPublish = true;
      return false;
    }
  }
  function isCheckpoint(name) {
    if (!checkpoints.has(name)) return false;
    const checkpoint = checkpoints.get(name);
    if (!checkpoint) return true; // Unknown provenance stays excluded.
    try {
      const current = FS.readFile(`${savePath}/${name}`);
      return current.length === checkpoint.length && current.every((byte, i) => byte === checkpoint[i]);
    } catch { return true; }
  }
  // Native save ownership brackets the complete compressed output lifetime.
  // Persist the pending name BEFORE opening/truncating a previously indexed slot.
  scope.__scummwebBeginSaveWrite = (name) => {
    if (!snapshot || !validName(name) || writers.has(name)) return false;
    const wasPending = pending.has(name);
    pending.add(name);
    const previousSaves = snapshot.saves;
    // Older library code also sees no positive entry while this slot is open.
    snapshot.saves = snapshot.saves.filter((save) => save.name !== name);
    if (!persist()) {
      if (!wasPending) pending.delete(name);
      snapshot.saves = previousSaves;
      return false;
    }
    writers.set(name, true);
    ioFailures.delete(name);
    return true;
  };
  scope.__scummwebSaveIoFailed = (path) => {
    if (path.startsWith(savePath + "/")) ioFailures.add(path.slice(savePath.length + 1));
  };
  scope.__scummwebEndSaveWrite = (name, success) => {
    if (!writers.delete(name)) return false;
    if (success && !ioFailures.has(name)) pending.delete(name);
    needsPublish = true;
    // Native code calls refresh only after the last output stream has closed.
    return writers.size === 0;
  };
  scope.__scummwebSaveDeleted = (name) => {
    pending.delete(name);
    needsPublish = true;
    return writers.size === 0;
  };

  scope.__scummwebBeginSaveScan = (engineId, gameId, target, supported, extra = "") => {
    scannedFiles = new Map(files().map((file) => [file.name, file]));
    snapshot = { schemaVersion: 1, engineId, gameId, target, extra, supported: Boolean(supported), saves: [] };
    if (!restoredPending) {
      restoredPending = true;
      try {
        const previous = JSON.parse(scope.localStorage.getItem(indexKey()));
        for (const name of previous?.pending || []) if (validName(name)) pending.add(name);
      } catch { /* Missing or invalid cache. */ }
    }
  };
  scope.__scummwebAddSave = (slot, name) => {
    if (!snapshot || !validName(name) || pending.has(name) || isCheckpoint(name)) return;
    const file = scannedFiles.get(name);
    if (file?.size > 0) snapshot.saves.push({ ...file, slot });
  };
  scope.__scummwebEndSaveScan = () => {
    if (!snapshot) return -1;
    const listing = files();
    const persisted = persist();
    const save = latestPlayerSave(snapshot, listing);
    if (params.get("continue") === "1" && !resumeReported) {
      scope.console?.info(`ScummWEB Continue: ${snapshot.engineId}:${snapshot.gameId}, slot ${save?.slot ?? "unavailable"}`);
      resumeReported = true;
    }
    scope.__scummwebSaveStatus = { ...snapshot, latestSlot: save?.slot ?? null };
    scope.parent.postMessage({ type: "scummweb:saves-listed", query: params.get("saveQuery"),
      ...snapshot, persisted, latestSlot: save?.slot ?? null }, launchUrl.origin);
    return params.get("continue") === "1" ? save?.slot ?? -1 : -1;
  };

  async function start() {
    if (params.has("saveQuery")) {
      const engine = params.get("saveEngine"), gameId = params.get("saveGameId"), target = params.get("saveTarget");
      if (![engine, gameId, target].every((value) => /^[a-z0-9][a-z0-9_-]*$/i.test(value || ""))) {
        throw new Error("Invalid save query");
      }
      const extra = params.get("saveExtra") || "";
      if (extra.length > 256 || /[\r\n\[\]\x00]/.test(extra)) throw new Error("Invalid save edition");
      FS.writeFile("/tmp/scummweb-query.ini", `[scummvm]\nsavepath=${savePath}\n\n[${target}]\nengineid=${engine}\ngameid=${gameId}\nextra=${extra}\n`);
      // The native bridge terminates query mode before engine construction.
      // Use ordinary plugin initialization; the CLI listing command runs
      // before the web backend is ready for dynamic engine modules.
      Module.arguments.splice(0, Module.arguments.length, "--config=/tmp/scummweb-query.ini", target);
    }
    // Match actual checkpoint bytes. Slot zero becomes a player save as soon
    // as the player overwrites it; never exclude a slot just by its number.
    if (!namespace) {
      const library = await (await scope.fetch(assetUrl("games.json"))).json();
      const target = params.get("catalogGame") || params.get("saveTarget")
        || decodeURIComponent(launchUrl.hash.slice(1)).trim().split(/\s+/).at(-1);
      const intro = library.games?.find((game) => game.target === target)?.skipIntro;
      await Promise.all((intro?.saveFiles || []).map(async (name) => {
        try {
          const response = await scope.fetch(assetUrl(`launcher/skip-intro/${encodeURIComponent(target)}/${encodeURIComponent(name)}`));
          if (!response.ok) throw new Error("Checkpoint unavailable");
          checkpoints.set(name, new Uint8Array(await response.arrayBuffer()));
        } catch {
          // Fail closed for a checkpoint slot when its provenance is unknown.
          checkpoints.set(name, null);
        }
      }));
    }
    // Repair missed external mutations and retry metadata quota failures. Saves
    // themselves publish synchronously at native stream completion, not on exit.
    const poll = () => {
      if (writers.size || (!needsPublish && saveRevision(files()) === lastRevision)) return;
      try { Module._scummweb_refresh_saves?.(); } catch {}
    };
    const resume = () => { scope.clearInterval(timer); timer = scope.setInterval(poll, 2000); };
    resume();
    scope.addEventListener("pagehide", () => scope.clearInterval(timer));
    scope.addEventListener("pageshow", resume);
  }
  return start();
}

import { installRotatingAutosaves } from "./rotating-autosaves.mjs";

// Shared by the player shell and the library. Only native-listed, nonempty
// files enter this index; an index never substitutes for the files themselves.
export const saveIndexPrefix = "scummweb.continue.v1:";
export const introCleanupPrefix = saveIndexPrefix + "intro-cleanup:";
export const defaultSavePath = "/home/web_user/.local/share/scummvm/saves";
const supportedEngines = new Set("access adl agi ags bbvs cge cge2 cine cruise draci drascula dreamweb freescape glk gnap got groovie hopkins hugo kyra lab lure mads mortevielle neverhood ngi pegasus queen saga sci scumm sherlock sky sword1 sword2 teenagent tinsel titanic toltecs tony toon touche tsage tucker voyeur wintermute zvision".split(" "));
const livingBooksDemos = new Set(["tortoise", "arthurbday", "grandma", "arthur", "ruff", "newkid"]);
const deferredDemoContinue = new Map([
  ["agos:simon1", "cd demo"],
  ["bbvs:bbvs", "loogie demo"],
  ["gob:gob1", "interactive demo (v2.0)"],
  ["gob:gob2", "interactive demo (v1.01)"],
  ["gob:gob3", "interactive demo 3 (v0.02)"],
  ["made:rtz", "v1.2, 9/8/94, demo cd"],
  ["mads:nebular", "demo"],
  ["mohawk:myst", "demo"],
  ["scumm:samnmax", "demo"],
  ["scumm:freddi", "demo"],
  ["scumm:freddi2", "demo"],
  ["scumm:freddi3", "demo"],
  ["scumm:freddi4", "demo"],
  ["scumm:puttzoo", "demo"],
  ["scumm:puttrace", "demo"],
  ["scumm:thinker1", "demo"],
  ["scumm:thinkerk", "demo"],
  ["scumm:football", "demo"],
  ["scumm:bluesabctime", "demo"],
  ["scumm:bluesbirthday", "demo"],
  ["scumm:airport", "demo"],
  ["scumm:farm", "demo"],
  ["scumm:pajama", "demo"],
  ["scumm:pajama2", "demo"],
  ["scumm:pajama3", "demo"],
  ["scumm:putttime", "demo"],
  ["scumm:spyfox", "demo"],
  ["scumm:spyozon", "demo"],
  ["scumm:fbear", "demo"],
  ["scumm:puttmoon", "demo"],
  ["scumm:puttputt", "demo"],
]);
const retiredIntroCheckpoints = new Map([
  ["monkey4-demo/efmi090.gsv", "bd8aa04ec9ebe0745830124ddd6cc50c67aa7c2dd18166c0e6cdee7c3a958dad"],
  ["qfi-demo/qfi-demo.098", "3dbd22f47c355795c96fcef11b2bb2aab5a84841b7b3b8f601715162d67c0b9c"],
]);
const equalBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);

// Only the exact incomplete checkpoints from the original release may be removed.
export async function isRetiredIntroCheckpoint(target, name, bytes) {
  const expected = retiredIntroCheckpoints.get(`${target}/${name}`);
  if (!expected || bytes.length !== 150006 || !globalThis.crypto?.subtle) return false;
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("") === expected;
}
function usesDeferredDemoContinue(engineId, gameId, edition) {
  return typeof gameId === "string" &&
    deferredDemoContinue.get(`${engineId}:${gameId.toLowerCase()}`) === edition;
}

export function supportsContinue(engineId, gameId, extra = "") {
  const edition = typeof extra === "string" ? extra.toLowerCase() : "";
  if (usesDeferredDemoContinue(engineId, gameId, edition)) return true;
  if (engineId === "grim") {
    return (gameId === "grim" && edition === "demo")
      || (gameId === "monkey4" && edition === "web demo");
  }
  if (engineId === "agos") {
    return gameId === "simon2" && edition === "cd demo";
  }
  if (engineId === "mohawk") {
    if (livingBooksDemos.has(gameId)) return edition.startsWith("demo");
    return ["myst", "riven"].includes(gameId) && !edition.includes("demo");
  }
  return supportedEngines.has(engineId)
    && !(engineId === "mads" && gameId === "nebular" && edition.includes("demo"))
    && !(engineId === "agi" && ["mickey", "winnie", "troll"].includes(gameId));
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
  const agentSaveScope = params.get("agentSaveScope");
  if (agentSaveScope !== null && !/^[a-f0-9]{64}$/.test(agentSaveScope)) throw new Error("Invalid AgentSCUMM save scope");
  const storageNamespace = agentSaveScope ? `agent-${agentSaveScope}` : namespace;
  const savePath = agentSaveScope ? `${defaultSavePath}-agent/${agentSaveScope}`
    : defaultSavePath + (namespace ? `/${namespace}` : "");
  if (scope.scummwebPlayerControls) scope.__scummwebAutosaves = installRotatingAutosaves(scope, FS, savePath, params);
  let snapshot;
  let lastRevision;
  let timer;
  const checkpoints = new Map();
  const pending = new Set();
  const writers = new Map();
  const ioFailures = new Set();
  const storage = scope.__scummwebSaveStorage || scope.localStorage;
  let writeCheckpoint;
  let pendingBeforeWrite;
  let writeFailed = false;
  let restoredPending = false;
  let needsPublish = false;
  let scannedFiles;
  let playerSaves;
  let occupiedSlots;
  let resumeReported = false;
  let legacyIndexKey;
  let change = 0;
  let publishedChange = 0;
  let removedSave = false;
  let emptyAfterDelete = false;
  let completedWrite = false;

  function files(strict = false) {
    try {
      return FS.readdir(savePath).filter((name) => name !== "." && name !== "..").flatMap((name) => {
        const stat = FS.stat(`${savePath}/${name}`);
        return FS.isFile(stat.mode) ? [{ name, size: stat.size, modifiedAt: Number(stat.mtime) }] : [];
      });
    } catch (error) { if (strict) throw error; return []; }
  }

  const validName = (name) => typeof name === "string" && name.length > 0 && !/[\\/\x00-\x1f]/.test(name);
  const indexKey = () => saveIndexKey(storageNamespace, snapshot?.target);
  function persist() {
    if (!snapshot) return false;
    snapshot.pending = [...pending];
    if (change > publishedChange) snapshot.saveChange = change;
    else delete snapshot.saveChange;
    if (emptyAfterDelete) snapshot.emptyAfterDelete = true;
    else delete snapshot.emptyAfterDelete;
    snapshot.revision = saveRevision(files());
    try {
      storage.setItem(indexKey(), JSON.stringify(snapshot));
      lastRevision = snapshot.revision;
      needsPublish = false;
    } catch {
      needsPublish = true;
      return false;
    }
    if (legacyIndexKey) {
      try {
        storage.removeItem(legacyIndexKey);
        legacyIndexKey = undefined;
      } catch { /* The canonical index was already published. */ }
    }
    return true;
  }
  function isCheckpoint(name) {
    if (!checkpoints.has(name)) return false;
    const checkpoint = checkpoints.get(name);
    if (!checkpoint) return true; // Unknown provenance stays excluded.
    try {
      const current = FS.readFile(`${savePath}/${name}`);
      return equalBytes(current, checkpoint);
    } catch { return true; }
  }
  // Native save ownership brackets the complete compressed output lifetime.
  // The IndexedDB backend holds the prior bytes until all native streams close.
  // The older synchronous backend uses a pending index before truncation.
  scope.__scummwebSaveWriteInProgress = () => writers.size > 0;
  scope.__scummwebBeginSaveWrite = (name) => {
    if (scope.__scummwebDiagnosticSaves?.active) return scope.__scummwebDiagnosticSaves.beginWrite(name);
    if (!snapshot || !validName(name) || writers.has(name)) return false;
    if (!writers.size) {
      writeFailed = false;
      completedWrite = false;
      if (storage.checkpoint) {
        writeCheckpoint = storage.checkpoint();
        pendingBeforeWrite = [...pending];
      }
    }
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
    if (scope.__scummwebDiagnosticSaves?.active) { scope.__scummwebDiagnosticSaves.ioFailed(path); return; }
    if (path.startsWith(savePath + "/")) ioFailures.add(path.slice(savePath.length + 1));
  };
  scope.__scummwebEndSaveWrite = (name, success) => {
    if (scope.__scummwebDiagnosticSaves?.active) {
      scope.__scummwebDiagnosticSaves.endWrite(name, success);
      return false;
    }
    if (!writers.delete(name)) return false;
    if (success && !ioFailures.has(name)) {
      pending.delete(name);
      completedWrite = true;
      scope.__scummwebPlayerSaveWritten?.(name);
    } else writeFailed = true;
    if (!writers.size && writeCheckpoint) {
      if (writeFailed) {
        storage.rollback(writeCheckpoint);
        pending.clear();
        for (const savedName of pendingBeforeWrite) pending.add(savedName);
      }
      writeCheckpoint = undefined;
      pendingBeforeWrite = undefined;
    }
    if (!writers.size && completedWrite && !writeFailed) change++;
    needsPublish = true;
    // Native code calls refresh only after the last output stream has closed.
    return writers.size === 0;
  };
  scope.__scummwebSaveDeleted = (name) => {
    if (scope.__scummwebDiagnosticSaves?.active) return false;
    pending.delete(name);
    if (validName(name) && name !== "timestamps") {
      removedSave = true;
      change++;
    }
    needsPublish = true;
    return writers.size === 0;
  };

  scope.__scummwebBeginSaveScan = (engineId, gameId, target, supported, extra = "") => {
    scope.__scummwebScanningSaves = true;
    scannedFiles = new Map(files().map((file) => [file.name, file]));
    snapshot = { schemaVersion: 1, engineId, gameId, target, extra, supported: Boolean(supported), saves: [] };
    const catalogTarget = params.get("catalogSaveTarget") || target;
    snapshot.destinationKey = storageNamespace || `catalog:${catalogTarget}`;
    if (params.has("saveQuery") && params.get("v")) snapshot.checkedByRuntime = params.get("v");
    if (scope.__scummwebPublishPlayerSaves) {
      playerSaves = [];
      occupiedSlots = new Set();
    }
    if (!restoredPending) {
      restoredPending = true;
      try {
        const previous = JSON.parse(storage.getItem(indexKey()));
        for (const name of previous?.pending || []) if (validName(name)) pending.add(name);
        emptyAfterDelete = previous?.emptyAfterDelete === true && previous.destinationKey === snapshot.destinationKey;
      } catch { /* Missing or invalid cache. */ }
      const archiveId = params.get("catalogGame") || params.get("saveGameId");
      if (!storageNamespace && archiveId && archiveId !== target) {
        const key = saveIndexKey("", archiveId);
        try {
          const previous = JSON.parse(storage.getItem(key));
          if (previous?.target === target && previous.engineId === engineId
            && previous.gameId === gameId && previous.extra?.toLowerCase() === extra.toLowerCase()) {
            for (const name of previous.pending || []) if (validName(name)) pending.add(name);
            legacyIndexKey = key;
          }
        } catch { /* Missing or invalid legacy cache. */ }
      }
    }
  };
  scope.__scummwebRecordOccupiedSave = (slot) => occupiedSlots?.add(slot);
  scope.__scummwebAddSave = (slot, name, description, writable) => {
    if (!snapshot || !validName(name) || pending.has(name) || isCheckpoint(name)) return;
    const file = scannedFiles.get(name);
    if (file?.size > 0) {
      if (snapshot.supported) snapshot.saves.push({ ...file, slot });
      playerSaves?.push({ slot, name, modifiedAt: file.modifiedAt, description, writable });
    }
  };
  scope.__scummwebEndSaveScan = () => {
    scope.__scummwebScanningSaves = false;
    if (!snapshot) return -1;
    const listing = files();
    if (!writers.size && !pending.size) {
      try {
        const hasFiles = files(true).some(({ name }) => name !== "timestamps");
        if (hasFiles) emptyAfterDelete = false;
        else if (removedSave) emptyAfterDelete = true;
        removedSave = false;
      } catch { /* A failed read cannot confirm an empty save folder. */ }
    }
    const persisted = persist();
    if (playerSaves) scope.__scummwebPublishPlayerSaves(playerSaves, occupiedSlots);
    const save = latestPlayerSave(snapshot, listing);
    const deferred = params.get("continue") === "1" &&
      usesDeferredDemoContinue(snapshot.engineId, snapshot.gameId, snapshot.extra.toLowerCase());
    const schedule = deferred ? scope.__scummwebQueueStartupLoad : undefined;
    const autoSlot = !deferred || schedule ? scope.__scummwebAutosaves?.startup(snapshot, save, schedule) ?? -1 : -1;
    const latestSlot = autoSlot >= 0 ? autoSlot : save?.slot ?? null;
    if (!resumeReported && deferred) {
      const queued = autoSlot >= 0 || (save && schedule?.(save.slot));
      if (queued && (snapshot.engineId === "scumm" ||
          (snapshot.engineId === "gob" && snapshot.gameId === "gob1"))) {
        // Drive the engine’s native intro skip while an exact demo restore is pending.
        scope.__scummwebUpdateIntroSkip = available => available && scope.__scummwebIsStartupLoad?.() === true;
      }
    }
    if (!resumeReported && (!deferred && latestSlot !== null && params.get("continue") === "1"
      || /^#-x(?:%20| )/i.test(launchUrl.hash) && !params.has("skipIntroTarget"))) {
      scope.__scummwebAutosaves?.afterLoad();
    }
    if (params.get("continue") === "1" && !resumeReported) {
      scope.console?.info(`ScummWEB Continue: ${snapshot.engineId}:${snapshot.gameId}, slot ${latestSlot ?? "unavailable"}${autoSlot >= 0 ? " (autosave)" : ""}`);
      resumeReported = true;
    }
    scope.__scummwebSaveStatus = { ...snapshot, latestSlot };
    const publish = () => {
      if (agentSaveScope) return;
      if (persisted && snapshot.saveChange) publishedChange = snapshot.saveChange;
      scope.parent.postMessage({ type: "scummweb:saves-listed", query: params.get("saveQuery"),
        ...snapshot, persisted, latestSlot }, launchUrl.origin);
    };
    if (scope.__scummwebFlushSaveStorage) {
      // A message advertising this index can trigger Dropbox publication.
      const listed = snapshot;
      void scope.__scummwebFlushSaveStorage().then(() => {
        if (snapshot === listed) publish();
      }, () => {
        needsPublish = true;
        scope.parent.postMessage({ type: "scummweb:save-storage-error", query: params.get("saveQuery") }, launchUrl.origin);
      });
    } else publish();
    scope.__scummwebBeginIntroCheckpoint?.(snapshot.target);
    return params.get("continue") === "1" && !deferred ? latestSlot ?? -1 : -1;
  };

  async function start() {
    if (params.has("saveQuery")) {
      const engine = params.get("saveEngine"), gameId = params.get("saveGameId"), target = params.get("saveTarget");
      if (![engine, gameId, target].every((value) => /^[a-z0-9][a-z0-9_-]*$/i.test(value || ""))) {
        throw new Error("Invalid save query");
      }
      const extra = params.get("saveExtra") || "";
      if (extra.length > 256 || /[\r\n\[\]\x00]/.test(extra)) throw new Error("Invalid save edition");
      const platform = params.get("savePlatform");
      if (platform && !/^[a-z0-9]+$/i.test(platform)) throw new Error("Invalid save platform");
      const platformSetting = platform ? `platform=${platform}\n` : "";
      FS.writeFile("/tmp/scummweb-query.ini", `[scummvm]\nsavepath=${savePath}\n\n[${target}]\nengineid=${engine}\ngameid=${gameId}\nextra=${extra}\n${platformSetting}`);
      // The native bridge terminates query mode before engine construction.
      // Use ordinary plugin initialization; the CLI listing command runs
      // before the web backend is ready for dynamic engine modules.
      Module.arguments.splice(0, Module.arguments.length, "--config=/tmp/scummweb-query.ini", target);
    }
    // Remove legacy copies before the native save manager caches the directory.
    // Match exact bytes, including retired assets; the same slot may hold a
    // player's save. New checkpoints never enter this directory.
    const target = params.get("saveTarget")
      || decodeURIComponent(launchUrl.hash.slice(1)).trim().split(/\s+/).at(-1);
    const editionTarget = params.get("catalogSaveTarget") || target;
    const key = introCleanupPrefix + `catalog:${editionTarget}`;
    if (!storageNamespace && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(editionTarget || "") && storage.getItem(key) !== "1") {
      const library = await (await scope.fetch(assetUrl("games.json"))).json();
      const intro = library.games?.find((game) => game.target === target)?.skipIntro;
      let cleaned = true;
      const existingNames = new Set(files().map(({ name }) => name));
      await Promise.all((intro?.saveFiles || []).filter((name) => existingNames.has(name)).map(async (name) => {
        const path = `${savePath}/${name}`;
        try {
          const response = await scope.fetch(assetUrl(`launcher/skip-intro/${encodeURIComponent(target)}/${encodeURIComponent(name)}`));
          if (!response.ok) throw new Error("Checkpoint unavailable");
          let checkpoint = new Uint8Array(await response.arrayBuffer());
          const existing = FS.readFile(path);
          if (await isRetiredIntroCheckpoint(target, name, existing)) checkpoint = existing;
          checkpoints.set(name, checkpoint);
          if (equalBytes(FS.readFile(path), checkpoint)) {
            FS.unlink(path);
          }
        } catch {
          // Keep an unverified legacy candidate out of Continue.
          checkpoints.set(name, null);
          cleaned = false;
        }
      }));
      if (cleaned && intro?.saveFiles?.length) {
        // Future checkpoints are staged outside the save directory. Once the
        // legacy pass is complete, an identical file can be an intentional save.
        try { storage.setItem(key, "1"); } catch { /* Retry legacy cleanup later. */ }
      }
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

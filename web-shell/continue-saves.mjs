// Shared by the player shell and the library. Only native-listed, nonempty
// files enter this index; an index never substitutes for the files themselves.
export const saveIndexPrefix = "scummweb.continue.v1:";
export const defaultSavePath = "/home/web_user/.local/share/scummvm/saves";
const supportedEngines = new Set("access agi bbvs cge cge2 cine cruise draci drascula dreamweb gnap groovie hopkins hugo kyra lab lure mads mohawk neverhood ngi pegasus queen saga sci scumm sherlock sky sword1 sword2 teenagent tinsel titanic toltecs tony toon touche tsage tucker voyeur wintermute".split(" "));

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
    || !Array.isArray(index.saves)) return null;
  const byName = new Map(files.map((file) => [file.name, file]));
  const saves = index.saves.filter((save) => {
    const file = byName.get(save.name);
    return Number.isInteger(save.slot) && save.slot >= 0 && save.slot <= 999
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
  let excluded = new Set();
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

  scope.__scummwebBeginSaveScan = (engineId, gameId, target, supported, extra = "") => {
    scannedFiles = new Map(files().map((file) => [file.name, file]));
    snapshot = { schemaVersion: 1, engineId, gameId, target, extra, supported: Boolean(supported), saves: [] };
  };
  scope.__scummwebAddSave = (slot, name) => {
    if (!snapshot || excluded.has(name) || /[\\/\x00-\x1f]/.test(name)) return;
    const file = scannedFiles.get(name);
    if (file?.size > 0) snapshot.saves.push({ ...file, slot });
  };
  scope.__scummwebEndSaveScan = () => {
    if (!snapshot) return -1;
    const listing = files();
    snapshot.revision = saveRevision(listing);
    lastRevision = snapshot.revision;
    const key = saveIndexKey(namespace, params.get("catalogGame") || snapshot.target);
    try { scope.localStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
    const save = latestPlayerSave(snapshot, listing);
    if (params.get("continue") === "1" && !resumeReported) {
      scope.console?.info(`ScummWEB Continue: ${snapshot.engineId}:${snapshot.gameId}, slot ${save?.slot ?? "unavailable"}`);
      resumeReported = true;
    }
    scope.__scummwebSaveStatus = { ...snapshot, latestSlot: save?.slot ?? null };
    scope.parent.postMessage({ type: "scummweb:saves-listed", query: params.get("saveQuery"),
      ...snapshot, latestSlot: save?.slot ?? null }, launchUrl.origin);
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
      Module.arguments.splice(0, Module.arguments.length, "--config=/tmp/scummweb-query.ini", "--list-saves", `--game=${target}`);
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
          const current = FS.readFile(`${savePath}/${name}`);
          const response = await scope.fetch(assetUrl(`launcher/skip-intro/${encodeURIComponent(target)}/${encodeURIComponent(name)}`));
          if (!response.ok) throw new Error("Checkpoint unavailable");
          const checkpoint = new Uint8Array(await response.arrayBuffer());
          if (current.length === checkpoint.length && current.every((byte, i) => byte === checkpoint[i])) excluded.add(name);
        } catch {
          // Fail closed for a checkpoint slot when its provenance is unknown.
          excluded.add(name);
        }
      }));
    }
    // Re-check checkpoint identity after writes, including overwrites of slot 0.
    const baseline = new Map(files().map((file) => [file.name, `${file.size}:${file.modifiedAt}`]));
    timer = scope.setInterval(() => {
      const listing = files();
      if (saveRevision(listing) === lastRevision) return;
      for (const file of listing) {
        if (baseline.get(file.name) !== `${file.size}:${file.modifiedAt}`) excluded.delete(file.name);
      }
      try { Module._scummweb_refresh_saves?.(); } catch {}
    }, 2000);
    scope.addEventListener("pagehide", () => scope.clearInterval(timer), { once: true });
  }
  return start();
}

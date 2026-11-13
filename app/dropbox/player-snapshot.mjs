import { saveIndexKey, defaultSavePath } from "../../web-shell/continue-saves.mjs";
import { safePath } from "../save-backups/filesystem.mjs";

// Called synchronously from the host's save-list message. Same-origin frames
// share this thread; the native writer cannot interleave another task here.
export function capturePlayerSaveSet(player, game) {
  const url = new URL(player.location.href);
  const params = url.searchParams;
  if (params.has("agentSaveScope") || params.has("saveQuery") || params.get("hostPlayer") !== "1") return null;
  const status = player.__scummwebSaveStatus;
  if (!status?.target || player.__scummwebScanningSaves) return null;
  const namespace = params.get("saveNamespace") || "";
  const target = params.get("catalogSaveTarget");
  if (namespace ? !/^version-[a-f0-9]{64}$/.test(namespace) : !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(target || "")) return null;
  const index = player.localStorage.getItem(saveIndexKey(namespace, status.target));
  const parsed = index && JSON.parse(index);
  // The pending marker is published before opening/truncating a native file.
  // Failed/incomplete writes must never replace the last verified cloud set.
  if (!parsed || parsed.pending?.length) return null;
  const path = defaultSavePath + (namespace ? "/" + namespace : "");
  const FS = player.FS;
  const files = [];
  const introNames = new Set(game?.skipIntro?.saveFiles || []);
  const indexedNames = new Set(parsed.saves?.map(({ name }) => name) || []);
  let total = 0;
  function walk(directory, prefix = "") {
    for (const name of FS.readdir(directory)) {
      if (name === "." || name === "..") continue;
      const relative = prefix + name;
      if (!safePath(relative)) throw new Error("A save has an unsupported filename.");
      const full = directory + "/" + name;
      const stat = FS.lstat(full);
      if (FS.isDir(stat.mode)) { walk(full, relative + "/"); continue; }
      if (!FS.isFile(stat.mode)) throw new Error("A save contains an unsupported file type.");
      if (!prefix && introNames.has(name) && !indexedNames.has(name)) continue;
      total += stat.size;
      if (total > 63 * 1024 * 1024 || files.length >= 4096) throw new Error("These saves exceed the backup limit.");
      files.push({ path: relative, modifiedAt: Number(stat.mtime), data: new Uint8Array(FS.readFile(full)) });
    }
  }
  walk(path);
  if (player.localStorage.getItem(saveIndexKey(namespace, status.target)) !== index) return null;
  return files.length ? { destination: namespace
    ? { key: namespace, namespace, title: game?.displayTitle || status.target, fingerprint: null }
    : { key: `catalog:${target}`, namespace: "", family: target, title: game?.displayTitle || target, isolated: true }, files } : null;
}

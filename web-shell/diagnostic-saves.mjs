// Report captures, checkpoints and backed-up saves share an isolated MEMFS directory.
export function installDiagnosticSaves(scope, FS, Module) {
  const directory = "/tmp/scummweb-bug-report";
  const validName = (name) => typeof name === "string" && /^[^/\\\x00-\x1f]{1,180}$/.test(name)
    && name !== "." && name !== "..";
  let active = false;
  let failed = false;
  const writers = new Set();
  const completed = new Set();
  const stagedFiles = new Set();
  const stagedDirectories = new Set();

  function cleanup() {
    for (const file of stagedFiles) {
      try { FS.unlink(file); } catch { /* A failed write might not have created the file. */ }
    }
    for (const folder of [...stagedDirectories].reverse()) FS.rmdir(folder);
    for (const name of FS.readdir(directory)) {
      if (validName(name)) FS.unlink(`${directory}/${name}`);
    }
    FS.rmdir(directory);
  }

  function reset(refresh = true) {
    active = false;
    try { cleanup(); } catch { /* A failed temporary tree is never persisted or indexed. */ }
    stagedFiles.clear();
    stagedDirectories.clear();
    writers.clear();
    completed.clear();
    // Restore the native manager's filename cache before reusing the temporary directory.
    if (refresh) {
      try { Module._scummweb_refresh_saves?.(); } catch { /* The isolated operation is complete. */ }
    }
  }

  const capture = {
    get active() { return active; },
    supported: () => Module._scummweb_diagnostic_saves_supported?.() === 1,
    backupSupported: () => capture.supported() && typeof Module._scummweb_list_isolated_saves === "function",
    begin() {
      if (active || !capture.supported()) return false;
      try { FS.mkdir(directory); } catch { return false; }
      failed = false;
      writers.clear();
      completed.clear();
      active = true;
      return true;
    },
    beginRestore(files) {
      if (!capture.begin()) return false;
      try {
        let size = 0;
        if (files.length > 4096) throw new Error("Too many backup files.");
        for (const { name, path = name, contents, data } of files) {
          const parts = path?.split("/");
          if (!parts?.every(validName)) throw new Error("Invalid backup path.");
          const bytes = contents === undefined ? new Uint8Array(data)
            : Uint8Array.from(atob(contents), char => char.charCodeAt(0));
          size += bytes.byteLength;
          if (size > 64 * 1024 * 1024) throw new Error("Backup exceeds the save limit.");
          let folder = directory;
          for (const part of parts.slice(0, -1)) {
            folder += "/" + part;
            if (stagedDirectories.has(folder)) continue;
            FS.mkdir(folder);
            stagedDirectories.add(folder);
          }
          const file = `${directory}/${path}`;
          if (stagedFiles.has(file)) throw new Error("Duplicate backup path.");
          stagedFiles.add(file);
          FS.writeFile(file, bytes);
        }
        return true;
      } catch {
        reset();
        return false;
      }
    },
    listBackup(files) {
      if (!capture.backupSupported() || !capture.beginRestore(files)) return null;
      const paths = new Map(files.map(({ path, modifiedAt }) => [path, modifiedAt]));
      const saves = [];
      const hooks = {
        __scummwebBeginSaveScan() {},
        __scummwebRecordOccupiedSave() {},
        __scummwebAddSave(slot, name, description) {
          if (paths.has(name)) saves.push({ slot, name, description, modifiedAt: paths.get(name) });
        },
        __scummwebEndSaveScan: () => -1,
      };
      const previous = Object.keys(hooks).map(name => [name, scope[name]]);
      try {
        Object.assign(scope, hooks);
        Module._scummweb_list_isolated_saves(1);
        return saves;
      } finally {
        for (const [name, value] of previous) scope[name] = value;
        try { Module._scummweb_list_isolated_saves(0); }
        finally { reset(false); }
      }
    },
    finishRestore: reset,
    beginWrite(name) {
      if (!validName(name) || writers.has(name) || completed.size + writers.size >= 16) {
        failed = true;
        return false;
      }
      writers.add(name);
      return true;
    },
    endWrite(name, success) {
      if (!writers.delete(name) || !success) failed = true;
      else completed.add(name);
    },
    ioFailed(path) {
      if (path.startsWith(directory + "/")) failed = true;
    },
    finish(error) {
      let result = { status: error ? "unavailable" : "failed", files: [],
        reason: error ? (error === "Save ID is unavailable in this run" ? "slot-unavailable" : "native-save-rejected")
          : failed || writers.size ? "save-write-failed" : "no-save-output" };
      try {
        if (!error && !failed && !writers.size && completed.size) {
          let size = 0;
          const files = [...completed].map((name) => {
            const path = `${directory}/${name}`;
            const length = FS.stat(path).size;
            size += length;
            if (!length || size > 2 * 1024 * 1024) throw new Error("Save too large");
            const data = FS.readFile(path);
            return { name, data: new Uint8Array(data) };
          });
          result = { status: "captured", files };
        }
      } catch { result.reason = "save-read-failed"; }
      finally { reset(); }
      return result;
    },
  };
  scope.__scummwebDiagnosticSaves = capture;
}

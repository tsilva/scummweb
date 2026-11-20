// Report captures and in-game checkpoint restores use an isolated MEMFS save directory.
export function installDiagnosticSaves(scope, FS, Module) {
  const directory = "/tmp/scummweb-bug-report";
  const validName = (name) => typeof name === "string" && /^[^/\\\x00-\x1f]{1,180}$/.test(name)
    && name !== "." && name !== "..";
  let active = false;
  let failed = false;
  const writers = new Set();
  const completed = new Set();

  function cleanup() {
    for (const name of FS.readdir(directory)) {
      if (validName(name)) FS.unlink(`${directory}/${name}`);
    }
    FS.rmdir(directory);
  }

  function reset() {
    active = false;
    try { cleanup(); } catch { /* A failed temporary tree is never persisted or indexed. */ }
    writers.clear();
    completed.clear();
    // Restore the native manager's filename cache before reusing the temporary directory.
    try { Module._scummweb_refresh_saves?.(); } catch { /* The isolated operation is complete. */ }
  }

  const capture = {
    get active() { return active; },
    supported: () => Module._scummweb_diagnostic_saves_supported?.() === 1,
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
        for (const { name, contents } of files) {
          const bytes = Uint8Array.from(atob(contents), char => char.charCodeAt(0));
          FS.writeFile(`${directory}/${name}`, bytes);
        }
        return true;
      } catch {
        reset();
        return false;
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

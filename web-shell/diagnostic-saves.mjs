// Diagnostic saves live only in MEMFS, never in BrowserFS or the Continue index.
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
      let result = { status: error ? "unavailable" : "failed", files: [] };
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
      } catch { /* Reporting remains available without a snapshot. */ }
      finally {
        active = false;
        try { cleanup(); } catch { /* A failed temporary tree is never persisted or indexed. */ }
        writers.clear();
        completed.clear();
      }
      return result;
    },
  };
  scope.__scummwebDiagnosticSaves = capture;
}

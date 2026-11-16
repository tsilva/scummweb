// Dedicated native service: no launcher, game plugins, BrowserFS or player UI.
import { createCloudTransferFetch } from "./cloud-transfer-fetch.mjs";
const parentOrigin = location.origin;
let initialized = false, pending = null;
const send = (data) => parent.postMessage({ type: "scummweb:cloud", ...data }, parentOrigin);
globalThis.fetch = createCloudTransferFetch(globalThis.fetch.bind(globalThis), () => pending,
  (transfer, bytes) => send({ id: transfer.id, op: "progress", ...bytes }));
window.addEventListener("message", async (event) => {
  if (event.origin !== parentOrigin || event.source !== parent || event.data?.type !== "scummweb:cloud") return;
  const data = event.data;
  if (data.op === "init" && !initialized && typeof data.config === "string" && data.config.length < 32768) {
    initialized = true;
    try {
      const assetsResponse = await fetch("runtime-assets.json", { cache: "no-cache" });
      if (!assetsResponse.ok) throw new Error("Runtime unavailable");
      const assets = await assetsResponse.json();
      const versioned = (path) => {
        const url = new URL(path, location.href);
        const version = assets.files?.[url.pathname];
        if (version) url.searchParams.set("v", version);
        return url.href;
      };
      globalThis.__scummwebCloudService = true;
      globalThis.__scummwebCloudReady = () => send({ id: data.id, ok: true });
      globalThis.__scummwebCloudReply = (result) => {
        const id = pending?.id;
        pending = null;
        try {
          const bytes = result.ok && ["download", "download-import"].includes(globalThis.__scummwebCloudLastOperation)
            ? globalThis.FS.readFile("/cloud/transfer").slice() : undefined;
          // The parent persists renewed credentials before acknowledging the operation.
          send({ id, ...result, bytes, config: globalThis.FS.readFile("/cloud/config.ini", { encoding: "utf8" }) });
        } catch { send({ id, ok: false, kind: "integrity" }); }
        try { globalThis.FS.unlink("/cloud/transfer"); } catch {}
      };
      globalThis.Module = {
        arguments: [], canvas: document.getElementById("canvas"),
        locateFile: versioned,
        print() {}, printErr() {},
        preRun: [() => {
          globalThis.FS.mkdir("/cloud");
          globalThis.FS.writeFile("/cloud/config.ini", data.config);
        }],
        onAbort: () => send({ id: pending?.id ?? data.id, ok: false, kind: "runtime" }),
      };
      const script = document.createElement("script");
      script.src = versioned("scummvm.js");
      script.onerror = () => send({ id: data.id, ok: false, kind: "runtime" });
      document.head.append(script);
    } catch { send({ id: data.id, ok: false, kind: "runtime" }); }
  } else if (initialized && !pending && ["refresh", "list", "mkdir", "upload", "download", "list-imports", "download-import"].includes(data.op)) {
    if (["upload", "download"].includes(data.op) && !/^[a-f0-9]{64}\.zip$/.test(data.name || "")) return;
    if (data.op === "download-import" && !/^[a-z0-9][a-z0-9 _().-]{0,119}$/i.test(data.name || "")) return;
    if (data.op === "upload") {
      if (!(data.bytes instanceof Uint8Array) || data.bytes.byteLength > 67108864) return;
      globalThis.FS.writeFile("/cloud/transfer", data.bytes);
    }
    pending = { id: data.id, op: data.op, total: data.op === "upload" ? data.bytes.byteLength : data.size };
    globalThis.__scummwebCloudLastOperation = data.op;
    globalThis.__scummwebCloudCommand = { op: data.op, name: data.name };
  }
});
send({ op: "booted" });

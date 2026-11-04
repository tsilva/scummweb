import { getArchiveGamePresentation } from "./archive-game-presentation.mjs";
import { normalizeGameZipUrl, readRemoteGameArchive } from "./game-bucket.mjs";
import { maxArchiveSize, scanGameZipReader } from "./local-game-archive.mjs";

const probeLimit = 2 * 1024 * 1024;
const probeTimeoutMs = 6000;

export async function inspectRemoteGameArchive(url, { signal } = {}) {
  const zipUrl = normalizeGameZipUrl(url);
  const probeSignal = AbortSignal.any([AbortSignal.timeout(probeTimeoutMs), ...(signal ? [signal] : [])]);
  const { HttpRangeReader } = await import("@zip.js/zip.js");
  let remaining = probeLimit;
  const source = new HttpRangeReader(zipUrl, {
    forceRangeRequests: true,
    combineSizeEocd: true,
    // Reject hosts ignoring ranges before zip.js can buffer the entire archive.
    fetch: async (requestUrl, options) => {
      probeSignal.throwIfAborted();
      if (!remaining || !options.headers?.Range) throw new Error("ZIP inspection limit reached.");
      const response = await fetch(requestUrl, {
        ...options, mode: "cors", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", signal: probeSignal,
      });
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
      const size = range && Number(range[3]);
      const length = range && Number(range[2]) - Number(range[1]) + 1;
      if (response.status !== 206 || !range || !Number.isSafeInteger(size) || size > maxArchiveSize ||
          !Number.isSafeInteger(length) || length <= 0 || length > remaining || !response.body) {
        await response.body?.cancel();
        throw new Error("This host does not support bounded ZIP inspection.");
      }
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          remaining -= chunk.byteLength;
          if (remaining < 0) controller.error(new Error("ZIP inspection limit reached."));
          else controller.enqueue(chunk);
        },
      }));
      return new Response(body, { status: response.status, headers: response.headers });
    },
  });
  return scanGameZipReader(source, { signal: probeSignal });
}

export async function prepareRemoteGameArchive(url, { signal, onDownloading } = {}) {
  const zipUrl = normalizeGameZipUrl(url);
  try {
    const files = await inspectRemoteGameArchive(zipUrl, { signal });
    signal?.throwIfAborted();
    return {
      game: getArchiveGamePresentation(files),
      loadArchive: (launchSignal) => readRemoteGameArchive(zipUrl, { signal: launchSignal }),
    };
  } catch {
    signal?.throwIfAborted();
    // CORS, range support and large directories vary by host. Reuse the normal
    // bounded download and keep its result for launch rather than fetching twice.
    onDownloading?.();
    let game = null;
    const files = await readRemoteGameArchive(zipUrl, {
      signal, onEntries: (entries) => { game = getArchiveGamePresentation(entries); },
    });
    signal?.throwIfAborted();
    return {
      game,
      loadArchive: async (launchSignal) => {
        launchSignal?.throwIfAborted();
        return files;
      },
    };
  }
}

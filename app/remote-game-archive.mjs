import { getArchiveGamePresentation } from "./archive-game-presentation.mjs";
import { normalizeGameZipUrl, readCachedGameArchive, readRemoteGameArchive, validateGameArchiveResponse } from "./game-bucket.mjs";
import { ArchiveError, maxArchiveSize, scanGameZipReader } from "./local-game-archive.mjs";

const probeLimit = 2 * 1024 * 1024;
const probeTimeoutMs = 6000;

// Only inspection capability failures may trigger the full-download fallback.
// ArchiveError also keeps this classification intact through ZIP validation.
class InspectionUnavailable extends ArchiveError {}

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
      if (!remaining || !options.headers?.Range) throw new InspectionUnavailable("ZIP inspection limit reached.");
      const response = await fetch(requestUrl, {
        ...options, mode: "cors", credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", signal: probeSignal,
      }).catch((error) => {
        probeSignal.throwIfAborted();
        // Browsers cannot distinguish a rejected Range request's CORS failure
        // from an unreachable host. Allow one ordinary credential-free GET.
        throw new InspectionUnavailable("This host could not be inspected.", { cause: error });
      });
      if ([405, 416, 501].includes(response.status)) {
        await response.body?.cancel();
        throw new InspectionUnavailable("This host does not support ZIP range requests.");
      }
      await validateGameArchiveResponse(response);
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
      const size = range && Number(range[3]);
      const length = range && Number(range[2]) - Number(range[1]) + 1;
      if (size > maxArchiveSize) {
        await response.body.cancel();
        throw new ArchiveError(`This ZIP exceeds the ${maxArchiveSize / (1024 * 1024)} MiB download limit.`);
      }
      if (response.status !== 206 || !range || !Number.isSafeInteger(size) ||
          !Number.isSafeInteger(length) || length <= 0 || length > remaining || !response.body) {
        await response.body?.cancel();
        throw new InspectionUnavailable("This host does not support bounded ZIP inspection.");
      }
      const body = response.body.pipeThrough(new TransformStream({
        transform(chunk, controller) {
          remaining -= chunk.byteLength;
          if (remaining < 0) controller.error(new InspectionUnavailable("ZIP inspection limit reached."));
          else controller.enqueue(chunk);
        },
      }));
      return new Response(body, { status: response.status, headers: response.headers });
    },
  });
  try {
    return await scanGameZipReader(source, { signal: probeSignal });
  } catch (error) {
    signal?.throwIfAborted();
    if (probeSignal.aborted) throw new ArchiveError("ZIP inspection timed out. Check the link and try again.");
    throw error;
  }
}

export async function prepareRemoteGameArchive(url, { signal, onDownloading, onProgress } = {}) {
  const zipUrl = normalizeGameZipUrl(url);
  let cachedGame = null;
  const cachedFiles = await readCachedGameArchive(zipUrl, {
    signal, onProgress, onEntries: (entries) => { cachedGame = getArchiveGamePresentation(entries); },
  });
  if (cachedFiles) {
    return {
      game: cachedGame,
      loadArchive: async (launchSignal) => {
        launchSignal?.throwIfAborted();
        return cachedFiles;
      },
    };
  }
  try {
    const files = await inspectRemoteGameArchive(zipUrl, { signal });
    signal?.throwIfAborted();
    return {
      game: getArchiveGamePresentation(files),
      loadArchive: (launchSignal, onProgress) => readRemoteGameArchive(zipUrl, { signal: launchSignal, onProgress }),
    };
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof InspectionUnavailable)) throw error;
    // Range support, exposed headers and directory sizes vary by host. Reuse
    // the bounded download for launch, without retrying known bad archives.
    onDownloading?.();
    let game = null;
    const files = await readRemoteGameArchive(zipUrl, {
      signal, onProgress, onEntries: (entries) => { game = getArchiveGamePresentation(entries); },
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

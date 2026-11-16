// Observe native requests without changing their options, bytes or responses.
// Uploads count provider-confirmed chunks; downloads count consumed body bytes.
export function createCloudTransferFetch(fetch, current, report) {
  return async (url, options) => {
    const transfer = current();
    const address = new URL(url, globalThis.location?.href || "http://localhost");
    const provider = address.origin === "https://content.dropboxapi.com";
    const upload = provider && transfer?.op === "upload"
      && /^\/2\/files\/(?:upload|upload_session\/(?:start|append_v2|finish))$/.test(address.pathname);
    const download = provider && ["download", "download-import"].includes(transfer?.op)
      && address.pathname === "/2/files/download";
    // Capture the offset before awaiting: native memory can change afterwards.
    let end;
    if (upload && ArrayBuffer.isView(options?.body)) {
      try {
        const arg = JSON.parse(new Headers(options.headers).get("Dropbox-API-Arg") || "{}");
        const offset = arg.cursor?.offset ?? 0;
        if (Number.isSafeInteger(offset) && offset >= 0) end = offset + options.body.byteLength;
      } catch { /* Unrecognized metadata must never affect native transport. */ }
    }
    const response = await fetch(url, options);
    if (current() !== transfer || !response.ok) return response;
    const notify = (loaded, total) => {
      if (current() === transfer) report(transfer, { loaded, total });
    };
    if (upload && Number.isSafeInteger(end) && end <= transfer.total) {
      transfer.loaded = Math.max(transfer.loaded || 0, end);
      notify(transfer.loaded, transfer.total);
    }
    if (!download || !response.body) return response;
    const declared = Number(response.headers.get("Content-Length"));
    const total = transfer.total || (Number.isSafeInteger(declared) && declared > 0 ? declared : 0);
    let loaded = 0;
    const stream = response.body.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        // An absent or stale total is indeterminate, never a made-up percentage.
        notify(loaded, total >= loaded ? total : 0);
        controller.enqueue(chunk);
      },
    }));
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}

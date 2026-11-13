import { createHash } from "node:crypto";
import { bugReportLimits as limits, captureStatuses, reportGameIdentity, validReportFilename } from "./bug-report.mjs";

const reply = (status, message) => Response.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });

async function boundedForm(request) {
  if (Number(request.headers.get("content-length")) > limits.bodyBytes) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limits.bodyBytes) throw new RangeError();
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = new Blob(chunks);
  return new Response(body, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
}

// Bounded, per-instance abuse protection. Hosting-level limits can supplement it.
export function createBugReportHandler({ enabled, send, games, now = Date.now }) {
  const clients = new Map();
  const receipts = new Map();
  return async function POST(request) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return reply(403, "Please send reports from the game menu.");
    }
    if (!enabled()) return reply(503, "Reporting is temporarily unavailable. Please try again later.");
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return reply(415, "Invalid report.");

    const time = now();
    for (const [key, value] of clients) if (value.expires <= time) clients.delete(key);
    for (const [key, value] of receipts) if (value.expires <= time) receipts.delete(key);
    const client = createHash("sha256").update(request.headers.get("x-real-ip") || "unknown").digest("hex");
    const quota = clients.get(client) || { count: 0, expires: time + 600000 };
    if (quota.count >= 5 || clients.size >= 10000 && !clients.has(client)) {
      return reply(429, "Too many reports. Please try again in a few minutes.");
    }
    quota.count++;
    clients.set(client, quota);

    let form, metadata;
    try {
      form = await boundedForm(request);
      const raw = form.get("metadata");
      if (typeof raw !== "string" || raw.length > 12000) throw new Error();
      metadata = JSON.parse(raw);
    } catch (error) {
      return reply(error instanceof RangeError ? 413 : 400, "The report could not be read.");
    }
    const message = form.get("message");
    const id = metadata?.reportId;
    if (typeof message !== "string" || !message.trim() || message.length > limits.message || metadata?.version !== 1 || typeof id !== "string"
      || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id || "")
      || !captureStatuses.has(metadata.capture?.status) || !["catalog", "local"].includes(metadata.game?.source)) {
      return reply(400, "Please describe what went wrong.");
    }
    const identity = reportGameIdentity(metadata.game);
    let game = identity;
    if (identity.source === "catalog") {
      const catalog = games().find((entry) => entry.target === identity.target);
      if (!catalog) return reply(400, "The game could not be identified.");
      game = { ...reportGameIdentity({ ...catalog, source: "catalog" }), title: catalog.title };
    } else if (!/^[a-z0-9_-]{1,40}$/i.test(identity.engineId || "") || !/^[a-z0-9_.-]{1,80}$/i.test(identity.gameId || "")) {
      return reply(400, "The game could not be identified.");
    }
    const capture = metadata.capture;
    if (!Array.isArray(capture.files) || capture.files.length > limits.files
      || (capture.status === "captured") !== (capture.files.length > 0)
      || capture.status === "captured" && (!Number.isInteger(capture.slot) || capture.slot < 1 || capture.slot > 999)) {
      return reply(400, "Invalid game snapshot.");
    }
    const allowed = new Set(["message", "metadata", ...capture.files.map((_, i) => `save-${i}`)]);
    if ([...form.keys()].some((key) => !allowed.has(key) || form.getAll(key).length !== 1)) return reply(400, "Invalid report attachments.");
    const attachments = [];
    const names = new Set();
    const files = [];
    let total = 0;
    for (const [index, entry] of capture.files.entries()) {
      const file = form.get(`save-${index}`);
      if (!validReportFilename(entry?.name) || names.has(entry.name) || !file || typeof file === "string"
        || file.size < 1 || (total += file.size) > limits.saveBytes) return reply(400, "Invalid game snapshot.");
      names.add(entry.name);
      const data = new Uint8Array(await file.arrayBuffer());
      const filename = `save-${index + 1}-${entry.name}`;
      attachments.push({ filename, data, contentType: "application/octet-stream" });
      files.push({ name: entry.name, attachment: filename, size: data.byteLength,
        sha256: createHash("sha256").update(data).digest("hex") });
    }
    const settings = metadata.player || {};
    const player = {
      volume: Number.isFinite(settings.volume) && settings.volume >= 0 && settings.volume <= 100 ? settings.volume : undefined,
      speed: Number.isFinite(settings.speed) && settings.speed >= 0.5 && settings.speed <= 1.5 ? settings.speed : undefined,
      subtitles: typeof settings.subtitles === "boolean" ? settings.subtitles : undefined,
    };
    const manifest = { version: 1, reportId: id, game, player,
      capture: { status: capture.status, slot: capture.status === "captured" ? capture.slot : undefined, files },
      runtimeVersion: typeof metadata.runtimeVersion === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(metadata.runtimeVersion)
        ? metadata.runtimeVersion : "unknown",
    };
    // Reusing an ID with different content must never acknowledge an unsent report.
    const digest = createHash("sha256").update(JSON.stringify(manifest)).update(message).digest("hex");
    if (receipts.has(id)) {
      const receipt = receipts.get(id);
      if (receipt.digest !== digest) return reply(409, "Please reopen the report form and try again.");
      return (await receipt.result).clone();
    }
    if (receipts.size >= 10000) return reply(429, "Please try again in a few minutes.");
    attachments.push({ filename: "reproduction.json", contentType: "application/json",
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const result = Promise.resolve().then(async () => {
        const eventId = await send({ message: message.trim(), manifest, attachments,
          userAgent: (request.headers.get("user-agent") || "").slice(0, 300) });
        if (!eventId) throw new Error();
        return Response.json({ ok: true, reportId: id }, { headers: { "Cache-Control": "no-store" } });
      }).catch(() => {
        receipts.delete(id);
        return reply(502, "The report could not be sent. Please try again.");
      });
    receipts.set(id, { digest, result, expires: time + 600000 });
    // Each HTTP request needs a fresh Response body, including retries.
    return (await result).clone();
  };
}

import { createHash } from "node:crypto";
import { getPrivacyRequestDelivery, sendPrivacyRequest } from "../../../lib/privacy-request-delivery.mjs";
import { isPrivacyRequestEmail, privacyRequestLimits, privacyRequestTypes } from "../../../lib/privacy-request.mjs";

export const runtime = "nodejs";

const requestTypeLabels = new Map([["", "Unspecified"], ...privacyRequestTypes]);
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const maxBodyBytes = 32 * 1024;
const submissionWindowMs = 10 * 60 * 1000;
const quotas = new Map();

const reply = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readRequest(request) {
  if (Number(request.headers.get("content-length")) > maxBodyBytes) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let json = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) throw new RangeError();
      json += decoder.decode(value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Match the bug-report route's bounded, per-instance quota.
function allowSubmission(request) {
  const now = Date.now();
  for (const [key, quota] of quotas) if (quota.expires <= now) quotas.delete(key);
  const client = createHash("sha256").update(request.headers.get("x-real-ip") || "unknown").digest("hex");
  const previous = quotas.get(client);
  if (previous) {
    if (previous.count >= 5) return false;
    previous.count++;
  } else {
    if (quotas.size >= 10000) return false;
    quotas.set(client, { count: 1, expires: now + submissionWindowMs });
  }
  return true;
}

export async function POST(request) {
  const site = new URL(request.url);
  // Next can normalize its internal URL to localhost. The Host header preserves the requested hostname.
  site.host = request.headers.get("host") || site.host;
  if (request.headers.get("origin") !== site.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply(403, { message: "Please send requests from the ScummWEB privacy page." });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(415, { message: "Please send requests from the ScummWEB privacy page." });
  }
  const delivery = getPrivacyRequestDelivery();
  if (!delivery) return reply(503, { message: "The form is temporarily unavailable. Please try again later." });
  if (!allowSubmission(request)) return reply(429, { message: "Too many requests. Please try again in a few minutes." });

  let input;
  try {
    input = await readRequest(request);
  } catch (error) {
    return reply(error instanceof RangeError ? 413 : 400, { message: "The request could not be read." });
  }
  const { id, type, replyTo, message } = input ?? {};
  if (typeof id !== "string" || !uuid.test(id) || !requestTypeLabels.has(type)) {
    return reply(400, { message: "Please reload the page and try again." });
  }
  if (!isPrivacyRequestEmail(replyTo)) {
    return reply(400, { message: "Please enter a valid email address for replies." });
  }
  if (typeof message !== "string" || !message.trim() || message.length > privacyRequestLimits.message) {
    return reply(400, { message: "Please describe your request in 4,000 characters or fewer." });
  }

  try {
    const accepted = await sendPrivacyRequest(delivery, {
      site: "scummweb",
      siteName: "ScummWEB",
      reference: id,
      type: requestTypeLabels.get(type),
      replyTo,
      message: message.trim(),
    });
    if (accepted) return reply(201, { reference: id });
  } catch {
    // The provider may have accepted the request before a timeout. Retries keep the same key.
  }
  return reply(502, { message: "Your request could not be confirmed. Please try again." });
}

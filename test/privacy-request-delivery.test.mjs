import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/privacy-requests/route.js";

const origin = "https://scummweb.tsilva.eu";
const reference = "4b2c3033-3efb-4f77-ac4c-3431157b0e59";
const deliveryEnv = {
  SCUMMWEB_PRIVACY_REQUEST_RESEND_API_KEY: "synthetic-api-key",
  SCUMMWEB_PRIVACY_REQUEST_FROM: "requests@example.invalid",
  SCUMMWEB_PRIVACY_REQUEST_TO: "privacy@example.invalid",
};

function configureDelivery(t, overrides) {
  for (const [name, value] of Object.entries({ ...deliveryEnv, ...overrides })) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

function submit(fields = {}) {
  return POST(new Request("https://localhost/api/privacy-requests", {
    method: "POST",
    headers: { host: "scummweb.tsilva.eu", origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: reference,
      type: "access",
      replyTo: "visitor@example.invalid",
      message: "  Synthetic privacy request.  ",
      ...fields,
    }),
  }));
}

test("missing delivery settings keep the form endpoint unavailable", async (t) => {
  configureDelivery(t, { SCUMMWEB_PRIVACY_REQUEST_TO: "" });
  t.mock.method(globalThis, "fetch", () => assert.fail("unconfigured form attempted to send"));
  assert.equal((await submit()).status, 503);
});

test("Resend accepts the same reference on retry and delivery stays fixed to the configured inbox", async (t) => {
  configureDelivery(t);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({
      url,
      method: options.method,
      authorization: options.headers.Authorization,
      idempotency: options.headers["Idempotency-Key"],
      body: JSON.parse(options.body),
    });
    if (calls.length === 1) return new Response("Unavailable", { status: 503 });
    return Response.json({ id: "synthetic-message-id" });
  });
  const fields = { to: "other@example.invalid", from: "other@example.invalid", subject: "Override" };
  assert.equal((await submit(fields)).status, 502);
  const result = await submit(fields);
  assert.equal(result.status, 201);
  assert.deepEqual(await result.json(), { reference });
  assert.deepEqual(calls, Array(2).fill({
    url: "https://api.resend.com/emails",
    method: "POST",
    authorization: "Bearer synthetic-api-key",
    idempotency: `privacy-request/scummweb/${reference}`,
    body: {
      from: "requests@example.invalid",
      to: ["privacy@example.invalid"],
      reply_to: "visitor@example.invalid",
      subject: "[ScummWEB] Privacy request",
      text: `Request type: Access my data\nReference: ${reference}\n\nSynthetic privacy request.`,
    },
  }));
});

test("invalid reply addresses and relay responses cannot produce a successful submission", async (t) => {
  configureDelivery(t);
  const send = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  assert.equal((await submit({ replyTo: "visitor@example.invalid,other@example.invalid" })).status, 400);
  assert.equal(send.mock.callCount(), 0);
  assert.equal((await submit()).status, 502);
  assert.equal(send.mock.callCount(), 1);
});

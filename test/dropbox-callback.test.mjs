import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/dropbox-callback.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function callback(search, opener = true) {
  const events = [];
  vm.runInNewContext(script, {
    URLSearchParams,
    location: { search, pathname: "/dropbox-callback.html", origin: "https://example.test" },
    history: { replaceState: (...args) => events.push(["replace", ...args]) },
    window: { opener: opener ? { postMessage: (data, origin) => events.push(["message", JSON.parse(JSON.stringify(data)), origin]) } : null },
  });
  return events;
}
test("OAuth callback removes the query before sending the code to the exact origin", () => {
  const events = callback("?code=synthetic%2Bcode&state=synthetic-state");
  assert.deepEqual(events[0], ["replace", null, "", "/dropbox-callback.html"]);
  assert.deepEqual(events[1], ["message", { type: "scummweb:dropbox-authorization", code: "synthetic+code", state: "synthetic-state", denied: false }, "https://example.test"]);
});
test("denied consent returns a cancellation without an authorization code", () => {
  const events = callback("?error=access_denied&state=synthetic-state");
  assert.equal(events[1][1].denied, true);
  assert.equal(events[1][1].code, null);
});
test("standalone callbacks clear sensitive parameters and do not fail without an opener", () => {
  assert.equal(callback("?code=synthetic", false).length, 1);
  assert.ok(!/<script[^>]+src=/i.test(html));
});

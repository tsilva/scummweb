import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LOCAL_PORT, resolvePortArgs } from "../scripts/dev-server.mjs";

test("local development and production use the same stable OAuth port", async () => {
  assert.equal(DEFAULT_LOCAL_PORT, 47831);
  assert.deepEqual(await resolvePortArgs("next", ["dev"]), ["dev", "--port", "47831"]);
  assert.deepEqual(await resolvePortArgs("next", ["start"]), ["start", "--port", "47831"]);
  assert.deepEqual(await resolvePortArgs("next", ["build"]), ["build"]);
});
test("explicit ports are preserved without adding a competing default", async () => {
  for (const args of [["dev", "--port", "51234"], ["start", "-p", "51234"], ["dev", "--port=51234"], ["dev", "-p=51234"]]) {
    assert.deepEqual(await resolvePortArgs("next", args), args);
  }
});
test("auto ports remain available for explicitly isolated checks", async () => {
  const args = ["dev", "--port", "auto"];
  const resolved = await resolvePortArgs("next", args);
  assert.deepEqual(args, ["dev", "--port", "auto"]);
  assert.deepEqual(resolved.slice(0, 2), ["dev", "--port"]);
  assert.ok(Number(resolved[2]) > 0 && Number(resolved[2]) < 65536);
  const serve = await resolvePortArgs("serve", ["--port=auto"]);
  assert.match(serve[0], /^--listen=\d+$/);
});

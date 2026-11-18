import assert from "node:assert/strict";
import test from "node:test";
import { readIncompleteSaveWrites } from "../app/save-backups/incomplete-writes.mjs";

test("unfinished-save inspection identifies retained and missing files without reading credentials or changing saves", () => {
  const values = new Map([
    ["scummweb.dropbox-connection.v1", "must not be read"],
    ["scummweb.continue.v1:catalog:sky", JSON.stringify({ target: "sky", pending: ["SKY-VM.001", "SKY-VM.002"] })],
    ["scummweb.continue.v1:version-abc", JSON.stringify({ target: "tentacle", pending: ["tentacle.s01"] })],
    ["scummweb.continue.v1:agent-test", JSON.stringify({ pending: ["isolated.001"] })],
    ["scummweb.continue.v1:catalog:queen", "broken JSON"],
  ]);
  const storage = { length: values.size, key: i => [...values.keys()][i], getItem(key) {
    assert.ok(key.startsWith("scummweb.continue.v1:") && !key.endsWith("agent-test"));
    return values.get(key);
  } };
  const result = readIncompleteSaveWrites(storage, [{ key: "catalog:sky", title: "Beneath a Steel Sky" }], [
    { destination: { key: "catalog:sky" }, files: [{ path: "SKY-VM.001", data: new Uint8Array([1, 2, 3]) }] },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].title, "Beneath a Steel Sky");
  assert.deepEqual(result[0].files, [{ name: "SKY-VM.001", exists: true, size: 3 }, { name: "SKY-VM.002", exists: false, size: null }]);
  assert.equal(result[1].target, "tentacle");
  assert.equal(values.get("scummweb.dropbox-connection.v1"), "must not be read");
});

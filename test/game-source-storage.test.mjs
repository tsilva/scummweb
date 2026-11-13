import assert from "node:assert/strict";
import test from "node:test";
import { saveGameSources, removeGameSources } from "../app/game-sources.mjs";

function storage(t, { failPut, failDelete, initial = [] } = {}) {
  const records = new Map(initial.map(value => [value.id, value]));
  const state = { aborted: 0, closed: 0, callbackErrors: [] };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() { state.closed++; },
          transaction() {
            const writes = [], tx = { error: null, aborted: false,
              abort() {
                tx.aborted = true; state.aborted++; writes.length = 0;
                queueMicrotask(() => tx.onabort?.());
              },
              objectStore() { return {
                put(value) { if (value.id === "bad" && failPut) throw failPut; writes.push(() => records.set(value.id, value)); },
                delete(id) { if (id === "bad" && failDelete) throw failDelete; writes.push(() => records.delete(id)); },
              }; },
            };
            setImmediate(() => {
              if (tx.aborted) return;
              writes.forEach(write => write());
              try { tx.oncomplete?.(); } catch (error) { state.callbackErrors.push(error); }
            });
            return tx;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "indexedDB", previous);
    else delete globalThis.indexedDB;
  });
  return { records, state };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test("a synchronous clone failure rejects the original cause and rolls back earlier writes", async t => {
  const cause = new DOMException("Synthetic uncloneable handle", "DataCloneError");
  const f = storage(t, { failPut: cause });
  await assert.rejects(saveGameSources([{ id: "good" }, { id: "bad" }]), error => error === cause);
  await settled();
  assert.equal(f.state.aborted, 1);
  assert.equal(f.records.size, 0);
  assert.equal(f.state.closed, 1);
  assert.deepEqual(f.state.callbackErrors, []);
});

test("successful writes commit once and retain normal close semantics", async t => {
  const f = storage(t);
  await saveGameSources([{ id: "one" }, { id: "two" }]);
  assert.deepEqual([...f.records.keys()], ["one", "two"]);
  assert.equal(f.state.aborted, 0);
  assert.equal(f.state.closed, 1);
  assert.deepEqual(f.state.callbackErrors, []);
});

test("a synchronous removal failure preserves all existing records", async t => {
  const cause = new Error("Synthetic deletion failure");
  const f = storage(t, { failDelete: cause, initial: [{ id: "one" }, { id: "bad" }] });
  await assert.rejects(removeGameSources(["one", "bad"]), error => error === cause);
  await settled();
  assert.deepEqual([...f.records.keys()], ["one", "bad"]);
  assert.equal(f.state.aborted, 1);
  assert.deepEqual(f.state.callbackErrors, []);
});

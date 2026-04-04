import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";

test("normalizes save-slot skip-intro configs", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["SKY-VM.000", "SKY-VM.000"],
    }),
    {
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["SKY-VM.000"],
    }
  );
});

test("infers save-slot configs when slot metadata is present", () => {
  assert.deepEqual(
    normalizeSkipIntroConfig({
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["queen.s00"],
    }),
    {
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 0,
      saveFiles: ["queen.s00"],
    }
  );
});

test("rejects legacy keypress skip-intro configs", () => {
  assert.equal(
    normalizeSkipIntroConfig({
      strategy: "keypress",
      durationMinutes: 2,
      key: "Escape",
      pressCount: 5,
      pressIntervalMs: 1000,
    }),
    null
  );
});

test("rejects incomplete save-slot configs", () => {
  assert.equal(
    normalizeSkipIntroConfig({
      strategy: "save-slot",
      durationMinutes: 2,
      slot: 2,
      saveFiles: [],
    }),
    null
  );
});

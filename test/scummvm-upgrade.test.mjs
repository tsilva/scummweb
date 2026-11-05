import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const scripts = ".codex/skills/scummweb_upgrade-scummvm/scripts/";

test("every ScummVM adaptation has current upgrade memory", () => {
  const result = JSON.parse(execFileSync("python3", [scripts + "upgrade_check.py", "--offline"], { cwd: root, encoding: "utf8", timeout: 10_000 }));
  assert.equal(result.status, "offline-validated");
  assert.ok(Number.isInteger(result.memory.native_patches) && result.memory.native_patches >= 0);
});

test("upgrade decisions and pin writes pass offline behavioral fixtures", () => {
  execFileSync("python3", [scripts + "test_upgrade_check.py"], { cwd: root, timeout: 30_000, stdio: "pipe" });
});

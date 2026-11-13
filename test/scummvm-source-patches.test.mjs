import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("source verification applies dependent patches in order and rejects unpublished edits", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "scummweb-source-series-"));
  const git = (...args) => execFileSync("git", ["-C", directory, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "--quiet");
    writeFileSync(path.join(directory, "pinned.txt"), "pinned\n");
    git("add", "pinned.txt");
    // Synthetic repository only: no workspace identity, signing or branches change.
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Pinned fixture");
    const commit = git("rev-parse", "HEAD");
    const first = path.join(directory, "01-create.patch"), second = path.join(directory, "02-update.patch");
    writeFileSync(first, "--- /dev/null\n+++ b/new.h\n@@ -0,0 +1 @@\n+before\n");
    writeFileSync(second, "--- a/new.h\n+++ b/new.h\n@@ -1 +1 @@\n-before\n+after\n");
    writeFileSync(path.join(directory, "new.h"), "after\n");
    const program = `import importlib.util,sys\nspec=importlib.util.spec_from_file_location('source_info',sys.argv[1])\nm=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\nm.verify_checkout(sys.argv[2],sys.argv[3],sys.argv[4:])\n`;
    const verify = () => execFileSync("python3", ["-c", program, path.resolve("scripts/write_source_info.py"), directory, commit, first, second], { stdio: ["ignore", "pipe", "pipe"] });
    assert.doesNotThrow(verify);
    writeFileSync(path.join(directory, "pinned.txt"), "unpublished\n");
    assert.throws(verify, /Command failed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

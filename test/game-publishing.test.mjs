import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("game publishing preserves exact demo bytes and conditional, placeholder-only delivery", () => {
  execFileSync("python3", ["-B", "-m", "unittest", "discover", "-s", "scripts/game-publishing", "-p", "test_*.py"], {
    cwd: root,
    timeout: 60_000,
    stdio: "pipe",
  });
});

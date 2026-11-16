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

test("Queen audio headers preserve all original samples", () => {
  execFileSync("python3", ["-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_build_queen_flac.py"], {
    cwd: root, timeout: 10_000, stdio: "pipe",
  });
});

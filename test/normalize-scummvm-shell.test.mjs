import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const normalizerPath = path.join(rootDir, "scripts", "normalize_scummvm_shell.py");

test("normalizer enables subtitles for every kept game section", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-normalize-shell-"));
  const iniPath = path.join(tempDir, "scummvm.ini");
  const gamesDir = path.join(tempDir, "games");
  const sword25DataPath = path.join(tempDir, "sword25", "sword25.dat");

  fs.mkdirSync(path.dirname(sword25DataPath), { recursive: true });
  fs.writeFileSync(sword25DataPath, "data");
  fs.mkdirSync(gamesDir, { recursive: true });

  fs.writeFileSync(
    iniPath,
    `[scummvm]
savepath=/home/web_user/.local/share/scummvm/saves

[sky]
gameid=sky
engineid=sky
path=/tmp/custom-sky

[queen]
gameid=queen
engineid=queen
path=/games/queen

[drascula]
gameid=drascula
engineid=drascula
subtitles=false

[agi-fan]
gameid=agi-fan
engineid=agi
path=/games/agi-fan
`,
    "utf8"
  );

  execFileSync("python3", [normalizerPath, iniPath, gamesDir, sword25DataPath], {
    cwd: rootDir,
    stdio: "pipe",
  });

  const normalizedIni = fs.readFileSync(iniPath, "utf8");

  assert.match(normalizedIni, /\[sky\][\s\S]*?path=\/games\/sky[\s\S]*?subtitles=true/);
  assert.match(normalizedIni, /\[queen\][\s\S]*?subtitles=true/);
  assert.match(normalizedIni, /\[drascula\][\s\S]*?subtitles=true/);
  assert.doesNotMatch(normalizedIni, /\[agi-fan\]/);
  assert.match(normalizedIni, /\[sword25\][\s\S]*?subtitles=true/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { getArchiveGamePresentation } from "../app/archive-game-presentation.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const installer = path.join(root, "scripts/install_classic_freeware.py");

test("fresh browser configuration preserves UTF-8 titles and records byte lengths", () => {
  const html = fs.readFileSync(path.join(root, "scummvm-shell/scummvm.html"), "utf8");
  const helper = html.match(/function encodeUtf8Base64\(text\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper);
  const encode = runInNewContext(`(${helper})`, { TextEncoder, btoa });
  const ini = "[soltys]\ndescription=Sołtys\n[example]\ndescription=日本語 😀\n";
  const bytes = Buffer.from(encode(ini), "base64");
  assert.equal(bytes.toString("utf8"), ini);
  assert.equal(bytes.length, Buffer.byteLength(ini));
  assert.match(html, /ini_data=encodeUtf8Base64\(e\)/);
  assert.match(html, /size:atob\(ini_data\)\.length/);
});

test("official classic archives are recognized by contents without relying on filenames", () => {
  for (const [target, files] of [
    ["got", [["GOTRES.DAT", 739710, 34139293]]],
    ["hires1", [["MYSTHOUS.DSK", 143360, 1258297292]]],
    ["soltys", [["vol.cat", 50176, 623096146], ["vol.dat", 8430868, 1606659223]]],
    ["sfinx", [["sfinx-en-v1.1/vol.cat", 129024, 950468179], ["sfinx-en-v1.1/vol.dat", 34182773, 4051689322]]],
    ["comi-demo", [["COMI.LA0", 18041, 0x2f43bb49], ["COMI.LA1", 10579949, 0x1ea49b19]]],
  ]) {
    assert.equal(getArchiveGamePresentation(files)?.target, target);
    assert.equal(getArchiveGamePresentation(files.map(([name, size]) => [name, size, 0])), null);
  }
});

test("classic freeware installation rejects corrupt packages before changing the catalog", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-freeware-"));
  try {
    const downloads = path.join(dir, "downloads");
    fs.mkdirSync(downloads);
    fs.writeFileSync(path.join(downloads, "soltys-en-v1.0.zip"), "corrupt");
    const original = "[sky]\nengineid=sky\ngameid=sky\npath=/games/sky\n";
    fs.writeFileSync(path.join(dir, "scummvm.ini"), original);
    const result = spawnSync("python3", [installer, dir, "--downloads", downloads]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr.toString(), /Archive checksum mismatch/);
    assert.equal(fs.readFileSync(path.join(dir, "scummvm.ini"), "utf8"), original);
    assert.equal(fs.existsSync(path.join(dir, "games")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rebuilding without optional freeware preserves existing targets and settings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-freeware-"));
  try {
    fs.mkdirSync(path.join(dir, "downloads"));
    const original = "[scummvm]\nmusic_volume=123\n\n[sky]\nengineid=sky\ngameid=sky\npath=/games/sky\n";
    fs.writeFileSync(path.join(dir, "scummvm.ini"), original);
    execFileSync("python3", [installer, dir, "--downloads", path.join(dir, "downloads")]);
    assert.equal(fs.readFileSync(path.join(dir, "scummvm.ini"), "utf8"), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

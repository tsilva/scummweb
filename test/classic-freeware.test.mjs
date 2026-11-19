import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { initializeSaveRoot } from "../app/save-backups/filesystem.mjs";
import { readSaveTree } from "../web-shell/save-editions.mjs";
import { memoryStorage } from "./helpers/dropbox-fixtures.mjs";
import { getArchiveGamePresentation } from "../app/archive-game-presentation.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const installer = path.join(root, "scripts/install_classic_freeware.py");

test("fresh browser configuration preserves UTF-8 titles and records byte lengths", () => {
  const ini = "[soltys]\ndescription=Sołtys\n[example]\ndescription=日本語 😀\n";
  const storage = memoryStorage();
  initializeSaveRoot(storage, ini);
  const { inode } = readSaveTree(storage, "");
  const rootEntry = inode("/");
  const { "scummvm.ini": iniKey } = JSON.parse(Buffer.from(storage.getItem(rootEntry.dataKey), "base64"));
  const config = inode(iniKey);
  const bytes = Buffer.from(storage.getItem(config.dataKey), "base64");
  assert.equal(bytes.toString("utf8"), ini);
  assert.equal(config.size, Buffer.byteLength(ini));
});

test("official classic archives are recognized by contents without relying on filenames", () => {
  for (const [target, files] of [
    ["grandma-demo", [["P01E.IBM", 2432263, 3086336102], ["P01J.IBM", 2423661, 3599050856], ["P01S.IBM", 2567284, 355773652], ["PAGES.512", 824, 4215291410]]],
    ["arthurbday-demo", [["BIRTHDAY.512", 699, 2545112256], ["P01EP.IBM", 2478313, 1454066852], ["P01SP.IBM", 2837914, 702361151]]],
    ["tortoise-demo", [["P01EP.IBM", 3493499, 2155196281], ["P01SP.IBM", 3462902, 2216245485], ["TORTOISE.512", 636, 1799113419]]],
    ["farm-demo", [["FARMDEMO.HE0", 18149, 4064708643], ["FARMDEMO.HE1", 8141104, 4243023337]]],
    ["airport-demo", [["AIRDEMO.HE0", 51131, 3554372771], ["AIRDEMO.HE1", 28668826, 3361941333]]],
    ["bluesbirthday-demo", [["BluesBirthdayDemo.HE0", 15789, 4262623801], ["BluesBirthdayDemo.(a)", 14266316, 388128617], ["BluesBirthdayDemo.(b)", 2679222, 2749443637]]],
    ["bluesabctime-demo", [["BluesABCTimeDemo.HE0", 12186, 541661588], ["BluesABCTimeDemo.(a)", 3892429, 4009412535]]],
    ["thinkerk-demo", [["KINDDEMO.HE0", 29789, 1887773344], ["KINDDEMO.HE1", 7003070, 2334537534]]],
    ["thinker1-demo", [["1grademo.HE0", 30919, 813602397], ["1grademo.HE1", 8031672, 3070787722]]],
    ["brstorm-demo", [["BRSTORM.HE0", 5433, 2011138004], ["BRSTORM.HE1", 237722, 491020587]]],
    ["football-demo", [["FOOTDEMO.HE0", 23135, 1468339392], ["FOOTDEMO.HE2", 10696556, 3909202253]]],
    ["fbear-demo", [["FBDEMO.HE0", 9593, 2725358755], ["FBDEMO.HE1", 1176219, 1667533979]]],
    ["spyozon-demo", [["SF3-DEMO.HE0", 15317, 1494850748], ["SF3-DEMO.HE2", 5876993, 2107715046]]],
    ["puttmoon-demo", [["MOONDEMO.HE0", 8856, 3451413547], ["MOONDEMO.HE1", 933372, 1040395290]]],
    ["puttrace-demo", [["RACEDEMO.HE0", 13108, 25833763], ["RACEDEMO.(A)", 6406987, 1004425682]]],
    ["pajama3-demo", [["PJ3DEMO.HE0", 13911, 1009492682], ["PJ3DEMO.(A)", 5476892, 450480674]]],
    ["freddi4-demo", [["FF4DEMO.HE0", 13600, 2900540967], ["FF4DEMO.(A)", 6322129, 3496239882]]],
    ["freddi3-demo", [["F3-MDEMO.HE0", 22718, 3705901357], ["F3-MDEMO.HE1", 5579470, 864671203]]],
    ["lsl7-demo", [["RESMAP.000", 2695, 285310727], ["RESSCI.000", 10195878, 2468665899]]],
    ["phantasmagoria-demo", [["RESMAP.001", 11518, 1988159651], ["RESSCI.001", 65844612, 3646433611]]],
    ["lighthouse-demo", [["RESMAP.000", 1525, 1708619834], ["RESSCI.000", 11494351, 2082545035]]],
    ["shivers-demo", [["RESMAP.000", 7069, 592407770], ["RESSCI.000", 37404155, 377852859]]],
    ["torin-demo", [["RESMAP.000", 3403, 3083944811], ["RESSCI.000", 5073868, 1095201545]]],
    ["nebular-demo", [["SECTION1.HAG", 192065, 2775015795], ["SECTION9.HAG", 543156, 2326445887]]],
    ["tucker-demo", [["INFOBAR.TXT", 203, 2809140262], ["TUCKER.EXE", 233145, 3209492942]]],
    ["scalpel-demo", [["TALK.LIB", 121102, 1973471485], ["RES03.RRM", 140669, 3291922347]]],
    ["rtz-demo", [["RTZCD.RED", 130683, 769598157], ["RTZCD.PRJ", 43016792, 2406992190]]],
    ["tony-demo", [["roasted.MPC", 39211, 3632859460], ["roasted.MPR", 14972409, 2203660658], ["VOICES.VDB", 20189260, 2600640084]]],
    ["touche-demo", [["TOUCHE.DAT", 8720683, 3670628460], ["OBJ", 5503572, 1897254655]]],
    ["pajama2-demo", [["PJ2DEMO.HE0", 58749, 374208885], ["PJ2DEMO.HE1", 6103756, 4209458581]]],
    ["freddi2-demo", [["FF2-DEMO.HE0", 27298, 1506492051], ["FF2-DEMO.HE1", 16911456, 1972877193]]],
    ["putttime-demo", [["TIMEDEMO.HE0", 18394, 3353746237], ["TIMEDEMO.HE1", 12042331, 451864772]]],
    ["puttzoo-demo", [["ZOODEMO.HE0", 14337, 1935052607], ["ZOODEMO.HE1", 13326164, 1569084410]]],
    ["lol-demo", [["GENERAL.PAK", 710633, 385577937], ["L01.PAK", 68733, 2853084991]]],
    ["kyra2-demo", [["THANKS.CPS", 7768, 3139399110], ["HOFCD.EXE", 199284, 1859532215]]],
    ["simon2", [["GSPTR30", 58757, 2279999647], ["SIMON2.GME", 4187270, 1777768517]]],
    ["simon1-demo", [["GAMEPC", 30879, 1563266732], ["SIMON.GME", 1237886, 3194878688]]],
    ["toon-demo", [["LOCAL.PAK", 2680573, 3491990584], ["GENERIC.SVL", 7739319, 281706566]]],
    ["got", [["GOTRES.DAT", 739710, 34139293]]],
    ["hires1", [["MYSTHOUS.DSK", 143360, 1258297292]]],
    ["soltys", [["vol.cat", 50176, 623096146], ["vol.dat", 8430868, 1606659223]]],
    ["sfinx", [["sfinx-en-v1.1/vol.cat", 129024, 950468179], ["sfinx-en-v1.1/vol.dat", 34182773, 4051689322]]],
    ["comi-demo", [["COMI.LA0", 18041, 0x2f43bb49], ["COMI.LA1", 10579949, 0x1ea49b19]]],
    ["ft-demo", [["wrapper/FT.000", 7885, 0x5a4b7e9a], ["wrapper/FT.001", 50371781, 0xb93903c9]]],
    ["samnmax-demo", [["wrapper/SAMDEMO.000", 7505, 0x112b0cbd], ["wrapper/SAMDEMO.001", 1190282, 0xa0b3f988]]],
    ["gk1-demo", [["RESOURCE.MAP", 2490, 2514227026], ["RESOURCE.000", 1718450, 661574477]]],
    ["freddypharkas-demo", [["RESOURCE.MAP", 1918, 1006686103], ["RESOURCE.000", 957382, 1863300513]]],
    ["neverhood-demo", [["neverhood-demo/A.BLB", 11973, 2870863031], ["neverhood-demo/NEVDEMO.BLB", 22564568, 3388389503]]],
    ["spyfox-demo", [["FOXDEMO.HE0", 20103, 1482007684], ["FOXDEMO.HE1", 14746318, 1132169902]]],
    ["pajama-demo", [["PJS-DEMO.HE0", 18354, 4124670312], ["PJS-DEMO.HE1", 13164357, 3769183567]]],
    ["freddi-demo", [["FREDDEMO.HE0", 9779, 2319558390], ["FREDDEMO.HE1", 6141457, 1951420878]]],
    ["puttputt-demo", [["PUTTDEMO.HE0", 8269, 921152807], ["PUTTDEMO.HE1", 826701, 2065697123]]],
    ["technobabylon-demo", [["Technobabylon.exe", 595787927, 1286211410], ["speech.vox", 54621204, 1148941554]]],
    ["primordia-demo", [["Primordia.exe", 727898212, 584883832], ["speech.vox", 212231939, 2479583785]]],
    ["geminirue-demo", [["Gemini Rue DEMO.exe", 61839853, 1256240307], ["speech.vox", 103642847, 1984807282]]],
    ["myst-demo", [["DEMO.DAT", 488921, 3831070402], ["SLIDES.DAT", 9483618, 1854365890]]],
    ["sq6-demo", [["RESOURCE.MAP", 2572, 1622953036], ["RESOURCE.000", 2272050, 3325270940]]],
    ["gob3-demo", [["INTRO.STK", 395561, 546295456], ["IMD.ITK", 83129, 1237808976]]],
    ["gob2-demo", [["INTRO.STK", 492226, 2476912281], ["ALL.ASK", 6078, 581017231]]],
    ["gob1-demo", [["INTRO.STK", 280044, 1661689621], ["DISK1.STK", 662036, 670765929]]],
    ["dw-demo", [["DISCWLD/DW.GRA", 781676, 2418090083], ["DISCWLD/ENGLISH.SMP", 51889165, 1007388091]]],
    ["sword2-demo", [["wrapper/General.clu", 8030769, 1224036629], ["wrapper/Docks.clu", 20262263, 238789565]]],
    ["sword1-demo", [["wrapper/CLUSTERS/scripts.CLm", 1088468, 3493304599], ["wrapper/CLUSTERS/SWORDRES.RIF", 59788, 2626330415]]],
    ["dig-demo", [["wrapper/DIG.LA0", 3472, 0x0d806066], ["wrapper/DIG.LA1", 13564378, 0x792615a2]]],
  ]) {
    assert.equal(getArchiveGamePresentation(files)?.target, target);
    assert.equal(getArchiveGamePresentation(files.map(([name, size]) => [name, size, 0])), null);
  }
});

test("Bear Stormin’ keeps its DOS label without forcing the native platform", () => {
  const ini = fs.readFileSync(path.join(root, "scummvm-shell/scummvm.ini"), "utf8");
  const section = ini.match(/^\[brstorm-demo\]\r?\n([^[]*)/m)?.[1];
  assert.ok(section);
  assert.match(section, /^platform=$/m);
  const { games } = JSON.parse(fs.readFileSync(path.join(root, "scummvm-shell/games.json"), "utf8"));
  assert.equal(games.find(({ target }) => target === "brstorm-demo")?.platform, "dos");
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


test("Windows Write notices expose readable UTF-8 text and reject invalid boundaries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-write-notice-"));
  try {
    const gameDir = path.join(dir, "games", "write-notice");
    fs.mkdirSync(gameDir, { recursive: true });
    const ini = path.join(dir, "scummvm.ini");
    const output = path.join(dir, "games.json");
    fs.writeFileSync(ini, "[write-notice]\nengineid=sci\ngameid=write-notice\npath=/games/write-notice\n");
    const body = Buffer.from([0x93, ...Buffer.from("Torin's Passage"), 0x94, 13, 10]);
    const bytes = Buffer.alloc(128 + body.length + 32, 0xff);
    bytes.writeUInt16LE(0xbe31, 0);
    bytes.writeUInt32LE(128 + body.length, 14);
    body.copy(bytes, 128);
    const notice = path.join(gameDir, "README.WRI");
    fs.writeFileSync(notice, bytes);
    const generator = path.join(root, "scripts/create_launcher_metadata.mjs");
    execFileSync(process.execPath, [generator, ini, output]);
    assert.equal(fs.readFileSync(path.join(dir, "launcher/notices/write-notice.txt"), "utf8"), "“Torin's Passage”\n");
    bytes.writeUInt32LE(bytes.length + 1, 14);
    fs.writeFileSync(notice, bytes);
    const result = spawnSync(process.execPath, [generator, ini, output]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr.toString(), /Invalid Windows Write text boundary/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

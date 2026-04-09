import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const shellHtmlPath = path.join(rootDir, "scummvm-shell", "scummvm.html");
const bootStatePath = path.join(rootDir, "app", "game-player", "useBootState.js");

test("managed shell keeps the log sink for detection but hides it from layout", () => {
  const shellHtml = fs.readFileSync(shellHtmlPath, "utf8");

  assert.match(shellHtml, /<textarea[^>]*\bid=output\b[^>]*><\/textarea>/);
  assert.doesNotMatch(shellHtml, /<hr>/i);
  assert.match(
    shellHtml,
    /#output\{[^}]*position:fixed;[^}]*left:-10000px;[^}]*width:1px!important;[^}]*height:1px!important;[^}]*opacity:0;[^}]*pointer-events:none;/
  );
  assert.match(shellHtml, /const output=document\.getElementById\("output"\);/);
  assert.match(shellHtml, /launchPattern&&output&&launchPattern\.test\(output\.value\|\|""\)/);
});

test("boot polling in the app still reads shell output for failures", () => {
  const bootStateSource = fs.readFileSync(bootStatePath, "utf8");

  assert.match(bootStateSource, /getElementById\("output"\)/);
  assert.match(bootStateSource, /"value" in outputElement/);
  assert.match(bootStateSource, /BOOT_FAILURE_PATTERNS\.some\(\(pattern\) => pattern\.test\(outputValue\)\)/);
});

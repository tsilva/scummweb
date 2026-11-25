import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sentryRequire = createRequire(require.resolve("@sentry/nextjs"));
const commonjsPath = sentryRequire.resolve("@rollup/plugin-commonjs");
const commonjsRequire = createRequire(commonjsPath);
const pluginutilsPath = commonjsRequire.resolve("@rollup/pluginutils");

function lockedVersions(lockfile, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const packageEntry = new RegExp(
    `^  ['"]?${escapedName}@([0-9][^:'"(]*)(?:\\([^:]*\\))?['"]?:`,
    "gm",
  );

  return new Set([...lockfile.matchAll(packageEntry)].map((match) => match[1]));
}

test("the complete locked dependency graph has no known advisory", () => {
  const audit = JSON.parse(
    execFileSync("pnpm", ["audit", "--json"], {
      cwd: rootDir,
      encoding: "utf8",
    }),
  );

  assert.deepEqual(audit.metadata.vulnerabilities, {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  });
});

test("all formerly vulnerable runtime families resolve only to fixed versions", () => {
  const lockfile = fs.readFileSync(path.join(rootDir, "pnpm-lock.yaml"), "utf8");
  const expected = new Map([
    ["@babel/core", new Set()],
    ["@opentelemetry/core", new Set()],
    ["uuid", new Set()],
    ["picomatch", new Set()],
    ["brace-expansion", new Set(["5.0.12"])],
    ["fast-uri", new Set(["3.1.9"])],
    ["nanoid", new Set(["3.3.19"])],
    ["picomatch", new Set()],
  ]);

  for (const [name, safeVersions] of expected) {
    assert.deepEqual(lockedVersions(lockfile, name), safeVersions, name);
  }
});

test("Sentry's glob filters reject repeated-extglob attacks within a bounded process", () => {
  execFileSync(process.execPath, ["-e", `
    const assert = require('node:assert/strict');
    const { createFilter } = require(${JSON.stringify(pluginutilsPath)});
    for (const pattern of ['+(*a)', '*(*a)', '+(*a|b)']) {
      assert.equal(createFilter(pattern, undefined, { resolve: false })('a'.repeat(40) + '!'), false);
    }
    assert.equal(createFilter('**/*.js')('/src/normal.js'), true);
  `], { timeout: 2000, encoding: "utf8" });
});

test("both Rollup filter entry points preserve Sentry's filters and ordinary glob controls", async () => {
  const esmPath = path.resolve(path.dirname(pluginutilsPath), "../es/index.js");
  for (const { createFilter } of [require(pluginutilsPath), await import(pathToFileURL(esmPath))]) {
    const plain = createFilter();
    assert.equal(plain("/src/page.js"), true);
    assert.equal(plain("\0internal"), false);
    assert.equal(plain(null), false);
    const filter = createFilter("**/*.{js,cjs}", "**/skip/**", { resolve: false });
    assert.equal(filter("/src/.hidden.cjs"), true);
    assert.equal(filter("/src/skip/page.js"), false);
    assert.equal(filter("/src/page.txt"), false);
    assert.equal(createFilter(/\.js$/, /skip/)("/src/page.js"), true);
    assert.equal(createFilter("#page.js", undefined, { resolve: false })("#page.js"), true);
    assert.equal(createFilter("!(skip).js", undefined, { resolve: false })("skip.js"), false);
    assert.equal(createFilter("!(skip).js", undefined, { resolve: false })("page.js"), true);
    assert.equal(createFilter("!skip.js", undefined, { resolve: false })("page.js"), true);
    const base = path.resolve("fixture+(test)[x]");
    assert.equal(createFilter("*.js", undefined, { resolve: base })(path.join(base, "page.js")), true);
  }
});

test("Sentry's CommonJS wrapping and source maps survive without picomatch", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-commonjs-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const entry = path.join(temporary, "page.cjs");
  fs.writeFileSync(entry, 'module.exports = function handler() { return "wrapped"; };');
  const { rollup } = sentryRequire("rollup");
  const esmPath = path.resolve(path.dirname(commonjsPath), "../es/index.js");
  for (const commonjs of [sentryRequire("@rollup/plugin-commonjs"), (await import(pathToFileURL(esmPath))).default]) {
    const bundle = await rollup({ input: entry, plugins: [commonjs({
      sourceMap: true, strictRequires: true, ignoreDynamicRequires: true, ignore: () => true,
    })] });
    try {
      const { output } = await bundle.generate({ format: "es", sourcemap: true });
      assert.equal((await import(`data:text/javascript,${encodeURIComponent(output[0].code)}`)).default(), "wrapped");
      assert.ok(output[0].map.sources.some((source) => source.endsWith("page.cjs")));
    } finally { await bundle.close(); }
  }
});

test("CommonJS dynamic targets keep dotfiles and ordered exclusions", async (t) => {
  const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "scummweb-dynamic-require-")));
  const previousDirectory = process.cwd();
  t.after(() => { process.chdir(previousDirectory); fs.rmSync(temporary, { recursive: true, force: true }); });
  process.chdir(temporary);
  fs.writeFileSync(path.join(temporary, ".hidden.cjs"), 'module.exports = "hidden";');
  fs.writeFileSync(path.join(temporary, "skip.cjs"), 'module.exports = "skipped";');
  const entry = path.join(temporary, "main.cjs");
  fs.writeFileSync(entry, 'module.exports = function load(name) { return require("./" + name + ".cjs"); };');
  const { rollup } = sentryRequire("rollup");
  const esmPath = path.resolve(path.dirname(commonjsPath), "../es/index.js");
  for (const commonjs of [sentryRequire("@rollup/plugin-commonjs"), (await import(pathToFileURL(esmPath))).default]) {
    const bundle = await rollup({ input: entry, plugins: [commonjs({
      dynamicRequireRoot: temporary,
      dynamicRequireTargets: ["*.cjs", "!skip.cjs"],
    })] });
    try {
      const { output } = await bundle.generate({ format: "es" });
      const load = (await import(`data:text/javascript,${encodeURIComponent(output[0].code)}`)).default;
      assert.equal(load(".hidden"), "hidden");
      assert.throws(() => load("skip"), /Could not dynamically require/);
    } finally { await bundle.close(); }
  }
});

test("the lockfile contains only registry dependencies", () => {
  const lockfile = fs.readFileSync(path.join(rootDir, "pnpm-lock.yaml"), "utf8");

  assert.doesNotMatch(
    lockfile,
    /^\s+(?:specifier|version|resolution|tarball):.*(?:git\+|github:|gitlab:|bitbucket:|file:|link:)/gim,
  );
  for (const match of lockfile.matchAll(/tarball:\s+(https?:\/\/[^\s,}]+)/gm)) {
    assert.match(match[1], /^https:\/\/registry\.npmjs\.org\//);
  }
});

test("supply-chain protections remain fail-closed", () => {
  const npmrc = fs.readFileSync(path.join(rootDir, ".npmrc"), "utf8");
  const workspace = fs.readFileSync(path.join(rootDir, "pnpm-workspace.yaml"), "utf8");

  assert.match(npmrc, /^minimum-release-age=2880$/m);
  assert.match(npmrc, /^block-exotic-subdeps=true$/m);
  assert.match(npmrc, /^ignore-scripts=true$/m);
  assert.match(workspace, /^minimumReleaseAge: 2880$/m);
  assert.match(workspace, /^blockExoticSubdeps: true$/m);
});

test("dynamic game routes await Next.js route parameters", () => {
  for (const relativePath of [
    "app/[gameSlug]/page.js",
    "app/[gameSlug]/play/page.js",
  ]) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.match(source, /const \{ gameSlug \} = await params;/, relativePath);
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    ["@babel/core", new Set(["7.29.7"])],
    ["@opentelemetry/core", new Set(["2.10.0"])],
    ["brace-expansion", new Set(["5.0.9"])],
    ["fast-uri", new Set(["3.1.5"])],
    ["nanoid", new Set(["3.3.18"])],
  ]);

  for (const [name, safeVersions] of expected) {
    assert.deepEqual(lockedVersions(lockfile, name), safeVersions, name);
  }
  assert.deepEqual(
    lockedVersions(lockfile, "uuid"),
    new Set(),
    "the vulnerable UUID branch was removed",
  );
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

  assert.match(npmrc, /^minimum-release-age=10080$/m);
  assert.match(npmrc, /^block-exotic-subdeps=true$/m);
  assert.match(npmrc, /^ignore-scripts=true$/m);
  assert.match(workspace, /^minimumReleaseAge: 10080$/m);
  assert.match(workspace, /^blockExoticSubdeps: true$/m);
});

test("dynamic game routes await Next.js route parameters", () => {
  for (const relativePath of [
    "app/[gameSlug]/page.js",
    "app/[gameSlug]/play/page.js",
    "app/[gameSlug]/opengraph-image.js",
    "app/[gameSlug]/social-card.png/route.js",
  ]) {
    const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
    assert.match(source, /const \{ gameSlug \} = await params;/, relativePath);
  }
});

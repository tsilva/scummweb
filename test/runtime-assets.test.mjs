import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { generateRuntimeAssets } from "../scripts/generate-runtime-assets.mjs";
import assetConfig from "../lib/scummvm-shell-assets.js";

test("runtime URLs remain stable across app changes and invalidate only changed resource bytes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "scummweb-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "data/plugins"), { recursive: true });
  const core = ["scummvm.js", "scummvm.wasm", "scummvm_fs.js", "audio-start-control.mjs", "scummvm.ini", "games.json"];
  for (const name of [...core, "data/index.json", "data/plugins/libdreamweb.so"]) await writeFile(path.join(root, name), name);
  await writeFile(path.join(root, "scummvm.html"), '<head><link id=scummweb-wasm-preload href=scummvm.wasm></head><script id=scummweb-runtime-assets>globalThis.SCUMMWEB_RUNTIME_ASSETS={};</script>');
  const first = await generateRuntimeAssets(root);
  await writeFile(path.join(root, "unrelated-app.js"), "new app deployment");
  const repeated = await generateRuntimeAssets(root);
  assert.deepEqual(repeated, first);
  assert.match(await readFile(path.join(root, "scummvm.html"), "utf8"), new RegExp(`href=scummvm.wasm\\?v=${first.files["/scummvm.wasm"]}`));
  await writeFile(path.join(root, "scummvm_fs.js"), "new filesystem behavior");
  const changed = await generateRuntimeAssets(root);
  assert.notEqual(changed.version, first.version);
  assert.notEqual(changed.files["/scummvm_fs.js"], first.files["/scummvm_fs.js"]);
  assert.equal(changed.files["/scummvm.wasm"], first.files["/scummvm.wasm"]);
  await writeFile(path.join(root, "data/plugins/libdreamweb.so"), "new engine bytes");
  const engineChange = await generateRuntimeAssets(root);
  assert.notEqual(engineChange.files["/data/plugins/libdreamweb.so"], changed.files["/data/plugins/libdreamweb.so"]);
  assert.equal(engineChange.files["/scummvm.wasm"], changed.files["/scummvm.wasm"]);
  const publicVersions = JSON.parse(await readFile(path.join(root, "runtime-version.json"), "utf8"));
  assert.deepEqual(Object.keys(publicVersions.files).sort(), [...core, "scummvm.html"].map((name) => `/${name}`).sort());
});

test("only the exact content version receives immutable caching headers", async () => {
  const module = { exports: {} };
  const runtime = { version: "sha-shell", files: { "/scummvm.wasm": "sha-wasm", "/scummvm.html": "sha-shell" } };
  runInNewContext(await readFile(new URL("../next.config.js", import.meta.url), "utf8"), {
    module, process: { env: { VERCEL_DEPLOYMENT_ID: "dpl-another-app-deployment" } },
    require(name) {
      if (name === "@sentry/nextjs") return { withSentryConfig: (config) => config };
      if (name.includes("social-cards")) return { cards: {} };
      if (name.includes("runtime-assets")) return runtime;
      if (name.includes("scummvm-shell-assets")) return assetConfig;
      throw new Error(name);
    },
  });
  assert.equal(module.exports.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION, "dpl-another-app-deployment");
  const wasm = module.exports.headers().find(({ source }) => source === "/scummvm.wasm");
  assert.equal(wasm.has[0].value, "sha-wasm");
  assert.equal(wasm.headers[0].value, "public, max-age=31536000, immutable");
  const html = module.exports.headers().find(({ source }) => source === "/scummvm.html");
  assert.ok(!html.headers.some(({ key }) => key === "Cache-Control"), "HTML revalidates hosting-injected scripts");
  const artwork = module.exports.headers().find(({ source }) => source === "/launcher/:path*");
  assert.equal(artwork.has[0].value, "dpl-another-app-deployment");
  assert.ok(!module.exports.headers().some(({ source }) => source === "/data/:path*"), "runtime data requires its exact content fingerprint");
});

test("app deployments refresh artwork while retaining content-addressed runtime URLs", async (t) => {
  const oldVersion = process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION;
  t.after(() => oldVersion === undefined ? delete process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION : process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION = oldVersion);
  process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION = "dpl-one";
  const first = await import("../app/asset-paths.js?deployment=one");
  process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION = "dpl-two";
  const second = await import("../app/asset-paths.js?deployment=two");
  for (const name of ["scummvm.html", "scummvm.wasm", "scummvm_fs.js", "scummvm.ini"]) {
    assert.equal(first.buildVersionedAssetPath(`/${name}`), second.buildVersionedAssetPath(`/${name}`));
  }
  assert.notEqual(first.buildVersionedAssetPath("/launcher/cover.webp"), second.buildVersionedAssetPath("/launcher/cover.webp"));
});

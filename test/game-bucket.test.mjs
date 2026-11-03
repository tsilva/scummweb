import assert from "node:assert/strict";
import test from "node:test";
import { BlobWriter, Uint8ArrayReader, ZipWriter } from "@zip.js/zip.js";
import { checkGameBucket, normalizeBucketUrl, readBucketGameArchive, readSavedBucket } from "../app/game-bucket.mjs";
import { maxArchiveSize } from "../app/local-game-archive.mjs";

const officialUrl = "https://scummvm-games.example.com";
const customUrl = "https://games.example.com";
const games = [
  { target: "sky", path: "/games/sky" },
  { target: "dreamweb-cd", path: "/games/dreamweb" },
  { target: "queen", path: "/games/queen" },
];

test("custom bucket discovery checks exact ZIP names with HEAD and ignores HTML fallback pages", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([url, options.method, options.credentials]);
    if (url.endsWith("sky.zip")) return new Response(null);
    if (url.endsWith("dreamweb-cd.zip")) {
      return new Response(null, { headers: { "content-type": "text/html" } });
    }
    return new Response(null, { status: 403 });
  });

  assert.deepEqual(await checkGameBucket(customUrl, games, officialUrl), ["sky"]);
  assert.deepEqual(requests, ["sky", "dreamweb-cd", "queen"].map((target) =>
    [`${customUrl}/${target}.zip`, "HEAD", "omit"]
  ));
});

test("the official bucket maps unpacked index folders back to their catalog targets", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, `${officialUrl}/index.json`);
    return Response.json({ dreamweb: { "DREAMWEB.C00": {} }, unknown: {} });
  });

  assert.deepEqual(await checkGameBucket(officialUrl, games, officialUrl), ["dreamweb-cd"]);
});

test("saved targets are limited to the current catalog and bucket URLs exclude credentials", () => {
  const saved = JSON.stringify({ url: `${customUrl}/`, targets: ["sky", "unknown", "sky"] });
  assert.deepEqual(readSavedBucket(saved, games), { url: customUrl, targets: ["sky"] });
  assert.throws(() => normalizeBucketUrl("https://user:password@games.example.com"));
  assert.throws(() => normalizeBucketUrl(`${customUrl}?token=abc`));
});

test("bucket play downloads and unpacks the selected ZIP, with a download limit", async (t) => {
  const zip = new ZipWriter(new BlobWriter());
  await zip.add("sky/sky.dnr", new Uint8ArrayReader(Uint8Array.of(1, 2, 3)));
  const archive = await zip.close();
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === `${customUrl}/sky.zip`) return new Response(archive);
    assert.equal(url, `${customUrl}/queen.zip`);
    return new Response(new Uint8Array(1), {
      headers: { "content-length": String(maxArchiveSize + 1) },
    });
  });

  assert.deepEqual(await readBucketGameArchive(customUrl, "sky"), [
    { path: "sky.dnr", data: Uint8Array.of(1, 2, 3) },
  ]);
  await assert.rejects(readBucketGameArchive(customUrl, "queen"), /128 MiB/);
});

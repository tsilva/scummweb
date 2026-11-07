const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

// The browser resolves artwork URLs and widths. Publication and verification
// tools read the complete inventory directly from disk.
module.exports = function artworkBrowserLoader() {
  // The resource path can be virtual in hosted builds. This loader is on disk.
  const manifest = resolve(__dirname, "../data/artwork-storage.json");
  this.addDependency(manifest);
  const { published, origin, files, images } = JSON.parse(readFileSync(manifest, "utf8"));
  if (this.getOptions?.().defer) {
    return `export default ${JSON.stringify({ published, origin, files: {}, deferred: true })};`;
  }
  const deliveryFiles = Object.fromEntries(Object.entries(files).map(([name, { key, width, sha256 }]) => {
    const filename = name.slice(name.lastIndexOf("/") + 1);
    const address = key === `artwork/${sha256}/${filename}` ? { hash: sha256 } : { key };
    return [name, { ...address, width }];
  }));
  // Parse data as JSON instead of compiling thousands of JavaScript literals.
  const data = JSON.stringify({ published, origin, files: deliveryFiles, images });
  return `export default JSON.parse(${JSON.stringify(data)});`;
};

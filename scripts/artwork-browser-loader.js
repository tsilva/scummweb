const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

// The browser resolves artwork URLs and widths. Publication and verification
// tools read the complete inventory directly from disk.
module.exports = function artworkBrowserLoader() {
  const manifest = resolve(dirname(this.resourcePath), "../data/artwork-storage.json");
  this.addDependency(manifest);
  const { published, origin, files, images } = JSON.parse(readFileSync(manifest, "utf8"));
  const deliveryFiles = Object.fromEntries(
    Object.entries(files).map(([name, { key, width }]) => [name, { key, width }]),
  );
  return `export default ${JSON.stringify({ published, origin, files: deliveryFiles, images })};`;
};

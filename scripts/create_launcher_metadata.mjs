import fs from "node:fs/promises";

const [iniPath, outPath] = process.argv.slice(2);

if (!iniPath || !outPath) {
  throw new Error("usage: create_launcher_metadata.mjs <scummvm.ini> <out.json>");
}

const iniText = await fs.readFile(iniPath, "utf8");
const sections = [];
let current = null;

for (const line of iniText.split(/\r?\n/)) {
  const sectionMatch = line.match(/^\[([^\]]+)\]$/);
  if (sectionMatch) {
    current = { name: sectionMatch[1], values: {} };
    sections.push(current);
    continue;
  }
  if (!current) continue;
  const kvMatch = line.match(/^([^=]+)=(.*)$/);
  if (kvMatch) {
    current.values[kvMatch[1].trim()] = kvMatch[2].trim();
  }
}

const gameSection = sections.find((section) => section.values.engineid === "sky");

if (!gameSection) {
  throw new Error("No sky engine game entry found in scummvm.ini");
}

const metadata = {
  target: gameSection.name,
  title: gameSection.values.description || "Beneath a Steel Sky",
  path: gameSection.values.path || "/games/bass-cd-1.2",
};

await fs.writeFile(outPath, JSON.stringify(metadata, null, 2) + "\n");

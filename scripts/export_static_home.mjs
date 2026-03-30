import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const inputPath = path.join(rootDir, ".next", "server", "app", "index.html");
const outputPath = path.join(rootDir, "public", "home-static.html");

let html = await fs.readFile(inputPath, "utf8");

const replacements = [
  [/<link rel="preload" href="\/_next\/static\/media\/[^"]+" as="font"[^>]*\/>/g, ""],
  [/<link rel="stylesheet" href="\/_next\/static\/css\/[^"]+"[^>]*\/>/g, ""],
  [/<link rel="preload" as="script"[^>]*\/>/g, ""],
  [/<script\b[\s\S]*?<\/script>/g, ""],
  [/\sclass="__variable_[^"]+(?: __variable_[^"]+)?"/g, ""],
  [
    /font-family: var\(--font-body\), sans-serif;/g,
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;',
  ],
  [
    /font-family: var\(--font-display\), sans-serif;/g,
    'font-family: "Arial Narrow", "Avenir Next Condensed", "Trebuchet MS", sans-serif;',
  ],
  [/<meta name="next-size-adjust"\/>/g, ""],
];

for (const [pattern, replacement] of replacements) {
  html = html.replace(pattern, replacement);
}

await fs.writeFile(outputPath, html);
console.log(`Wrote ${outputPath}`);

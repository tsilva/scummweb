import { readFile } from "node:fs/promises";
import swc from "next/dist/build/swc/index.js";

await swc.loadBindings();

for (const filename of process.argv.slice(2)) {
  const source = await readFile(filename, "utf8");
  try {
    await swc.transform(source, {
      filename,
      swcrc: false,
      configFile: false,
      jsc: { parser: { syntax: "ecmascript", jsx: true } },
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

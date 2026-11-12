import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("Castle Master web demo selects the prince while other native selectors remain available", async (t) => {
  const patch = await readFile(new URL("../patches/scummvm/97-start-castle-master-demo-as-prince.patch", import.meta.url), "utf8");
  const selection = patch.split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-castle-prince-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <string>
struct Config {
  std::string target;
  int boot = 0;
  const std::string &getActiveDomainName() const { return target; }
  int getInt(const char *) const { return boot; }
} ConfMan;
struct CastleEngine {
  bool dos = true;
  bool _selectedPrincess = true;
  int prompts = 0;
  bool isDOS() const { return dos; }
  void selectCharacterScreen() {
${selection}
    ++prompts;
  }
};
int main() {
  for (int boot : {0, 1}) {
    ConfMan.boot = boot;
    for (bool dos : {false, true}) {
      for (const char *target : {"castlemaster-demo", "castlemaster", "castlemaster2"}) {
        ConfMan.target = target;
        CastleEngine engine;
        engine.dos = dos;
        engine.selectCharacterScreen();
        bool automatic = false;
#ifdef __EMSCRIPTEN__
        automatic = dos && ConfMan.target == "castlemaster-demo";
#endif
        assert(engine.prompts == (automatic ? 0 : 1));
        assert(engine._selectedPrincess == !automatic);
      }
    }
  }
}
`);
  for (const web of [false, true]) {
    const binary = path.join(directory, web ? "web" : "desktop");
    const compile = spawnSync("c++", ["-std=c++11", ...(web ? ["-D__EMSCRIPTEN__"] : []), path.join(directory, "test.cpp"), "-o", binary], { encoding: "utf8" });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(binary, [], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
});

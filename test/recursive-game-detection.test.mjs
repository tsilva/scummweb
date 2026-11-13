import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("web autostart finds nested data and launches its detected directory, preserving root and desktop behavior", async (t) => {
  const patch = await readFile(new URL("../patches/scummvm/101-recursive-web-autodetection.patch", import.meta.url), "utf8");
  // Compile the actual patched functions from retained unified-diff context.
  const source = patch.split("\n").filter((line) => line.startsWith(" ") || line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const detection = source.slice(source.indexOf("static DetectedGames recListGames("), source.indexOf("static int recAddGames("));
  const autostart = source.split('} else if (command == "auto-detect") {')[1].split('} else if (command == "detect") {')[0];
  assert.ok(detection.includes("*detectedPath = candidates[0].path"));
  assert.ok(autostart.includes('settings["path"] = path.toConfig()'));
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-recursive-detection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = `
#include <cassert>
#include <cstdio>
#include <map>
#include <string>
#include <vector>
namespace Common {
using String = std::string;
struct Path {
  enum { kNativeSeparator = 0 };
  String value;
  Path() {} Path(const char *s):value(s) {} Path(String s):value(s) {}
  bool empty() const { return value.empty(); }
  String toString(int) const { return value; }
  String toConfig() const { return value; }
  static Path fromConfig(String s) { return Path(s); }
};
struct FSNode;
using FSList = std::vector<FSNode>;
std::map<String, std::vector<String>> children;
struct FSNode {
  enum { kListDirectoriesOnly };
  Path path; FSNode(Path p):path(p) {}
  Path getPath() const { return path; }
  void getChildren(FSList &out, int) const {
    for (const auto &p : children[path.value]) out.push_back(FSNode(Path(p)));
  }
};
enum { kUnknownError = 1, kNoGameDataFoundError = 2 };
}
struct Game { Common::String engineId, gameId, description; Common::Path path; };
using DetectedGames = std::vector<Game>;
std::map<Common::String, DetectedGames> games;
std::vector<Common::String> reads;
DetectedGames getGameList(const Common::FSNode &dir) { reads.push_back(dir.path.value); return games[dir.path.value]; }
Common::String buildQualifiedGameName(Common::String e, Common::String g) { return e + ":" + g; }
${detection}
std::map<Common::String, Common::String> settings;
struct { Common::String engineId, gameId; } gameOption;
Common::String command;
int err = 0;
const int cmdDoExit = 1;
int autostart() {
${autostart}
  return 0;
}
int main() {
  Common::children["/local-game"] = {"/local-game/SUPPORT", "/local-game/DATA"};
  Common::children["/local-game/DATA"] = {"/local-game/DATA/VIDEO"};
  games["/local-game/DATA"] = {{"scumm", "ft", "Full Throttle", "/local-game/DATA"}};
  auto launch = [](bool recursive) {
    settings["path"] = "/local-game"; settings["recursive"] = recursive ? "true" : "false";
    command = "auto-detect"; err = 0; reads.clear(); return autostart();
  };
  // Merely accepting the recursive flag is insufficient: launch must use DATA.
#ifdef __EMSCRIPTEN__
  assert(launch(true) == 0);
  assert(command == "scumm:ft" && settings["path"] == "/local-game/DATA");
  gameOption.engineId = "sky"; gameOption.gameId = "sky";
  assert(launch(true) == cmdDoExit && err == Common::kNoGameDataFoundError);
  assert(settings["path"] == "/local-game");
  gameOption.engineId.clear(); gameOption.gameId.clear();
#else
  assert(launch(true) == cmdDoExit && err == Common::kUnknownError);
  assert(reads.empty());
#endif
  assert(launch(false) == cmdDoExit && err == Common::kNoGameDataFoundError);
  games["/local-game"] = {{"sky", "sky", "Root game", "/local-game"}};
  assert(launch(false) == 0 && command == "sky:sky");
#ifdef __EMSCRIPTEN__
  assert(launch(true) == 0 && command == "sky:sky");
  assert(reads.size() == 1 && settings["path"] == "/local-game");
#endif
  // Ordinary recursive detection still lists root and nested games.
  assert(recListGames(Common::FSNode(Common::Path("/local-game")), "", "", true).size() == 2);
  games.clear();
#ifdef __EMSCRIPTEN__
  assert(launch(true) == cmdDoExit && err == Common::kNoGameDataFoundError);
  assert(settings["path"] == "/local-game");
#endif
}
`;
  await writeFile(path.join(directory, "test.cpp"), fixture);
  for (const web of [false, true]) {
    const binary = path.join(directory, web ? "web" : "desktop");
    const compile = spawnSync("c++", ["-std=c++11", ...(web ? ["-D__EMSCRIPTEN__"] : []), path.join(directory, "test.cpp"), "-o", binary], { encoding: "utf8" });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(binary, [], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
});

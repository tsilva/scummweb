import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("Nippon's hosted startup loader cancels safely and restores without starting a new story", async (t) => {
  const patch = await readFile(new URL("../patches/scummvm/99-route-nippon-load-to-player-menu.patch", import.meta.url), "utf8");
  const source = patch.split("\n").filter((line) => line.startsWith(" ") || (line.startsWith("+") && !line.startsWith("+++")))
    .map((line) => line.slice(1)).join("\n");
  const state = source.match(/class LoadGameInputState_NS[\s\S]*?\n};/)[0];
  const capabilities = source.match(/bool Parallaction::canLoadGameStateCurrently[\s\S]*?\n}\n\nbool Parallaction::canSaveGameStateCurrently[\s\S]*?\n}/)[0];
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-nippon-load-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <cstring>
#include <string>
#define __EMSCRIPTEN__ 1
namespace Common { struct U32String {}; }
enum { GType_Nippon = 1, kEngineChangeLocation = 1, kEngineWalking = 2 };
int g_engineFlags = 0;
bool hosted = true, open = false;
int requests = 0;
bool bridge(const char *code) {
  if (std::strstr(code, "RequestPlayerMenu")) {
    if (!hosted) return false;
    assert(std::strstr(code, "load"));
    ++requests; open = true; return true;
  }
  return open;
}
#define EM_ASM_INT(...) bridge(#__VA_ARGS__)
int scumm_stricmp(const char *a, const char *b) { return std::strcmp(a, b); }
struct Input { enum { kInputModeMenu, kInputModeGame }; int _inputMode = kInputModeMenu; };
struct SaveLoad {
  int calls = 0; bool result = false;
  bool loadGame() { ++calls; return result; }
};
struct Parallaction {
  bool _scummwebStartupLoad = false;
  Input input; Input *_input = &input;
  SaveLoad saveLoad; SaveLoad *_saveLoad = &saveLoad;
  struct { void *_ani = nullptr; } _char;
  struct { const char *_name = "test"; } _location;
  std::string scheduled;
  int getGameType() { return GType_Nippon; }
  bool canLoadGameStateCurrently(Common::U32String * = nullptr);
  bool canSaveGameStateCurrently(Common::U32String * = nullptr);
  void scheduleLocationSwitch(const char *location) { scheduled = location; }
};
${capabilities}
struct MenuInputHelper;
struct MenuInputState {
  MenuInputHelper *_helper;
  MenuInputState(const char *, MenuInputHelper *h) : _helper(h) {}
  virtual ~MenuInputState() {}
  virtual MenuInputState *run() = 0;
  virtual void enter() = 0;
};
struct MenuInputHelper {
  MenuInputState *selection = nullptr;
  MenuInputState *getState(const char *name) { assert(std::string(name) == "selectgame"); return selection; }
};
${state}
int main() {
  Parallaction vm;
  MenuInputHelper helper;
  LoadGameInputState_NS loader(&vm, &helper), selection(&vm, &helper);
  helper.selection = &selection;
  assert(!vm.canLoadGameStateCurrently());
  loader.enter();
  assert(requests == 1 && vm.saveLoad.calls == 0 && vm._scummwebStartupLoad);
  assert(loader.run() == &loader && vm.canLoadGameStateCurrently() && !vm.canSaveGameStateCurrently());
  open = false;
  assert(loader.run() == &selection && !vm._scummwebStartupLoad && vm.scheduled.empty());
  loader.enter();
  assert(requests == 2);
  // Native deserialization schedules a saved location, never the default intro.
  vm.scheduled = "saved.donna";
  g_engineFlags = kEngineChangeLocation;
  assert(loader.run() == nullptr && !vm._scummwebStartupLoad && vm.scheduled == "saved.donna");
  g_engineFlags = 0; vm.scheduled.clear(); open = false;
  hosted = false;
  loader.enter();
  assert(vm.saveLoad.calls == 1 && loader.run() == nullptr && vm.scheduled == "fogne.dough");
  vm.scheduled.clear(); vm.saveLoad.result = true;
  loader.enter();
  assert(vm.saveLoad.calls == 2 && loader.run() == nullptr && vm.scheduled.empty());
  vm._char._ani = &vm; vm.input._inputMode = Input::kInputModeGame;
  assert(vm.canLoadGameStateCurrently() && vm.canSaveGameStateCurrently());
  vm._location._name = "caveau";
  assert(vm.canLoadGameStateCurrently() && !vm.canSaveGameStateCurrently());
  g_engineFlags = kEngineWalking;
  assert(!vm.canLoadGameStateCurrently() && !vm.canSaveGameStateCurrently());
}
`);
  const binary = path.join(directory, "test");
  const compile = spawnSync("c++", ["-std=c++11", path.join(directory, "test.cpp"), "-o", binary], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync(binary, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

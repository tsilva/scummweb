import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("native Nippon portraits select the correct stories and release their graphics", async (t) => {
  const patch = await readFile(new URL("../patches/scummvm/95-select-nippon-character-without-manual.patch", import.meta.url), "utf8");
  const additions = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const menu = additions.match(/class SelectCharacterInputState_NS[\s\S]*?\n};/)[0];
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-nippon-selector-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Exercise the shipped C++ state with observable native input and graphics.
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <cstring>
#include <string>
#include <vector>
using uint = unsigned int;
using uint16 = unsigned short;
int liveObjects = 0;
namespace Common {
struct Point {
  int x = 0, y = 0;
  bool operator!=(const Point &p) const { return x != p.x || y != p.y; }
};
struct Rect {
  int left = 0, top = 0, right = 48, bottom = 88;
  bool contains(const Point &p) const { return p.x >= left && p.x < right && p.y >= top && p.y < bottom; }
  void moveTo(int x, int y) { right += x - left; bottom += y - top; left = x; top = y; }
  void grow(int n) { left -= n; top -= n; right += n; bottom += n; }
};
enum { KEYCODE_ESCAPE = 27, KEYCODE_TAB = 9, KEYCODE_RETURN = 13, KEYCODE_SPACE = 32 };
}
namespace Graphics {
struct Surface {
  int outlines = 0;
  void copyFrom(const Surface &s) { outlines = s.outlines; }
  void frameRect(const Common::Rect &, int) { ++outlines; }
  void free() {}
};
}
struct GfxObj {
  uint frame = 0;
  bool visible = true;
  std::string name;
  GfxObj(const char *s) : name(s) { ++liveObjects; }
  ~GfxObj() { --liveObjects; }
  void getRect(int, Common::Rect &r) { r = Common::Rect(); }
};
struct BackgroundInfo { Graphics::Surface bg; };
enum { kMouseLeftUp = 1, MOUSE_ENABLED_SHOW = 1, kBackgroundSlide = 2, CENTER_LABEL_HORIZONTAL = -1 };
struct Gfx {
  BackgroundInfo *_backgroundInfo = nullptr;
  std::vector<GfxObj *> items;
  ~Gfx() { delete _backgroundInfo; }
  void freeDialogueObjects() { items.clear(); }
  void unregisterLabel(GfxObj *) {}
  void showGfxObj(GfxObj *o, bool visible) { o->visible = visible; }
  void setBlackPalette() {}
  void beginFrame() {}
  void setBackground(int, BackgroundInfo *b) { delete _backgroundInfo; _backgroundInfo = b; }
  GfxObj *loadAnim(const char *s) { return new GfxObj(s); }
  void setItem(GfxObj *o, int, int) { items.push_back(o); }
  GfxObj *createLabel(void *, const char *s, int) { return new GfxObj(s); }
  void showLabel(GfxObj *, int, int) {}
};
struct Input {
  Common::Point pos;
  int button = 0;
  uint16 key = 0;
  void getCursorPos(Common::Point &p) { p = pos; }
  int getLastButtonEvent() { return button; }
  bool getLastKeyDown(uint16 &k) { k = key; return key != 0; }
  void setArrowCursor() {}
  void setMouseState(int) {}
};
struct Sound { void stopMusic() {} };
struct Disk {
  std::string archive = "disk4";
  void selectArchive(const char *s) { archive = s; }
  void loadScenery(BackgroundInfo &, const char *s, void *, void *) {
    assert(archive == "disk1"); assert(std::string(s) == "test");
  }
};
struct Parallaction_ns {
  Gfx gfx; Input input; Sound sound; Disk disk;
  Gfx *_gfx = &gfx; Input *_input = &input; Sound *_soundManI = &sound; Disk *_disk = &disk;
  void *_introFont = nullptr;
  bool quit = false;
  int language = 2, cleaned = 0;
  std::string location;
  bool shouldQuit() { return quit; }
  int getInternLanguage() { return language; }
  void cleanupGame() { assert(liveObjects == 0 && gfx.items.empty()); ++cleaned; }
  void scheduleLocationSwitch(const char *s) { location = s; }
};
struct MenuInputHelper {};
struct MenuInputState {
  MenuInputState(const char *, MenuInputHelper *) {}
  virtual ~MenuInputState() {}
  virtual MenuInputState *run() = 0;
  virtual void enter() = 0;
};
namespace ScummWebIntro { int interactive = 0; void gameplayStarted() { ++interactive; } }
${menu}
int main() {
  const char *stories[] = { "test.donna", "test.dough", "test.dino" };
  const char *faces[] = { "donnaf", "doughf", "dinof" };
  const int xs[] = { 60, 140, 221 };
  const uint nameFrames[] = { 1, 0, 2 };
  for (int choice = 0; choice < 3; ++choice) {
      Parallaction_ns vm;
      SelectCharacterInputState_NS selector(&vm, nullptr);
      selector.enter();
      assert(liveObjects == 5 && vm.gfx.items.size() == 4);
      for (int i = 0; i < 3; ++i) assert(vm.gfx.items[i]->name == faces[i]);
      vm.input.pos.x = xs[choice] + 24; vm.input.pos.y = 132;
      assert(selector.run() == &selector);
      assert(vm.gfx.items[3]->visible && vm.gfx.items[3]->frame == nameFrames[choice]);
      assert(vm.gfx._backgroundInfo->bg.outlines == 1);
      vm.input.button = kMouseLeftUp;
      assert(selector.run() == nullptr);
      assert(vm.location == stories[choice] && vm.cleaned == 1 && liveObjects == 0);
  }
  for (int language = 0; language < 4; ++language) {
    Parallaction_ns vm; vm.language = language;
    SelectCharacterInputState_NS selector(&vm, nullptr); selector.enter();
    // Outside clicks, including the exclusive right/bottom edges, never start.
    const int points[][2] = { {0,0}, {108,132}, {164,176}, {210,132}, {269,132} };
    vm.input.button = kMouseLeftUp;
    for (const auto &p : points) {
      vm.input.pos.x = p[0]; vm.input.pos.y = p[1];
      assert(selector.run() == &selector && vm.location.empty());
    }
    vm.input.button = 0;
    vm.input.key = Common::KEYCODE_RETURN;
    assert(selector.run() == &selector && vm.location.empty());
    // Static pointer positions cannot undo keyboard focus on the next frame.
    vm.input.key = Common::KEYCODE_TAB; selector.run();
    assert(vm.gfx.items[3]->visible && vm.gfx.items[3]->frame == 1);
    vm.input.key = 0; selector.run(); assert(vm.gfx.items[3]->visible);
    vm.input.key = Common::KEYCODE_ESCAPE; selector.run();
    assert(!vm.gfx.items[3]->visible);
    vm.input.key = Common::KEYCODE_SPACE; selector.run(); assert(vm.location.empty());
    vm.input.key = '3'; selector.run();
    assert(vm.gfx.items[3]->frame == 2);
    vm.input.key = Common::KEYCODE_TAB; selector.run();
    assert(vm.gfx.items[3]->frame == 1); // wraps to Donna
    vm.input.key = Common::KEYCODE_RETURN;
    assert(selector.run() == nullptr && vm.location == stories[0]);
  }
  {
    Parallaction_ns vm;
    SelectCharacterInputState_NS selector(&vm, nullptr); selector.enter();
    vm.quit = true; vm.input.button = kMouseLeftUp;
    vm.input.pos.x = 160; vm.input.pos.y = 132;
    assert(selector.run() == nullptr && vm.location.empty());
  }
  assert(liveObjects == 0 && ScummWebIntro::interactive == 8);
}
`);
  const executable = path.join(directory, "test");
  const compiler = process.env.CXX || "c++";
  const build = spawnSync(compiler, ["-std=c++11", path.join(directory, "test.cpp"), "-o", executable], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || build.error?.message);
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

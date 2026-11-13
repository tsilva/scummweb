import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native compatibility notices defer only to an opted-in host and preserve native fallback", async (t) => {
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).error) return t.skip("C++ compiler unavailable");
  const original = await readFile(new URL("../patches/scummvm/23-defer-browser-startup-warnings.patch", import.meta.url), "utf8");
  const extended = await readFile(new URL("../patches/scummvm/99zz-defer-engine-compatibility-warnings.patch", import.meta.url), "utf8");
  const additions = (patch) => patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const defer = additions(original).match(/inline bool deferCompatibilityWarning[^]*?\n\}/)?.[0];
  const show = additions(extended).match(/inline void showCompatibilityWarning[^]*?\n\}/)?.[0];
  assert.ok(defer && show);
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-warnings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <string>
#include <vector>
bool hosted = false;
std::vector<std::string> forwarded, modal;
namespace Common {
enum { kUtf8 };
using String = std::string;
struct U32String : std::string {
  using std::string::string;
  String encode(int) const { return *this; }
};
}
int forward(const char *text) {
  if (!hosted) return 0;
  forwarded.push_back(text);
  return 1;
}
#define EM_ASM_INT(code, text) forward(text)
namespace GUI {
struct MessageDialog {
  Common::U32String text;
  MessageDialog(const Common::U32String &value) : text(value) {}
  int runModal() { modal.push_back(text); return 0; }
};
}
namespace ScummWebStartup {
${defer}
${show}
}
int main() {
  const Common::U32String subtitles = "King's Quest VII: unfinished subtitles.\\nÉdition française.";
  ScummWebStartup::showCompatibilityWarning(subtitles);
  assert(modal.size() == 1 && modal[0] == subtitles && forwarded.empty());
  hosted = true;
  ScummWebStartup::showCompatibilityWarning(subtitles);
  ScummWebStartup::showCompatibilityWarning("Optional MIDI instruments missing.");
#ifdef __EMSCRIPTEN__
  assert(modal.size() == 1 && forwarded.size() == 2);
  assert(forwarded[0] == subtitles && forwarded[1] == "Optional MIDI instruments missing.");
#else
  assert(modal.size() == 3 && forwarded.empty());
  assert(modal[1] == subtitles && modal[2] == "Optional MIDI instruments missing.");
#endif
}
`);
  for (const flags of [[], ["-D__EMSCRIPTEN__"]]) {
    const binary = path.join(directory, flags.length ? "web" : "native");
    const compile = spawnSync(compiler, ["-std=c++11", ...flags, path.join(directory, "test.cpp"), "-o", binary], { encoding: "utf8" });
    assert.equal(compile.status, 0, compile.stderr);
    const run = spawnSync(binary, [], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
  }
});

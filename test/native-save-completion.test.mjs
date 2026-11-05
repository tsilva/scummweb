import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native save owner finalizes, closes and only then reports success or failure", async (t) => {
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).error) return t.skip("C++ compiler unavailable");
  const patch = await readFile(new URL("../patches/scummvm/15-publish-completed-browser-saves.patch", import.meta.url), "utf8");
  const additions = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const owner = additions.match(/class ScummwebSaveFile[\s\S]*?\n};/)[0];
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-save-owner-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Compile the actual shipped owner against an observable output stream.
  // This verifies destructor-only engine saves without emulating its lifecycle.
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <string>
#include <vector>
std::vector<std::string> events;
bool result;
namespace Common {
using String = std::string;
class WriteStream {
public:
  virtual ~WriteStream() {}
  virtual void finalize() = 0;
  virtual bool err() const = 0;
};
class OutSaveFile : public WriteStream {
protected: WriteStream *_wrapped;
public:
  OutSaveFile(WriteStream *stream) : _wrapped(stream) {}
  ~OutSaveFile() override { delete _wrapped; }
  void finalize() override { _wrapped->finalize(); }
  bool err() const override { return _wrapped->err(); }
};
}
void scummwebFinishSave(const Common::String &name, bool success) {
  assert(name == "lure.001");
  assert(events.back() == "closed");
  events.push_back("reported"); result = success;
}
${owner}
class Output : public Common::WriteStream {
  bool _fail, _error;
public:
  Output(bool fail, bool error) : _fail(fail), _error(error) {}
  ~Output() override { events.push_back("closed"); }
  void finalize() override { events.push_back("finalized"); _error = _error || _fail; }
  bool err() const override { return _error; }
};
int main() {
  for (int mode = 0; mode < 4; ++mode) {
    events.clear();
    auto *save = new ScummwebSaveFile(new Output(mode == 2, mode == 3), "lure.001");
    if (mode == 1) save->finalize();
    delete save;
    assert(result == (mode < 2));
    assert(events[0] == "finalized");
    assert(events[events.size()-2] == "closed");
    assert(events.back() == "reported");
  }
}
`);
  const executable = path.join(directory, "test");
  const build = spawnSync(compiler, ["-std=c++11", path.join(directory, "test.cpp"), "-o", executable], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

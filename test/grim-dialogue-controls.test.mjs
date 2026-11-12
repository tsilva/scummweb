import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("native GrimE choices recognize dialogue objects and functions while speech and missing handlers stay inactive", async (t) => {
  const patch = await readFile(new URL("../patches/scummvm/98-expose-grim-dialogue-choices.patch", import.meta.url), "utf8");
  const additions = patch.split("\n").filter((line) => (line.startsWith("+") && !line.startsWith("+++")) || line.startsWith(" "))
    .map((line) => line.slice(1)).join("\n");
  const helper = additions.match(/static void publishDialogueChoices\(\) {[\s\S]*?\n}/)[0];
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-dialogue-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <map>
#include <string>
using uint = unsigned int;
struct Object {
  bool function = false;
  std::map<std::string, Object *> fields;
};
using lua_Object = Object *;
Object systemTable, dialog, chooser, speech;
bool enabled = true, published = true;
int blocks = 0;
bool lua_istable(Object *o) { return o && !o->function; }
bool lua_isfunction(Object *o) { return o && o->function; }
Object *luaA_Address(Object *o) { return o; }
bool luaO_equalObj(Object *a, Object *b) { return a == b; }
Object *lua_rawgetglobal(const char *name) { return std::string(name) == "system" ? &systemTable : &dialog; }
Object *storyField(Object *o, const char *key) { return lua_istable(o) ? o->fields[key] : nullptr; }
void lua_beginblock() { ++blocks; }
void lua_endblock() { --blocks; }
#define EM_ASM_INT(...) enabled
#define EM_ASM(...) published = active
${helper}
int main() {
  chooser.function = speech.function = true;
  dialog.fields["buttonHandler"] = &chooser;
  auto check = [](Object *handler, bool expected) {
    systemTable.fields["buttonHandler"] = handler;
    publishDialogueChoices();
    assert(published == expected);
    assert(blocks == 0);
  };
  check(nullptr, false);
  check(&speech, false);
  check(&chooser, true);
  check(&dialog, true);
  Object instance, subclass, unrelated, cyclic;
  instance.fields["parent"] = &subclass;
  subclass.fields["parent"] = &dialog;
  check(&instance, true);
  check(&unrelated, false);
  cyclic.fields["parent"] = &cyclic;
  check(&cyclic, false);
  dialog.fields.erase("buttonHandler");
  check(&speech, false);
  enabled = false;
  published = true;
  check(nullptr, true);
}
`);
  const binary = path.join(directory, "test");
  const compile = spawnSync("c++", ["-std=c++11", path.join(directory, "test.cpp"), "-o", binary], { encoding: "utf8" });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync(binary, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

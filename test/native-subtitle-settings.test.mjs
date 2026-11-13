import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native subtitle controls synchronize cached engines and preserve unavailable editions", async (t) => {
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).error) return t.skip("C++ compiler unavailable");
  const patch = await readFile(new URL("../patches/scummvm/99-subtitle-settings.patch", import.meta.url), "utf8");
  const additions = patch.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).join("\n");
  const bridge = additions.match(/extern "C" EMSCRIPTEN_KEEPALIVE int scummweb_player_subtitles\(int enabled\) \{[\s\S]*?\n\}/)[0];
  const names = ["Sky", "Drascula", "AGOS", "Grim", "Tinsel", "Toltecs", "Tucker"];
  const adapters = names.map((name) => additions.match(new RegExp(`void ${name}Engine::applyGameSettings\\(\\) \\{[\\s\\S]*?\\n\\}`))[0]).join("\n");
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-subtitles-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <cassert>
#include <map>
#include <string>
#define EMSCRIPTEN_KEEPALIVE
bool hosted = true;
#define EM_ASM_INT(...) hosted
namespace Common {
using String = std::string;
enum Language { EN_ANY, DE_DEU, FR_FRA };
bool checkGameGUIOption(const String &option, const String &options) { return options.find(option) != String::npos; }
}
const char *GUIO_NOSUBTITLES = "no-subs", *GUIO_NOSPEECH = "no-speech";
struct Config {
  std::map<std::string, bool> values;
  std::string options;
  bool getBool(const std::string &key) { return values[key]; }
  void setBool(const std::string &key, bool value) { values[key] = value; }
  std::string get(const std::string &) { return options; }
} ConfMan;
struct Engine {
  int applied = 0, synced = 0;
  virtual ~Engine() {}
  void *getMetaEngine() { return this; }
  virtual void applyGameSettings() { ++applied; }
  void syncSoundSettings() { ++synced; }
} *g_engine = nullptr;
${bridge}
enum { SF_ALLOW_TEXT = 1, SF_ALLOW_SPEECH = 2, GF_TALKIE = 4, GType_PP = 5, GType_SIMON1 = 6, kGameFlagNoSubtitles = 8 };
struct SkyEngine : Engine {
  struct Vars { int systemFlags = 16; } vars, *_systemVars = &vars;
  bool cd = true;
  bool isCDVersion() { return cd; }
  void applyGameSettings() override;
};
struct DrasculaEngine : Engine { bool _subtitlesDisabled = true; void applyGameSettings() override; };
struct AGOSEngine : Engine {
  bool _subtitles = false, _speech = true;
  int features = GF_TALKIE, type = 0;
  Common::Language _language = Common::FR_FRA;
  int getFeatures() { return features; } int getGameType() { return type; }
  void applyGameSettings() override;
};
struct Registry { int speech = 0; void setInt(const char *, int value) { speech = value; } } registry, *g_registry = &registry;
struct GrimEngine : Engine {
  enum { TextOnly = 1, VoiceOnly = 2, TextAndVoice = 3 };
  int _speechMode = TextAndVoice;
  void applyGameSettings() override;
};
struct TinselEngine : Engine {
  struct Settings { int reads = 0; void readFromDisk() { ++reads; } } config, *_config = &config;
  void applyGameSettings() override;
};
struct ToltecsEngine : Engine { bool _cfgText = true, _cfgVoices = true; void applyGameSettings() override; };
struct TuckerEngine : Engine { int _gameFlags = 0; bool _displaySpeechText = true; void applyGameSettings() override; };
${adapters}
int main() {
  assert(scummweb_player_subtitles(-1) == -1);
  Engine plain; g_engine = &plain;
  ConfMan.setBool("subtitles", true); ConfMan.setBool("speech_mute", true);
  assert(scummweb_player_subtitles(-1) == 1);
  assert(plain.applied == 0 && plain.synced == 0);
  for (const auto &options : {"no-subs", "no-speech"}) {
    ConfMan.options = options;
    assert(scummweb_player_subtitles(0) == -1);
    assert(ConfMan.getBool("subtitles"));
  }
  ConfMan.options.clear(); hosted = false;
  assert(scummweb_player_subtitles(0) == -1);
  hosted = true;
  assert(scummweb_player_subtitles(0) == 0);
  assert(!ConfMan.getBool("speech_mute"));
  assert(plain.applied == 1 && plain.synced == 1);
  assert(scummweb_player_subtitles(42) == 0 && plain.synced == 1);
  SkyEngine sky; DrasculaEngine drascula; AGOSEngine agos; GrimEngine grim;
  TinselEngine tinsel; ToltecsEngine toltecs; TuckerEngine tucker;
  Engine *engines[] = {&sky, &drascula, &agos, &grim, &tinsel, &toltecs, &tucker};
  for (bool enabled : {true, false, true}) {
    for (Engine *engine : engines) {
      g_engine = engine;
      assert(scummweb_player_subtitles(enabled) == enabled);
    }
    assert(bool(sky.vars.systemFlags & SF_ALLOW_TEXT) == enabled);
    assert((sky.vars.systemFlags & (16 | SF_ALLOW_SPEECH)) == (16 | SF_ALLOW_SPEECH));
    assert(drascula._subtitlesDisabled == !enabled);
    assert(agos._subtitles == enabled && agos._speech);
    assert(grim._speechMode == (enabled ? GrimEngine::TextAndVoice : GrimEngine::VoiceOnly));
    assert(registry.speech == grim._speechMode);
    assert(toltecs._cfgText == enabled && toltecs._cfgVoices);
    assert(tucker._displaySpeechText == enabled);
  }
  assert(tinsel.config.reads == 3);
  ConfMan.setBool("subtitles", false); sky.cd = false; sky.vars.systemFlags |= SF_ALLOW_TEXT;
  sky.applyGameSettings(); assert(sky.vars.systemFlags & SF_ALLOW_TEXT);
  ConfMan.setBool("subtitles", true); agos._subtitles = false; agos._language = Common::EN_ANY; agos.type = GType_SIMON1;
  agos.applyGameSettings(); assert(!agos._subtitles);
  agos._language = Common::FR_FRA; agos.type = GType_PP;
  agos.applyGameSettings(); assert(!agos._subtitles);
  tucker._gameFlags = kGameFlagNoSubtitles;
  tucker.applyGameSettings(); assert(!tucker._displaySpeechText);
}
`);
  const executable = path.join(directory, "test");
  const build = spawnSync(compiler, ["-std=c++11", path.join(directory, "test.cpp"), "-o", executable], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

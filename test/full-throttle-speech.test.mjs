import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const patchUrl = new URL("../patches/scummvm/100-full-throttle-flac-speech.patch", import.meta.url);

test("FT FLAC lines retain PCM, mouth tags and original seek offsets for digital iMUSE", async (t) => {
  const compiler = process.env.CXX || "c++";
  if (spawnSync(compiler, ["--version"]).error) return t.skip("C++ compiler unavailable");
  const patch = await readFile(patchUrl, "utf8");
  const section = patch.split("diff --git a/engines/scumm/scummweb_ft_speech.h ")[1].split("diff --git ")[0];
  const header = section.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)).filter((line) => !line.startsWith("#include")).join("\n");
  const directory = await mkdtemp(path.join(tmpdir(), "scummweb-ft-speech-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, "test.cpp"), `
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <vector>
using byte = uint8_t; using uint32 = uint32_t; using int16 = int16_t; using int64 = int64_t;
#define ARRAYSIZE(a) (sizeof(a) / sizeof((a)[0]))
#define MKTAG(a,b,c,d) ((uint32(a)<<24)|(uint32(b)<<16)|(uint32(c)<<8)|uint32(d))
void WRITE_BE_UINT32(byte *p, uint32 n) { for(int i=0;i<4;i++) p[i]=n>>(24-8*i); }
void WRITE_LE_UINT32(byte *p, uint32 n) { for(int i=0;i<4;i++) p[i]=n>>(8*i); }
uint32 be(const byte *p) { return MKTAG(p[0],p[1],p[2],p[3]); }
namespace DisposeAfterUse { enum Flag { NO, YES }; }
namespace Common {
struct MemoryReadStream {
  byte *data; uint32 length, cursor=0; bool ended=false;
  MemoryReadStream(byte *d, uint32 n, DisposeAfterUse::Flag):data(d),length(n) {}
  ~MemoryReadStream() { free(data); }
  int64 pos() const { return cursor; } int64 size() const { return length; }
  bool seek(int64 n, int w) {
    int64 p=(w==SEEK_SET?0:w==SEEK_CUR?cursor:length)+n;
    if(p<0 || p>length) return false; cursor=p; ended=false; return true;
  }
  uint32 read(void *out, uint32 n) { uint32 take=std::min(n,length-cursor); memcpy(out,data+cursor,take); cursor+=take; ended=take<n; return take; }
};
struct MemoryWriteStreamDynamic {
  std::vector<byte> bytes;
  MemoryWriteStreamDynamic(DisposeAfterUse::Flag) {}
  void write(const void *p,uint32 n) { const byte *b=(const byte*)p; bytes.insert(bytes.end(),b,b+n); }
  void writeByte(byte b) { bytes.push_back(b); }
  void writeUint16LE(uint32 n) { writeByte(n); writeByte(n>>8); }
  void writeUint32LE(uint32 n) { for(int i=0;i<4;i++) writeByte(n>>(8*i)); }
  void writeUint32BE(uint32 n) { for(int i=0;i<4;i++) writeByte(n>>(24-8*i)); }
  uint32 size() const { return bytes.size(); } const byte *getData() const { return bytes.data(); }
};
}
namespace Audio {
struct AudioStream {
  int rate=22050; bool stereo=false, stuck=false, drain=false; uint32 remaining=0;
  std::vector<int16> samples; size_t cursor=0;
  virtual ~AudioStream() {}
  bool isStereo() const { return stereo; } int getRate() const { return rate; }
  bool endOfStream() const { return !stuck && !drain && !remaining && cursor==samples.size(); }
  int readBuffer(int16 *out,int n) {
    if(stuck) return 0; if(cursor==samples.size() && !remaining) { drain=false; return 0; }
    if(remaining) { n=std::min(uint32(n),remaining); remaining-=n; std::fill(out,out+n,0); return n; }
    n=std::min(size_t(n),samples.size()-cursor); std::copy(samples.begin()+cursor,samples.begin()+cursor+n,out); cursor+=n; return n;
  }
};
}
namespace Scumm {
struct ScummEngine {};
struct ScummFile {
  std::unique_ptr<Common::MemoryReadStream> _baseStream;
  explicit ScummFile(ScummEngine *) {} virtual ~ScummFile() {}
  virtual int64 pos() const { return _baseStream->pos(); }
  virtual int64 size() const { return _baseStream->size(); }
  virtual bool seek(int64 n,int w=SEEK_SET) { return _baseStream->seek(n,w); }
  uint32 read(void *p,uint32 n) { return _baseStream->read(p,n); }
};
}
${header}
int main() {
  using namespace Scumm;
  ScummEngine vm; byte tags[]={0,1,0,8};
  for(int rate : {11025,22050}) for(bool drain : {false,true}) {
    Audio::AudioStream audio; audio.rate=rate; audio.drain=drain; audio.samples={-32768,-256,0,256,32767};
    std::unique_ptr<ScummFile> file(makeScummWebFTSpeechFile(&vm,audio,tags,4,123456));
    assert(file && file->pos()==123456 && file->size()==123456+58);
    byte record[58]; assert(file->read(record,sizeof(record))==sizeof(record));
    assert(be(record)==MKTAG('V','C','T','L') && be(record+4)==12);
    assert(memcmp(record+8,tags,4)==0);
    assert(be(record+12)==MKTAG('V','T','L','K') && be(record+16)==46);
    assert(memcmp(record+20,"Creative Voice File\\x1a",20)==0);
    assert(record[40]==26 && record[42]==10 && record[43]==1);
    assert(record[46]==1 && record[47]==7 && record[48]==0 && record[49]==0);
    assert(record[50]==(rate==22050?211:165) && record[51]==0);
    const byte pcm[]={0,127,128,129,255};
    assert(memcmp(record+52,pcm,5)==0 && record[57]==0);
    // Restore seeks use the saved original SOU offset plus a relative stream cursor.
    assert(file->seek(123456+20)); byte sample; assert(file->read(&sample,1)==1 && sample=='C');
    assert(file->seek(-1,SEEK_CUR) && file->pos()==123456+20);
    assert(file->seek(0,SEEK_END) && file->pos()==file->size());
    assert(!file->seek(123455) && !file->seek(1,SEEK_END));
  }
  Audio::AudioStream empty; assert(!makeScummWebFTSpeechFile(&vm,empty,tags,4,0));
  Audio::AudioStream invalid; invalid.samples={0}; invalid.stereo=true;
  assert(!makeScummWebFTSpeechFile(&vm,invalid,tags,4,0)); invalid.stereo=false; invalid.rate=44100;
  assert(!makeScummWebFTSpeechFile(&vm,invalid,tags,4,0)); invalid.rate=22050;
  assert(!makeScummWebFTSpeechFile(&vm,invalid,tags,3,0));
  assert(!makeScummWebFTSpeechFile(&vm,invalid,tags,1026,0));
  invalid.stuck=true; assert(!makeScummWebFTSpeechFile(&vm,invalid,tags,4,0));
  Audio::AudioStream oversized; oversized.remaining=8*1024*1024+1;
  assert(!makeScummWebFTSpeechFile(&vm,oversized,tags,4,0));
}
`);
  const executable = path.join(directory, "test");
  const build = spawnSync(compiler, ["-std=c++11", path.join(directory, "test.cpp"), "-o", executable], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr);
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
});

#!/usr/bin/env python3

from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()


def replace_once(text, original, replacement, label):
    if text.count(replacement) == 1:
        return text
    if text.count(original) != 1:
        raise SystemExit(f"Expected one SDL3 {label} hook in {path}")
    return text.replace(original, replacement, 1)


# SDL3 leaves the output buffer untouched if the mixer produces no samples.
# Silence every channel before running the playback callback.
source = replace_once(
    source,
    'SDL3.audio_playback.currentPlaybackBuffer=e["outputBuffer"];dynCall("ii",$2,[$3])',
    'var outputBuffer=e["outputBuffer"];'
    'for(var channel=0;channel<outputBuffer["numberOfChannels"];++channel){'
    'outputBuffer["getChannelData"](channel).fill(0)}'
    'SDL3.audio_playback.currentPlaybackBuffer=outputBuffer;dynCall("ii",$2,[$3])',
    "playback callback",
)

# The address of this EM_ASM block varies with the Wasm build. Match the
# playback copy itself, leaving SDL3's recording path untouched.
source = replace_once(
    source,
    'var numChannels=SDL3.audio_playback.currentPlaybackBuffer["numberOfChannels"];'
    'for(var c=0;c<numChannels;++c){'
    'var channelData=SDL3.audio_playback.currentPlaybackBuffer["getChannelData"](c);'
    'if(channelData.length!=$1){throw"Web Audio playback buffer length mismatch! Destination size: "+channelData.length+" samples vs expected "+$1+" samples!"}'
    'for(var j=0;j<$1;++j){channelData[j]=HEAPF32[buf+(j*numChannels+c)]}}',
    'var outputBuffer=SDL3.audio_playback.currentPlaybackBuffer;'
    'var numChannels=outputBuffer["numberOfChannels"];'
    'var abnormalSamples=0;'
    'for(var c=0;c<numChannels;++c){'
    'var channelData=outputBuffer["getChannelData"](c);'
    'if(channelData.length!=$1){throw"Web Audio playback buffer length mismatch! Destination size: "+channelData.length+" samples vs expected "+$1+" samples!"}'
    'for(var j=0;j<$1;++j){'
    'var sample=HEAPF32[buf+(j*numChannels+c)];'
    'if(!Number.isFinite(sample)){sample=0;++abnormalSamples}'
    'else if(sample>1){if(sample>8){++abnormalSamples}sample=1}'
    'else if(sample<-1){if(sample<-8){++abnormalSamples}sample=-1}'
    'channelData[j]=sample}}'
    'if(abnormalSamples>$1*numChannels/16){'
    'for(var clearChannel=0;clearChannel<numChannels;++clearChannel){'
    'outputBuffer["getChannelData"](clearChannel).fill(0)}}',
    "sample copy",
)

path.write_text(source)

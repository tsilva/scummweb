#!/usr/bin/env python3

from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

audio_process_needle = (
    'SDL2.audio.scriptProcessorNode["onaudioprocess"]=function(e){'
    'if(SDL2===undefined||SDL2.audio===undefined){return}'
    'SDL2.audio.currentOutputBuffer=e["outputBuffer"];dynCall("vi",$2,[$3])};'
)
audio_process_replacement = (
    'SDL2.audio.scriptProcessorNode["onaudioprocess"]=function(e){'
    'if(SDL2===undefined||SDL2.audio===undefined){return}'
    'var outputBuffer=e["outputBuffer"];'
    'for(var channel=0;channel<outputBuffer["numberOfChannels"];++channel){'
    'outputBuffer["getChannelData"](channel).fill(0)}'
    'SDL2.audio.currentOutputBuffer=outputBuffer;dynCall("vi",$2,[$3])};'
)

audio_copy_needle = (
    '6350777:($0,$1)=>{var SDL2=Module["SDL2"];'
    'var numChannels=SDL2.audio.currentOutputBuffer["numberOfChannels"];'
    'for(var c=0;c<numChannels;++c){'
    'var channelData=SDL2.audio.currentOutputBuffer["getChannelData"](c);'
    'if(channelData.length!=$1){throw"Web Audio output buffer length mismatch! Destination size: "+channelData.length+" samples vs expected "+$1+" samples!"}'
    'for(var j=0;j<$1;++j){channelData[j]=HEAPF32[$0+(j*numChannels+c<<2)>>2]}}},'
)
audio_copy_replacement = (
    '6350777:($0,$1)=>{var SDL2=Module["SDL2"];'
    'var outputBuffer=SDL2.audio.currentOutputBuffer;'
    'var numChannels=outputBuffer["numberOfChannels"];'
    'var abnormalSamples=0;'
    'for(var c=0;c<numChannels;++c){'
    'var channelData=outputBuffer["getChannelData"](c);'
    'if(channelData.length!=$1){throw"Web Audio output buffer length mismatch! Destination size: "+channelData.length+" samples vs expected "+$1+" samples!"}'
    'for(var j=0;j<$1;++j){'
    'var sample=HEAPF32[$0+(j*numChannels+c<<2)>>2];'
    'if(!Number.isFinite(sample)){sample=0;++abnormalSamples}'
    'else if(sample>1){if(sample>8){++abnormalSamples}sample=1}'
    'else if(sample<-1){if(sample<-8){++abnormalSamples}sample=-1}'
    'channelData[j]=sample}}'
    'if(abnormalSamples>$1*numChannels/16){'
    'for(var clearChannel=0;clearChannel<numChannels;++clearChannel){'
    'outputBuffer["getChannelData"](clearChannel).fill(0)}}},'
)

if audio_process_needle in text:
    text = text.replace(audio_process_needle, audio_process_replacement, 1)
elif audio_process_replacement not in text:
    raise SystemExit(f"Could not find ScummVM audio process glue in {path}")

if audio_copy_needle in text:
    text = text.replace(audio_copy_needle, audio_copy_replacement, 1)
elif audio_copy_replacement not in text:
    raise SystemExit(f"Could not find ScummVM audio copy glue in {path}")

path.write_text(text)

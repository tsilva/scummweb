#!/usr/bin/env python3
"""Keep optional browser speech support from aborting native initialization."""

from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
patterns = {
    'globalThis["ttsUtteranceQueue"]=[];const refreshVoices=':
        'globalThis["ttsUtteranceQueue"]=[];'
        'if(!window.speechSynthesis||typeof window.speechSynthesis.getVoices!=="function"'
        '||typeof SpeechSynthesisUtterance!=="function"){return}const refreshVoices=',
    'function _ttsStop(){window.speechSynthesis.cancel()}':
        'function _ttsStop(){if(window.speechSynthesis&&typeof window.speechSynthesis.cancel===\"function\"){window.speechSynthesis.cancel()}}',
    'function __asyncjs___ttsPause(){return Asyncify.handleAsync(async()=>{':
        'function __asyncjs___ttsPause(){if(!window.speechSynthesis||typeof window.speechSynthesis.pause!==\"function\"){return}return Asyncify.handleAsync(async()=>{',
    'function _ttsResume(){window.speechSynthesis.resume()}':
        'function _ttsResume(){if(window.speechSynthesis&&typeof window.speechSynthesis.resume===\"function\"){window.speechSynthesis.resume()}}',
    'function _ttsIsSpeaking(){return window.speechSynthesis.speaking}':
        'function _ttsIsSpeaking(){return Boolean(window.speechSynthesis&&window.speechSynthesis.speaking)}',
    'function _ttsIsPaused(){console.debug':
        'function _ttsIsPaused(){if(!window.speechSynthesis||typeof window.speechSynthesis.paused!==\"boolean\"){return false}console.debug',
}

# Validate every hook before writing, including a mixed already-patched input.
for original, replacement in patterns.items():
    if source.count(replacement) == 1:
        continue
    if source.count(original) != 1:
        raise SystemExit(f"Unsupported Emscripten speech hook in {path}")
    source = source.replace(original, replacement, 1)
path.write_text(source)

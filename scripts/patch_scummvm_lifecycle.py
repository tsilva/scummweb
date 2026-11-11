#!/usr/bin/env python3
"""Send the unload signal only after the native runtime has initialized."""

from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
original = 'window.addEventListener("beforeunload",function(e){Module["_raise"](2)});'
replacement = (
    'window.addEventListener("beforeunload",function(e){'
    'if(runtimeInitialized&&!ABORT&&typeof Module["_raise"]==="function")'
    '{Module["_raise"](2)}});'
)

# The export exists before native constructors run. Calling it in that interval
# can trap in the uninitialized native signal table, so an export check alone
# is insufficient. Preserve SIGINT for a fully initialized, non-aborted runtime.
if source.count(replacement) == 1:
    sys.exit(0)
if source.count(original) != 1:
    raise SystemExit(f"Expected one Emscripten unload signal hook in {path}")
path.write_text(source.replace(original, replacement, 1))

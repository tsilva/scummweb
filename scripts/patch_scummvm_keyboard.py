#!/usr/bin/env python3
"""Replace stale native keyboard callbacks when SDL recreates its window."""

from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()

original = (
    'var eventHandler={target:findEventTarget(target),eventTypeString,callbackfunc,'
    'handlerFunc:keyEventHandlerFunc,useCapture};'
    'return JSEvents.registerOrRemoveHandler(eventHandler)'
)
replacement = original.replace(
    'return JSEvents.registerOrRemoveHandler(eventHandler)',
    # SDL 3.2.4 dereferences the numeric WINDOW target during unregister and
    # skips keyboard cleanup. Display recreation then retains stale userData.
    # Replace only the same native callback on the same target and phase;
    # independent callbacks, ordinary DOM listeners and OS repeat stay intact.
    'if(callbackfunc){'
    'for(var i=JSEvents.eventHandlers.length-1;i>=0;--i){'
    'var previous=JSEvents.eventHandlers[i];'
    'if(previous.target===eventHandler.target&&previous.eventTypeString===eventTypeString'
    '&&previous.callbackfunc===callbackfunc&&previous.useCapture===useCapture){'
    'JSEvents._removeHandler(i)}}}'
    'return JSEvents.registerOrRemoveHandler(eventHandler)',
)

if source.count(replacement) == 1:
    sys.exit(0)
if source.count(original) != 1:
    raise SystemExit(f"Expected one Emscripten keyboard registration hook in {path}")
path.write_text(source.replace(original, replacement, 1))

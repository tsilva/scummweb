#!/usr/bin/env python3

from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text()
start = "\t// We failed to find it using the engine ID. Scan the list of plugins"
end = "\n\treturn nullptr;\n}\n\nQualifiedGameDescriptor EngineManager::findTarget"
begin = "#if !defined(EMSCRIPTEN) || !defined(DYNAMIC_MODULES)\n"

if begin + start not in source:
    offset = source.index(start)
    boundary = source.index(end, offset)
    # Web plugins are named after their engine IDs. Avoid downloading unrelated
    # plugins when the requested engine is unavailable or fails to load.
    path.write_text(source[:offset] + begin + source[offset:boundary] + "#endif\n" + source[boundary:])

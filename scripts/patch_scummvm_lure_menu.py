#!/usr/bin/env python3

from pathlib import Path
import sys


TARGET = 'bool clickable_menu = g_system->hasFeature(OSystem::kFeatureTouchscreen);'
REPLACEMENT = """#ifdef EMSCRIPTEN
\tbool clickable_menu = true;
#else
\tbool clickable_menu = g_system->hasFeature(OSystem::kFeatureTouchscreen);
#endif"""


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_scummvm_lure_menu.py <menu.cpp>")

    path = Path(sys.argv[1])
    source = path.read_text()

    if TARGET not in source:
        if REPLACEMENT in source:
            return 0
        raise SystemExit("Could not find Lure popup menu touchscreen gate in vendored ScummVM source")

    path.write_text(source.replace(TARGET, REPLACEMENT, 1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

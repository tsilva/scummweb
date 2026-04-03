#!/usr/bin/env python3

from pathlib import Path
import sys


INCLUDE_SENTINEL = '#include "common/system.h"\n'
CONST_SENTINEL = "static constexpr uint32 kDialogueChoiceMouseDebounceMs = 180;\n"
BLOCK_SENTINEL = "const uint32 choiceInputDebounceUntil = g_system->getMillis() + kDialogueChoiceMouseDebounceMs;"

BLOCK = """\t\t_vm->input()->clearKeyVerb();
\t\t_vm->input()->clearMouseButton();
"""

BLOCK_REPLACEMENT = """\t\t_vm->input()->clearKeyVerb();
\t\t_vm->input()->clearMouseButton();
\t\tconst uint32 choiceInputDebounceUntil = g_system->getMillis() + kDialogueChoiceMouseDebounceMs;
"""

MOUSE_BUTTON_BLOCK = """\t\t\t\tint mouseButton = _vm->input()->mouseButton();
\t\t\t\t_vm->input()->clearMouseButton();
"""

MOUSE_BUTTON_REPLACEMENT = """\t\t\t\tint mouseButton = _vm->input()->mouseButton();
\t\t\t\t_vm->input()->clearMouseButton();

\t\t\t\t// On touch devices, the tap that dismisses the previous spoken line can finish
\t\t\t\t// after the choice list is drawn. Ignore that trailing click so dialogue choices
\t\t\t\t// require a deliberate follow-up tap instead of auto-selecting.
\t\t\t\tif (g_system->getMillis() < choiceInputDebounceUntil) {
\t\t\t\t\tmouseButton = 0;
\t\t\t\t}
"""


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_scummvm_queen_dialogue.py <talk.cpp>")

    path = Path(sys.argv[1])
    source = path.read_text()
    updated = source

    if INCLUDE_SENTINEL not in updated:
        updated = updated.replace('#include "common/file.h"\n', '#include "common/file.h"\n#include "common/system.h"\n', 1)

    if CONST_SENTINEL not in updated:
        updated = updated.replace("namespace Queen {\n", f"namespace Queen {{\n\n{CONST_SENTINEL}", 1)

    if BLOCK_SENTINEL not in updated:
        updated = updated.replace(BLOCK, BLOCK_REPLACEMENT, 1)

    if "Ignore that trailing click so dialogue choices" not in updated:
        updated = updated.replace(MOUSE_BUTTON_BLOCK, MOUSE_BUTTON_REPLACEMENT, 1)

    if updated != source:
        path.write_text(updated)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

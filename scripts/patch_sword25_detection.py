#!/usr/bin/env python3

from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
known_md5 = 'AD_ENTRY1s("data.b25c", "1f89a63e3509aa64626cc90cd2561032", 827397764)'

if known_md5 not in text:
    anchor = '''\t{
\t\t"sword25",
\t\t"Latest version",
\t\tAD_ENTRY1s("data.b25c", "880a8a67faf4a4e7ab62cf114b771428", 827397764),
\t\tCommon::UNK_LANG,
\t\tCommon::kPlatformUnknown,
\t\tADGF_NO_FLAGS,
\t\tGUIO1(GUIO_NOASPECT)
\t},
'''
    replacement = anchor + '''
\t{
\t\t"sword25",
\t\t"Latest version",
\t\tAD_ENTRY1s("data.b25c", "1f89a63e3509aa64626cc90cd2561032", 827397764),
\t\tCommon::UNK_LANG,
\t\tCommon::kPlatformUnknown,
\t\tADGF_NO_FLAGS,
\t\tGUIO1(GUIO_NOASPECT)
\t},
'''
    if anchor not in text:
        raise SystemExit("Could not find Sword25 detection anchor in vendored ScummVM source")
    path.write_text(text.replace(anchor, replacement, 1))

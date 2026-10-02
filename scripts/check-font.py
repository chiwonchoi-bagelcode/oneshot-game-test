#!/usr/bin/env python3
"""Q-TE-08: every character the UI can show must exist in the bundled (offline) Jua faces.
Emoji / pictographs are excluded on purpose: they fall back to the system emoji font."""
import pathlib, sys
from fontTools.ttLib import TTFont

root = pathlib.Path(__file__).resolve().parent.parent
files = root / 'node_modules/@fontsource/jua/files'
have = set()
for name in ['jua-korean-400-normal.woff2', 'jua-latin-400-normal.woff2']:
    have |= set(TTFont(files / name).getBestCmap())

def wanted(ch):
    c = ord(ch)
    if c < 0x20 or ch in '️‍  ': return False
    if 0x1F000 <= c <= 0x1FAFF or 0x2600 <= c <= 0x27BF or 0x2190 <= c <= 0x21FF or 0x2B00 <= c <= 0x2BFF: return False  # emoji / arrows → system font
    return 0xAC00 <= c <= 0xD7A3 or 0x3130 <= c <= 0x318F or (0x20 <= c < 0x7F and ch != '`')

missing = {}
for p in sorted(list(root.glob('src/**/*.ts')) + [root / 'index.html']):
    for ch in p.read_text(encoding='utf-8'):
        if wanted(ch) and ord(ch) not in have:
            missing.setdefault(ch, p.relative_to(root).as_posix())
if missing:
    print('glyphs missing from bundled font:', ' '.join(f'{c}({f})' for c, f in missing.items()))
    sys.exit(1)
print(f'font coverage ok ({len(have)} glyphs available)')

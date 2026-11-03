"""Writes lib/unicode.js: what Python's own Unicode tables say, so the JavaScript tokenizer splits text exactly as
mneme-llm's does, whatever Unicode version Node ships.

    python3 tools/unicode.py           write lib/unicode.js
    python3 tools/unicode.py --check   exit 1 when lib/unicode.js is not what this Python would write

The tables are each code point's general category, its full case folding (`str.casefold`), what `str.split` takes
for whitespace, and where each run of decimal digits starts. Python 3.13 carries Unicode 15.1.
"""

from __future__ import annotations

import sys
import textwrap
import unicodedata
from pathlib import Path

TARGET = Path(__file__).resolve().parent.parent / "lib" / "unicode.js"
CATEGORIES = ("Cn", "Lu", "Ll", "Lt", "Lm", "Lo", "Mn", "Mc", "Me", "Nd", "Nl", "No", "Pc", "Pd", "Ps", "Pe", "Pi",
              "Pf", "Po", "Sm", "Sc", "Sk", "So", "Zs", "Zl", "Zp", "Cc", "Cf", "Cs", "Co")
CODES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%"  # one character per category, after each run's length in base 36


def base36(number: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        number, rest = divmod(number, 36)
        out = digits[rest] + out
        if not number:
            return out


def runs() -> str:
    found, start, previous = [], 0, None
    for code in range(0x110000):
        category = unicodedata.category(chr(code))
        if category != previous:
            if previous is not None:
                found.append(base36(code - start) + CODES[CATEGORIES.index(previous)])
            start, previous = code, category
    found.append(base36(0x110000 - start) + CODES[CATEGORIES.index(previous)])
    return "".join(found)


def js(text: str, width: int = 110) -> str:
    """A JavaScript string literal in ASCII, in lines of about `width`."""
    pieces, piece = [], ""
    for character in text:
        code = ord(character)
        if character in "'\\":
            escaped = "\\" + character
        elif 0x20 <= code < 0x7f:
            escaped = character
        elif code < 0x10000:
            escaped = f"\\u{code:04x}"
        else:
            escaped = f"\\u{{{code:x}}}"
        if len(piece) + len(escaped) > width:
            pieces.append(piece)
            piece = ""
        piece += escaped
    pieces.append(piece)
    return " +\n  ".join(f"'{piece}'" for piece in pieces)


def listed(items, width: int = 110) -> str:
    """A JavaScript array, in lines of about `width`."""
    return "[\n  " + "\n  ".join(textwrap.wrap(", ".join(items), width)) + "\n]"


def source() -> str:
    folds = [(code, chr(code).casefold()) for code in range(0x110000)
             if not 0xD800 <= code <= 0xDFFF and chr(code).casefold() != chr(code)]
    spaces = [code for code in range(0x110000) if chr(code).isspace()]
    zeros = [code for code in range(0x110000) if unicodedata.category(chr(code)) == "Nd"
             and unicodedata.decimal(chr(code)) == 0]
    fold_text = "".join(f"{base36(code)}:{folded}" + "\u0001" for code, folded in folds)
    lines = [
        f"// Written by tools/unicode.py from Python's tables (Unicode {unicodedata.unidata_version}): do not edit.",
        "// Each code point's general category, its full case folding, what str.split takes for whitespace, and where",
        "// each run of decimal digits starts, as mneme-llm's Python sees them.",
        f"export const UNICODE = '{unicodedata.unidata_version}'",
        "export const CATEGORIES = " + listed(f"'{name}'" for name in CATEGORIES),
        f"export const CODES = '{CODES}'",
        "export const RUNS =\n  " + js(runs()),
        "export const FOLDS =\n  " + js(fold_text),
        "export const SPACES = " + listed(f"0x{code:x}" for code in spaces),
        "export const ZEROS = " + listed(f"0x{code:x}" for code in zeros),
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    text = source()
    if "--check" in sys.argv[1:]:
        if TARGET.read_text(encoding="utf-8") != text:
            print(f"{TARGET} differs from what Python {sys.version.split()[0]} writes", file=sys.stderr)
            return 1
        return 0
    TARGET.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())

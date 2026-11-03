"""A gut file through Python's mneme-llm, for test/compat.test.js: what it writes, and what it reads from any gut file.

    python3 tools/gutfile.py write FILE     a gut born from starter.json.gz, taught, with a side grown and one written
    python3 tools/gutfile.py more FILE      more lessons and a side on a gut file someone else wrote
    python3 tools/gutfile.py read FILE      what waking from FILE gives, as JSON
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from mneme_llm.gut import Gut

STARTER = Path(__file__).resolve().parent.parent / "starter.json.gz"
FORMS = [{"people": ["coworker"], "gender": ["woman"], "topic": ["lunch"], "event": ["ate"], "sender_feels": "happy",
          "toward_you": "none"},
         {"people": [], "gender": [], "topic": ["rain"], "event": ["got wet"], "sender_feels": "tired",
          "toward_you": "asking"},
         {"people": ["mother"], "gender": ["woman"], "topic": ["health"], "event": ["fell"], "sender_feels": "worried",
          "toward_you": "affection"}]
NOTES = [{"feel": {"sweet": 0.6, "jealous": 0.4}, "mood": 1}, {"feel": {"tender": 1.0}, "mood": -1},
         {"feel": {"worried": 0.7, "sad": 0.3}, "mood": -2}]


def opened(path: str) -> Gut:
    gut = Gut(path, STARTER, tags={"傲娇": "你嘴硬心软。"})
    gut.wake()
    return gut


def teach(gut: Gut, first: int, count: int) -> None:
    for index in range(first, first + count):
        if gut.teach("owner", ("zh", "en")[index % 2], FORMS[index % 3], NOTES[index % 3], (85, 50, 41)[index % 3],
                     ["喵", "本鲸", "nya"][: 1 + index % 3]):
            gut.sleep()


def read(path: str) -> dict:
    gut = opened(path)
    return {"lessons": len(gut.net.lessons), "born": len(gut.net.born), "share": gut.net.share(),
            "vectors": [gut.net.vector(form, closeness) for form in FORMS for closeness in (10, 85)],
            "grown": gut.grown, "weights": gut.weights, "held": gut.held, "tone": gut.tone.v,
            "languages": gut.languages, "sightings": [list(row) for row in gut.sightings],
            "heads": {language: head["names"] for language, head in sorted(gut.marks.heads.items())},
            "spoken": [gut.marks.speaks(language, form, 85) for language in ("zh", "en") for form in FORMS]}


def main() -> int:
    command, path = sys.argv[1], sys.argv[2]
    if command == "write":
        gut = opened(path)
        teach(gut, 0, 25)
        gut.language("owner", {"language": "yue"}, "")
        for day in range(4):
            gut.sighted("owner", {"name": "绿茶", "more": True, "what": "说别的女生不好"}, 85, now=1767225600.0 + day * 86400)
        gut.grow("绿茶", {"name": "小绿茶", "what": "你先夸她，再让她显得不如你。"})
        gut.write_side("御姐", "你从容，不撒娇。", 3.0)
        gut.holding(1767225600.0)
        gut.close()
    elif command == "more":
        gut = opened(path)
        teach(gut, 25, 30)
        gut.write_side("三无", "你话很少。", 1.0)
        gut.close()
    elif command == "read":
        print(json.dumps(read(path), ensure_ascii=False))
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

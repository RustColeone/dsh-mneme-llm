"""Writes test/fixtures/parity.json: what Python's mneme-llm gives for a set of inputs, so the JavaScript tests can check
this port against it without Python.

    python3 tools/fixtures.py           write test/fixtures/parity.json
    python3 tools/fixtures.py --check   exit 1 when what this Python's mneme-llm gives differs from the committed file

What it holds: text (terms, tokens, fold, normalize, clean, blank, clip, fit, split) for listed and random strings, and a
digest of the same for 20,000 more drawn with Python's random numbers (the tests draw them again with the port of it);
talking days and stamps in thirteen zones; surface bounds; every config default as the file keeps it, and checked
values; relation lines; the gut born from starter.json.gz and after a sleep; and the scenario (test/fixtures/
scenario.json) as Python reads it after running it, with a digest of every row of the file it made.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import random
import sys
import tempfile
from pathlib import Path

import mneme_llm
from mneme_llm import config as configs, dates, gut as G, surface, text as texts
from mneme_llm.relations import Relations
from mneme_llm.store import Store, dumps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scenario as scenarios  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "test" / "fixtures" / "parity.json"
ALPHABET = ("aAzZ'_- s12İıßΣσςéé́ü考试没好的了我们鲸アカ가힣ทยကမᠠ‌‍　\x1c\x85\t\n😀\U00020000ًٰ֑ﬁ"
            "①²½\x00\x07\x7f\ud83d’Ǆǅİꭰ٣")
DRAWN, SEED = 20000, 4  # random strings in the digest, and the seed they are drawn with
CLIPS, FITS = (0, 1, 5, 12), (0, 4, 7, 12, 20)
LISTED = ["", " ", "Straße STRASSE İstanbul", "ΣΑΣ σας ς", "考试没考好，我们去吃饭吧", "don’t it's Leo's cats' parties boss",
          "שָׁלוֹם שלום", "مَرْحَبًا", "नमस्ते दुनिया", "สวัสดีครับ", "안녕하세요 세계", "こんにちは、カタカナ", "ﾊﾝｶｸ ＦＵＬＬ",
          "école ﬁne", "a_b-c 'quoted' -dash- x‍y", "\x1c\x85a　b c﻿d", "😀 emoji 🐋 鲸酱",
          "\U00020000\U0002a6d6 ext", "ꭰꮳ Cherokee", "Ǆǅǆ ǈ", "ﬃ ŉ", "İi̇", "boss's bosses classes ies series",
          "I'm OK, yes yeah oh the it's", "年糕今天把我的耳机线咬断了……", "Hola, ¿qué tal? Ñandú", "Привет, мир! Ёлка",
          "Γειά σου Κόσμε", "x" * 50, "鲸" * 30, "line one\nline two\r\nthree\tfour", "\ud83d lone", "١٢٣ ٤٥٦ digits",
          "\U000e0001\U0001fbf0 new", "ྵཱི tibetan", "ﷺ ligature", "㍿ ㌀ squares"]
ZONES = ["UTC", "UTC+8", "UTC-05:30", "UTC+14", "UTC-12", "Asia/Shanghai", "America/New_York", "Europe/London",
         "Australia/Lord_Howe", "America/Sao_Paulo", "Pacific/Chatham", "Asia/Kathmandu", "America/St_Johns"]
FORMS = [{"people": ["coworker"], "gender": ["woman"], "topic": ["lunch"], "event": ["ate"], "sender_feels": "happy",
          "toward_you": "none"},
         {"people": [], "gender": [], "topic": ["rain", "Bus"], "event": ["got wet"], "sender_feels": "tired",
          "toward_you": "asking"},
         {"people": ["mother"], "gender": ["woman"], "topic": ["health"], "event": ["fell"], "sender_feels": "worried",
          "toward_you": "affection"}]
FEELS = [{"jealous": .7, "sweet": .3}, {"tender": 1.0}, {"worried": .6, "sad": .4}]


def text_of(case: str) -> list:
    return [texts.terms(case), repr(texts.tokens(case)), texts.fold(case), texts.normalize(case), texts.clean(case),
            texts.blank(case), [texts.clip(case, n) for n in CLIPS], [texts.fit(case, n) for n in FITS],
            " ".join(case.split())]


def drawn(count: int, seed: int) -> list[str]:
    rng, letters = random.Random(seed), list(ALPHABET)
    return ["".join(rng.choice(letters) for _ in range(rng.randint(0, 24))) for _ in range(count)]


def digest(rows) -> str:
    return hashlib.sha256("\n".join(json.dumps(row) for row in rows).encode()).hexdigest()


def stamps() -> list[float]:
    rng = random.Random(3)
    found = [0.0, 1.0, 1e9, 1711846800.0, 1711846799.9999996, 1711846799.9999994, 1730611800.5, 1730613600.0,
             1767225599.9999995, 32503679999.0]
    found += [round(rng.uniform(0, 4.1e9), 3) for _ in range(150)]
    for base in (1772953200, 1793516400, 1774749600, 1792890000, 1775318400):  # around 4 a.m. and the 2026 changes
        found += [float(base + step) for step in range(-7200, 7201, 1800)]
    return found


def config_part() -> dict:
    checks = [["companion.name", "大肥鱼"], ["companion.name", ""], ["companion.name", "x" * 81], ["companion.zone", "UTC+8"],
              ["companion.zone", "UTC+15"], ["companion.zone", "UTC-0530"], ["companion.zone", "Asia/Shanghai"],
              ["companion.zone", "asia/shanghai"], ["companion.zone", "Mars/Olympus"], ["companion.zone", "UTC+٨"],
              ["memory.half_life_days", 30], ["memory.half_life_days", True], ["memory.daily_quota", 2.0],
              ["memory.daily_quota", 2.5], ["memory.surface_cap", 999], ["mood.weights", {"user": 2}],
              ["mood.weights", {"User": 2}], ["mood.skip", ["time", "runtime", "time"]], ["mood.tell", "mood"],
              ["roles", [{"key": "teacher", "floor": 40, "start": 60, "names": {"en": "your teacher"}}]],
              ["roles", [{"key": "x", "floor": 70, "start": 60}]], ["roles", []],
              ["emotions", [{"key": "proud", "lowers": False, "names": {"zh": "骄傲"}}]], ["emotions", [{"key": "none"}]],
              ["prompts.surface_summary", "Sum {user} up: {turns}"], ["prompts.surface_summary", "{nope}"],
              ["messages.zh.surface.summary", "以前：{summary}"], ["messages.ja.role.teacher", "先生"],
              ["messages.xx_y.notes.header", "x"], ["messages.en.cue.proud", "You feel proud."], ["no.such", 1]]
    found = []
    for key, value in checks:
        try:
            found.append([key, value, True, dumps(configs.check(key, value))])
        except ValueError:
            found.append([key, value, False, None])
    return {"defaults": {key: dumps(value) for key, value in configs.DEFAULTS.items()}, "checks": found}


def relations_part() -> list:
    store = Store(":memory:")
    now = {"t": 1767225600.0}
    relations = Relations(store, "s", clock=lambda: now["t"])
    found = []
    for subject, role, closeness in (("a", "creator", None), ("b", "family", 60.5), ("c", "friend", 39.5),
                                     ("d", "acquaintance", 0.5), ("e", "friend", 79.5), ("f", "friend", 20.4999)):
        relations.set(subject, role, closeness=closeness)
    for days in (0, 1, 15, 45, 400):
        now["t"] = 1767225600.0 + days * 86400
        found.append([[relations.line(subject, "Leo"), relations.weight(subject), relations.get(subject).closeness]
                      for subject in "abcdef"])
    relations.display_language = "zh"
    found.append([relations.line(subject) for subject in "abcdef"])
    return found


def gut_part() -> dict:
    with gzip.open(ROOT / "starter.json.gz", "rt", encoding="utf-8") as file:
        rows = [tuple(row) for row in json.load(file)["rows"]]
    net = G.Net()
    net.start(rows)
    born = [{key: round(value, 9) for key, value in net.vector(form, closeness).items()} for form in FORMS
            for closeness in (10, 85)]
    for index in range(30):
        net.teach(FORMS[index % 3], FEELS[index % 3], index % 3 - 1, (85, 50, 41)[index % 3])
    net.sleep(seed=30)
    slept = [{key: round(value, 9) for key, value in net.vector(form, closeness).items()} for form in FORMS
             for closeness in (10, 85)]
    marks = G.Marks(G.read_starter(ROOT / "starter.json.gz")[1])
    for index in range(90):
        words = [word for j, word in enumerate(["喵", "本鲸", "呜呜", "哼", "嘿嘿", "nya", "好的"]) if index % (j + 1) == 0]
        marks.teach(("zh", "en")[index % 2], FORMS[index % 3], index % 5 - 2, (85, 50, 41)[index % 3], words)
    heads = marks.trained(seed=7)
    marks.heads = heads
    spoken = [marks.speaks(language, form, closeness) for language in ("zh", "en") for form in FORMS
              for closeness in (41, 85)]
    return {"rows": len(rows), "born": born, "slept": slept, "share": round(net.share(), 9), "spoken": spoken,
            "heads": {language: {"names": head["names"], "b": [round(value, 9) for value in head["b"]]}
                      for language, head in sorted(heads.items())}}


def scenario_part() -> dict:
    given = scenarios.scenario()
    with tempfile.TemporaryDirectory() as folder:
        path = str(Path(folder) / "scenario.db")
        state = {"t": given["ops"][0][1]}
        m = scenarios.opened(path, given, state)
        asked = scenarios.apply(m, state, given["ops"])
        reads = scenarios.read(m, state, given)
        m.close()
        rows = scenarios.dump(path)
    return {"asked": asked, "reads": reads,
            "dump": hashlib.sha256(json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()}


def build() -> dict:
    listed = LISTED + drawn(300, SEED + 1)
    return {
        "mneme_llm": mneme_llm.__version__, "terms_version": texts.version(),
        "text": {"alphabet": ALPHABET, "clips": CLIPS, "fits": FITS, "cases": listed,
                 "out": [text_of(case) for case in listed],
                 "drawn": {"count": DRAWN, "seed": SEED, "digest": digest(text_of(case) for case in drawn(DRAWN, SEED))}},
        "dates": {"zones": ZONES, "stamps": stamps(),
                  "out": {name: [[dates.talking_day(moment, configs.zone_of(name)), dates.stamp(moment,
                                                                                               configs.zone_of(name))]
                                 for moment in stamps()] for name in ZONES}},
        "bounds": [[recent, floor, cap, window, *surface.bounds(recent, floor, cap, window)]
                   for recent in (0, 1, 299.9, 70000, 100000.7, 400000, 1e12)
                   for floor, cap, window in ((70000, 504000, 1048576), (300, 1000, 1048576), (0, 1000, 1000),
                                              (70000, 10 ** 12, 10 ** 12), (5, 1001, 1251))],
        "config": config_part(),
        "relations": relations_part(),
        "gut": gut_part(),
        "scenario": scenario_part(),
    }


def main() -> int:
    found = build()
    if "--check" in sys.argv[1:]:
        kept = json.loads(TARGET.read_text(encoding="utf-8"))
        if kept != json.loads(json.dumps(found)):
            for key in found:
                if json.loads(json.dumps(found[key])) != kept.get(key):
                    print(f"{TARGET.name}: {key} differs from what mneme-llm {mneme_llm.__version__} gives",
                          file=sys.stderr)
            return 1
        return 0
    TARGET.write_text(json.dumps(found, separators=(",", ":")) + "\n", encoding="utf-8")  # (ASCII: it holds lone
    # surrogates, which UTF-8 cannot)
    return 0


if __name__ == "__main__":
    sys.exit(main())

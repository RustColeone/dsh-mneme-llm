"""Writes test/fixtures/parity.json: what Python's mneme-llm gives for a set of inputs, so the JavaScript tests can
check this package against it without Python.

    python3 tools/fixtures.py           write test/fixtures/parity.json
    python3 tools/fixtures.py --check   exit 1 when what this Python's mneme-llm gives differs from the committed file

What it holds: text (terms, tokens, fold, normalize, clean, blank, clip, fit, split) for listed and random strings, and
a digest of the same for 20,000 more drawn with Python's random numbers (the tests draw them again with random.js);
talking days and stamps in thirteen zones; surface bounds; every config default as the file keeps it, and checked
values; relation lines; the gut born from starter.json.gz and after a sleep; and the scenario (test/fixtures/
scenario.json) as Python reads it after running it, with a digest of every row of the file it made.

And for notes, mood and meaning: the judge's messages and what it reads in replies, the note writer's replies as
notes, the scripts of text, dates as a person says them, Python's sums, reprs and JSON, TOML documents as tomllib reads
them and the config as a file, the floor's numbers, the tools' specs, and the world (test/fixtures/world.json): what
each operation gave, what the models were asked, and a digest of every row of the file.

And the command line: what `mneme-llm` prints for a run of commands on one file, and what its MCP server answers.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import random
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

import math
import tomllib

import mneme_llm
from mneme_llm import config as configs, dates, gut as G, surface, text as texts
from mneme_llm.capture import notes_in
from mneme_llm.decide import Choice, Predicate, Prompt, Score, normalized
from mneme_llm.episodes import spread_bin, tally, threshold
from mneme_llm.i18n import Words
from mneme_llm.meaning import calibrate
from mneme_llm.meaning.unify import Unify
from mneme_llm.relations import Relations
from mneme_llm.store import Store, dumps
from mneme_llm.tools import specs

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scenario as scenarios  # noqa: E402
import world as worlds  # noqa: E402

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
# Normal words of a companion's own (how many of her replies hold each word, and how many replies), so her habits are
# checked against a base whatever the starter holds.
BASE = {"zh": (Counter({"哼": 40, "好的": 120, "呜呜": 200, "喵": 1}), 575), "en": (Counter({"nya": 2}), 594)}


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
    checks = [["companion.name", "大肥鱼"], ["companion.name", ""], ["companion.name", "x" * 81],
              ["companion.zone", "UTC+8"],
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
    rows, _, known = G.read_starter(ROOT / "starter.json.gz")
    net = G.Net()
    net.start(rows, known)
    nine = lambda found: {key: round(value, 9) for key, value in found.items()}
    born = [nine(net.vector(form, closeness)) for form in FORMS for closeness in (10, 85)]
    for index in range(30):
        net.teach("abc"[index % 3], FORMS[index % 3], FEELS[index % 3], index % 3 - 1, (85, 50, 41)[index % 3], G.ENDS,
                  index // 4)
    net.sleep()
    slept = [nine(net.vector(form, closeness, who)) for form in FORMS for closeness in (10, 85) for who in (None, "a", "c")]
    marks = G.Marks(BASE)
    for index in range(90):
        words = [word for j, word in enumerate(["喵", "本鲸", "呜呜", "哼", "嘿嘿", "nya", "好的"]) if index % (j + 1) == 0]
        marks.teach(("zh", "en")[index % 2], FORMS[index % 3], index % 5 - 2, (85, 50, 41)[index % 3], words)
    heads = marks.trained(seed=7)
    marks.heads = heads
    spoken = [marks.speaks(language, form, closeness) for language in ("zh", "en") for form in FORMS
              for closeness in (41, 85)]
    return {"rows": len(rows), "known": list(known), "born": born, "slept": slept, "learning": round(net.learning(), 9),
            "weights": [round(net.weight(who), 9) for who in "abc"], "spoken": spoken,
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


def canonical(value) -> str:
    """JSON that JavaScript writes the same: every number as a float's repr, keys in order, ASCII."""
    def plain(item):
        if isinstance(item, bool) or item is None or isinstance(item, str):
            return item
        if isinstance(item, (int, float)):
            return {"#": repr(float(item))}
        if isinstance(item, dict):
            return {str(key): plain(inner) for key, inner in item.items()}
        return [plain(inner) for inner in item]
    return json.dumps(plain(value), sort_keys=True, separators=(",", ":"))


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


BIG = ("read", "export_import")  # operations kept as a digest, being large


def world_part() -> dict:
    given = worlds.world()
    with tempfile.TemporaryDirectory() as folder:
        path = str(Path(folder) / "world.db")
        found = {}
        for key in ("ops", "more"):
            w = worlds.World(path, given, {"t": given[key][0][1]})
            out = worlds.run(w, given[key])
            w.close()
            found[key] = {"asked": w.asked, "out": [[kind, sha(canonical(item))] if kind in BIG else [kind, item]
                                                    for kind, item in out],
                          "dump": sha(json.dumps(scenarios.dump(path), ensure_ascii=False, separators=(",", ":")))}
    return found


QUESTIONS = [Predicate("worth", "Worth it?"), Choice("feeling", "Which feeling?", {"happy": "happy (开心)", "none": ""}),
             Choice("pick", "Pick one.", ["a", "b", "c"]),
             Score("mood_change", "How did it move?", {"-2": "worse", "-1": "", "0": "same", "1": "", "2": "better"})]
REPLIES = ['{"worth": {"probability": 0.7}}', '{"worth": {"probability": "0.7"}}', '{"worth": {"probability": NaN}}',
           '{"worth": {"probability": 1.5}, "feeling": {"choice": "happy", "confidence": 2}}',
           '{"worth": {"probability": -Infinity}}', '{"worth": {}}', '{"worth": {"probability": null}}',
           '{"worth": {"probability": true}}', '{"feeling": {"choice": "none"}}',
           '{"feeling": {"choice": "sad", "confidence": 0.9}}', '{"pick": {"choice": "b", "confidence": 0.1, '
           '"reason": "because"}}', '{"mood_change": {"level": 1, "confidence": 0.8}}',
           '{"mood_change": {"level": 1.0}}',
           '{"mood_change": {"level": "-2", "confidence": "high"}}',
           '{"mood_change": {"level": "2", "confidence": 0.95, "reason": 42}}',
           '{"mood_change": {"level": "0", "reason": null}}', '{"mood_change": {"level": "-1", "confidence": 1e-3}}',
           'prose {"worth": {"probability": 0.2}} more prose {"x": 1}', 'no json at all', '[1, 2]', '{"worth": 5}',
           '{"worth": {"probability": 0.5}, "worth": {"probability": 0.9}}', '{"worth": {"probability": 1e400}}',
           '{"pick": {"choice": "a", "confidence": 0.3, "reason": "' + "长" * 400 + '"}}',
           '{"feeling": {"choice": ["happy"]}}', '{"a":' * 1200 + "1" + "}" * 1200,
           'Sure!\n```json\n{"worth": {"probability": 0.35, "reason": "她说了猫的名字"}, "pick": {"choice": "c"}}\n```',
           '{"pick": {"choice": "a", "confidence": 0.5}, "mood_change": {"level": "1", "confidence": -0.4}}',
           '{"worth": {"probability": "1_0"}}', '{"worth": {"probability": " 0.25 "}}']
NORMALIZED = [[{"a": 0.2, "b": "0.3"}, ["a", "b", "c"]], [{}, ["x", "y"]],
              [{"a": -1, "b": None, "c": 0}, ["a", "b", "c"]],
              [{"a": 1e308, "b": 1e308}, ["a", "b"]], [{"a": 0.1, "b": 0.2, "c": 0.3}, ["c", "b", "a"]],
              [{"b": "", "a": 3}, ["a", "b"]]]


def answer(found) -> list:
    return [list(map(list, found.probabilities.items())), found.confidence, found.by, found.reason, found.choice,
            found.probability, found.mean() if found.name == "mood_change" else None]


def decide_part() -> dict:
    prompt = Prompt(None)
    return {"message": prompt.message("我的猫叫年糕。" * 3000 + "end", QUESTIONS),
            "short": prompt.message("Leo: hi", QUESTIONS[:1]),
            "replies": REPLIES,
            "parsed": [{name: answer(found) for name, found in prompt.parse(reply, QUESTIONS).items()}
                       for reply in REPLIES],
            "normalized": [[given, labels, list(map(list, normalized(given, labels).items()))]
                           for given, labels in NORMALIZED]}


WRITTEN = ['[{"text": "Has a cat", "kind": "fact", "importance": 4}]',
           '[{"text": "Exam", "kind": "plan", "date": "2026-01-09"}, {"text": "Trip on 1月9日", "kind": "plan"}, '
           '{"text": "Wedding 2026年1月3日", "kind": "plan"}, {"text": "x", "kind": "plan"}]',
           '[{"text": "Fell ill", "kind": "episode", "date": "2026-13-01"}, {"text": "Moved", "kind": "episode", '
           '"date": "tomorrow"}, {"text": "Bad", "kind": "thing"}]',
           '[{"text": "Lives here", "kind": "fact", "key": "has space"}, {"text": "Cat", "key": "Pet.Name"}, '
           '{"text": "k", "key": 5}]',
           '[{"text": "a", "importance": "5"}, {"text": "b", "importance": 9}, {"text": "c", "importance": -3}]',
           '[{"text": "d", "importance": "abc"}, {"text": "e", "importance": 1e999}, '
           '{"text": "f", "importance": null}]',
           '[{"text": "g", "feeling": "-0.5"}, {"text": "h", "feeling": 3}, {"text": "i", "feeling": NaN}]',
           '[{"text": "j", "gloss": ""}, {"text": "l", "gloss": 5}, {"text": "m", "gloss": "the m"}]',
           '[{"text": ""}, {"text": 5}, {"text": "a\\nb\\tc"}, {"text": "' + "x" * 600 + '"}]',
           '[1, "two", {"text": "three"}, {"text": "four"}, {"text": "five"}]',
           'Here are the notes:\n[{"text": "Plays cello", "kind": "fact"}]\nThat is all.', 'not json', '{"text": "x"}',
           '[{"text": "Plan 10月30日", "kind": "plan"}, {"text": "Plan 2026/1/2", "kind": "plan"}, '
           '{"text": "12026-10-301", "kind": "plan"}]',
           '[{"text": "考试 ２０２６-０１-１０", "kind": "plan", "date": "２０２６-０１-１０"}]']


def notes_part() -> list:
    return [[reply, name, notes_in(reply, 1767229200.0, configs.zone_of(name))] for reply in WRITTEN
            for name in ("UTC+8", "America/New_York")]


def dates_part() -> dict:
    zones = ["UTC+8", "America/New_York", "Europe/London", "Australia/Lord_Howe"]
    moments = [1767229200.0 + step * 21600 for step in range(-60, 61, 7)] + [1741503600.0, 1762059600.0]
    now = 1767229200.0
    days = ["2026-10-30", "2026-1-5", "2026-02-29", "2024-02-29", "1969-12-31", "２０２６-１０-３０", "2026-03-08",
            "2025-11-02", "2026-10-30T12", " 2026-01-01", "2026-01- 5", "3000-01-01", "2999-12-31", "abc", "", None, 5]
    found = ["考试在2026年12月3日", "下周 1月3日 见", "on 2026/1/2 ok", "12026-10-301", "10月30号去", "无", "12月31日",
             "1月1日", "2月30日", "2026-02-30 then 2026-03-01"]
    out = {}
    for name in zones:
        zone = configs.zone_of(name)
        words = Words("zh")
        out[name] = {"when": [[dates.when(moment, now, zone), dates.when(moment, now, zone, words),
                               dates.day_began(moment, zone),
                               dates.local(moment, zone).strftime("%Y-%m-%d (%A) %d %B %Y, %H:%M")]
                              for moment in moments],
                     "noon": [dates.noon(day, zone) for day in days],
                     "find": [[dates.find(text, now, zone), dates.find(text, now, zone, ahead=True)] for text in found]}
    return {"zones": zones, "moments": moments, "days": days, "found": found, "out": out}


def python_part(cases: list[str]) -> dict:
    rng = random.Random(9)
    sums = [[rng.uniform(-1, 1) * 10 ** rng.randint(-5, 5) for _ in range(rng.randint(0, 40))] for _ in range(300)]
    loads = ['{"a": [1, 2.5, NaN, -Infinity, Infinity, "\\ud83d\\ude00", "\\ud800"], "__proto__": {"b": null}}',
             '{"a": 1} x', '[1, 2', '{"a": 1,}', '"\\x"', '01', '1.', '-', '{"a": "\x01"}', '  [true, false, null]  ',
             '{"x": -0.0, "y": 1E2, "z": 1e-7}', '{"dup": 1, "dup": 2}', '"\\u00e9\\uD83D\\uDE00"', '']
    values = [0.125, 0.625, -0.001, 2.675, 1e20, 1e22, 0.005, 1.005, -0.0, 0.0, 3.14159, 99.995]

    def loaded(text):
        try:
            return ["ok", json.loads(text, parse_constant=lambda name: {"constant": name})]
        except ValueError:
            return ["error"]
    return {"sums": [[repr(value) for value in values] for values in sums],
            "summed": [repr(sum(values)) for values in sums],
            "reprs": [repr(case) for case in cases], "lines": [case.splitlines() for case in cases],
            "loads": loads, "loaded": [loaded(text) for text in loads],
            "fixed": [[repr(value), f"{value:.2f}", f"{value:.3f}"] for value in values]}


def scripts_part(cases: list[str]) -> dict:
    languages = ["English", "Chinese", "japanese", " Russian ", "Thai", "Klingon"]
    return {"languages": languages, "scripts": [texts.scripts(case) for case in cases],
            "translate": [[Unify(None, language).needs_translation(case) for language in languages] for case in cases]}


TOMLS = [
    """# a companion
[companion]
name = "大肥鱼"   # her name
display_language = 'zh'
zone = "UTC+8"

[memory]
half_life_days = 45
daily_quota = 4.0
surface_floor = 1_000

[mood]
baseline = 65.5
weights = { user = 1, "speak-up" = 0.5, duty = 0.25 }
skip = ["runtime", "time",]

[[roles]]
key = "teacher"
floor = 40
start = 70
names = { en = "your teacher", zh = "你的老师" }

[[roles]]
key = "creator"
floor = 80
ceiling = 100
start = 100
fades = false
unique = true

[[emotions]]
key = "proud"
names.en = "proud"
names.zh = "骄傲"

[prompts]
reflect = \"\"\"
Write about {user} from {notes}; keep {"braces"} and \\"quotes\\".\"\"\"

[messages.zh]
notes.header = "关于{who}的笔记"
"mood.line" = '心情 {value}/100（{face}）'
""",
    'a = "tab\\there \\u00e9 \\U0001F600 \\\\ \\""\nb = \'C:\\\\path\\\\x\'\nc = \'\'\'\nraw \\n line\'\'\'\n'
    'd = """\\\n   folded \\\n   line"""\ne = """a""b"""\nf = """x""""\ng = """"y\'"""\n',
    "int = [+99, -17, 0, 1_000, 0xDEAD_BEEF, 0o755, 0b1101]\nfloat = [3.14, -0.01, 5e+22, 1e06, -2E-2, 6.626e-34, "
    "224_617.445_991_228, inf, -inf, nan, +inf, -0.0]\n",
    "bools = [true, false]\nnested = [[1, 2], ['a', \"b\"], [ {x = 1}, {} ]]\nmulti = [\n  1, # one\n  2,\n]\n",
    'a . b = 1\n[ x . "y z" ]\nc = 2\n[x.w]\nd = 3\n',
    "[[a]]\nn = 1\n[a.b]\nm = 2\n[[a.c]]\no = 3\n[[a]]\nn = 4\n",
    "odt = 1979-05-27T07:32:00Z\noff = 1979-05-27 07:32:00-07:00\nld = 1979-05-27\nlt = 07:32:00.999999\n"
    "ldt = 1979-05-27T00:32:00.999999\n",
    "", "# only a comment\n\n   \n", 'a = 1\r\nb = "x"\r\n', '"ключ" = 1\nbare-key_1 = "ok"\n\'lit key\' = 2\n',
    "[a.b.c]\nx = 1\n[a]\ny = 2\n",
    "a = 1\na = 2\n", "[a]\n[a]\n", "a = \n", 'a = "unterminated\n', 'a = "ctrl\x01"\n', "a = 1 b = 2\n",
    "a = {b = 1,\n c = 2}\n", "[[a]]\n[a]\n", "a.b = 1\n[a]\n", 'a = "\\x41"\n', "a = 2026-02-30\n", "a = 01\n",
    "ключ = 1\n", "a = 1\rb = 2\n", "a = [1, 2\n", "a = {b = 1,}\n", "\ufeffa = 1\n", 'a = "\\ud800"\n',
    'x = """\n', "a = {b = 1}\na.c = 2\n", "a = [1]\n[[a]]\n", "# bad \x7f comment\n", "[a\n", "[[a]\n",
    "a = tru\n", "a = 1979-05-27T25:00:00\n", 'a = "\\u00"\n', "1.2 = 3\n", 'a = """x"""""\n',
]


def toml_part() -> dict:
    def read(text):
        try:
            return ["ok", plain(tomllib.loads(text))]
        except tomllib.TOMLDecodeError as error:
            return ["error", str(error)]

    def plain(value):
        if isinstance(value, float) and not math.isfinite(value):
            return {"float": repr(value)}
        if isinstance(value, dict):
            return {key: plain(item) for key, item in value.items()}
        if isinstance(value, list):
            return [plain(item) for item in value]
        if hasattr(value, "isoformat"):
            return {"date": value.isoformat()}
        return value
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "companion.toml"
        path.write_text(TOMLS[0], encoding="utf-8")
        store = Store(":memory:")
        config = configs.Config(store, "s", lambda: 1.0)
        config.seed(str(path))
        rows = [[row["key"], row["value"], row["origin"]] for row in store.rows("select * from config order by rowid")]
        written = config.to_toml()
        store.close()
    return {"documents": TOMLS, "read": [read(text) for text in TOMLS],
            "template": configs.to_toml(configs.DEFAULTS), "rows": rows, "written": written,
            "again": plain(tomllib.loads(written))}


def floor_part() -> dict:
    rng = random.Random(11)
    lists = [[rng.uniform(-1, 1) for _ in range(rng.randint(0, 30))] for _ in range(40)]
    bins = []
    for values in lists:
        found = [0] * 200
        pairs = tally(found, values)
        bins.append([pairs, [index for index, count in enumerate(found) if count], threshold(found, max(pairs, 100)),
                     threshold(found, pairs)])
    return {"lists": [[repr(value) for value in values] for values in lists],
            "quantiles": [[calibrate.quantile(values, q) for q in (0, 0.25, 0.5, 0.95, 1)] for values in lists],
            "bins": [[spread_bin(value) for value in values] for values in lists], "tallies": bins,
            "unrelated": [list(pair) for pair in calibrate.UNRELATED]}


CLI_TOML = '[companion]\nname = "大肥鱼"\nzone = "UTC+8"\n'
CLI_START = 1767229200.0  # each command a minute after the one before
CLI_FILE = ["--db", "cli.db", "--space", "dafeiyu", "--config", "companion.toml"]
CLI = [["remember", "discord:42", "养了一只叫年糕的猫", "--kind", "fact", "--key", "pet.name", "--importance", "4"],
       ["remember", "discord:42", "下周五考数学", "--kind", "plan", "--date", "2026-01-09"],
       ["remember", "discord:42", "下周五考数学", "--kind", "plan", "--date", "2026-01-09"],
       ["remember", "discord:42", "养了一只叫汤圆的猫", "--key", "pet.name"],
       ["remember", "discord:42", "Plays the cello", "--kind", "preference", "--importance", "2"],
       ["remember", "discord:42", "x", "--date", "2026-02-30"],
       ["recall", "discord:42", "猫"], ["recall", "discord:42", "考试 数学 cello", "--explain"],
       ["recall", "web:9", "nothing"], ["context", "discord:42", "猫", "--user-name", "Leo"], ["context", "nobody"],
       ["--display-language", "zh", "context", "discord:42", "考试"], ["notes", "discord:42"],
       ["notes", "discord:42", "--kind", "plan"], ["history", "discord:42", "pet.name"], ["profile", "discord:42"],
       ["profile", "discord:42", "Leo 喜欢猫，在学大提琴。"], ["relate", "discord:42", "creator"],
       ["relate", "discord:42", "--closeness", "92.5"], ["relate", "web:7", "--closeness", "5"],
       ["relate", "web:7", "friend", "--closeness", "200"], ["relate", "web:7", "friend"],
       ["relate", "web:8", "acquaintance", "--closeness", "12.5"], ["relate", "web:8"], ["relations"],
       ["relate", "web:8", "--remove"], ["relate", "web:8", "--remove"], ["alias", "discord:42", "鲸酱"],
       ["alias", "discord:42"], ["alias", "web:7", "x" * 41], ["alias", "web:7", "--remove"],
       ["link", "web:leo", "discord:42"], ["link", "web:leo", "web:7"], ["people"], ["recall", "web:leo", "猫"],
       ["unlink", "web:leo"], ["unlink", "web:leo"], ["people"], ["mood", "discord:42"],
       ["--display-language", "zh", "mood", "discord:42", "--reset"], ["subjects"], ["recalls", "discord:42"],
       ["forget", "discord:42", "--key", "pet.name"], ["forget", "discord:42", "--id", "99"],
       ["history", "discord:42", "pet.name"], ["export", "--out", "backup.json"], ["export"],
       ["import", "backup.json", "--into", "copy"], ["--space", "copy", "notes", "discord:42"],
       ["import", "backup.json"], ["config", "show", "companion"], ["config", "show", "memory.daily", "--origins"],
       ["config", "set", "memory.daily_quota", "4"], ["config", "set", "companion.name", "42"],
       ["config", "set", "mood.weights", "{user = 2}"], ["config", "set", "memory.daily_quota", "2.5"],
       ["config", "set", "no.such", "1"], ["config", "set", "companion.name"], ["config", "show", "companion"],
       ["config", "check"], ["config", "defaults", "memory.daily_quota"], ["config", "defaults", "no.such"],
       ["config", "apply", "companion.toml"], ["config", "show", "mood.weights", "--origins"],
       ["tools", "--style", "gemini"], ["config", "template"], ["erase", "discord:42"],
       ["erase", "discord:42", "--yes"], ["subjects"], ["export"],
       ["remember"], ["forget", "a"], ["notes", "a", "extra"], ["nosuch"]]  # (the last four: usage)
MCP = ['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}',
       '{"jsonrpc":"2.0","method":"notifications/initialized"}', '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
       '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"remember","arguments":{"subject":"discord:42",'
       '"text":"养了一只叫年糕的猫","kind":"fact","key":"pet.name","importance":4}}}',
       '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"recall","arguments":{"subject":"discord:42",'
       '"query":"猫"}}}', '{"jsonrpc":"2.0","id":5,"method":"ping"}',
       '{"jsonrpc":"2.0","id":6,"method":"resources/list"}', 'not json',
       '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"remember","arguments":{"subject":"discord:42",'
       '"text":"考试","kind":"plan","date":"2026-01-09","importance":3.0}}}',
       '{"jsonrpc":"2.0","id":8.0,"method":"tools/call","params":{"name":"mood","arguments":{"subject":"discord:42"}}}',
       '{"jsonrpc":"2.0","id":"nine","method":"tools/call","params":{"name":"forget","arguments":'
       '"{\\"subject\\": \\"discord:42\\", \\"key\\": \\"pet.name\\"}"}}',
       '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"search","arguments":{"subject":"discord:42",'
       '"query":"猫"}}}', '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"read","arguments":'
       '{"subject":"discord:42","id":"#1"}}}',
       '{"jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"nope"}}',
       '{"jsonrpc":"2.0","id":13,"method":"tools/call","params":{"name":"recall","arguments":{"query":"猫"}}}',
       '{"jsonrpc":"2.0","id":14,"method":"tools/call","params":{"name":"remember","arguments":{"subject":"discord:42",'
       '"text":"","kind":"fact"}}}', '{"jsonrpc":"2.0","id":15,"method":"tools/call","params":[1]}',
       '[1, 2]', '   ', '{"jsonrpc":"2.0","id":null,"method":"ping"}', '﻿{"jsonrpc":"2.0","id":16,"method":"ping"}',
       '{"jsonrpc":"2.0","id":17,"method":"tools/call","params":{"name":"recall","arguments":[1]}}']
MCP_BYTES = "\n".join(MCP).encode() + b"\n\xff\xfe{}\r\n" + MCP[5].encode()  # (not UTF-8; a last line without "\n")


def cli_part() -> dict:
    """What Python's command prints for each command line, run one after another on one file, a minute apart; and
    what its MCP server answers, bound to a person and not."""
    import contextlib
    import io
    import os
    import time
    import types
    from unittest import mock

    from mneme_llm import cli
    now = {"t": CLI_START}
    kwdefaults = dict(mneme_llm.Mneme.__init__.__kwdefaults__, clock=lambda: now["t"])

    def run(argv, data=b""):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err), \
                mock.patch.object(sys, "stdin", types.SimpleNamespace(buffer=io.BytesIO(data))):
            try:
                code = cli.main(argv)
            except SystemExit as stopped:  # (argparse)
                code = stopped.code
        return [code, out.getvalue(), err.getvalue()]
    found = {"toml": CLI_TOML, "start": CLI_START, "file": CLI_FILE, "commands": CLI, "out": [], "mcp": MCP_BYTES.hex()}
    with tempfile.TemporaryDirectory() as folder, mock.patch.object(time, "time", lambda: now["t"]), \
            mock.patch.object(mneme_llm.Mneme.__init__, "__kwdefaults__", kwdefaults), \
            mock.patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
        here = os.getcwd()
        os.chdir(folder)
        try:
            Path("companion.toml").write_text(CLI_TOML, encoding="utf-8")
            for index, argv in enumerate(CLI):
                now["t"] = CLI_START + 60 * index
                found["out"].append(run(CLI_FILE + argv))
            now["t"] = CLI_START
            found["bound"] = run(["--db", "mcp.db", "--config", "companion.toml", "mcp", "--subject", "discord:42"],
                                 MCP_BYTES)
            found["unbound"] = run(["--db", "mcp2.db", "--config", "companion.toml", "mcp"], MCP_BYTES)
        finally:
            os.chdir(here)
    return found


def build() -> dict:
    listed = LISTED + drawn(300, SEED + 1)
    return {
        "mneme_llm": mneme_llm.__version__, "terms_version": texts.version(),
        "text": {"alphabet": ALPHABET, "clips": CLIPS, "fits": FITS, "cases": listed,
                 "out": [text_of(case) for case in listed],
                 "drawn": {"count": DRAWN, "seed": SEED,
                           "digest": digest(text_of(case) for case in drawn(DRAWN, SEED))}},
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
        "decide": decide_part(),
        "notes": notes_part(),
        "dates2": dates_part(),
        "python": python_part(listed),
        "scripts": scripts_part(listed),
        "toml": toml_part(),
        "floor": floor_part(),
        "specs": {style: specs(style) for style in ("openai", "responses", "anthropic", "gemini", "mcp")} |
        {"subject": specs("mcp", prefix="memory_", with_subject=True)},
        "world": world_part(),
        "cli": cli_part(),
    }


CHOICES = re.compile(r"\(choose from ([^)]*)\)")


def unquoted(value):
    """argparse's "invalid choice" without quotes around the choices: newer Pythons quote them (3.13.18 does, 3.13.5
    does not), and that is not mneme-llm's to give."""
    if isinstance(value, str):
        return CHOICES.sub(lambda found: f"(choose from {found.group(1).replace(chr(39), '')})", value)
    if isinstance(value, list):
        return [unquoted(item) for item in value]
    if isinstance(value, dict):
        return {key: unquoted(item) for key, item in value.items()}
    return value


def first_difference(kept, given, where: str = "") -> str:
    """Where two fixtures part first, and what each holds there."""
    if isinstance(kept, dict) and isinstance(given, dict):
        for key in sorted(set(kept) | set(given), key=str):
            if kept.get(key) != given.get(key):
                return first_difference(kept.get(key), given.get(key), f"{where}.{key}")
    if isinstance(kept, list) and isinstance(given, list) and len(kept) == len(given):
        for index, (one, other) in enumerate(zip(kept, given)):
            if one != other:
                return first_difference(one, other, f"{where}[{index}]")
    return f"  at {where or '(top)'}:\n  kept:  {json.dumps(kept, ensure_ascii=False)[:800]}\n  gives: " \
           f"{json.dumps(given, ensure_ascii=False)[:800]}"


def main() -> int:
    found = build()
    if "--check" in sys.argv[1:]:
        kept = unquoted(json.loads(TARGET.read_text(encoding="utf-8")))
        found = unquoted(json.loads(json.dumps(found)))
        if kept != found:
            for key in found:
                if found[key] != kept.get(key):
                    print(f"{TARGET.name}: {key} differs from what mneme-llm {mneme_llm.__version__} gives",
                          file=sys.stderr)
                    print(first_difference(kept.get(key), json.loads(json.dumps(found[key]))), file=sys.stderr)
            return 1
        return 0
    TARGET.write_text(json.dumps(found, separators=(",", ":")) + "\n", encoding="utf-8")  # (ASCII: it holds lone
    # surrogates, which UTF-8 cannot)
    return 0


if __name__ == "__main__":
    sys.exit(main())

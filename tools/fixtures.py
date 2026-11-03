"""Writes test/fixtures/parity.json: what Python's mneme-llm gives for a set of inputs, so the JavaScript tests can
check this port against it without Python.

    python3 tools/fixtures.py           write test/fixtures/parity.json
    python3 tools/fixtures.py --check   exit 1 when what this Python's mneme-llm gives differs from the committed file

What it holds: text (terms, tokens, fold, normalize, clean, blank, clip, fit, split) for listed and random strings, and
a digest of the same for 20,000 more drawn with Python's random numbers (the tests draw them again with the port of it);
talking days and stamps in thirteen zones; surface bounds; every config default as the file keeps it, and checked
values; relation lines; the gut born from starter.json.gz and after a sleep; and the scenario (test/fixtures/
scenario.json) as Python reads it after running it, with a digest of every row of the file it made.

And for notes, mood and meaning: the judge's messages and what it reads in replies, the note writer's replies as
notes, the scripts of text, dates as a person says them, Python's sums, reprs and JSON, TOML documents as tomllib reads
them and the config as a file, the floor's numbers, the tools' specs, and the world (test/fixtures/world.json): what
each operation gave, what the models were asked, and a digest of every row of the file.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import random
import sys
import tempfile
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
           '"reason": "because"}}', '{"mood_change": {"level": 1, "confidence": 0.8}}', '{"mood_change": {"level": 1.0}}',
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
NORMALIZED = [[{"a": 0.2, "b": "0.3"}, ["a", "b", "c"]], [{}, ["x", "y"]], [{"a": -1, "b": None, "c": 0}, ["a", "b", "c"]],
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
           '[{"text": "d", "importance": "abc"}, {"text": "e", "importance": 1e999}, {"text": "f", "importance": null}]',
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

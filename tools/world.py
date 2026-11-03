"""test/fixtures/world.json through Python's mneme-llm: notes, mood, the judge, the note writer, meaning, tools, links,
erasing, export and import, with the rules of tools/models.py for the models. tools/world.js does the same through
dsh-mneme-llm; the two must agree, call for call and row for row.

    python3 tools/world.py write FILE        the scenario's `ops` into FILE (a new file): what was asked and given
    python3 tools/world.py run FILE KEY      the scenario's ops under KEY ("more", "reads") on a file
    python3 tools/world.py export FILE SPACE      SPACE of FILE as an export, as JSON
    python3 tools/world.py import FILE SPACE DATA an export (a JSON file) added to SPACE of FILE, with its config
    python3 tools/world.py dump FILE         every row of FILE, as JSON

Vectors are compared as Python does without numpy (in double precision), as the port does.
"""

from __future__ import annotations

import asyncio
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import mneme_llm.episodes  # noqa: E402
import mneme_llm.meaning.vectors  # noqa: E402

mneme_llm.meaning.vectors.numpy = mneme_llm.episodes.numpy = None

from mneme_llm import Embeddings, Mneme  # noqa: E402
from mneme_llm.tools import Toolbox  # noqa: E402

import models  # noqa: E402
import scenario  # noqa: E402

WORLD = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "world.json"
IMPORTED = 1767488400.0  # the clock an export is made and added on


def world() -> dict:
    return json.loads(WORLD.read_text(encoding="utf-8"))


class World:
    """The spaces of one file, opened as the scenario says, on one clock and one model."""

    def __init__(self, path: str, given: dict, state: dict):
        self.path, self.given, self.state, self.asked = path, given, state, []
        self.spaces, self.boxes = {}, {}

    def space(self, name: str) -> Mneme:
        if name not in self.spaces:
            embed = Embeddings(models.toy, name="toy:1") if name in self.given["embedded"] else False
            self.spaces[name] = Mneme(self.path, name, config=self.given["config"], complete=models.model(self.asked),
                                      embed=embed, clock=lambda: self.state["t"])
        return self.spaces[name]

    def box(self, name: str, subject) -> Toolbox:
        if (name, subject) not in self.boxes:
            self.boxes[name, subject] = Toolbox(self.space(name), subject)
        return self.boxes[name, subject]

    def close(self) -> None:
        for m in self.spaces.values():
            m.close()


def note(note) -> list:
    return [note.id, note.subject, note.text, note.kind, note.key, note.importance, note.feeling, note.happened_at,
            note.created_at, note.recalls, note.source, note.recalled_at, note.superseded_by, note.deleted_at, note.gloss]


def event(found) -> list | None:
    return None if found is None else [found.id, found.at, found.delta, found.emotions, found.reason, found.confidence,
                                       found.source, found.judge, found.value]


def recalled(found) -> dict:
    return {"chosen": [[item.note.id, item.why, repr(item.score), list(item.matched)] for item in found.chosen],
            "skipped": [[item.id, reason] for item, reason in found.skipped], "tier": found.tier,
            "explain": found.explain()}


def snapshot(m: Mneme) -> dict:
    subjects = m.memory.subjects()
    keys = {subject: sorted({row["key"] for row in m.store.rows("select key from memories where space = ? and "
                                                                 "subject = ? and key is not null", (m.space, subject))})
            for subject in subjects}
    people = sorted({*subjects, *m.episodes.subjects(), *(row["subject"] for row in m.store.rows(
        "select subject from moods where space = ? union select subject from relationships where space = ?",
        (m.space, m.space)))})
    report = m.report()
    return {
        "everyone": m.everyone(), "links": m.people.all(), "aliases": m.aliases.all(),
        "relations": [[r.subject, r.role, r.closeness, r.since, r.updated_at] for r in m.relations.all()],
        "notes": {subject: [note(item) for item in m.memory.notes(subject)] for subject in subjects},
        "history": {subject: {key: [item.id for item in m.memory.history(subject, key)] for key in keys[subject]}
                    for subject in subjects},
        "profiles": {subject: [m.memory.profile(subject), m.memory.profile_updated_at(subject)] for subject in people},
        "recalls": {subject: m.memory.recalls(subject, 5) for subject in subjects},
        "mood": {subject: [m.mood.state(subject).value, m.mood.state(subject).emotions, m.mood.state(subject).face,
                           m.mood.describe(subject), [event(item) for item in m.mood.timeline(subject, 5)],
                           m.mood.news(subject, mark=False)] for subject in people},
        "lines": {subject: [m.relations.line(subject, "Leo"), m.aliases.line(subject, "Leo")] for subject in people},
        "report": report,
        "floor": [m.meaning.floor, m.meaning.set_floor] if m.meaning is not None else None,
        "toml": m.config.to_toml("mood."),
    }


def call(w: World, kind: str, rest: list):
    """One operation; what it gives, as JSON."""
    def m():
        return w.space(rest[0])
    if kind == "clock":
        w.state["t"] = rest[0]
        return None
    if kind == "relate":
        found = m().relate(rest[1], rest[2], closeness=rest[3])
        return [found.subject, found.role, found.closeness, found.since, found.updated_at]
    if kind == "alias":
        return m().alias(rest[1], rest[2])
    if kind == "remember":
        options = dict(rest[3])
        outcome, found = m().memory.keep(rest[1], rest[2], **options)
        return [outcome, None if found is None else note(found)]
    if kind == "forget":
        return m().forget(rest[1], **rest[2])
    if kind == "purge":
        return m().purge(rest[1])
    if kind == "profile":
        m().memory.set_profile(rest[1], rest[2])
        return None
    if kind == "observe":
        _, at, subject, conversation, lines, options = rest
        w.state["t"] = at
        seen = m().observe(subject, lines, conversation=conversation, **options)
        return [event(seen.mood), [note(item) for item in seen.notes], seen.worth, seen.error,
                seen.episode.id if seen.episode else None]
    if kind == "capture":
        return [note(item) for item in m().capture(rest[1], rest[2], **rest[3])]
    if kind == "reflect":
        return m().reflect(rest[1], user_name=rest[2])
    if kind == "regloss":
        return m().regloss(rest[1], everything=rest[2])
    if kind == "link":
        return m().link(rest[1], rest[2])
    if kind == "unlink":
        return m().unlink(rest[1])
    if kind == "erase":
        return m().erase(rest[1])
    if kind == "wipe":
        return m().wipe(rest[1])
    if kind == "mood":
        return event(m().mood.apply(rest[1], **rest[2]))
    if kind == "tool":
        box = w.box(rest[0], rest[1])
        return asyncio.run(box.acall(rest[2], rest[3])) if rest[4] else box.call(rest[2], rest[3])
    if kind == "new_turn":
        for (name, _), box in w.boxes.items():
            if name == rest[0]:
                box.new_turn()
        return None
    if kind == "search":
        _, subject, query, refresh, meaning = rest
        found = asyncio.run(m().episodes.asearch(subject, query, refresh=refresh)) if meaning else \
            m().episodes.search(subject, query, refresh=refresh)
        return [item.id for item in found]
    if kind == "recall":
        _, subject, query, options, meaning = rest
        return recalled(asyncio.run(m().arecall(subject, query, **options)) if meaning else
                        m().recall(subject, query, **options))
    if kind == "context":
        _, subject, query, user, meaning = rest
        return asyncio.run(m().memory.acontext(subject, query, user_name=user)) if meaning else \
            m().memory.context(subject, query, user_name=user)
    if kind == "prompt":
        _, subject, query, options, meaning = rest
        return asyncio.run(m().aprompt(subject, query, **options)) if meaning else m().prompt(subject, query, **options)
    if kind == "look":
        _, subject, query, options, meaning = rest
        return asyncio.run(m().alook(subject, query, **options)) if meaning else m().look(subject, query, **options)
    if kind == "prepare":
        return asyncio.run(m().episodes.prepare(rest[1]))
    if kind == "config_set":
        m().config.set(rest[1], rest[2])
        return None
    if kind == "config_apply":
        path = w.path + ".apply.toml"
        Path(path).write_text(rest[1], encoding="utf-8")
        try:
            return m().config.apply(path, origin=rest[2])
        except ValueError as error:
            raise ValueError(str(error).replace(path, "FILE")) from None
    if kind == "export_import":
        data = m().export_data()
        added = w.space(rest[1]).import_data(data, config=rest[2])
        data.pop("exported_at")
        return [added, data]
    if kind == "bulk":
        _, subject, count, prefix = rest
        topics = ["my cat", "the math exam", "jasmine tea", "black coffee", "a Shanghai trip", "the cello"]
        return sum(m().memory.keep(subject, f"{prefix} {index} {topics[index % 6]}", kind=["fact", "preference",
                                   "episode", "plan", "reflection"][index % 5])[0] == "kept" for index in range(count))
    if kind == "read":
        return snapshot(m())
    raise ValueError(f"no operation {kind}")


def run(w: World, ops: list) -> list:
    out = []
    for kind, *rest in ops:
        try:
            found = call(w, kind, rest)
        except (ValueError, TypeError) as error:
            found = ["error", type(error).__name__, str(error)]
        if kind != "clock":
            out.append([kind, clean(found)])
    return out


def clean(value):
    """JSON of what Python gives: a number that is not finite as text, tuples as lists."""
    if isinstance(value, float) and not math.isfinite(value):
        return repr(value)
    if isinstance(value, dict):
        return {str(key): clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    return value


def main() -> int:
    command, path = sys.argv[1], sys.argv[2]
    given = world()
    if command in ("write", "run"):
        ops = given["ops"] if command == "write" else given[sys.argv[3]]
        state = {"t": ops[0][1]}
        w = World(path, given, state)
        out = run(w, ops)
        w.close()
        print(json.dumps({"asked": w.asked, "out": out}, ensure_ascii=False))
    elif command in ("export", "import"):
        w = World(path, given, {"t": IMPORTED})
        m = w.space(sys.argv[3])
        if command == "export":
            print(json.dumps(m.export_data(), ensure_ascii=False))
        else:
            print(json.dumps(m.import_data(json.loads(Path(sys.argv[4]).read_text(encoding="utf-8")), config=True)))
        w.close()
    elif command == "dump":
        print(json.dumps(scenario.dump(path), ensure_ascii=False))
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

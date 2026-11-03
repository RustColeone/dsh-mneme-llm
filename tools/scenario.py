"""test/fixtures/scenario.json through Python's mneme-llm: its operations into a file, then what reading the file gives,
and every row of the file in a canonical form. tools/scenario.js does the same through dsh-mneme-llm; the two must
agree.

    python3 tools/scenario.py write FILE        the operations into FILE (a new file)
    python3 tools/scenario.py read FILE         what reading FILE gives, as JSON
    python3 tools/scenario.py dump FILE         every row of FILE, as JSON
    python3 tools/scenario.py extra FILE        a link ("web:leo" is "discord:42"), then the scenario's `extra`
    python3 tools/scenario.py more FILE         the scenario's `more`: what a host adds to a file it was given

The Python package is imported as installed, or from PYTHONPATH.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import sys
from pathlib import Path

from mneme_llm import Mneme, __version__

SCENARIO = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "scenario.json"


def scenario() -> dict:
    return json.loads(SCENARIO.read_text(encoding="utf-8"))


def opened(path: str, given: dict, state: dict) -> Mneme:
    return Mneme(path, given["space"], config=given["config"], embed=False, memory_language=None,
                 clock=lambda: state["t"])


def apply(m: Mneme, state: dict, ops: list) -> list:
    """The operations, in order; what the summary writer was asked, and what each let-go came to."""
    asked = []
    for op in ops:
        kind, *rest = op
        if kind == "clock":
            state["t"] = rest[0]
        elif kind == "relate":
            subject, role, closeness = rest
            m.relate(subject, role, closeness=closeness)
        elif kind == "observe":
            at, subject, conversation, lines = rest
            state["t"] = at
            m.observe(subject, lines, conversation=conversation)
        elif kind == "search":
            subject, query, refresh = rest
            m.episodes.search(subject, query, refresh=refresh)
        elif kind == "let_go":
            subject, user, summary = rest

            def complete(system, user_text, summary=summary):
                asked.append([system, user_text])
                return summary
            asked.append(asyncio.run(m.surface.alet_go(subject, user_name=user, complete=complete)))
        elif kind == "set_first":
            m.surface.set_first(*rest)
        elif kind == "send_first":
            m.surface.send_first(*rest)
        elif kind == "drop_first":
            m.surface.drop_first(*rest)
        elif kind == "clear":
            m.surface.clear(*rest)
        else:
            raise ValueError(f"no operation {kind}")
    return asked


def read(m: Mneme, state: dict, given: dict) -> dict:
    reads = given["reads"]
    out = {"config": {"name": m.companion_name, "language": m.display_language, "zone": m.config.get("companion.zone"),
                      "surface": [m.surface.span, m.surface.floor, m.surface.cap, m.surface.window],
                      "said": [m.said_budget, list(m.said_cut)], "roles": [role.key for role in m.config.roles()],
                      "newer": m.config.newer_defaults(), "invalid": m.config.invalid},
           "everyone": m.everyone(), "links": m.people.all(), "moments": []}
    ids = [row["id"] for row in m.store.rows("select id from episodes order by id")]
    out["shown"] = [m.episodes.shown(m.episodes.get(id)) for id in ids]
    out["around"] = [[episode.id for episode in m.episodes.around(m.episodes.get(id).subject, id)] for id in ids[:6]]
    for at in reads["at"]:
        state["t"] = at
        moment = {"at": at, "people": [], "episodes": [], "search": [], "look": [], "looked": []}
        for subject, user, here in reads["people"]:
            view = m.surface.read(subject, user_name=user, here=here)
            first, relation = m.surface.first(subject), m.relations.get(subject)
            moment["people"].append({
                "subject": subject, "messages": view.messages, "tokens": view.tokens, "keep": view.keep,
                "top": view.top, "upto": view.upto, "slice": m.surface.slice(subject, 400),
                "began": m.surface.began(subject),
                "first": [first.text, first.at, first.by_command, first.send] if first else None,
                "days": m.episodes.talking_days(subject), "count": m.episodes.count(subject),
                "tokens_after": m.episodes.tokens_after(subject, 0, days=3), "latest": list(m.episodes.latest(subject)),
                "relation": [relation.role, relation.closeness, relation.since, relation.updated_at]
                if relation else None,
                "line": m.relations.line(subject, user), "weight": m.relations.weight(subject)})
        for id in ids:
            episode = m.episodes.get(id)
            moment["episodes"].append([id, episode.subject, episode.at, episode.day, episode.stability,
                                       episode.recalled_at, episode.recalls, episode.tokens,
                                       m.episodes.retention(episode)])
        for subject, query in reads["queries"]:
            moment["search"].append([episode.id for episode in m.episodes.search(subject, query, refresh=False)])
            moment["looked"].append([episode.id for episode in m.episodes.look(subject, query, budget=1500)])
        for subject, query, budget, search, own in reads["looks"]:
            moment["look"].append(m.look(subject, query, budget=budget, search=search, own=own))
        out["moments"].append(moment)
    return out


def dump(path: str) -> dict:
    """Every row of the file, each value with its storage class, in the order the file keeps them; and its schema."""
    db = sqlite3.connect(path)
    out = {"schema": [list(row) for row in db.execute(
        "select type, name, tbl_name, sql from sqlite_master order by type, name")]}
    for (table,) in db.execute("select name from sqlite_master where type = 'table' order by name"):
        columns = [row[1] for row in db.execute(f"pragma table_info({table})")]
        rowid = db.execute("select sql from sqlite_master where name = ?", (table,)).fetchone()[0]
        order = ", ".join(str(i + 1) for i in range(len(columns))) if "without rowid" in rowid else "rowid"
        picked = ", ".join(f'typeof("{column}"), "{column}"' for column in columns)
        rows = []
        for row in db.execute(f'select {picked} from "{table}" order by {order}'):
            rows.append([value(row[i], row[i + 1]) for i in range(0, len(row), 2)])
        out[table] = rows
    db.close()
    return out


def value(kind: str, item):
    if kind == "real":
        return ["real", repr(item)]
    if kind == "integer":
        return ["integer", str(item)]
    if kind == "blob":
        return ["blob", bytes(item).hex()]
    return [kind, item]


def main() -> int:
    command, path = sys.argv[1], sys.argv[2]
    given, state = scenario(), {"t": 0.0}
    if command == "write":
        state["t"] = given["ops"][0][1]
        m = opened(path, given, state)
        asked = apply(m, state, given["ops"])
        m.close()
        print(json.dumps({"asked": asked, "version": __version__}, ensure_ascii=False))
    elif command in ("extra", "more"):
        state["t"] = given[command][0][1]
        m = opened(path, given, state)
        if command == "extra":
            m.link("web:leo", "discord:42")
        asked = apply(m, state, given[command])
        m.close()
        print(json.dumps({"asked": asked}, ensure_ascii=False))
    elif command == "read":
        m = opened(path, given, state)
        print(json.dumps(read(m, state, given), ensure_ascii=False))
        m.close()
    elif command == "dump":
        print(json.dumps(dump(path), ensure_ascii=False))
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

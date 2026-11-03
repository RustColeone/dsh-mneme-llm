"""A file of schema 1, as mneme-llm's own tests/test_migrate.py builds it (`old_file`, here word for word), so that
the migration here and Python's start from the same file.

    python3 tools/oldfile.py build FOLDER       a schema 1 file in FOLDER (old.db); its path
    python3 tools/oldfile.py migrate FILE       Python's migration of FILE: what it says, or why it failed
    python3 tools/oldfile.py read FILE          what Python reads of FILE once it is current, as JSON
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

from mneme_llm import Mneme
from mneme_llm.migrate import migrate

START = datetime(2026, 1, 1, 12, tzinfo=timezone.utc).timestamp()
SCHEMA_1 = """
create table meta (key text primary key, value text not null);
create table memories (id integer primary key, space text not null, subject text not null, key text, kind text not null,
    text text not null, importance integer not null, feeling real not null default 0, happened_at real not null,
    created_at real not null, recalled_at real, recalls integer not null default 0, superseded_by integer,
    deleted_at real, source text, gloss text, terms text, folded text);
create index memories_live on memories(space, subject, deleted_at, superseded_by);
create index memories_key on memories(space, subject, key);
create index memories_folded on memories(space, subject, folded);
create index memories_newest on memories(space, subject, id);
create index memories_important on memories(space, subject, importance, id);
create table recalls (id integer primary key, space text not null, subject text not null, at real not null,
    query text not null, chosen text not null, skipped text not null);
create table profiles (space text not null, subject text not null, text text not null, updated_at real not null,
    primary key (space, subject));
create table moods (space text not null, subject text not null, value real not null, emotions text not null,
    updated_at real not null, last_event integer, told_event integer, primary key (space, subject));
create table mood_events (id integer primary key, space text not null, subject text not null, at real not null,
    delta real not null, value real not null, emotions text not null, reason text not null, confidence real not null,
    source text not null, judge text not null);
create table vectors (memory_id integer not null, embedder text not null, vector blob not null, taught text,
    primary key (memory_id, embedder));
create index vectors_untaught on vectors(embedder) where taught is null;
create table meaning_terms (embedder text not null, term text not null, count integer not null, vector blob not null,
    primary key (embedder, term));
create table note_terms (space text not null, subject text not null, term text not null, memory_id integer not null,
    primary key (space, subject, term, memory_id)) without rowid;
create index note_terms_memory on note_terms(memory_id);
create table config (space text not null, key text not null, value text not null, origin text not null,
    updated_at real not null, primary key (space, key));
create table relationships (space text not null, subject text not null, role text not null, closeness real not null,
    since real not null, updated_at real not null, primary key (space, subject));
create table aliases (space text not null, subject text not null, alias text not null, updated_at real not null,
    primary key (space, subject));
create table people (space text not null, subject text not null, person text not null, updated_at real not null,
    primary key (space, subject));
create index people_person on people(space, person);
create table episodes (id integer primary key, space text not null, subject text not null, at real not null,
    conversation text not null default '', lines text not null, size integer not null, stability real not null,
    recalled_at real, recalls integer not null default 0, terms text);
create index episodes_subject on episodes(space, subject, at);
create index episodes_conversation on episodes(space, subject, conversation, at);
create table episode_terms (space text not null, subject text not null, term text not null, episode_id integer not null,
    primary key (space, subject, term, episode_id)) without rowid;
create index episode_terms_episode on episode_terms(episode_id);
create table episode_vectors (episode_id integer not null, embedder text not null, vector blob not null,
    primary key (episode_id, embedder));
create table surfaces (space text not null, subject text not null, since real not null, summary text not null,
    updated_at real not null, primary key (space, subject));
create table first_prompts (space text not null, subject text not null, text text not null, at real not null,
    by_command integer not null, send integer not null, primary key (space, subject));
create table episode_spread (space text not null, subject text not null, embedder text not null, bins text not null,
    pairs integer not null, primary key (space, subject, embedder));
create table micro_models (name text primary key, model blob);
"""
LINES = [["Leo", "我的猫叫年糕"], ["小鲸", "好可爱"]]


def old_file(folder: str, zone: str = "UTC+8") -> str:
    """A schema 1 file: two spaces' config, exchanges (one said late at night), a surface, notes (one never indexed, and
    one from before the case-folded text was kept), centroids and links, with stale settings."""
    path = os.path.join(folder, "old.db")
    db = sqlite3.connect(path)
    db.executescript(SCHEMA_1)
    db.executemany("insert into meta values (?, ?)", [("schema_version", "1"), ("terms_version", "4"),
                                                      ("terms_indexed", "1"), ("meaning_texts:toy", "2"),
                                                      ("meaning_version:toy", "4"), ("floor:toy", '{"version": 1}')])
    for key, value in (("companion.zone", json.dumps(zone)), ("companion.name", '"小鲸"'), ("mood.thresholds", "[1, 2]"),
                       ("prompts.asks_back", '"Ask them back."'), ("memory.gone_long_ago", "1")):
        db.execute("insert into config values ('t', ?, ?, 'default', 0)", (key, value))
    db.execute("""insert into config values ('other', 'companion.zone', '"Not/AZone"', 'default', 0)""")
    late = START + 11.5 * 3600  # 23:30 UTC is 07:30 the next day in UTC+8
    for space, at in (("t", START), ("t", START + 3600), ("t", late), ("other", late)):
        db.execute("insert into episodes (space, subject, at, conversation, lines, size, stability, terms) values "
                   "(?, 'u', ?, 'dm', ?, 2, 30, '猫 年糕')", (space, at, json.dumps(LINES, ensure_ascii=False)))
    db.execute("insert into episode_terms values ('t', 'u', '年糕', 1)")
    db.execute("insert into surfaces values ('t', 'u', ?, 'he has a cat', ?)", (START + 3600, START))
    db.execute("insert into surfaces values ('t', 'nobody', ?, '', ?)", (START, START))
    db.execute("insert into first_prompts values ('t', 'u', '你是我的姐姐', ?, 0, 0)", (START,))
    note = "insert into memories (id, space, subject, kind, text, importance, happened_at, created_at, terms, folded) "
    db.execute(note + "values (1, 't', 'u', 'fact', 'Has a CAT', 3, 0, 0, null, null)")
    db.execute(note + "values (2, 't', 'u', 'fact', 'Likes tea', 3, 0, 0, 'like tea', 'likes tea')")
    db.execute("insert into note_terms values ('t', 'u', 'tea', 2)")
    db.execute("insert into vectors values (2, 'toy', ?, 'like tea')", (b"\0\0\0\0",))
    db.execute("insert into meaning_terms values ('toy', 'tea', 1, ?)", (b"\0\0\0\0",))
    db.execute("insert into people values ('t', 'web:leo', 'u', 0)")
    db.commit()
    db.close()
    return path


def read(path: str) -> dict:
    with Mneme(path, "t", embed=False, memory_language=None, companion_name="小鲸") as m:
        return {"notes": [[note.id, note.text, note.kind, note.importance] for note in m.memory.notes("u")],
                "recall": [[item.note.id, item.why] for item in m.recall("u", "cat", important=0, recent=0).chosen],
                "search": [episode.id for episode in m.episodes.search("u", "年糕", limit=9)],
                "first": [m.surface.first(subject).text for subject in ("u", "v") if m.surface.first(subject)],
                "began": m.surface.began("u"), "messages": m.surface.read("u").messages,
                "person": m.person("web:leo"), "unknown": m.config.unknown, "everyone": m.everyone(),
                "kept": m.episodes.keep("u", [("Leo", "新的一句")]).id}


def main() -> int:
    command, path = sys.argv[1], sys.argv[2]
    if command == "build":
        print(old_file(path))
    elif command == "migrate":
        try:
            print(json.dumps(["ok", migrate(path)], ensure_ascii=False))
        except (OSError, ValueError, sqlite3.Error) as error:
            print(json.dumps([type(error).__name__, str(error)], ensure_ascii=False))
    elif command == "read":
        print(json.dumps(read(path), ensure_ascii=False))
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())

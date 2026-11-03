// A file of schema 1, as mneme-llm's own tests/test_migrate.py builds it (`old_file`): the same statements, so the
// migration is tested here on the file Python's tests migrate.
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import * as py from '../lib/python.js'

export const START = Date.UTC(2026, 0, 1, 12) / 1000
export const SCHEMA_1 = `
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
`
export const LINES = [['Leo', '我的猫叫年糕'], ['小鲸', '好可爱']]

/** A schema 1 file: two spaces' config, exchanges (one said late at night), a surface, notes (one never indexed, and one
 * from before the case-folded text was kept), centroids and links, with stale settings. */
export function oldFile (folder, zone = 'UTC+8') {
  const file = path.join(folder, 'old.db')
  const db = new DatabaseSync(file)
  db.exec(SCHEMA_1)
  const run = (sql, ...values) => db.prepare(sql).run(...values)
  for (const row of [['schema_version', '1'], ['terms_version', '4'], ['terms_indexed', '1'], ['meaning_texts:toy', '2'],
    ['meaning_version:toy', '4'], ['floor:toy', '{"version": 1}']]) run('insert into meta values (?, ?)', ...row)
  for (const [key, value] of [['companion.zone', py.dumps(zone)], ['companion.name', '"小鲸"'],
    ['mood.thresholds', '[1, 2]'], ['prompts.asks_back', '"Ask them back."'], ['memory.gone_long_ago', '1']]) {
    run("insert into config values ('t', ?, ?, 'default', 0)", key, value)
  }
  db.exec(`insert into config values ('other', 'companion.zone', '"Not/AZone"', 'default', 0)`)
  const late = START + 11.5 * 3600 // 23:30 UTC is 07:30 the next day in UTC+8
  for (const [space, at] of [['t', START], ['t', START + 3600], ['t', late], ['other', late]]) {
    run("insert into episodes (space, subject, at, conversation, lines, size, stability, terms) values (?, 'u', ?, " +
      "'dm', ?, 2, 30, '猫 年糕')", space, at, py.dumps(LINES, { ascii: false }))
  }
  db.exec("insert into episode_terms values ('t', 'u', '年糕', 1)")
  run("insert into surfaces values ('t', 'u', ?, 'he has a cat', ?)", START + 3600, START)
  run("insert into surfaces values ('t', 'nobody', ?, '', ?)", START, START)
  run("insert into first_prompts values ('t', 'u', '你是我的姐姐', ?, 0, 0)", START)
  const note = 'insert into memories (id, space, subject, kind, text, importance, happened_at, created_at, terms, ' +
    'folded) '
  db.exec(note + "values (1, 't', 'u', 'fact', 'Has a CAT', 3, 0, 0, null, null)")
  db.exec(note + "values (2, 't', 'u', 'fact', 'Likes tea', 3, 0, 0, 'like tea', 'likes tea')")
  db.exec("insert into note_terms values ('t', 'u', 'tea', 2)")
  run("insert into vectors values (2, 'toy', ?, 'like tea')", new Uint8Array(4))
  run("insert into meaning_terms values ('toy', 'tea', 1, ?)", new Uint8Array(4))
  db.exec("insert into people values ('t', 'web:leo', 'u', 0)")
  db.close()
  return file
}

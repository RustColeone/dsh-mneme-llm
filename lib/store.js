// The database: one SQLite file holding everything her memory keeps, with the version of its schema, and the
// statements that make its tables and indexes.
//
// Every row belongs to a `space` (whose memory it is) and most to a `subject` (who it is about). This module is the
// file alone: its tables, locking and transactions. A file of another schema is refused before anything changes.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { reindexNotes } from './memory.js'
import * as py from './python.js'
import * as texts from './text.js'

export const SCHEMA_VERSION = 2
export const SCHEMA = `
create table if not exists meta (key text primary key, value text not null);
create table if not exists memories (
    id integer primary key,
    space text not null,
    subject text not null,
    key text,
    kind text not null,
    text text not null,
    importance integer not null,
    feeling real not null default 0,
    happened_at real not null,
    created_at real not null,
    recalled_at real,
    recalls integer not null default 0,
    superseded_by integer,
    deleted_at real,
    source text,
    gloss text,
    folded text not null
);
create index if not exists memories_live on memories(space, subject, deleted_at, superseded_by);
create index if not exists memories_key on memories(space, subject, key);
create index if not exists memories_folded on memories(space, subject, folded);
create index if not exists memories_newest on memories(space, subject, id);
create index if not exists memories_important on memories(space, subject, importance, id);
create table if not exists recalls (
    id integer primary key, space text not null, subject text not null, at real not null, query text not null,
    chosen text not null, skipped text not null
);
create index if not exists recalls_subject on recalls(space, subject, at);
create table if not exists profiles (
    space text not null, subject text not null, text text not null, updated_at real not null,
    primary key (space, subject)
);
create table if not exists moods (
    space text not null, subject text not null, value real not null, emotions text not null,
    updated_at real not null, last_event integer, told_event integer,
    primary key (space, subject)
);
create table if not exists mood_events (
    id integer primary key, space text not null, subject text not null, at real not null, delta real not null,
    value real not null, emotions text not null, reason text not null, confidence real not null,
    source text not null, judge text not null
);
create index if not exists mood_events_subject on mood_events(space, subject, at);
create table if not exists vectors (
    memory_id integer not null, embedder text not null, vector blob not null,
    primary key (memory_id, embedder)
);
create table if not exists note_terms (
    space text not null, subject text not null, term text not null, memory_id integer not null,
    primary key (space, subject, term, memory_id)
) without rowid;
create index if not exists note_terms_memory on note_terms(memory_id);
create table if not exists config (
    space text not null, key text not null, value text not null, origin text not null, updated_at real not null,
    primary key (space, key)
);
create table if not exists relationships (
    space text not null, subject text not null, role text not null, closeness real not null, since real not null,
    updated_at real not null,
    primary key (space, subject)
);
create table if not exists aliases (
    space text not null, subject text not null, alias text not null, updated_at real not null,
    primary key (space, subject)
);
create table if not exists people (
    space text not null, subject text not null, person text not null,
    primary key (space, subject)
);
create index if not exists people_person on people(space, person);
create table if not exists episodes (
    id integer primary key autoincrement,
    space text not null,
    subject text not null,
    at real not null,
    day integer not null,
    conversation text not null default '',
    lines text not null,
    size integer not null,
    tokens real not null,
    stability real not null,
    recalled_at real,
    recalls integer not null default 0
);
create index if not exists episodes_subject on episodes(space, subject, at);
create index if not exists episodes_conversation on episodes(space, subject, conversation, at);
create index if not exists episodes_day on episodes(space, subject, day);
create index if not exists episodes_newest on episodes(space, subject, id);
create table if not exists episode_terms (
    space text not null, subject text not null, term text not null, episode_id integer not null,
    primary key (space, subject, term, episode_id)
) without rowid;
create index if not exists episode_terms_episode on episode_terms(episode_id);
create table if not exists episode_vectors (
    episode_id integer not null, embedder text not null, vector blob not null,
    primary key (episode_id, embedder)
);
create table if not exists surfaces (
    space text not null, subject text not null, start_id integer not null, cleared_at real not null,
    summary text not null,
    primary key (space, subject)
);
create table if not exists first_prompts (
    space text not null, subject text not null, text text not null, at real not null, by_command integer not null,
    send integer not null, primary key (space, subject)
);
create table if not exists episode_spread (
    space text not null, subject text not null, embedder text not null, bins text not null, pairs integer not null,
    primary key (space, subject, embedder)
);
`
export const IN_LIST = 400 // values in one `in (...)`: SQLite takes 999 parameters in all on older builds
const WAIT = 10 // seconds another process holding the write lock is waited for
const STATEMENTS = 256 // prepared statements kept

/** Every table and index of the schema that the file does not have yet. */
export function create (db) {
  for (const statement of SCHEMA.split(';')) if (statement.trim()) db.exec(statement)
}

/** JSON as the file keeps it: compact, its own characters (Python's `store.dumps`). */
export const dumps = (value, { floats = false } = {}) => py.dumps(value, { ascii: false, compact: true, floats })

const bound = value => value === undefined ? null : value === true ? 1 : value === false ? 0 : value
const pause = milliseconds => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

/** A connection to one mneme-llm file (created on first use). */
export class Store {
  constructor (file) {
    this.path = String(file)
    if (this.path !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(this.path)), { recursive: true })
    this._db = new DatabaseSync(this.path)
    this._depth = 0 // open transactions on this connection (nested ones are savepoints)
    this._indexes = new Map() // what rebuilds each term index
    this._statements = new Map()
    this.index('note_terms', () => reindexNotes(this)) // (Memory's own: a store opened alone keeps it whole too)
    try {
      this._db.exec(`pragma busy_timeout = ${WAIT * 1000}`) // (begin immediate honours it)
      this._open()
      if (this.path !== ':memory:') this._wal()
    } catch (error) {
      this._db.close()
      throw error
    }
  }

  /** A new file gets the schema; one of another schema is refused before anything changes. Under the write lock, so
   * two processes opening one file at once take turns. */
  _open () {
    this._db.exec('begin immediate')
    try {
      const found = this._version()
      if (found === null) {
        create(this._db)
        this.setMeta('schema_version', String(SCHEMA_VERSION))
        this.setMeta('terms_version', texts.version())
      } else if (found > SCHEMA_VERSION) {
        throw new Error(`${this.path} was written by a newer mneme-llm (schema ${found}); upgrade dsh-mneme-llm to ` +
          'read it')
      } else if (found < SCHEMA_VERSION) {
        throw new Error(`${this.path} has schema ${found}, this mneme-llm reads schema ${SCHEMA_VERSION}: run ` +
          `\`python -m mneme_llm.migrate ${this.path}\``)
      }
      this._db.exec('commit')
    } catch (error) {
      this._rollback()
      throw error
    }
  }

  /** WAL journaling, so readers don't block the writer. Switching needs the file to itself for a moment; another
   * process opening it at the same time is waited for. */
  _wal (timeout = WAIT) {
    const deadline = performance.now() + timeout * 1000
    for (;;) {
      try {
        this._db.exec('pragma journal_mode=wal')
        return
      } catch (error) {
        if ((!/locked|busy/.test(String(error.message))) || performance.now() > deadline) throw error
        pause(50)
      }
    }
  }

  /** The file's schema version, read without changing anything (null for a new or empty file). */
  _version () {
    if (!this.row("select 1 from sqlite_master where type = 'table' and name = 'meta'")) return null
    const found = this.row("select value from meta where key = 'schema_version'")
    return found ? py.int(found.value) : null
  }

  get inTransaction () {
    return typeof this._db.isTransaction === 'boolean' ? this._db.isTransaction : this._depth > 0
  }

  _rollback () {
    try {
      if (this.inTransaction) this._db.exec('rollback')
    } catch {} // (SQLite may have rolled it back itself, on a full disk say)
  }

  close () {
    this._statements.clear()
    try {
      this._db.close()
    } catch {} // (closed already)
  }

  // ---- plain access (the modules above use these, never the connection itself) ---------------------------------
  _prepare (sql) {
    let statement = this._statements.get(sql)
    if (!statement) {
      statement = this._db.prepare(sql)
      if (this._statements.size >= STATEMENTS) this._statements.delete(this._statements.keys().next().value)
      this._statements.set(sql, statement)
    }
    return statement
  }

  /** A statement run: its `lastrowid` and `rowcount`, as Python's cursor names them. */
  execute (sql, parameters = []) {
    const done = this._prepare(sql).run(...parameters.map(bound))
    return { lastrowid: Number(done.lastInsertRowid), rowcount: Number(done.changes) }
  }

  rows (sql, parameters = []) {
    return this._prepare(sql).all(...parameters.map(bound))
  }

  row (sql, parameters = []) {
    return this._prepare(sql).get(...parameters.map(bound)) ?? null
  }

  /** `sql` for any number of values: its `{}` takes marks for up to IN_LIST of them at a time, after `parameters`. Any
   * statement will do (a delete gives no rows). */
  rowsIn (sql, values, parameters = []) {
    values = [...values]
    const found = []
    for (let start = 0; start < values.length; start += IN_LIST) {
      const chunk = values.slice(start, start + IN_LIST)
      const statement = sql.replace('{}', chunk.map(() => '?').join(', '))
      found.push(...this._prepare(statement).all(...[...parameters, ...chunk].map(bound)))
    }
    return found
  }

  /** `store.transaction(() => ...)`: several writes that land together or not at all, run at once (never across an
   * await). It takes the write lock up front (`begin immediate`), so another process writing the same file is waited
   * for rather than failing midway; a transaction inside another is a savepoint of it. Returns what `work` returns. */
  transaction (work) {
    const savepoint = this._depth ? `inner${this._depth}` : ''
    this._db.exec(savepoint ? `savepoint ${savepoint}` : 'begin immediate')
    this._depth++
    let result
    try {
      result = work(this)
      if (result && typeof result.then === 'function') {
        throw new TypeError('a transaction runs at once, not across an await')
      }
    } catch (error) {
      // SQLite rolls a transaction back by itself on some errors (a full disk): then there is nothing left to roll
      // back, and trying would hide the error that is on its way out. (The depth counts this one until it is gone.)
      if (savepoint) {
        if (this.inTransaction) {
          this._db.exec(`rollback to ${savepoint}`)
          this._db.exec(`release ${savepoint}`)
        }
      } else this._rollback()
      this._depth--
      throw error
    }
    try {
      if (savepoint) {
        if (this.inTransaction) this._db.exec(`release ${savepoint}`)
      } else {
        try {
          this._db.exec('commit')
        } catch (error) {
          this._rollback() // a failed commit must not leave the transaction open for every later write
          throw error
        }
      }
    } finally {
      this._depth--
    }
    return result
  }

  /** `rebuild()` makes the term index `name` again from what it indexes (`reindex` calls it). */
  index (name, rebuild) {
    this._indexes.set(name, rebuild)
  }

  /** Every term index made again when the tokenizer has changed since it was made (`terms_version`: jieba turned on
   * in Python, a new release); whether it was. Whoever reads an index asks this first. */
  reindex () {
    const wanted = texts.version()
    if (this.meta('terms_version') === wanted) return false
    return this.transaction(() => {
      if (this.meta('terms_version') === wanted) return false // (another writer, while this one waited for the lock)
      for (const rebuild of this._indexes.values()) rebuild()
      this.setMeta('terms_version', wanted)
      return true
    })
  }

  meta (key) {
    return this.row('select value from meta where key = ?', [key])?.value ?? null
  }

  setMeta (key, value) {
    this.execute('insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
      [key, value])
  }
}

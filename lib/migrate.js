// A memory file of an earlier schema made current, by hand, once. A port of mneme_llm/migrate.py.
//
//     import { migrate } from 'dsh-mneme-llm/lib/migrate'
//     migrate('companion.db')
//
// Back the file up and stop whatever uses it first. Each file changes in one transaction, whole or not at all, and one
// that is current already is left as it is, so running this twice is safe. It says what it did to each file.
//
// From schema 1 to 2: every exchange gets its talking day (in the zone of its space's config, the machine's where that
// gives none) and its tokens; a surface's `since` becomes the last exchange said before it; everyone kept from before
// first prompts were gets the first thing they said as theirs; what nothing reads any more goes (the word centroids,
// `vectors.taught`, `memories.terms`, `people.updated_at`, `episodes.terms`), and so do config keys no version knows;
// the term indexes are rebuilt the first time they are searched.
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { known, zoneOf } from './config.js'
import * as dates from './dates.js'
import { cost } from './episodes.js'
import * as py from './python.js'
import { SCHEMA_VERSION, create } from './store.js'
import { FIRST } from './surface.js'
import * as texts from './text.js'

export const RESHAPED = ['memories', 'vectors', 'people', 'episodes', 'surfaces'] // in schema 2
export const GONE = ['micro_models', 'meaning_terms']

const has = (db, table) => db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table) !==
  undefined

function version (db) {
  if (!has(db, 'meta')) return null
  const row = db.prepare("select value from meta where key = 'schema_version'").get()
  return row ? py.int(row.value) : null
}

/** Each space's zone, as its config gives it; one that cannot be read counts as none. */
function zones (db) {
  const found = new Map()
  if (has(db, 'config')) {
    for (const row of db.prepare("select space, value from config where key = 'companion.zone'").all()) {
      try {
        found.set(row.space, zoneOf(py.loads(row.value)))
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof py.ValueError)) throw error
      }
    }
  }
  return found
}

/** A table's rows back from `old_<table>`, by the columns both have; `filled` gives SQL for a new column. */
function copy (db, table, filled = {}) {
  const had = new Set(db.prepare(`pragma table_info(old_${table})`).all().map(row => row.name))
  const columns = db.prepare(`pragma table_info(${table})`).all().map(row => row.name)
    .filter(column => had.has(column) || Object.hasOwn(filled, column))
  const values = columns.map(column => Object.hasOwn(filled, column) ? filled[column] : column).join(', ')
  db.exec(`insert into ${table} (${columns.join(', ')}) select ${values} from old_${table}`)
}

/** For everyone kept from before first prompts were, the first thing they said: else their next message would be. */
function firsts (db) {
  const names = new Map(db.prepare("select space, value from config where key = 'companion.name'").all()
    .map(row => [row.space, py.loads(row.value)]))
  let added = 0
  for (const row of db.prepare('select space, subject, min(id) as id from episodes where not exists (select 1 from ' +
    'first_prompts f where f.space = episodes.space and f.subject = episodes.subject) group by space, subject').all()) {
    const hers = new Set([names.has(row.space) ? names.get(row.space) : null, 'assistant', ''])
    for (const episode of db.prepare('select at, lines from episodes where space = ? and subject = ? order by at, id')
      .all(row.space, row.subject)) {
      const said = py.loads(episode.lines).map(([who, said]) => [who, said]).find(([who]) => !hers.has(who))?.[1]
      if (py.truthy(said)) {
        db.prepare('insert into first_prompts (space, subject, text, at, by_command, send) values (?, ?, ?, ?, 0, 0)')
          .run(row.space, row.subject, texts.fit(said, FIRST), episode.at)
        added++
        break
      }
    }
  }
  return added
}

/** Schema 1 to 2, inside the caller's transaction; what it did, in words. */
function toTwo (db) {
  const moved = RESHAPED.filter(table => has(db, table))
  const gone = GONE.filter(table => has(db, table))
  for (const table of moved) {
    db.exec(`alter table ${table} rename to old_${table}`)
    for (const row of db.prepare("select name from sqlite_master where type = 'index' and tbl_name = ? and sql is " +
      'not null').all(`old_${table}`)) db.exec(`drop index ${row.name}`)
  }
  for (const table of gone) db.exec(`drop table ${table}`)
  create(db)

  let exchanges = 0, surfaces = 0
  if (moved.includes('memories')) {
    copy(db, 'memories', { folded: "''" })
    const update = db.prepare('update memories set folded = ? where id = ?')
    for (const row of db.prepare('select id, text from memories').all()) update.run(texts.fold(row.text), row.id)
  }
  for (const table of ['vectors', 'people']) if (moved.includes(table)) copy(db, table)
  if (moved.includes('episodes')) {
    copy(db, 'episodes', { day: '0', tokens: '0' })
    const zone = zones(db)
    const update = db.prepare('update episodes set day = ?, tokens = ? where id = ?')
    for (const row of db.prepare('select id, space, at, lines from episodes').all()) {
      update.run(dates.talkingDay(row.at, zone.get(row.space) ?? null), cost(py.loads(row.lines)), row.id)
      exchanges++
    }
  }
  const taken = moved.includes('episodes') ? firsts(db) : 0
  if (moved.includes('surfaces')) {
    for (const row of db.prepare('select * from old_surfaces').all()) {
      const start = db.prepare('select coalesce(max(id), 0) as id from episodes where space = ? and subject = ? and ' +
        'at < ?').get(row.space, row.subject, row.since).id
      db.prepare('insert into surfaces (space, subject, start_id, cleared_at, summary) values (?, ?, ?, ?, ?)')
        .run(row.space, row.subject, start, row.since, row.summary)
      surfaces++
    }
  }
  for (const table of moved) db.exec(`drop table old_${table}`)

  const stale = db.prepare('select space, key from config').all().filter(row => !known(row.key))
  for (const row of stale) db.prepare('delete from config where space = ? and key = ?').run(row.space, row.key)
  db.exec("delete from meta where key in ('terms_indexed', 'terms_version') or key like 'meaning_texts:%' or key " +
    "like 'meaning_version:%'")
  const dropped = gone.length ? `, dropped ${gone.join(' and ')}` : ''
  return `${exchanges} exchanges got their day and tokens, ${surfaces} surfaces start at an exchange now, ${taken} ` +
    `first prompts taken from the first thing said, ${stale.length} old config keys removed${dropped}; search ` +
    'indexes are rebuilt at the first search'
}

/** One file made current, in one transaction; what was done to it, in words. */
export function migrate (file) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw Object.assign(new Error(`${file}: no such file`), { code: 'ENOENT' })
  }
  const db = new DatabaseSync(String(file))
  let found, done
  try {
    db.exec('pragma busy_timeout = 10000')
    db.exec('begin immediate')
    try {
      found = version(db)
      if (found === SCHEMA_VERSION) {
        db.exec('rollback')
        return `${file}: schema ${found} already, nothing to do`
      }
      if (found !== 1) throw new py.ValueError(`${file}: not a schema 1 file (schema ${py.str(found)})`)
      done = toTwo(db)
      db.prepare("update meta set value = ? where key = 'schema_version'").run(String(SCHEMA_VERSION))
      db.exec('commit')
    } catch (error) {
      try {
        db.exec('rollback')
      } catch {} // (SQLite may have rolled it back itself)
      throw error
    }
  } finally {
    db.close()
  }
  return `${file}: schema ${found} to ${SCHEMA_VERSION}: ${done}`
}

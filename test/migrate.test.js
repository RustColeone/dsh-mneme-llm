// A file of schema 1 made current: refused until then, migrated once, whole or not at all: the cases of mneme-llm's
// tests/test_migrate.py, on the file its tests build (test/oldfile.js).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { talkingDay } from '../lib/dates.js'
import { cost } from '../lib/episodes.js'
import { migrate } from '../lib/migrate.js'
import { Mneme } from '../lib/mneme.js'
import { fold, version } from '../lib/text.js'
import { LINES, START, oldFile } from './oldfile.js'

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-old-'))
const rows = (file, sql) => {
  const db = new DatabaseSync(file)
  try {
    return db.prepare(sql).all().map(row => ({ ...row }))
  } finally {
    db.close()
  }
}
const open = file => new Mneme(file, 't', { embed: false, memoryLanguage: null, companionName: '小鲸' })

test('a file of schema 1 is refused untouched, and told what to run', () => {
  const file = oldFile(folder())
  assert.throws(() => open(file), new RegExp(`python -m mneme_llm.migrate ${file}`))
  assert.equal(rows(file, "select value from meta where key = 'schema_version'")[0].value, '1')
})

test('every exchange gets its day in its space\'s zone, and its tokens; a surface starts at an exchange', () => {
  const file = oldFile(folder())
  const report = migrate(file)
  const found = rows(file, 'select * from episodes order by id')
  assert.deepEqual(found.map(row => row.id), [1, 2, 3, 4])
  assert.equal(found[2].day, talkingDay(found[2].at, { offset: 8 * 3600 })) // already the next day where she lives
  assert.notEqual(found[2].day, talkingDay(found[2].at, { offset: 0 }))
  assert.equal(found[3].day, talkingDay(found[3].at, null)) // a zone that cannot be read: the machine's
  assert.equal(found[0].tokens, cost(LINES))
  assert.ok(!('terms' in found[0]))
  const surfaces = Object.fromEntries(rows(file, 'select * from surfaces').map(row => [row.subject, row]))
  assert.deepEqual(surfaces.u, { space: 't', subject: 'u', start_id: 1, cleared_at: START + 3600,
    summary: 'he has a cat' })
  assert.equal(surfaces.nobody.start_id, 0)
  assert.match(report, /schema 1 to 2: 4 exchanges got their day and tokens, 2 surfaces start at an exchange now/)
  assert.match(report, /3 old config keys removed, dropped micro_models and meaning_terms/)
  const m = open(file)
  assert.equal(m.surface.began('u'), START + 3600)
  assert.equal(m.surface.read('u').messages.length, 5) // the summary, and two exchanges of two lines each
  assert.deepEqual(m.config.unknown, [])
  m.close()
})

test('what nothing reads is gone, and what was measured stays', () => {
  const file = oldFile(folder())
  migrate(file)
  const tables = new Set(rows(file, "select name from sqlite_master where type = 'table'").map(row => row.name))
  const indexes = new Set(rows(file, "select name from sqlite_master where type = 'index'").map(row => row.name))
  const columns = table => new Set(rows(file, `pragma table_info(${table})`).map(row => row.name))
  const meta = Object.fromEntries(rows(file, 'select key, value from meta').map(row => [row.key, row.value]))
  assert.ok(!tables.has('micro_models') && !tables.has('meaning_terms'))
  assert.ok(![...tables].some(table => table.startsWith('old_')))
  assert.ok(!indexes.has('vectors_untaught') && indexes.has('episodes_day'))
  assert.ok(!columns('memories').has('terms') && !columns('vectors').has('taught') && !columns('people').has('updated_at'))
  assert.equal(meta.schema_version, '2')
  assert.ok('floor:toy' in meta)
  assert.ok(!('terms_indexed' in meta) && !('meaning_texts:toy' in meta) && !('meaning_version:toy' in meta))
  assert.deepEqual(new Set(rows(file, 'select key from config').map(row => row.key)),
    new Set(['companion.zone', 'companion.name']))
})

test('someone with no first prompt gets the first thing they said; notes and links carry over', () => {
  const file = oldFile(folder())
  const db = new DatabaseSync(file)
  for (const [at, lines] of [[START, [['小鲸', '你好呀'], ['Mei', '以后叫我姐姐']]], [START + 60, [['Mei', '今天好累']]]]) {
    db.prepare("insert into episodes (space, subject, at, conversation, lines, size, stability) values ('t', 'v', ?, " +
      "'', ?, 10, 30)").run(at, JSON.stringify(lines))
  }
  db.close()
  assert.match(migrate(file), /2 first prompts taken/) // (and u in the other space)
  const m = open(file)
  assert.equal(m.surface.first('v').text, '以后叫我姐姐') // (not what she said first)
  assert.equal(m.surface.first('v').send, false)
  assert.equal(m.surface.first('u').text, '你是我的姐姐') // (one they had stays)
  assert.deepEqual(m.memory.notes('u').map(note => note.text).sort(), ['Has a CAT', 'Likes tea'])
  assert.equal(rows(file, 'select folded from memories where id = 1')[0].folded, fold('Has a CAT'))
  assert.equal(m.person('web:leo'), 'u')
  assert.equal(m.meaning, null)
  assert.equal(m.store.meta('terms_version'), null)
  assert.deepEqual(m.recall('u', 'cat', { important: 0, recent: 0 }).chosen.map(item => item.note.text),
    ['Has a CAT']) // a note that was never indexed
  assert.equal(m.episodes.search('u', '年糕', { limit: 9 }).length, 3) // (only one was, in that file)
  assert.equal(m.store.meta('terms_version'), version())
  assert.equal(m.episodes.keep('u', [['Leo', '新的一句']]).id, 7) // a new exchange goes on after the old ids
  m.episodes.forget('u', 7)
  assert.equal(m.episodes.keep('u', [['Leo', '再一句']]).id, 8)
  m.close()
})

test('running it twice changes nothing; a failure leaves the file as it was', () => {
  let file = oldFile(folder())
  migrate(file)
  const before = fs.readFileSync(file)
  assert.match(migrate(file), /nothing to do/)
  assert.deepEqual(fs.readFileSync(file), before)
  file = oldFile(folder())
  const db = new DatabaseSync(file)
  db.exec("update episodes set lines = 'not json' where id = 3")
  db.close()
  assert.throws(() => migrate(file), /Expecting value/)
  assert.equal(rows(file, "select value from meta where key = 'schema_version'")[0].value, '1')
  assert.equal(rows(file, 'select * from micro_models').length, 0)
  assert.equal(rows(file, "select since from surfaces where subject = 'u'")[0].since, START + 3600)
  assert.throws(() => migrate(path.join(folder(), 'no.db')), /no such file/)
})

test('an older schema 1 file with no exchanges is made current', () => {
  const file = path.join(folder(), 'first.db'), db = new DatabaseSync(file)
  db.exec(`
    create table meta (key text primary key, value text not null);
    insert into meta values ('schema_version', '1');
    create table memories (id integer primary key, space text not null, subject text not null, key text,
      kind text not null, text text not null, importance integer not null, feeling real not null default 0,
      happened_at real not null, created_at real not null, recalled_at real, recalls integer not null default 0,
      superseded_by integer, deleted_at real, source text);
    insert into memories (space, subject, kind, text, importance, happened_at, created_at)
      values ('t', 'u', 'fact', 'Has a cat', 3, 0, 0);
    create table config (space text not null, key text not null, value text not null, origin text not null,
      updated_at real not null, primary key (space, key));`)
  db.close()
  migrate(file)
  const m = open(file)
  assert.deepEqual(m.recall('u', 'cat', { important: 0, recent: 0 }).chosen.map(item => item.note.text), ['Has a cat'])
  assert.equal(m.episodes.count(), 0)
  m.close()
})

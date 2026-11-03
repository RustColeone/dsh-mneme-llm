// The file: its schema, the versions it refuses, WAL, and transactions.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { IN_LIST, SCHEMA_VERSION, Store } from '../lib/store.js'

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'store-')), 'm.db')

test('a new file has the schema, its versions and WAL', () => {
  const where = file()
  const store = new Store(where)
  assert.equal(store.meta('schema_version'), String(SCHEMA_VERSION))
  assert.equal(store.meta('terms_version'), '4')
  assert.equal(store.row('pragma journal_mode').journal_mode, 'wal')
  assert.equal(store.rows("select name from sqlite_master where type = 'table'").length, 19)
  store.close()
  new Store(where).close() // (opened again, nothing changes)
})

test('a file of another schema is refused, untouched', () => {
  for (const [version, said] of [['3', /newer mneme-llm \(schema 3\)/], ['1', /python -m mneme_llm\.migrate/]]) {
    const where = file()
    new Store(where).close()
    const db = new DatabaseSync(where)
    db.exec(`update meta set value = '${version}' where key = 'schema_version'`)
    db.exec('create table mine (x)')
    db.close()
    const before = fs.readFileSync(where)
    assert.throws(() => new Store(where), said)
    assert.deepEqual(fs.readFileSync(where), before)
  }
})

test('a transaction lands whole or not at all, and one inside another is a savepoint', () => {
  const store = new Store(':memory:')
  assert.throws(() => store.transaction(() => {
    store.setMeta('a', '1')
    throw new Error('no')
  }), /no/)
  assert.equal(store.meta('a'), null)
  store.transaction(() => {
    store.setMeta('b', '1')
    assert.throws(() => store.transaction(() => {
      store.setMeta('c', '1')
      throw new Error('inner')
    }))
    assert.equal(store.transaction(() => 7), 7)
  })
  assert.deepEqual([store.meta('b'), store.meta('c')], ['1', null])
  assert.throws(() => store.transaction(async () => store.setMeta('d', '1')), TypeError)
  assert.equal(store.meta('d'), null)
  assert.equal(store.inTransaction, false)
})

test('any number of values in one `in`', () => {
  const store = new Store(':memory:')
  store.transaction(() => {
    for (let n = 0; n < IN_LIST * 2 + 5; n++) store.setMeta(`k${n}`, String(n))
  })
  const keys = Array.from({ length: IN_LIST * 2 + 5 }, (_, n) => `k${n}`)
  assert.equal(store.rowsIn('select key from meta where key in ({})', keys).length, keys.length)
  store.rowsIn("delete from meta where value != ? and key in ({})", keys, ['never'])
  assert.equal(store.row('select count(*) as n from meta').n, 2)
})

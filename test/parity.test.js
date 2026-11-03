// This port against Python's mneme-llm, without Python: test/fixtures/parity.json holds what mneme-llm 0.4.0 gives for
// the same inputs (tools/fixtures.py wrote it; CI writes it again from the released package and fails on a difference).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Config, check, written, zoneOf } from '../lib/config.js'
import * as dates from '../lib/dates.js'
import * as G from '../lib/gut.js'
import * as py from '../lib/python.js'
import { Random } from '../lib/random.js'
import { Relations } from '../lib/relations.js'
import { Store, dumps } from '../lib/store.js'
import { bounds } from '../lib/surface.js'
import * as T from '../lib/text.js'
import * as scenarios from '../tools/scenario.js'
import { FEELS, FORMS, near as close } from './helpers.js'

const P = JSON.parse(fs.readFileSync(new URL('./fixtures/parity.json', import.meta.url), 'utf8'))
const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const textOf = text => [T.terms(text), py.repr(T.tokens(text)), T.fold(text), T.normalize(text), T.clean(text),
  T.blank(text), P.text.clips.map(n => T.clip(text, n)), P.text.fits.map(n => T.fit(text, n)), py.split(text).join(' ')]
const near = (actual, expected) => close(assert, actual, expected)

test('the fixtures are mneme-llm 0.4.0\'s, with the tokenizer this port has', () => {
  assert.equal(P.mneme_llm, '0.4.0')
  assert.equal(P.terms_version, T.version())
})

test('text: terms, tokens, folding, cleaning and cutting, string by string', () => {
  assert.ok(P.text.cases.length > 300)
  P.text.cases.forEach((text, index) => assert.deepEqual(textOf(text), P.text.out[index], JSON.stringify(text)))
})

test('text: 20,000 strings drawn with Python\'s random numbers come out the same', () => {
  const { count, seed, digest } = P.text.drawn
  const rng = new Random(seed), letters = py.chars(P.text.alphabet), lines = []
  for (let n = 0; n < count; n++) {
    const size = rng.randbelow(25)
    let text = ''
    for (let i = 0; i < size; i++) text += letters[rng.randbelow(letters.length)]
    lines.push(py.dumps(textOf(text)))
  }
  assert.equal(crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), digest)
})

test('talking days and local times in thirteen zones, across the changes of summer time', () => {
  for (const name of P.dates.zones) {
    const zone = zoneOf(name)
    P.dates.stamps.forEach((moment, index) => assert.deepEqual(
      [dates.talkingDay(moment, zone), dates.stamp(moment, zone)], P.dates.out[name][index], `${name} ${moment}`))
  }
})

test('what the surface keeps and may reach', () => {
  for (const [recent, floor, cap, window, keep, top] of P.bounds) {
    assert.deepEqual(bounds(recent, floor, cap, window), [keep, top])
  }
})

test('a new space\'s config is written row for row as Python writes it', () => {
  const store = new Store(':memory:')
  new Config(store, 'x', () => 1).seed()
  const rows = store.rows('select key, value from config order by rowid')
  assert.deepEqual(rows.map(row => [row.key, row.value]), Object.entries(P.config.defaults))
  for (const [key, value, ok, kept] of P.config.checks) {
    let found
    try {
      found = [true, written(key, check(key, value))]
    } catch (error) {
      assert.ok(error instanceof py.ValueError, `${key}: ${error}`)
      found = [false, null]
    }
    assert.deepEqual(found, [ok, kept], `${key} ${JSON.stringify(value)}`)
  }
  store.close()
})

test('who people are to her, as the prompt says it, as closeness fades', () => {
  const store = new Store(':memory:'), at = { t: 1767225600.0 }
  const relations = new Relations(store, 's', { clock: () => at.t })
  for (const [subject, role, closeness] of [['a', 'creator', null], ['b', 'family', 60.5], ['c', 'friend', 39.5],
    ['d', 'acquaintance', 0.5], ['e', 'friend', 79.5], ['f', 'friend', 20.4999]]) {
    relations.set(subject, role, { closeness })
  }
  const found = []
  for (const days of [0, 1, 15, 45, 400]) {
    at.t = 1767225600.0 + days * 86400
    found.push([...'abcdef'].map(subject => [relations.line(subject, 'Leo'), relations.weight(subject),
      relations.get(subject).closeness]))
  }
  relations.displayLanguage = 'zh'
  found.push([...'abcdef'].map(subject => relations.line(subject)))
  assert.deepEqual(found, P.relations)
  store.close()
})

test('the gut born from its starter, and after a sleep, has Python\'s weights', async () => {
  const [rows, base] = G.readStarter(STARTER)
  assert.equal(rows.length, P.gut.rows)
  const net = new G.Net()
  net.start(rows)
  const forms = FORMS, feels = FEELS, vectors = () => forms.flatMap(form => [10, 85].map(closeness =>
    net.vector(form, closeness)))
  vectors().forEach((item, i) => near(item, P.gut.born[i]))
  for (let index = 0; index < 30; index++) {
    net.teach(forms[index % 3], feels[index % 3], index % 3 - 1, [85, 50, 41][index % 3])
  }
  await net.sleep(30)
  vectors().forEach((item, i) => near(item, P.gut.slept[i]))
  assert.ok(Math.abs(net.share() - P.gut.share) < 2e-9)
  const marks = new G.Marks(base)
  for (let index = 0; index < 90; index++) {
    const words = ['喵', '本鲸', '呜呜', '哼', '嘿嘿', 'nya', '好的'].filter((_, j) => index % (j + 1) === 0)
    marks.teach(['zh', 'en'][index % 2], forms[index % 3], index % 5 - 2, [85, 50, 41][index % 3], words)
  }
  marks.heads = await marks.trained(7)
  assert.deepEqual(Object.keys(marks.heads).sort(), Object.keys(P.gut.heads))
  for (const [language, head] of Object.entries(P.gut.heads)) {
    assert.deepEqual(marks.heads[language].names, head.names)
    marks.heads[language].b.forEach((value, k) => assert.ok(Math.abs(value - head.b[k]) < 2e-9))
  }
  assert.deepEqual(['zh', 'en'].flatMap(language => forms.flatMap(form => [41, 85].map(closeness =>
    marks.speaks(language, form, closeness)))), P.gut.spoken)
})

test('the scenario: what Python read from its file, and every row of that file, come out the same', async () => {
  const given = scenarios.scenario(), folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-'))
  const file = path.join(folder, 'scenario.db'), state = { t: given.ops[0][1] }
  const m = scenarios.opened(file, given, state)
  assert.deepEqual(await scenarios.apply(m, state, given.ops), P.scenario.asked)
  assert.deepEqual(scenarios.read(m, state, given), P.scenario.reads)
  m.close()
  const rows = dumps(scenarios.dump(file))
  assert.equal(crypto.createHash('sha256').update(rows).digest('hex'), P.scenario.dump)
})

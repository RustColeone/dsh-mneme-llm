// This package against Python's mneme-llm, without Python: test/fixtures/parity.json holds what mneme-llm 0.8.0 gives
// for the same inputs (tools/fixtures.py wrote it; CI writes it again from the released package and fails on a
// difference).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { notesIn } from '../lib/capture.js'
import { Config, DEFAULTS, check, toToml, written, zoneOf } from '../lib/config.js'
import * as dates from '../lib/dates.js'
import { Choice, Predicate, Prompt, Score, normalized } from '../lib/decide.js'
import { spreadBin, tally, threshold } from '../lib/episodes.js'
import * as G from '../lib/gut.js'
import { Words } from '../lib/i18n.js'
import * as calibrate from '../lib/meaning/calibrate.js'
import { Unify } from '../lib/meaning/unify.js'
import * as py from '../lib/python.js'
import { Random } from '../lib/random.js'
import { Relations } from '../lib/relations.js'
import { Store, dumps } from '../lib/store.js'
import { bounds } from '../lib/surface.js'
import * as T from '../lib/text.js'
import * as toml from '../lib/toml.js'
import { specs } from '../lib/tools.js'
import * as scenarios from '../tools/scenario.js'
import * as worlds from '../tools/world.js'
import { FEELS, FORMS, near as close } from './helpers.js'

const P = JSON.parse(fs.readFileSync(new URL('./fixtures/parity.json', import.meta.url), 'utf8'))
const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const textOf = text => [T.terms(text), py.repr(T.tokens(text)), T.fold(text), T.normalize(text), T.clean(text),
  T.blank(text), P.text.clips.map(n => T.clip(text, n)), P.text.fits.map(n => T.fit(text, n)), py.split(text).join(' ')]
const near = (actual, expected) => close(assert, actual, expected)

test('the fixtures are mneme-llm 0.8\'s, with the tokenizer this package has', () => {
  assert.ok(P.mneme_llm.startsWith('0.8.'), P.mneme_llm)
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

test('the gut born from its starter, and after lessons from three people and a sleep, has Python\'s weights', () => {
  const [rows, words, known] = G.readStarter(STARTER)
  assert.equal(rows.length, P.gut.rows)
  assert.deepEqual(known, P.gut.known)
  assert.deepEqual(words, {}, 'the starter holds feelings only: her words are her own')
  const base = { zh: { words: new Map([['哼', 40], ['好的', 120], ['呜呜', 200], ['喵', 1]]), n: 575 },
    en: { words: new Map([['nya', 2]]), n: 594 } } // (tools/fixtures.py's BASE)
  const net = new G.Net()
  net.start(rows, known)
  const forms = FORMS, feels = FEELS
  forms.flatMap(form => [10, 85].map(closeness => net.vector(form, closeness)))
    .forEach((item, i) => near(item, P.gut.born[i]))
  for (let index = 0; index < 30; index++) {
    net.teach('abc'[index % 3], forms[index % 3], feels[index % 3], index % 3 - 1, [85, 50, 41][index % 3], G.ENDS,
      Math.floor(index / 4))
  }
  net.sleep()
  forms.flatMap(form => [10, 85].flatMap(closeness => [null, 'a', 'c'].map(who => net.vector(form, closeness, who))))
    .forEach((item, i) => near(item, P.gut.slept[i]))
  assert.ok(Math.abs(net.learning() - P.gut.learning) < 2e-9)
  ;[...'abc'].forEach((who, i) => assert.ok(Math.abs(net.weight(who) - P.gut.weights[i]) < 2e-9))
  const marks = new G.Marks(base)
  for (let index = 0; index < 90; index++) {
    const words = ['喵', '本鲸', '呜呜', '哼', '嘿嘿', 'nya', '好的'].filter((_, j) => index % (j + 1) === 0)
    marks.teach(['zh', 'en'][index % 2], forms[index % 3], index % 5 - 2, [85, 50, 41][index % 3], words)
  }
  return marks.trained(7).then(heads => { marks.heads = heads
  assert.deepEqual(Object.keys(marks.heads).sort(), Object.keys(P.gut.heads))
  for (const [language, head] of Object.entries(P.gut.heads)) {
    assert.deepEqual(marks.heads[language].names, head.names)
    marks.heads[language].b.forEach((value, k) => assert.ok(Math.abs(value - head.b[k]) < 2e-9))
  }
  assert.deepEqual(['zh', 'en'].flatMap(language => forms.flatMap(form => [41, 85].map(closeness =>
    marks.speaks(language, form, closeness)))), P.gut.spoken)
  })
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

// ---- notes, mood and meaning ---------------------------------------------------------------------------------------
test('the judge: its message, and what it reads in a reply, label by label', () => {
  const questions = [new Predicate('worth', 'Worth it?'), new Choice('feeling', 'Which feeling?',
    { happy: 'happy (开心)', none: '' }), new Choice('pick', 'Pick one.', ['a', 'b', 'c']),
  new Score('mood_change', 'How did it move?', [['-2', 'worse'], ['-1', ''], ['0', 'same'], ['1', ''],
    ['2', 'better']])]
  const prompt = new Prompt(null)
  assert.equal(prompt.message('我的猫叫年糕。'.repeat(3000) + 'end', questions), P.decide.message)
  assert.equal(prompt.message('Leo: hi', questions.slice(0, 1)), P.decide.short)
  const answer = found => [[...found.probabilities], found.confidence, found.by, found.reason, found.choice,
    found.probability, found.name === 'mood_change' ? found.mean() : null]
  P.decide.replies.forEach((reply, index) => {
    const parsed = Object.fromEntries(Object.entries(prompt.parse(reply, questions)).map(([name, found]) => [name,
      answer(found)]))
    assert.deepEqual(parsed, P.decide.parsed[index], reply.slice(0, 80))
  })
  for (const [given, labels, wanted] of P.decide.normalized) assert.deepEqual([...normalized(given, labels)], wanted)
})

test('the note writer\'s replies as notes, held to the rules of writing', () => {
  for (const [reply, name, wanted] of P.notes) {
    assert.deepEqual(notesIn(reply, 1767229200.0, zoneOf(name)), wanted, `${name} ${reply.slice(0, 60)}`)
  }
})

test('dates as a person says them, when a day began, noon of a day, a day written in a sentence', () => {
  const { zones, moments, days, found, out } = P.dates2
  for (const name of zones) {
    const zone = zoneOf(name), now = 1767229200.0
    assert.deepEqual(moments.map(moment => [dates.when(moment, now, zone), dates.when(moment, now, zone,
      new Words('zh')), dates.dayBegan(moment, zone), dates.strftime(moment, zone, '%Y-%m-%d (%A) %d %B %Y, %H:%M')]),
    out[name].when, name)
    assert.deepEqual(days.map(day => dates.noon(day, zone)), out[name].noon, name)
    assert.deepEqual(found.map(text => [dates.find(text, now, zone), dates.find(text, now, zone, { ahead: true })]),
      out[name].find, name)
  }
})

test('Python\'s sums of floats, reprs, lines, JSON and fixed digits', () => {
  const { sums, summed, reprs, lines, loads, loaded, fixed } = P.python
  sums.forEach((values, index) => { // (an empty sum is Python's int 0)
    assert.equal(values.length ? py.repr(py.sum(values.map(Number))) : String(py.sum([])), summed[index], values.join())
  })
  P.text.cases.forEach((text, index) => {
    assert.equal(py.reprString(text), reprs[index], JSON.stringify(text))
    assert.deepEqual(py.splitlines(text), lines[index], JSON.stringify(text))
  })
  const constants = value => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return { constant: Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity' }
    }
    if (Array.isArray(value)) return value.map(constants)
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, constants(item)]))
    }
    return value
  }
  loads.forEach((text, index) => {
    let found
    try {
      found = ['ok', constants(py.loads(text))]
    } catch (error) {
      assert.ok(error instanceof py.ValueError, error.message)
      found = ['error']
    }
    assert.deepEqual(found, loaded[index], text)
  })
  for (const [value, two, three] of fixed) assert.deepEqual([py.fixed(Number(value), 2), py.fixed(Number(value), 3)],
    [two, three])
})

test('the scripts of text, and which text the unify tier translates', () => {
  const { languages, scripts, translate } = P.scripts
  P.text.cases.forEach((text, index) => {
    const shares = T.scripts(text)
    assert.deepEqual(Object.keys(shares), Object.keys(scripts[index]), JSON.stringify(text))
    for (const [kind, share] of Object.entries(scripts[index])) assert.equal(shares[kind], share)
    assert.deepEqual(languages.map(language => new Unify(null, language).needsTranslation(text)), translate[index])
  })
})

/** A TOML document's table as tools/fixtures.py writes Python's: floats that are not finite and dates as text. */
const plain = value => {
  if (typeof value === 'number' && !Number.isFinite(value)) return { float: py.repr(value) }
  if (value instanceof toml.TomlDate) return { date: value.iso }
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  }
  return value
}

test('TOML documents read as tomllib reads them, and refused with its words', () => {
  P.toml.documents.forEach((text, index) => {
    let found
    try {
      found = ['ok', plain(toml.loads(text))]
    } catch (error) {
      assert.ok(error instanceof toml.TOMLDecodeError, error.stack)
      found = ['error', error.message]
    }
    assert.deepEqual(found, P.toml.read[index], JSON.stringify(text))
  })
})

test('a config file seeds a space row for row, and the config written as a file reads back the same', () => {
  assert.equal(toToml(DEFAULTS), P.toml.template)
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-')), file = path.join(folder, 'companion.toml')
  fs.writeFileSync(file, P.toml.documents[0])
  const store = new Store(':memory:'), config = new Config(store, 's', () => 1.0)
  config.seed(file)
  assert.deepEqual(store.rows('select * from config order by rowid').map(row => [row.key, row.value, row.origin]),
    P.toml.rows)
  assert.equal(config.toToml(), P.toml.written)
  assert.deepEqual(plain(toml.loads(config.toToml())), P.toml.again)
  store.close()
})

test('the floor\'s numbers: quantiles, the spread\'s bins and its threshold', () => {
  const { lists, quantiles, bins, tallies, unrelated } = P.floor
  lists.forEach((given, index) => {
    const values = given.map(Number)
    assert.deepEqual([0, 0.25, 0.5, 0.95, 1].map(q => calibrate.quantile(values, q)), quantiles[index])
    assert.deepEqual(values.map(spreadBin), bins[index])
    const found = new Array(200).fill(0), pairs = tally(found, values)
    assert.deepEqual([pairs, found.flatMap((count, at) => count ? [at] : []), threshold(found, Math.max(pairs, 100)),
      threshold(found, pairs)], tallies[index])
  })
  assert.deepEqual(calibrate.UNRELATED, unrelated)
})

test('the tools\' specs, in every style', () => {
  for (const style of ['openai', 'responses', 'anthropic', 'gemini', 'mcp']) {
    assert.deepEqual(specs(style), P.specs[style])
  }
  assert.deepEqual(specs('mcp', { prefix: 'memory_', withSubject: true }), P.specs.subject)
})

/** JSON both sides write the same: every number as a float's repr, keys in order, ASCII. */
function canonical (value) {
  const order = item => {
    if (typeof item === 'number') return { '#': py.repr(item) }
    if (Array.isArray(item)) return item.map(order)
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort(py.compare).map(key => [key, order(item[key])]))
    }
    return item
  }
  return py.dumps(order(value), { compact: true })
}

const sha = text => crypto.createHash('sha256').update(text).digest('hex')

test('the world: notes, mood, the judge, the writer, meaning, tools, links and moves give what Python gave',
  async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-')), file = path.join(folder, 'world.db')
  for (const key of ['ops', 'more']) {
    const { asked, out } = await worlds.play(file, key), wanted = P.world[key]
    assert.deepEqual(asked, wanted.asked, key)
    out.forEach(([kind, found], index) => {
      const [, expected] = wanted.out[index]
      if (['read', 'export_import'].includes(kind)) assert.equal(sha(canonical(found)), expected, `${key} ${index}`)
      else assert.deepEqual(JSON.parse(JSON.stringify(found)), expected, `${key} ${index} ${kind}`)
    })
    assert.equal(out.length, wanted.out.length)
    assert.equal(sha(dumps(scenarios.dump(file))), wanted.dump, key)
  }
})

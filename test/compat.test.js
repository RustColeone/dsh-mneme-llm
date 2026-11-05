// Files both ways, against Python's mneme-llm itself: a file Python writes is read here as Python reads it, one written
// here is read by Python as it is read here, and the same operations make the same file row for row. Skipped when
// Python or the package is not there: set MNEME_LLM_PYTHON to a Python, and PYTHONPATH to a checkout if it is not
// installed. CI runs these against the released package, with MNEME_LLM_REQUIRE set so that they cannot skip.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as dates from '../lib/dates.js'
import * as G from '../lib/gut.js'
import { migrate } from '../lib/migrate.js'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import * as T from '../lib/text.js'
import * as scenarios from '../tools/scenario.js'
import * as worlds from '../tools/world.js'

const PYTHON = process.env.MNEME_LLM_PYTHON || 'python3'
const TOOLS = fileURLToPath(new URL('../tools/', import.meta.url))
const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))

function python (args, { input, env } = {}) {
  const done = spawnSync(PYTHON, args, { encoding: 'utf8', input, env: { ...process.env, ...env }, maxBuffer: 1 << 28 })
  if (done.status !== 0) throw new Error(`${args.join(' ')}: ${done.stderr || done.error}`)
  return done.stdout
}

const probe = spawnSync(PYTHON, ['-c', 'import mneme_llm, unicodedata; print(mneme_llm.__version__, ' +
  'unicodedata.unidata_version)'], { encoding: 'utf8' })
const [version, unicode] = probe.status === 0 ? probe.stdout.trim().split(' ') : []
const skip = probe.status !== 0 ? 'no Python with mneme-llm here (MNEME_LLM_PYTHON, PYTHONPATH)'
  : !version.startsWith('0.7.') ? `mneme-llm ${version} is not 0.7` : false
if (skip && process.env.MNEME_LLM_REQUIRE) throw new Error(`MNEME_LLM_REQUIRE is set, and ${skip}`) // (CI: never skip)
const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-compat-'))
const tool = (name, ...args) => python([path.join(TOOLS, name), ...args])

test('the fixtures are what this mneme-llm gives', { skip }, () => {
  tool('fixtures.py', '--check')
})

test('lib/unicode.js holds this Python\'s Unicode tables', { skip: skip || (unicode !== '15.1.0' &&
  `Python's Unicode is ${unicode}, the tables are 15.1.0's`) }, () => {
  tool('unicode.py', '--check')
})

test('the same operations make the same file, row for row, here and in Python', { skip }, async () => {
  const where = folder(), theirs = path.join(where, 'python.db'), ours = path.join(where, 'js.db')
  const asked = JSON.parse(tool('scenario.py', 'write', theirs)).asked
  const given = scenarios.scenario(), state = { t: given.ops[0][1] }
  const m = scenarios.opened(ours, given, state)
  assert.deepEqual(await scenarios.apply(m, state, given.ops), asked)
  m.close()
  assert.deepEqual(JSON.parse(tool('scenario.py', 'dump', ours)), JSON.parse(tool('scenario.py', 'dump', theirs)))
  assert.deepEqual(scenarios.dump(theirs), JSON.parse(tool('scenario.py', 'dump', theirs)))
})

test('a file Python wrote, with a link, is read here as Python reads it; what is added here, Python reads the same',
  { skip }, async () => {
    const where = folder(), file = path.join(where, 'python.db'), copy = path.join(where, 'copy.db')
    tool('scenario.py', 'write', file)
    tool('scenario.py', 'extra', file) // web:leo is linked to discord:42, and says something
    const given = scenarios.scenario(), state = { t: 0 }
    let m = scenarios.opened(file, given, state)
    assert.deepEqual(scenarios.read(m, state, given), JSON.parse(tool('scenario.py', 'read', file)))
    assert.deepEqual(m.people.all(), { 'web:leo': 'discord:42' })
    m.close()
    fs.copyFileSync(file, copy)
    tool('scenario.py', 'more', copy) // Python adds `more` to one copy, this package to the other
    state.t = given.more[0][1]
    m = scenarios.opened(file, given, state)
    await scenarios.apply(m, state, given.more)
    m.close()
    assert.deepEqual(JSON.parse(tool('scenario.py', 'dump', file)), JSON.parse(tool('scenario.py', 'dump', copy)))
    m = scenarios.opened(file, given, state)
    assert.deepEqual(scenarios.read(m, state, given), JSON.parse(tool('scenario.py', 'read', file)))
    m.close()
  })

function gutRead (file) {
  const gut = new G.Gut(file, { starter: STARTER, tags: { 傲娇: '你嘴硬心软。' } })
  gut.wake()
  const forms = gutForms(), net = gut.net
  const found = { lessons: net.lessons, age: net.age, born: net.born, today: net.today, learning: net.learning(),
    people: Object.fromEntries([...net.people].map(([subject, item]) => [subject, [item.n, item.fade, item.day,
      net.weight(subject)]])),
    vectors: forms.flatMap(form => [10, 85].flatMap(closeness => [null, 'owner', 'friend'].map(who =>
      net.vector(form, closeness, who)))), grown: gut.grown,
    weights: gut.weights, held: gut.held, tone: gut.tone.kept(), settings: gut.settings,
    languages: Object.fromEntries(gut.languages),
    sightings: gut.sightings.map(row => [row.subject, row.at, row.name, row.more, row.closeness, row.what]),
    heads: Object.fromEntries(Object.entries(gut.marks.heads).sort().map(([language, head]) => [language, head.names])),
    spoken: ['zh', 'en'].flatMap(language => forms.map(form => gut.marks.speaks(language, form, 85))) }
  gut.close()
  return found
}

const gutForms = () => [
  { people: ['coworker'], gender: ['woman'], topic: ['lunch'], event: ['ate'], sender_feels: 'happy',
    toward_you: 'none' },
  { people: [], gender: [], topic: ['rain'], event: ['got wet'], sender_feels: 'tired', toward_you: 'asking' },
  { people: ['mother'], gender: ['woman'], topic: ['health'], event: ['fell'], sender_feels: 'worried',
    toward_you: 'affection' }] // (tools/gutfile.py's)

function sameGut (ours, theirs) {
  const { vectors, people, learning, ...rest } = ours
  const { vectors: wanted, people: known, learning: rate, ...others } = theirs
  assert.deepEqual(rest, others)
  assert.ok(Math.abs(learning - rate) < 1e-12)
  assert.deepEqual(Object.keys(people), Object.keys(known))
  for (const [subject, values] of Object.entries(people)) {
    values.forEach((value, i) => assert.ok(value === known[subject][i] || Math.abs(value - known[subject][i]) < 1e-12,
      `${subject} ${i}: ${value} against ${known[subject][i]}`))
  }
  vectors.forEach((vector, i) => {
    for (const end of G.ENDS) assert.ok(Math.abs(vector[end] - wanted[i][end]) < 1e-9, `${end}: ${vector[end]}`)
  })
}

test('a gut file moves both ways', { skip }, async () => {
  const where = folder(), file = path.join(where, 'gut.db')
  tool('gutfile.py', 'write', file)
  sameGut(gutRead(file), JSON.parse(tool('gutfile.py', 'read', file)))
  const gut = new G.Gut(file, { starter: STARTER, tags: { 傲娇: '你嘴硬心软。' } })
  gut.wake()
  const notes = [{ feel: { sweet: 0.6, jealous: 0.4 }, mood: 1 }, { feel: { tender: 1.0 }, mood: -1 },
    { feel: { worried: 0.7, sad: 0.3 }, mood: -2 }]
  for (let index = 25; index < 55; index++) {
    if (gut.teach(index % 4 === 3 ? 'friend' : 'owner', ['zh', 'en'][index % 2], gutForms()[index % 3],
      notes[index % 3], [85, 50, 41, 30][index % 4], ['喵', '本鲸', 'nya'].slice(0, 1 + index % 3),
      1767225600.0 + index * 5 * 3600)) await gut.sleep()
  }
  gut.writeSide('三无', '你话很少。', 1.0)
  gut.configure({ tau: 200.0, sensitivity: -0.5 })
  gut.tune('irritable', { nature: -1.0 })
  gut.tunePerson('owner', { end: 'sweet', nature: 1.5 })
  gut.tunePerson('owner', { weight: 0.4 })
  gut.tunePerson('friend', { locked: true })
  gut.lockSide('三无', { often: 0.5 })
  gut.configure({ locked: true })
  gut.close()
  sameGut(gutRead(file), JSON.parse(tool('gutfile.py', 'read', file)))
  const copy = path.join(where, 'python.db') // and the same lessons taught in Python give the same gut
  tool('gutfile.py', 'write', copy)
  tool('gutfile.py', 'more', copy)
  const ours = gutRead(file), theirs = JSON.parse(tool('gutfile.py', 'read', copy))
  sameGut({ ...ours, tone: null, sightings: null, held: null }, { ...theirs, tone: null, sightings: null, held: null })
})

test('every code point folds and normalizes here as in Python', { skip }, () => {
  const theirs = JSON.parse(python(['-c', `
import json, unicodedata, sys
out = {}
for code in range(0x110000):
    if 0xD800 <= code <= 0xDFFF: continue
    c = chr(code); n = unicodedata.normalize("NFKC", c); f = c.casefold()
    if n != c or f != c: out[code] = [n, f]
sys.stdout.write(json.dumps(out))`]))
  let differ = 0, checked = 0
  for (let code = 0; code < 0x110000; code++) {
    if (code >= 0xd800 && code <= 0xdfff) continue
    const character = String.fromCodePoint(code), normal = py.nfkc(character), folded = py.casefold(character)
    const wanted = theirs[code] ?? [character, character]
    checked++
    if (normal !== wanted[0] || folded !== wanted[1]) differ++
  }
  assert.equal(differ, 0, `${differ} of ${checked} code points`)
  assert.equal(T.normalize('Ａ́ ﬃ \u{1fbf0}'), python(['-c', 'import sys; from mneme_llm.text import normalize; ' +
    'sys.stdout.write(normalize("Ａ\\u0301 ﬃ \\U0001fbf0"))']))
})

test('talking days in the machine\'s own zone, as TZ sets it', { skip }, () => {
  const stamps = [0, 1711846800, 1730613600, 1772953200, 1774749600, 1793516400, 1767225599.9999995, 2e9, 4e9]
  const before = process.env.TZ
  try {
    for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe']) {
      const theirs = JSON.parse(python(['-c', 'import json, sys; from mneme_llm import dates; ' +
        `print(json.dumps([[dates.talking_day(s), dates.stamp(s)] for s in ${JSON.stringify(stamps)}]))`],
      { env: { TZ: zone } }))
      process.env.TZ = zone
      assert.deepEqual(stamps.map(moment => [dates.talkingDay(moment), dates.stamp(moment)]), theirs, zone)
    }
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
})

// ---- notes, mood and meaning ---------------------------------------------------------------------------------------
const json = value => JSON.parse(JSON.stringify(value)) // (as the other side's JSON reads)
const rows = file => JSON.parse(tool('world.py', 'dump', file))

test('the world: the same operations, with the same models, ask the same, give the same and make the same file',
  { skip }, async () => {
    const where = folder(), theirs = path.join(where, 'python.db'), ours = path.join(where, 'js.db')
    const python = JSON.parse(tool('world.py', 'write', theirs))
    const js = json(await worlds.play(ours))
    assert.deepEqual(js.asked, python.asked)
    js.out.forEach((item, index) => assert.deepEqual(item, python.out[index], `${index} ${item[0]}`))
    assert.equal(js.out.length, python.out.length)
    assert.deepEqual(rows(ours), rows(theirs))
    assert.deepEqual(scenarios.dump(theirs), rows(theirs))
  })

test('a file either side wrote, the other reads and adds to as its writer would: notes, keys and their history, ' +
  'profiles, recalls, moods and their events, aliases, links, vectors and the floor, config', { skip }, async () => {
  for (const first of ['python', 'js']) {
    const where = folder(), file = path.join(where, 'world.db'), copy = path.join(where, 'copy.db')
    if (first === 'python') tool('world.py', 'write', file)
    else await worlds.play(file)
    fs.copyFileSync(file, copy)
    const theirs = JSON.parse(tool('world.py', 'run', copy, 'more')), ours = json(await worlds.play(file, 'more'))
    assert.deepEqual(ours.asked, theirs.asked, first)
    ours.out.forEach((item, index) => assert.deepEqual(item, theirs.out[index], `${first} ${index} ${item[0]}`))
    assert.deepEqual(rows(file), rows(copy), first)
  }
})

test('an export from one side, imported by the other, makes the file the first would have made', { skip }, async () => {
  const where = folder(), file = path.join(where, 'world.db')
  tool('world.py', 'write', file)
  const theirs = JSON.parse(tool('world.py', 'export', file, 'whale')), ours = json(worlds.moved(file, 'whale'))
  delete theirs.exported_at
  delete ours.exported_at
  assert.deepEqual(ours, theirs)
  const data = path.join(where, 'export.json')
  fs.writeFileSync(data, JSON.stringify(worlds.moved(file, 'whale')))
  for (const space of ['fresh', 'cat', 'whale']) { // a space with nothing, one with its own people, and the same one
    const one = path.join(where, `${space}-python.db`), other = path.join(where, `${space}-js.db`)
    fs.copyFileSync(file, one)
    fs.copyFileSync(file, other)
    const added = JSON.parse(tool('world.py', 'import', one, space, data)) // Python adds this package's export ...
    assert.equal(worlds.moved(other, space, JSON.parse(fs.readFileSync(data, 'utf8'))), added) // ... and so does it
    assert.deepEqual(rows(other), rows(one), space)
  }
})

/** What this package reads of a migrated file, as tools/oldfile.py reads it in Python. */
function oldRead (file) {
  const m = new Mneme(file, 't', { embed: false, memoryLanguage: null, companionName: '小鲸' })
  try {
    return json({ notes: m.memory.notes('u').map(note => [note.id, note.text, note.kind, note.importance]),
      recall: m.recall('u', 'cat', { important: 0, recent: 0 }).chosen.map(item => [item.note.id, item.why]),
      search: m.episodes.search('u', '年糕', { limit: 9 }).map(episode => episode.id),
      first: ['u', 'v'].map(subject => m.surface.first(subject)).filter(Boolean).map(first => first.text),
      began: m.surface.began('u'), messages: m.surface.read('u').messages, person: m.person('web:leo'),
      unknown: m.config.unknown, everyone: m.everyone(), kept: m.episodes.keep('u', [['Leo', '新的一句']]).id })
  } finally {
    m.close()
  }
}

test('a schema 1 file is migrated here as Python migrates it, and each reads the other\'s', { skip }, () => {
  const where = folder(), built = tool('oldfile.py', 'build', where).trim()
  const theirs = path.join(where, 'python.db'), ours = path.join(where, 'js.db')
  fs.copyFileSync(built, theirs)
  fs.copyFileSync(built, ours)
  const said = JSON.parse(tool('oldfile.py', 'migrate', theirs))
  assert.deepEqual(['ok', migrate(ours).replaceAll(ours, 'FILE')], [said[0], said[1].replaceAll(theirs, 'FILE')])
  assert.deepEqual(rows(ours), rows(theirs))
  assert.match(migrate(theirs), /schema 2 already, nothing to do/)
  assert.match(JSON.parse(tool('oldfile.py', 'migrate', ours))[1], /schema 2 already, nothing to do/)
  for (const [reader, writer] of [[theirs, ours], [ours, theirs]]) { // each side reads what the other migrated
    const copy = reader + '.read.db'
    fs.copyFileSync(writer, copy)
    assert.deepEqual(oldRead(copy), JSON.parse(tool('oldfile.py', 'read', writer)))
  }
  const broken = path.join(where, 'broken.db') // a failure leaves the file as it was, on both sides
  fs.copyFileSync(built, broken)
  const db = new DatabaseSync(broken)
  db.exec("update episodes set lines = 'not json' where id = 3")
  db.close()
  const before = fs.readFileSync(broken)
  assert.throws(() => migrate(broken), py.ValueError)
  assert.deepEqual(fs.readFileSync(broken), before)
  assert.equal(JSON.parse(tool('oldfile.py', 'migrate', broken))[0], 'JSONDecodeError')
  assert.deepEqual(fs.readFileSync(broken), before)
})

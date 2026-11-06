// A companion's config and who people are to her, through `Mneme`: cases of mneme-llm's
// tests/test_config.py and tests/test_relations.py.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { DEFAULTS, zoneOf } from '../lib/config.js'
import { talkingDay } from '../lib/dates.js'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import { Role } from '../lib/relations.js'
import { DAY, START, companion } from './helpers.js'

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-')), 'm.db')

test('the file takes a config once, when it first meets the space; an option wins for the process only', () => {
  const where = file()
  let m = new Mneme(where, 'whale', { config: { companion: { name: '大肥鱼', display_language: 'zh', zone: 'UTC+8' } },
    embed: false })
  assert.deepEqual([m.companionName, m.displayLanguage], ['大肥鱼', 'zh'])
  m.close()
  m = new Mneme(where, 'whale', { config: { companion: { name: 'Other' } }, companionName: 'Today', embed: false })
  assert.deepEqual([m.companionName, m.config.get('companion.name')], ['Today', '大肥鱼'])
  assert.deepEqual(m.config.zone(), { offset: 8 * 3600 })
  m.close()
  m = new Mneme(where, 'another', { embed: false })
  assert.equal(m.companionName, 'the assistant')
  m.close()
})

test('a change is used at once and kept', () => {
  const where = file()
  const m = new Mneme(where, 's', { embed: false, companionName: 'Fei', surfaceDays: 30 })
  assert.equal(m.change({ 'companion.name': '小鲸', 'companion.display_language': 'zh', 'memory.surface_days': 7,
    'memory.surface_cap': 9000, 'memory.said_budget': 3000, 'memory.said_words': 0.4, 'memory.said_cut_faded': 0.3,
    'relations.fade_days': 10.0, 'mood.threshold': 0.8 }), 9)
  assert.deepEqual([m.companionName, m.mood.companionName, m.surface.companionName], ['小鲸', '小鲸', '小鲸'])
  assert.deepEqual([m.surface.span, m.surface.cap, m.saidBudget, m.saidWords], [7, 9000, 3000, 0.4])
  assert.deepEqual([m.saidCut, m.relations.fadeDays, m.mood.settings.threshold], [[0.08, 0.3], 10.0, 0.8])
  assert.deepEqual(new Set([m.displayLanguage, m.surface.words.language, m.mood.words.language]), new Set(['zh']))
  assert.throws(() => m.change({ 'companion.name': 'Other', 'memory.surface_days': 0 }), py.ValueError) // (whole)
  assert.deepEqual([m.companionName, m.config.get('companion.name'), m.surface.span], ['小鲸', '小鲸', 7])
  m.close()
  const again = new Mneme(where, 's', { embed: false })
  assert.deepEqual([again.companionName, again.surface.span, again.saidWords], ['小鲸', 7, 0.4])
  again.close()
})

test('every value is checked when it is set, and a stored one that no longer passes is passed over', () => {
  const [m] = companion()
  assert.throws(() => m.config.set('memory.surface_cap', 10), py.ValueError)
  assert.throws(() => m.config.set('mood.baseline', 120), py.ValueError)
  assert.throws(() => m.config.set('nothing.here', 1), /no such setting/)
  m.config.set('memory.said_cut', 0)
  assert.equal(m.store.row("select value from config where key = 'memory.said_cut'").value, '0.0')
  m.store.execute("update config set value = '\"many\"' where key = 'memory.said_budget'")
  m.store.execute("insert into config values ('t', 'future.key', '1', 'set', 0)")
  assert.equal(m.config.get('memory.said_budget'), DEFAULTS['memory.said_budget'])
  assert.ok('memory.said_budget' in m.config.invalid)
  assert.deepEqual(m.config.unknown, ['future.key'])
  m.store.execute("update config set value = '99' where key = 'mood.floor'") // (a band spoiled by hand)
  assert.equal(m.config.get('mood.floor'), 0)
  assert.deepEqual(m.config.newerDefaults(), []) // (what does not pass is reported as invalid, not as newer)
  assert.equal(m.config.importRows([{ key: 'mood.floor', value: 10 }, { key: 'mood.baseline', value: 50 },
    { key: 'mood.ceiling', value: 90 }, { key: 'nope', value: 1 }, { key: 'companion.name', value: '' }]), 3)
  assert.equal(m.config.get('mood.floor'), 10)
  assert.equal(m.config.loadDefaults(['mood.floor']), 1)
})

test('zones: an offset, an IANA name Python knows in the same case, or the machine\'s', () => {
  assert.deepEqual(zoneOf('UTC-05:30'), { offset: -(5 * 3600 + 1800) })
  assert.deepEqual(zoneOf('UTC'), { offset: 0 })
  assert.deepEqual(zoneOf('UTC+٨'), { offset: 8 * 3600 }) // (Python's \d is any script's digit)
  assert.deepEqual(zoneOf('Asia/Shanghai'), { name: 'Asia/Shanghai' })
  assert.equal(zoneOf(''), null)
  for (const name of ['UTC+15', 'UTC+08:60', 'Mars/Olympus', '../etc/passwd']) {
    assert.throws(() => zoneOf(name), py.ValueError)
  }
  const late = Date.UTC(2026, 0, 1, 17) / 1000 // 01:00 the next day in Shanghai: still the 1st, as a talking day
  assert.equal(talkingDay(late, zoneOf('Asia/Shanghai')), talkingDay(Date.UTC(2026, 0, 1, 12) / 1000, { offset: 0 }))
})

test('a role keeps closeness in its band; one creator; closeness moves with how she takes them, fading without', () => {
  const [m, clock] = companion({ config: { relations: { liking: 0.5 } } })
  assert.equal(m.relate('u', 'creator').closeness, 100)
  assert.throws(() => m.relate('v', 'creator'), /already the creator/)
  assert.throws(() => m.relate('v', 'friend', { closeness: 95 }), py.ValueError)
  assert.throws(() => m.relate('v', 'stranger'), /no role 'stranger'/)
  m.relate('v', 'friend', { closeness: 40 })
  assert.equal(m.relate('v', 'friend').closeness, 40) // (the same role again changes nothing)
  m.relations.seen('v', 0) // a talk that left her as she was
  m.relations.seen('v') // nothing judged
  assert.equal(m.relations.get('v').closeness, 40)
  clock.now += DAY
  m.relations.seen('v', 2)
  const faded = 40 - 1 / 30
  assert.ok(Math.abs(m.relations.get('v').closeness - (faded + 0.5 * 2 * (90 - faded) / 70)) < 1e-9)
  for (let i = 0; i < 400; i++) m.relations.seen('v', -2)
  assert.ok(m.relations.get('v').closeness >= 20 && m.relations.get('v').closeness < 21) // down toward the floor
  clock.now += 3000 * DAY // (a point every 30 days)
  assert.equal(m.relations.get('v').closeness, 20) // faded to the band's floor
  assert.equal(m.relations.get('u').closeness, 100) // a creator does not fade
  assert.equal(m.relations.weight('nobody'), 1)
  assert.equal(m.relations.weight('u'), 1.5)
  assert.equal(m.relations.line('u', 'Leo'), '(Leo is your creator; you are very close.)')
  assert.deepEqual(m.relations.all().map(item => item.subject), ['u', 'v'])
})

test('a host\'s own role, from the config, with its own names', () => {
  const [m] = companion({ config: { roles: [{ key: 'teacher', floor: 40, ceiling: 95, start: 70,
    names: { en: 'your teacher', zh: '你的老师' } }] } })
  assert.deepEqual(m.config.roles().map(role => role.key), ['teacher'])
  m.relate('u', 'teacher')
  assert.equal(m.relations.line('u', 'Ms Li'), '(Ms Li is your teacher; you are close.)')
  m.displayLanguage = 'zh'
  assert.equal(m.relations.line('u', '李老师'), '（李老师是你的老师，你们很亲近。）')
  assert.throws(() => new Role('x', { floor: 70, start: 60 }), py.ValueError)
})

test('everyone anything is kept of', () => {
  const [m, clock] = companion()
  m.observe('b', [['B', 'hi']])
  m.surface.setFirst('a', 'be kind')
  clock.now = START
  m.store.execute('insert into memories (space, subject, kind, text, importance, happened_at, created_at, folded) ' +
    "values ('t', 'c', 'fact', 'x', 2, 1, 1, 'x')")
  assert.deepEqual(m.everyone(), ['a', 'b', 'c'])
})

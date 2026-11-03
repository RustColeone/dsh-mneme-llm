// One person under several accounts: links, joining what each kept, erasing, moving: the cases of mneme-llm's
// tests/test_people.py and tests/test_aliases.py.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import { DAY } from './helpers.js'

const NOON = Date.UTC(2026, 9, 24, 12) / 1000

function mneme (clock = { now: NOON }) {
  return [new Mneme(':memory:', 't', { embed: false, memoryLanguage: null, clock: () => clock.now }), clock]
}

test('either account means the same person', () => {
  const [m] = mneme()
  assert.equal(m.link('web:leo', 'discord:42'), 'discord:42')
  assert.deepEqual(['web:leo', 'discord:42', 'someone'].map(subject => m.person(subject)),
    ['discord:42', 'discord:42', 'someone'])
  m.remember('web:leo', '养了一只叫年糕的猫', { kind: 'fact', key: 'pet.name' })
  assert.deepEqual(m.memory.notes('discord:42').map(note => note.subject), ['discord:42'])
  assert.deepEqual(m.recall('web:leo', '猫').chosen.map(item => item.note.text), ['养了一只叫年糕的猫'])
  m.relate('web:leo', 'friend')
  assert.equal(m.relations.get('discord:42').role, 'friend')
  m.alias('discord:42', '鲸酱')
  assert.equal(m.aliases.get('web:leo'), '鲸酱')
  m.mood.apply('web:leo', { delta: 10, reason: 'a kind word' })
  assert.equal(m.mood.state('discord:42').value, m.mood.state('web:leo').value)
  assert.equal(m.mood.timeline('discord:42').length, 1)
  const told = m.prompt('web:leo', '猫', { userName: 'Leo' })
  assert.match(told, /a kind word/)
  assert.equal(m.prompt('discord:42', '猫', { userName: 'Leo' }), told.slice(0, told.lastIndexOf('\n\n'))) // (once)
  assert.deepEqual(m.memory.subjects(), ['discord:42'])
})

test('what each account kept is joined: the newer value, one copy of the same words, the closer relationship', () => {
  const [m, clock] = mneme()
  m.remember('discord:42', '住在上海', { kind: 'fact', key: 'user.city' })
  m.remember('discord:42', '喜欢乌龙茶', { kind: 'preference' })
  m.relate('discord:42', 'acquaintance')
  m.alias('discord:42', '鲸鱼')
  m.memory.setProfile('discord:42', 'an old impression')
  m.mood.apply('discord:42', { delta: -20, emotions: { sad: 40 }, reason: 'old news' })
  clock.now += DAY
  m.remember('web:leo', '住在北京', { kind: 'fact', key: 'user.city' }) // moved since: the newer value wins
  m.remember('web:leo', '喜欢乌龙茶', { kind: 'preference' }) // the same words: kept once
  m.remember('web:leo', '下周三考物理', { kind: 'plan' })
  m.relate('web:leo', 'creator')
  m.alias('web:leo', '鲸酱')
  m.memory.setProfile('web:leo', 'a newer impression')
  m.mood.apply('web:leo', { delta: 10, emotions: { happy: 30 }, reason: 'good news' })
  clock.now += DAY
  m.link('web:leo', 'discord:42')
  assert.deepEqual(m.memory.notes('discord:42').map(note => note.text).sort(), ['住在北京', '喜欢乌龙茶', '下周三考物理']
    .sort())
  assert.deepEqual(m.memory.history('discord:42', 'user.city').map(note => note.text), ['住在上海', '住在北京'])
  const relationship = m.relations.get('web:leo')
  assert.deepEqual([relationship.subject, relationship.role, relationship.since], ['discord:42', 'creator', NOON])
  assert.deepEqual(m.aliases.all(), { 'discord:42': '鲸酱' })
  assert.equal(m.memory.profile('discord:42'), 'a newer impression')
  assert.ok('happy' in m.mood.state('discord:42').emotions) // the newer mood
  assert.equal(m.mood.timeline('discord:42').length, 2) // and both timelines
  assert.deepEqual(m.store.rows('select distinct subject from note_terms').map(row => row.subject), ['discord:42'])
})

test('the person keeps their own when as close; links stay one step deep', () => {
  let [m] = mneme()
  m.relate('discord:42', 'friend', { closeness: 50 })
  m.relate('web:leo', 'friend', { closeness: 50 })
  m.alias('discord:42', '鲸酱')
  m.alias('web:leo', 'Whale') // set at the same moment: the person's own stays
  m.link('web:leo', 'discord:42')
  assert.deepEqual(m.aliases.all(), { 'discord:42': '鲸酱' })
  assert.equal(m.relations.get('discord:42').closeness, 50)
  ;[m] = mneme()
  m.link('b', 'a')
  assert.equal(m.link('c', 'b'), 'a') // to the person b stands for
  assert.deepEqual(m.people.all(), { b: 'a', c: 'a' })
  m.remember('d', "a note of d's")
  m.link('e', 'd')
  assert.equal(m.link('d', 'a'), 'a') // d's own links follow it
  assert.deepEqual(m.people.all(), { b: 'a', c: 'a', d: 'a', e: 'a' })
  assert.deepEqual(m.memory.notes('e').map(note => note.subject), ['a'])
  assert.equal(m.link('a', 'c'), 'a') // already one person: nothing changes
  assert.equal(m.link('a', 'a'), 'a')
  m.link('y', 'x')
  assert.throws(() => m.link('y', 'a'), py.ValueError) // linked to someone else: unlink it first
  for (const bad of ['', '  ']) {
    assert.throws(() => m.link(bad, 'a'), py.ValueError)
    assert.throws(() => m.link('z', bad), py.ValueError)
  }
})

test('unlinked, an account is its own again; erasing from any account takes the person and their links', () => {
  let [m] = mneme()
  m.link('web:leo', 'discord:42')
  m.remember('web:leo', '喜欢乌龙茶')
  assert.equal(m.unlink('web:leo'), true)
  assert.equal(m.unlink('web:leo'), false)
  assert.deepEqual(m.memory.notes('web:leo'), []) // what was joined stays with the person
  assert.equal(m.memory.notes('discord:42').length, 1)
  ;[m] = mneme()
  m.link('web:leo', 'discord:42')
  m.link('discord:43', 'discord:42')
  m.link('amy:2', 'amy:1')
  m.remember('web:leo', '喜欢乌龙茶')
  m.relate('discord:42', 'creator')
  assert.equal(m.erase('discord:43'), 1)
  assert.deepEqual(m.memory.notes('discord:42'), [])
  assert.equal(m.relations.get('discord:42'), null)
  assert.deepEqual(m.people.all(), { 'amy:2': 'amy:1' })
})

test('an export and an import carry the links; a file\'s own link stays', () => {
  const [m] = mneme()
  m.link('web:leo', 'discord:42')
  m.remember('web:leo', '喜欢乌龙茶')
  let data = m.exportData()
  assert.deepEqual(data.people, [{ space: 't', subject: 'web:leo', person: 'discord:42' }])
  const [fresh] = mneme()
  fresh.importData(data)
  assert.equal(fresh.person('web:leo'), 'discord:42')
  assert.equal(fresh.memory.notes('web:leo').length, 1)
  const [other] = mneme()
  other.remember('web:leo', '下周三考物理', { kind: 'plan' })
  data = other.exportData()
  data.people.push({ subject: 'x' }, 'junk', { subject: 'web:leo', person: 'elsewhere' })
  fresh.importData(data)
  assert.deepEqual(fresh.memory.notes('discord:42').map(note => note.text).sort(), ['下周三考物理', '喜欢乌龙茶'].sort())
  assert.equal(fresh.person('web:leo'), 'discord:42')
})

test('an alias is one short line, never empty, said in the prompt, and moved by the same rule', () => {
  const [m] = mneme()
  assert.equal(m.alias('u', '  鲸酱\n  小鲸鱼 '), '鲸酱 小鲸鱼')
  assert.equal(m.aliases.line('u', 'Leo'), '(Leo calls you 鲸酱 小鲸鱼.)')
  assert.throws(() => m.alias('u', '​ '), py.ValueError)
  assert.equal(m.alias('u', 'x'.repeat(60)).length, 40)
  assert.equal(m.alias('u', null), null)
  assert.equal(m.aliases.get('u'), null)
  const [other] = mneme()
  other.importData({ aliases: [{ subject: 'v', alias: 'y'.repeat(60) }, { subject: 'w' }, 'junk',
    { subject: ' ', alias: 'z' }] })
  assert.deepEqual(other.aliases.all(), { v: 'y'.repeat(39) + '…' })
})

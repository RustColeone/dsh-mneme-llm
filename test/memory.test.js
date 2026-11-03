// Notes: keys and their history, the daily quota, forgetting, pruning, recall by words, the context block, moving
// between files: the cases of mneme-llm's tests/test_memory.py.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as dates from '../lib/dates.js'
import { Memory } from '../lib/memory.js'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import { Store } from '../lib/store.js'
import { DAY, UTC } from './helpers.js'

const NOW = Date.UTC(2026, 9, 24, 12) / 1000

function memory (options = {}) {
  const clock = { now: NOW }
  return [new Memory(new Store(':memory:'), 'test', { zone: UTC, clock: () => clock.now, ...options }), clock]
}

test('human dates, and dates written into a sentence', () => {
  const now = NOW
  assert.equal(dates.when(now + 6 * DAY, now, UTC), 'in 6 days')
  assert.equal(dates.when(now + 3 * DAY, now, UTC, 'zh'), '3天后')
  assert.equal(dates.when(Date.UTC(2026, 11, 25) / 1000, now, UTC), '12-25')
  assert.equal(dates.when(Date.UTC(2027, 2, 1) / 1000, now, UTC, 'zh'), '明年 03-01')
  assert.equal(dates.when(now - DAY, now, UTC), 'yesterday')
  assert.equal(dates.find('考试在2026年12月3日', now, UTC), Date.UTC(2026, 11, 3, 12) / 1000)
  assert.equal(dates.find('1月3日见', now, UTC, { ahead: true }), Date.UTC(2027, 0, 3, 12) / 1000)
  assert.equal(dates.find('12026-10-301', now, UTC), null)
})

test('a newer note with the same key replaces the older, which stays in the history', () => {
  const [notes, clock] = memory()
  notes.remember('u', 'Lives in Shanghai', { kind: 'fact', key: 'user.city' })
  clock.now += DAY
  const [outcome] = notes.keep('u', 'Moved to Hangzhou', { kind: 'fact', key: 'User.City' })
  assert.equal(outcome, 'replaced')
  assert.deepEqual(notes.notes('u').map(n => n.text), ['Moved to Hangzhou'])
  assert.deepEqual(notes.history('u', 'user.city').map(n => n.text), ['Lives in Shanghai', 'Moved to Hangzhou'])
})

test('a repeated note is not kept twice, and keys name the topic, not the value', () => {
  const [notes] = memory()
  const first = notes.remember('u', 'Has a cat named 年糕', { kind: 'fact', importance: 2 })
  const [outcome, again] = notes.keep('u', 'has a cat named 年糕', { kind: 'fact', importance: 4 })
  assert.deepEqual([outcome, again.id, again.importance], ['known', first.id, 4])
  assert.throws(() => notes.remember('u', 'Lives in Shanghai', { kind: 'fact', key: 'lives in shanghai' }),
    py.ValueError)
  assert.throws(() => notes.remember('u', 'x', { kind: 'gossip' }), py.ValueError)
  assert.throws(() => notes.remember('u', 5), TypeError)
})

test('automatic notes have a daily quota unless important, and it turns with the talking day', () => {
  const [notes, clock] = memory({ dailyQuota: 2 })
  assert.ok(notes.remember('u', 'one', { source: 'auto' }))
  assert.ok(notes.remember('u', 'two', { source: 'auto' }))
  assert.deepEqual(notes.keep('u', 'three', { source: 'auto' }), ['over quota', null])
  assert.ok(notes.remember('u', 'four, important', { source: 'auto', importance: 4 }))
  assert.ok(notes.remember('u', 'asked to remember', { source: 'user' }))
  clock.now += DAY
  assert.ok(notes.remember('u', 'next day', { source: 'auto' }))
  const moment = { at: Date.UTC(2026, 2, 1, 23) / 1000 }
  const m = new Memory(new Store(':memory:'), 'test', { zone: UTC, clock: () => moment.at, dailyQuota: 2 })
  for (const text of ['one', 'two']) m.keep('u', text, { source: 'auto' })
  moment.at += 3 * 3600 // 2 a.m.: still the evening's day
  assert.equal(m.keep('u', 'three', { source: 'auto' })[0], 'over quota')
  moment.at += 2 * 3600 // 4 a.m.: a new one
  assert.equal(m.keep('u', 'four', { source: 'auto' })[0], 'kept')
  const night = Date.UTC(2026, 2, 2, 3) / 1000
  assert.equal(dates.dayBegan(night, UTC), Date.UTC(2026, 2, 1, 4) / 1000)
  assert.equal(dates.dayBegan(night + 3600, UTC), night + 3600)
})

test('forget, purge and erase', () => {
  const [notes] = memory()
  const a = notes.remember('u', 'a note', { kind: 'fact' })
  notes.remember('u', 'keyed', { kind: 'fact', key: 'x.y' })
  assert.equal(notes.forget('u', { id: a.id }), 1)
  assert.equal(notes.forget('u', { key: 'x.y' }), 1)
  assert.deepEqual(notes.notes('u'), [])
  assert.throws(() => notes.forget('u'), py.ValueError)
  notes.remember('u', 'another')
  notes.setProfile('u', 'A student.')
  assert.equal(notes.purge('u'), 2)
  assert.equal(notes.erase('u'), 1)
  assert.equal(notes.profile('u'), null)
})

test('the least valuable fading notes go first when full', () => {
  const [notes, clock] = memory({ maxNotes: 3 })
  notes.remember('u', 'lasting', { kind: 'fact', importance: 1 })
  notes.remember('u', 'old trivial', { importance: 1 })
  clock.now += 40 * DAY
  notes.remember('u', 'new normal', { importance: 2 })
  notes.remember('u', 'new notable', { importance: 3 })
  assert.deepEqual(notes.notes('u').map(n => n.text).sort(), ['lasting', 'new normal', 'new notable'])
})

function recalling () {
  const [notes, clock] = memory()
  notes.remember('u', '数学考试没考好，觉得自己很笨', { kind: 'episode', importance: 3 })
  notes.remember('u', '喜欢喝杨枝甘露', { kind: 'preference', importance: 2 })
  notes.remember('u', 'Plays the cello in the school orchestra', { kind: 'fact', importance: 3 })
  return [notes, clock]
}

test('recall matches by shared words, explains what it skipped, and always brings what is pinned', () => {
  const [notes] = recalling()
  let found = notes.recall('u', '下次数学考试是什么时候', { important: 0, recent: 0 })
  assert.deepEqual(found.chosen.map(r => r.note.text), ['数学考试没考好，觉得自己很笨'])
  assert.ok(found.chosen[0].matched.includes('数学'))
  found = notes.recall('u', 'cello practice', { important: 0, recent: 0 })
  assert.equal(found.chosen.length, 1)
  assert.match(found.explain(), /nothing in common/)
  assert.match(found.explain(), /^recall for 'cello practice':\n {2}\+ #3 matched: cello \(score \d\.\d\d\)/)
  notes.remember('u', '名字叫Leo', { kind: 'fact', importance: 5 })
  assert.equal(notes.recall('u', 'cello', { important: 0, recent: 0 }).chosen[0].why, 'pinned')
  notes.remember('u', 'Has a cat named 年糕', { kind: 'fact', importance: 4 })
  assert.deepEqual(notes.recall('u', '我的猫', { recent: 0 }).chosen.map(r => [r.note.text, r.why]).slice(1),
    [['Has a cat named 年糕', 'important']])
})

test('fresher episodes rank higher, recalling refreshes a memory, and the budget caps characters', () => {
  let [notes, clock] = memory()
  notes.remember('u', '去了海边看日落', { importance: 2 })
  clock.now += 90 * DAY
  notes.remember('u', '又去海边捡贝壳', { importance: 2 })
  let found = notes.recall('u', '海边', { important: 0, recent: 0 })
  assert.equal(found.chosen[0].note.text, '又去海边捡贝壳')
  assert.ok(found.chosen[0].score > 2 * found.chosen[1].score)
  ;[notes, clock] = memory()
  const old = notes.remember('u', '去了海边看日落')
  clock.now += 60 * DAY
  const before = notes.freshness(notes.get(old.id))
  notes.recall('u', '海边')
  assert.ok(Math.abs(notes.freshness(notes.get(old.id)) - 1.0) < 1e-9)
  assert.ok(before < 0.3)
  assert.equal(notes.recalls('u')[0].query, '海边')
  ;[notes] = memory()
  for (let i = 0; i < 5; i++) notes.remember('u', `海边的第${i}次回忆` + '很长'.repeat(40))
  found = notes.recall('u', '海边', { budget: 200, recent: 0 })
  assert.equal(found.chosen.length, 2)
  assert.ok(found.skipped.some(([, reason]) => reason.includes('budget')))
})

test('the context block has human dates and the profile card', () => {
  const [notes, clock] = recalling()
  clock.now += 2 * DAY
  notes.setProfile('u', 'A cellist who is hard on herself.')
  const block = notes.context('u', '数学考试', { userName: 'Leo' })
  assert.match(block, /Leo/)
  assert.match(block, /A cellist/)
  assert.match(block, /\[2 days ago\] 数学考试没考好/)
  assert.equal(memory()[0].context('nobody', 'hi'), '')
})

test('an export and an import keep the history and its links, the card and the mood', () => {
  const source = new Mneme(':memory:', 'a', { embed: false })
  source.remember('u', 'Lives in Shanghai', { kind: 'fact', key: 'user.city' })
  source.remember('u', 'Moved to Hangzhou', { kind: 'fact', key: 'user.city' })
  source.memory.setProfile('u', 'card')
  source.mood.apply('u', { delta: 5, emotions: { happy: 20 } })
  const data = JSON.parse(JSON.stringify(source.exportData()))
  const target = new Mneme(':memory:', 'b', { embed: false })
  target.remember('u', 'unrelated', { kind: 'fact' }) // so ids differ from the source's
  assert.equal(target.importData(data), 2)
  assert.equal(target.memory.notes('u', { kinds: ['fact'] })[0].text, 'Moved to Hangzhou')
  const history = target.memory.history('u', 'user.city')
  assert.equal(history[0].supersededBy, history[1].id)
  assert.equal(target.memory.profile('u'), 'card')
  assert.ok(target.mood.state('u').value > 70)
  assert.equal(target.importData(data), 2) // (twice: the notes again, kept once as live text, the events once)
  assert.equal(target.memory.notes('u').length, 2)
  assert.equal(target.mood.timeline('u').length, 1)
  assert.throws(() => target.importData([]), TypeError)
})

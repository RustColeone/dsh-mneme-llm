// The panel's server half: her gut as the panel shows it, a change checked whole before any of it lands and kept in
// her gut file, the routes on DSH's API, and her star map worked out again only when her heart has changed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'
import * as py from '../lib/python.js'
import { Mneme } from '../lib/mneme.js'
import { ROUTES, change, serve, stamp, view } from '../plugin/panel.js'
import { FORMS } from './helpers.js'

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'panel-')), 'gut.db')
const NOTE = { feel: { happy: 0.8, worried: 0.3 }, mood: 1 }

/** DSH's API as the routes see it: each route by its path, asked with a Fetch request. */
function api () {
  const routes = {}
  const connection = { fetch: { register: route => { routes[route.path] = route } } }
  const ask = async (path, body) => {
    const route = routes[path]
    const request = body === undefined ? new Request(`http://127.0.0.1${path}`)
      : new Request(`http://127.0.0.1${path}`, { method: 'POST', body: typeof body === 'string' ? body
        : JSON.stringify(body) })
    assert.deepEqual(route.methods, [request.method])
    const response = await route.fetch(request)
    return [response.status, await response.json()]
  }
  return { connection, routes, ask }
}

test('her gut as the panel shows it: her report, each bar lately against usual, and how each end is tuned', () => {
  const gut = new G.Gut(file())
  gut.wake()
  for (let i = 0; i < 3; i++) {
    gut.tone.feed({ happy: 0.8, sad: 0.1, jealous: 0.5 })
    gut.teach('owner', 'zh', FORMS[i], NOTE, 85, [])
  }
  gut.tune('sad', { now: 0.25, nature: -1 })
  const shown = view(gut, { you: 'owner', companion: '小鲸' })
  assert.deepEqual([shown.you, shown.companion, shown.report.lessons], ['owner', '小鲸', 3])
  assert.equal(shown.bars.length, 13)
  const mood = shown.bars[0]
  assert.deepEqual([mood.bar, mood.zh, mood.ends], ['mood', '心情', ['sad', 'happy']])
  assert.ok(Math.abs(mood.lately - gut.tone.level('mood')) < 1e-3)
  assert.ok(Math.abs(mood.lately - (0.8 - 0.1 - 0.25)) < 1e-3) // (the second end less the first, with her tune)
  assert.ok(Math.abs(mood.usual - 0.7) < 1e-3)
  assert.deepEqual(shown.bars.at(-2).ends, [null, 'jealous'])
  assert.deepEqual(shown.ends.find(item => item.end === 'sad'), { end: 'sad', zh: '难过', now: 0.25, nature: -1 })
  assert.deepEqual(shown.ends.find(item => item.end === 'happy'), { end: 'happy', zh: '开心', now: 0, nature: 0 })
  assert.equal(shown.ends.length, 24)
  gut.close()
})

test('a change lands whole or not at all, and her gut keeps it', () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  for (const bad of [{ tau: 0 }, { tau: '9' }, { sensitivity: 1.5 }, { age: -1 }, { tune: { end: 'angry', now: 0 } },
    { tune: [{ end: 'sad', now: 0.2 }, { end: 'sad', nature: 4 }] }, { tau: 200, tune: { end: 'happy', now: 2 } }, [],
    null]) {
    assert.throws(() => change(gut, bad), py.ValueError)
  }
  assert.deepEqual(gut.settings, { tau: G.TAU, sensitivity: 0, nudge: {}, locked: false, people: {}, side: null })
  // (nothing landed)
  assert.deepEqual(gut.tone.shift, {})
  for (let i = 0; i < 6; i++) gut.teach('owner', 'zh', FORMS[i % 3], NOTE, 85, [])
  const before = stamp(gut)
  change(gut, { tau: 200, sensitivity: -0.5, tune: [{ end: 'sad', now: -0.3, nature: 1.5 },
    { end: 'happy', now: 0.2 }] })
  assert.deepEqual(gut.settings, { tau: 200, sensitivity: -0.5, nudge: { sad: 1.5 }, locked: false, people: {},
    side: null })
  assert.deepEqual(gut.tone.shift, { sad: -0.3, happy: 0.2 })
  assert.equal(stamp(gut), before) // (settings do not move her heart)
  change(gut, { age: 0 })
  assert.equal(gut.net.age, 0)
  assert.notEqual(stamp(gut), before) // (young again: what waited for her sleep is settled)
  change(gut, { tune: { end: 'sad', nature: 0 } }) // (0 takes the nudge away)
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.settings, { tau: 200, sensitivity: -0.5, nudge: {}, locked: false, people: {}, side: null })
  assert.deepEqual([again.net.age, again.tone.shift.happy], [0, 0.2])
  again.close()
})

test('each person, her sides and closeness: shown, and changed whole or not at all', () => {
  const gut = new G.Gut(file())
  gut.wake()
  const memory = new Mneme(path.join(path.dirname(file()), 'memory.db'), 'her', { embed: false, memoryLanguage: null,
    clock: () => 1.8e9 }) // (a clock that stands still: closeness does not fade between two reads)
  memory.relate('owner', 'creator')
  memory.relate('discord:2', 'friend', { closeness: 50 })
  for (let i = 0; i < 6; i++) gut.teach(i % 2 ? 'discord:2' : 'owner', 'zh', FORMS[i % 3], NOTE, 85, [])
  gut.writeSide('御姐', '你从容，不撒娇。', 3)
  let shown = view(gut, { you: 'owner', memory })
  assert.deepEqual(shown.people.map(person => [person.subject, person.lessons, person.closeness?.role]),
    [['owner', 3, 'creator'], ['discord:2', 3, 'friend']])
  assert.deepEqual(shown.sides, [{ name: '御姐', what: '你从容，不撒娇。', given: false, own: 3, weight: 3 }])
  assert.deepEqual([shown.locked, shown.side, shown.names.length], [false, null, G.NAMES.length])
  for (const bad of [{ people: { subject: '' } }, { people: { subject: 'discord:2', weight: 2 } },
    { people: { subject: 'discord:2', tune: { end: 'sweet', nature: 9 } } },
    { people: { subject: 'discord:2', closeness: 95 } }, { people: { subject: 'nobody', hold: true } },
    { people: { subject: 'discord:2', locked: 'yes' } }, { sides: { name: '龙傲天', what: '你很狂。' } },
    { sides: { name: '病娇' } }, { side: { name: '病娇' } }, { side: { name: '御姐', often: 2 } },
    { locked: 'yes' }, { locked: true, people: { subject: 'discord:2', weight: -1 } }]) {
    assert.throws(() => change(gut, bad, memory), py.ValueError)
  }
  assert.deepEqual([gut.settings.locked, gut.settings.people, gut.settings.side, memory.relations.locks()],
    [false, {}, null, {}]) // (nothing landed)
  change(gut, { locked: true, people: [{ subject: 'discord:2', tune: { end: 'sweet', nature: 2 }, weight: 0.4,
    locked: true, closeness: 70, hold: true }], sides: { name: '病娇', what: '你离不开对方。' },
  side: { name: '病娇', often: 0.5 } }, memory)
  assert.deepEqual(gut.settings.people, { 'discord:2': { nudge: { sweet: 2 }, weight: 0.4, locked: true } })
  assert.deepEqual([gut.settings.locked, gut.settings.side, gut.holding()], [true, { name: '病娇', often: 0.5 }, ['病娇']])
  assert.deepEqual([memory.relations.locks(), memory.relations.get('discord:2').closeness], [{ 'discord:2': 70 }, 70])
  shown = view(gut, { you: 'owner', memory })
  const theirs = shown.people.find(person => person.subject === 'discord:2')
  assert.deepEqual([theirs.set, theirs.locked, theirs.nudge, theirs.closeness.locked], [0.4, true, { sweet: 2 }, true])
  change(gut, { people: { subject: 'discord:2', weight: 'learned', locked: false, hold: false, closeness: 60 },
    side: null, sides: { name: '御姐', drop: true } }, memory)
  assert.deepEqual(gut.settings.people, { 'discord:2': { nudge: { sweet: 2 } } })
  assert.deepEqual([gut.settings.side, Object.keys(gut.grown)], [null, ['病娇']])
  assert.deepEqual([memory.relations.locks(), memory.relations.get('discord:2').closeness], [{}, 60])
  change(gut, { people: { subject: 'discord:2', forget: true } }, memory)
  assert.equal(gut.net.people.has('discord:2'), false)
  assert.deepEqual(gut.settings.people, {})
  memory.close()
  gut.close()
})

test('the routes: her gut, her star map until her heart changes, and a change answered with her gut as it is now',
  async () => {
    const gut = new G.Gut(file())
    gut.wake()
    const { connection, routes, ask } = api()
    let woken = 0
    serve(connection, () => {
      woken += 1
      return gut
    }, { you: 'owner', companion: '小鲸' })
    assert.deepEqual(Object.keys(routes).sort(), Object.values(ROUTES).sort())
    let [status, body] = await ask(ROUTES.gut)
    assert.deepEqual([status, body.companion, body.report.lessons, body.bars.length], [200, '小鲸', 0, 13])
    const [, map] = await ask(ROUTES.starmap)
    assert.equal(map.stamp, stamp(gut))
    assert.deepEqual(map.reach.length, 24)
    const [, same] = await ask(ROUTES.starmap)
    assert.deepEqual(same, map)
    gut.teach('owner', 'zh', FORMS[0], NOTE, 85, [])
    const [, next] = await ask(ROUTES.starmap)
    assert.notEqual(next.stamp, map.stamp)
    assert.deepEqual(next.people.map(person => person.subject), ['owner'])
    ;[status, body] = await ask(ROUTES.change, { sensitivity: 0.4, tune: { end: 'jealous', nature: 2 } })
    assert.deepEqual([status, body.report.sensitivity, body.ends.find(item => item.end === 'jealous').nature],
      [200, 0.4, 2])
    ;[status, body] = await ask(ROUTES.change, { sensitivity: 3 })
    assert.equal(status, 400)
    assert.match(body.error, /sensitivity/)
    ;[status, body] = await ask(ROUTES.change, 'not json')
    assert.deepEqual([status, body.error], [400, 'a change is JSON'])
    assert.equal(gut.settings.sensitivity, 0.4)
    assert.ok(woken >= 7) // (each request wakes her if she is not awake yet)
    const none = api()
    serve(none.connection, () => null)
    ;[status, body] = await none.ask(ROUTES.gut)
    assert.equal(status, 404)
    gut.close()
  })

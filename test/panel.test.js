// The panel's server half: her gut as the panel shows it, a change checked whole before any of it lands and kept in
// her gut file, the routes on DSH's API, and her star map worked out again only when her heart has changed.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'
import * as py from '../lib/python.js'
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
  assert.deepEqual(gut.settings, { tau: G.TAU, sensitivity: 0, nudge: {} }) // (nothing landed)
  assert.deepEqual(gut.tone.shift, {})
  for (let i = 0; i < 6; i++) gut.teach('owner', 'zh', FORMS[i % 3], NOTE, 85, [])
  const before = stamp(gut)
  change(gut, { tau: 200, sensitivity: -0.5, tune: [{ end: 'sad', now: -0.3, nature: 1.5 },
    { end: 'happy', now: 0.2 }] })
  assert.deepEqual(gut.settings, { tau: 200, sensitivity: -0.5, nudge: { sad: 1.5 } })
  assert.deepEqual(gut.tone.shift, { sad: -0.3, happy: 0.2 })
  assert.equal(stamp(gut), before) // (settings do not move her heart)
  change(gut, { age: 0 })
  assert.equal(gut.net.age, 0)
  assert.notEqual(stamp(gut), before) // (young again: what waited for her sleep is settled)
  change(gut, { tune: { end: 'sad', nature: 0 } }) // (0 takes the nudge away)
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.settings, { tau: 200, sensitivity: -0.5, nudge: {} })
  assert.deepEqual([again.net.age, again.tone.shift.happy], [0, 0.2])
  again.close()
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

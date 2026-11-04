// Her star map: where a row of her heart sits, how bright it is and which end it leans to, her arms against as she was
// born, the stars that lean most, and a star for each person.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as G from '../lib/gut.js'
import * as S from '../lib/starmap.js'
import { FORMS } from './helpers.js'

const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'starmap-')), 'gut.db')
const close = (one, other, within = 1e-9) => assert.ok(Math.abs(one - other) < within, `${one} against ${other}`)
const row = (pulls = {}) => G.ENDS.map(end => pulls[end] ?? 0.0)

test('a row sits where it pulls her, as bright as it leans, in the colour of its strongest end', () => {
  assert.equal(S.ANGLES.length, 24)
  close(S.ANGLES[0], -Math.PI / 2) // (the first end at the top)
  close(S.ANGLES[6], 0) // (a quarter of the way round, on the right)
  assert.deepEqual(S.spot(row()).map(value => Math.abs(value) < 1e-12), [true, true]) // (no lean: the middle)
  const toward = G.ENDS.indexOf('sweet')
  const [x, y] = S.spot(row({ sweet: 9 }))
  close(x, Math.cos(S.ANGLES[toward]), 1e-6)
  close(y, Math.sin(S.ANGLES[toward]), 1e-6)
  const reach = G.ENDS.map((end, k) => k === toward ? 2.0 : 1.0)
  close(S.spot(row({ sweet: 9 }), reach)[0], 2 * x, 1e-6)
  const pulls = row({ happy: 0.5, sad: 0.2 }), exp = value => Math.exp(S.SPREAD * value)
  const total = exp(0.5) + exp(0.2) + 22 * exp(0)
  close(S.spot(pulls)[0], [...pulls.keys()].reduce((sum, k) => sum + exp(pulls[k]) / total * Math.cos(S.ANGLES[k]), 0))
  assert.equal(S.brightness(row({ happy: 0.5, sad: -0.25 })), 0.75)
  assert.equal(S.strongest(row({ happy: 0.5, sad: 0.7 })), G.ENDS.indexOf('sad'))
  assert.equal(S.strongest(row()), 0) // (the first, of equals)
})

test('her arms: what she feels now against as she was born, square root, from half to 2.4', () => {
  const born = new G.Table(), now = new G.Table()
  now.b = now.b.map((bias, k) => k === 0 ? 3.0 : k === 1 ? -9.0 : bias)
  const probe = Array.from({ length: S.LEAST }, (_, i) => [FORMS[i % 3], 85])
  assert.deepEqual(S.arms(now, born, probe.slice(1)), G.ENDS.map(() => 1)) // (too few to measure on)
  const reach = S.arms(now, born, probe)
  assert.equal(reach[0], S.LONGEST)
  assert.equal(reach[1], S.SHORTEST)
  assert.deepEqual(reach.slice(2), G.ENDS.slice(2).map(() => 1))
  now.b[2] = G.BLANK + 0.1
  close(S.arms(now, born, probe)[2], Math.sqrt(G.squash(G.BLANK + 0.1) / G.squash(G.BLANK)))
})

test('her star map: the rows that lean most, her arms over her own latest lessons, and a star for each person',
  async () => {
    const gut = new G.Gut(file(), { starter: STARTER })
    gut.wake()
    assert.deepEqual([...S.born(STARTER).w.keys()], [...gut.net.heart.w.keys()]) // (born as she was)
    assert.deepEqual(S.born(STARTER).w.get('close=high'), gut.net.heart.w.get('close=high'))
    assert.equal(S.born(STARTER), S.born(STARTER)) // (once)
    let map = S.starmap(gut)
    assert.deepEqual(map.reach, G.ENDS.map(() => 1)) // (nothing lived yet)
    assert.deepEqual([map.probed, map.people], [0, []])
    for (let i = 0; i < 30; i++) {
      gut.teach(i % 3 ? 'owner' : 'qq:2', 'zh', FORMS[i % 3], { feel: { jealous: 0.9, sweet: 0.4 }, mood: 1 }, 85, [])
    }
    await gut.sleep()
    map = S.starmap(gut, { most: 50 })
    assert.deepEqual([map.probed, map.rows, map.stars.length, map.ends], [30, gut.net.heart.w.size, 50, G.ENDS])
    assert.ok(map.stars.every((star, i) => i === 0 || star[2] <= map.stars[i - 1][2])) // (the brightest first)
    const all = [...gut.net.heart.w.values()].map(S.brightness).sort((one, other) => other - one)
    close(map.stars.at(-1)[2], all[49], 1e-3)
    const probe = S.probeOf(gut), reach = S.arms(gut.net.heart, S.born(STARTER), probe)
    assert.deepEqual(probe[0], [FORMS[29 % 3], 85]) // (the newest first)
    assert.ok(map.reach[G.ENDS.indexOf('jealous')] > 1) // (she feels it more than she was born to)
    for (const [x, y, bright, end, key] of map.stars.slice(0, 5)) {
      const weights = gut.net.heart.w.get(key), [sx, sy] = S.spot(weights, reach)
      close(x, sx, 1e-4)
      close(y, sy, 1e-4)
      close(bright, S.brightness(weights), 1e-3)
      assert.equal(end, S.strongest(weights))
    }
    assert.deepEqual(map.people.map(person => [person.subject, person.lessons]), [['owner', 20], ['qq:2', 10]])
    const [owner] = map.people
    close(owner.x, S.spot(gut.net.people.get('owner').table.b, reach)[0], 1e-4)
    close(owner.weight, gut.net.weight('owner'), 1e-3)
    assert.ok(JSON.stringify(map).length < 20000)
    gut.close()
  })

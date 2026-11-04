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
  assert.equal(S.ANGLES.length, 26)
  close(S.ANGLES[0], -Math.PI / 2) // (the first end at the top)
  close(S.ANGLES[13], Math.PI / 2) // (half way round, at the bottom)
  assert.deepEqual(S.spot(row()).map(value => Math.abs(value) < 1e-12), [true, true]) // (no lean: the middle)
  const toward = G.ENDS.indexOf('sweet')
  const [x, y] = S.spot(row({ sweet: 9 }))
  close(x, Math.cos(S.ANGLES[toward]), 1e-6)
  close(y, Math.sin(S.ANGLES[toward]), 1e-6)
  const reach = G.ENDS.map((end, k) => k === toward ? 2.0 : 1.0)
  close(S.spot(row({ sweet: 9 }), reach)[0], 2 * x, 1e-6)
  const pulls = row({ happy: 0.5, sad: 0.2 }), exp = value => Math.exp(S.SPREAD * value)
  const total = exp(0.5) + exp(0.2) + (G.ENDS.length - 2) * exp(0)
  close(S.spot(pulls)[0], [...pulls.keys()].reduce((sum, k) => sum + exp(pulls[k]) / total * Math.cos(S.ANGLES[k]), 0))
  assert.equal(S.brightness(row({ happy: 0.5, sad: -0.25 })), 0.75)
  assert.equal(S.strongest(row({ happy: 0.5, sad: 0.7 })), G.ENDS.indexOf('sad'))
  assert.equal(S.strongest(row()), 0) // (the first, of equals)
})

test('in 3D her bars are spread over a sphere, and the two ends of a bar sit side by side', () => {
  const angle = (one, other) => Math.acos(Math.min(1, one.reduce((sum, value, k) => sum + value * other[k], 0)))
  const barOf = G.BARS.flatMap(([bar, , left]) => left ? [bar, bar] : [bar])
  assert.equal(S.DIRECTIONS.length, 26)
  for (const direction of S.DIRECTIONS) close(Math.hypot(...direction), 1)
  let nearest = Infinity
  S.DIRECTIONS.forEach((one, i) => S.DIRECTIONS.forEach((other, j) => {
    if (j <= i) return
    if (barOf[i] === barOf[j]) close(angle(one, other), 2 * S.APART) // (a bar's two ends: 24 degrees apart)
    else nearest = Math.min(nearest, angle(one, other))
  }))
  assert.ok(nearest > 40 * Math.PI / 180, `${nearest * 180 / Math.PI}`) // (any other bar's end: more than 40)
  assert.ok(S.DIRECTIONS[0][1] > 0.8) // (her first bar near the top)
  const toward = G.ENDS.indexOf('sweet'), reach = G.ENDS.map((end, k) => k === toward ? 2.0 : 1.0)
  S.spot3(row({ sweet: 9 }), reach).forEach((value, axis) => close(value, 2 * S.DIRECTIONS[toward][axis], 1e-6))
  const both = S.spot3(row({ sweet: 9, scornful: 9 }))
  assert.ok(Math.hypot(...both) > 0.95) // (pulled to both ends of a bar: out between them, not back to the middle)
})

test('her arms: 1 as she was born, longer by GAIN for each 1 she has gained, from SHORTEST to LONGEST', () => {
  const born = new G.Table(), now = new G.Table()
  born.b[1] = 3.0 // (born feeling it strongly, and now not at all: as short as an arm gets)
  now.b = now.b.map((bias, k) => k === 0 ? 3.0 : k === 1 ? -9.0 : bias)
  const probe = Array.from({ length: S.LEAST }, (_, i) => [FORMS[i % 3], 85])
  assert.deepEqual(S.arms(now, born, probe.slice(1)), G.ENDS.map(() => 1)) // (too few to measure on)
  const reach = S.arms(now, born, probe)
  assert.equal(reach[0], S.LONGEST)
  assert.equal(reach[1], S.SHORTEST)
  assert.deepEqual(reach.slice(2), G.ENDS.slice(2).map(() => 1))
  now.b[2] = G.BLANK + 0.1
  close(S.arms(now, born, probe)[2], 1 + S.GAIN * (G.squash(G.BLANK + 0.1) - G.squash(G.BLANK)))
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
    assert.equal(map.directions.length, 26)
    for (const [x, y, bright, end, key, ...at] of map.stars.slice(0, 5)) {
      const weights = gut.net.heart.w.get(key), [sx, sy] = S.spot(weights, reach)
      close(x, sx, 1e-4)
      close(y, sy, 1e-4)
      S.spot3(weights, reach).forEach((value, axis) => close(at[axis], value, 1e-4))
      close(bright, S.brightness(weights), 1e-3)
      assert.equal(end, S.strongest(weights))
    }
    assert.deepEqual(map.people.map(person => [person.subject, person.lessons]), [['owner', 20], ['qq:2', 10]])
    const [owner] = map.people
    close(owner.x, S.spot(gut.net.people.get('owner').table.b, reach)[0], 1e-4)
    close(owner.at[2], S.spot3(gut.net.people.get('owner').table.b, reach)[2], 1e-4)
    close(owner.weight, gut.net.weight('owner'), 1e-3)
    assert.ok(JSON.stringify(map).length < 30000)
    gut.close()
  })

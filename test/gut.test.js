// The numbers mneme-llm pins for its gut (its tests/gut_vectors.json, copied here unchanged): this port gives the same.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'

const V = JSON.parse(fs.readFileSync(new URL('./gut_vectors.json', import.meta.url), 'utf8'))
const forms = [{ people: ['coworker'], gender: ['woman'], topic: ['lunch'], event: ['ate'], sender_feels: 'happy', toward_you: 'none' },
  { people: [], gender: [], topic: ['rain', 'Bus'], event: ['got wet'], sender_feels: 'tired', toward_you: 'asking' },
  { people: ['mother'], gender: ['woman'], topic: ['health'], event: ['fell'], sender_feels: 'worried', toward_you: 'affection' }]
const feels = [{ jealous: 0.7, sweet: 0.3 }, { tender: 1 }, { worried: 0.6, sad: 0.4 }]
const near = (actual, expected) => {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
  for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 2e-9, `${key}: ${actual[key]} against ${expected[key]}`)
}
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gut-')), 'gut.db')

test('tags and features', () => {
  assert.deepEqual(forms.map(G.tags), V.tags)
  forms.flatMap(form => [10, 40, 85].map(closeness => G.features(form, closeness))).forEach((item, index) => near(item, V.features[index]))
})

test('the network after 30 lessons, and the balance', () => {
  const net = new G.Net()
  for (let index = 0; index < 30; index++) net.teach(forms[index % 3], feels[index % 3], index % 3 - 1, [85, 50, 41][index % 3])
  forms.flatMap(form => [10, 85].map(closeness => net.vector(form, closeness))).forEach((item, index) => near(item, V['after 30 lessons'][index]))
  ;[0, 5, 200].forEach((exchanges, index) => assert.ok(Math.abs(G.balance(net, exchanges) - V.balance[index]) < 2e-9))
})

test('tone', () => {
  const tone = new G.Tone()
  for (let index = 0; index < 50; index++) tone.feed(feels[index % 3])
  near(tone.v, V.tone)
  near(tone.lean(G.NORMAL), V.lean)
})

test('the line, her words, notes and languages', () => {
  assert.deepEqual([G.line({ jealous: 0.4, sweet: 0.3, tender: 0.2, happy: 0.1 }, ['喵', '本鲸']), G.line({ calm: 0.9 }),
    G.line({ happy: 0.6, calm: 0.2, sad: 0.2 })], V.lines)
  assert.deepEqual([G.mine('午饭吃了吗', '吃啦喵 nya', 'zh'), G.mine('hi there', 'Fine nya 本鲸 😊', 'en'), G.mine('元気', 'いいにゃ nya', 'ja')], V.mine)
  assert.deepEqual([G.written('{"mood": 9, "feel": {"sad": 2, "calm": 2, "angry": 9}}'), G.written('{"feel": {"angry": 1}}')], V.written)
  assert.deepEqual(['今天好累', '今日好攰', 'おはよう', 'hello'].map(G.languageOf), V.languages)
})

test('how much a side is wanted, and what her readings come to', () => {
  const day = 86400
  ;[40, 60, 85, 100].forEach((closeness, index) => assert.ok(Math.abs(G.strength([[0, true, closeness], [day, true, closeness],
    [2 * day, false, 60]], 10 * day) - V.strength[index]) < 2e-9))
  assert.deepEqual(['{"side": null}', 'nothing', '{"side": {"name": " 「小 绿茶」 ", "more": false, "what": " 说 她\\n不好 "}}',
    `{"side": {"name": "御姐", "what": "${'从容'.repeat(40)}"}}`, '{"side": {"name": ""}}'].map(G.shaping), V.shaping)
  ;[40, 85].forEach((closeness, index) => assert.ok(Math.abs(G.strength([[0, true, closeness], [2 * day, false, 60]], 100 * day,
    G.KEEPS) - V['strength over months'][index]) < 2e-9))
  assert.deepEqual([[1, 0], [1, 0.5], [1, 0.99], [2, 0.5], [5, 0.2]].map(([count, roll]) => G.draw({ 御姐: 3, 病娇: 1, 三无: 0.5 },
    count, () => roll)), V.draw)
  assert.deepEqual(G.NAMES, V.names)
  ;[['你先夸她，再让她不如你。', '你先夸她，再 让她不如你！'], ['你从容。', '你先夸她。'], ['', 'x']].forEach(([one, other], index) =>
    assert.ok(Math.abs(G.overlap(one, other) - V.overlap[index]) < 2e-9))
  assert.deepEqual(['{"name": "（御姐）", "what": "你从容（不急）\\n，不撒娇。"}', '{"name": "x"}', 'no'].map(G.grownSide), V['grown side'])
})

test('a side is only a name on the list', () => {
  assert.throws(() => new G.Gut('x', { tags: { 草莓: 'x' } }))
  assert.throws(() => new G.Gut('x', { tags: { 草莓: 'x' }, names: ['别的'] }))
  assert.deepEqual(new G.Gut('x', { tags: { 草莓: 'x' }, names: ['草莓'] }).tags, { 草莓: 'x' })
  const gut = new G.Gut(file())
  gut.wake()
  gut.grow('草莓', { name: '草莓', what: '你很甜。' })
  assert.deepEqual(gut.grown, {})
  assert.throws(() => gut.writeSide('草莓', 'x'))
  assert.ok(G.growMessages('病娇', [], {})[0].content.includes('小绿茶'))
  gut.close()
})

test('a side grows over days, is lost by objecting, and comes back from the file', () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  const day = 86400, seen = { name: '绿茶', more: true, what: '说别的女生不好' }
  assert.equal(gut.sighted('a', seen, 85, 0), null)
  assert.equal(gut.sighted('a', seen, 85, 3600), null) // the same evening: one sighting
  assert.equal(gut.sightings.length, 1)
  assert.equal(gut.sighted('a', seen, 85, day), null)
  assert.equal(gut.sighted('a', seen, 20, 2 * day), null) // a stranger counts for nothing
  assert.equal(gut.sighted('a', seen, 85, 2 * day), null)
  assert.equal(gut.sighted('a', seen, 85, 3 * day), '绿茶')
  gut.grow('绿茶', { name: '小绿茶', what: '你先夸她。' })
  assert.deepEqual(gut.wants('小绿茶'), ['说别的女生不好'])
  assert.deepEqual(gut.shown(20), {})
  assert.deepEqual(gut.shown(40), { 小绿茶: '你先夸她。' })
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.grown, { 小绿茶: '你先夸她。' })
  assert.equal(again.sightings[0].name, '小绿茶')
  assert.ok('小绿茶' in again.noted())
  const no = { name: '端着', more: false, what: '' } // the word they use is rarely the name she keeps it under
  for (let count = 0; count < 3; count++) again.sighted('a', no, 85, 3 * day)
  assert.ok('小绿茶' in again.grown)
  again.sighted('a', no, 85, 3 * day)
  assert.deepEqual(again.grown, {})
  assert.deepEqual(again.sightings, [])
  again.close()
})

test('she stays in one side for a month, then her sides are drawn by weight', () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  gut.writeSide('御姐', '你从容。', 3)
  gut.writeSide('病娇', '你只要他。', 1)
  const first = gut.holding(0)
  assert.equal(first.length, 1)
  for (let day = 0; day < 30; day++) assert.deepEqual(gut.holding(day * 86400), first)
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.holding(20 * 86400), first) // a restart is not a new month
  assert.deepEqual(again.weights, { 御姐: 3, 病娇: 1 })
  let older = 0
  for (let month = 1; month <= 2000; month++) if (again.holding(month * G.HOLD)[0] === '御姐') older++
  assert.ok(Math.abs(older / 2000 - 0.75) < 0.04)
  const held = again.holding(2000 * G.HOLD)[0]
  again.dropSide(held)
  assert.deepEqual(again.holding(2000 * G.HOLD + 86400), Object.keys(again.grown)) // a side going away ends the month
  again.close()
})

test('a turn reads the person beside her note, and a failed reading loses no lesson', async () => {
  const gut = new G.Gut(file())
  gut.wake()
  const asked = []
  let side = 'null'
  const ask = async messages => {
    const first = messages[0].content
    if (first === G.FORM) return JSON.stringify({ people: [], topic: ['tea'], language: 'zh' })
    if (first.startsWith(G.SHAPE)) {
      asked.push(first)
      if (side === 'fail') throw new Error('no')
      return `{"side": ${side}}`
    }
    if (messages.at(-1).content.includes(G.ASK)) return '{"sweet": 1}'
    return '{"mood": 1, "feel": {"sweet": 1}}'
  }
  const say = async () => {
    const turn = new G.Turn(gut, ask, '你是傲娇的鲸', '嗯', 'a')
    assert.ok((await turn.feel([], '', 85, 1)).endsWith('Reply in Mandarin Chinese.'))
    return turn.learn('好')
  }
  side = '{"name": "绿茶", "more": true, "what": "说她不好"}'
  await say()
  assert.equal(gut.sightings.length, 1)
  assert.equal(asked[0], G.SHAPE)
  await say()
  assert.ok(asked[1].includes('Sides noted so far: 绿茶 (说她不好)'))
  side = '{"name": "傲娇", "more": true, "what": "x"}' // who she already is
  await say()
  assert.equal(gut.sightings.length, 1)
  side = 'fail'
  assert.ok(await say())
  assert.equal(gut.report().lessons, 4)
  gut.close()
})

test('a slow model does not hold her up, and a wipe leaves her as she was born', async () => {
  const gut = new G.Gut(file())
  gut.wake()
  const before = G.limits.TIME_LIMIT
  G.limits.TIME_LIMIT = 0.2
  try {
    const turn = new G.Turn(gut, () => new Promise(resolve => setTimeout(resolve, 2000, '{}').unref()), '', 'hello', 'a')
    const started = performance.now()
    assert.equal(await turn.feel([], '', 85, 0), 'Reply in English.')
    assert.ok(performance.now() - started < 1500)
  } finally {
    G.limits.TIME_LIMIT = before
  }
  gut.teach('a', 'en', forms[0], { feel: { sweet: 1.0 }, mood: 1 }, 85, ['nya'])
  gut.writeSide('御姐', '你从容。')
  assert.equal(await gut.wipe(), 1)
  assert.equal(gut.report().lessons, 0)
  assert.deepEqual(gut.grown, {})
  gut.close()
})

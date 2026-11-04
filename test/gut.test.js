// The numbers mneme-llm pins for its gut (its tests/gut_vectors.json, copied here unchanged), and what the gut does.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import zlib from 'node:zlib'
import * as G from '../lib/gut.js'
import * as py from '../lib/python.js'
import { FEELS, FORMS, near as close } from './helpers.js'

const V = JSON.parse(fs.readFileSync(new URL('./gut_vectors.json', import.meta.url), 'utf8'))
const forms = FORMS
const near = (actual, expected) => close(assert, actual, expected)
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gut-')), 'gut.db')

const FEELS2 = [{ jealous: 0.7, sweet: 0.3 }, { tender: 1.0, defiant: 0.4 }, { worried: 0.6, sad: 0.4, aching: 0.5 }]
const round9 = item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, py.round(value, 9)]))
const FORM = forms[0], OTHER = { people: [], gender: [], topic: ['rain'], event: ['rained'], sender_feels: 'tired',
  toward_you: 'none' }
const JEALOUS = { jealous: 0.8, sweet: 0.2 }
const teachMany = (net, subject, feel, count, { closeness = 85, form = FORM, today = null, known = G.ENDS } = {}) => {
  for (let i = 0; i < count; i++) net.teach(subject, form, feel, 1, closeness, known, today)
}

test('tags, features, the bars and their prompts', () => {
  assert.deepEqual(forms.map(G.tags), V.tags)
  forms.flatMap(form => [10, 40, 85].map(closeness => G.features(form, closeness)))
    .forEach((item, index) => near(item, V.features[index]))
  assert.deepEqual(G.ENDS, V.ends)
  assert.equal(G.FEELINGS, V.feelings)
  assert.ok(G.ASK.includes(G.FEELINGS) && G.NOTE.includes(G.FEELINGS))
  assert.equal(G.CHINESE.irritable, '易怒')
  assert.equal(G.CHINESE.tender, '温柔')
})

test('born, then 30 lessons from three people over eight days, a sleep among them', () => {
  const net = new G.Net()
  net.start(Array.from({ length: 12 }, (_, i) => [forms[i % 3], FEELS2[i % 3], i % 3 - 1, [85, 50, 20][i % 3]]),
    G.OLD)
  for (let index = 0; index < 30; index++) {
    net.teach('abc'[index % 3], forms[index % 3], FEELS2[index % 3], index % 3 - 1, [85, 50, 20][index % 3], G.ENDS,
      Math.floor(index / 4))
    if (index === 19) net.sleep()
  }
  forms.flatMap(form => [10, 85].flatMap(closeness => [null, 'a', 'c'].map(who => net.vector(form, closeness, who))))
    .forEach((item, index) => near(item, V['after 30 lessons'][index]))
  ;[...'abcd'].forEach((who, index) => assert.ok(Math.abs(net.weight(who) - V.weights[index]) < 2e-9))
  assert.ok(Math.abs(net.learning() - V.learning) < 2e-9)
  ;[0, 5, 200].forEach((exchanges, index) => assert.ok(Math.abs(G.balance(net, exchanges) - V.balance[index]) < 2e-9))
})

test('slow levels, sensitivity, the line, notes and readings', () => {
  const tone = new G.Tone()
  tone.shift.proud = 0.3
  for (let index = 0; index < 50; index++) tone.feed(FEELS2[index % 3], [0, 0.5][index % 2])
  near(tone.lately, V.tone.lately)
  near(tone.usual, V.tone.usual)
  near(tone.shift, V.tone.shift)
  near(tone.lean(Object.fromEntries(G.ENDS.map(end => [end, 0.1]))), V.lean)
  assert.deepEqual(tone.said(), V.said)
  ;[-1, -0.5, 0.5, 1].forEach((sensitivity, index) => near(G.sensitive({ sad: 0.3, happy: 0.7 }, sensitivity),
    V.sensitive[index]))
  assert.deepEqual([G.line({ defiant: 0.7, happy: 0.4, irritable: 0.2, sad: 0.1 }, ['喵', '本鲸'],
    ['lately you are easily shaken']), G.line({ calm: 0.9 }), G.line({ happy: 0.6, calm: 0.2, sad: 0.2 })], V.lines)
  assert.deepEqual([G.mine('午饭吃了吗', '吃啦喵 nya', 'zh'), G.mine('hi there', 'Fine nya 本鲸 😊', 'en'),
    G.mine('元気', 'いいにゃ nya', 'ja')], V.mine)
  assert.deepEqual([G.written('{"mood": 9, "feel": {"sad": 2, "calm": 0.5, "angry": 9}}'),
    G.written('{"feel": {"angry": 1}}')], V.written)
  assert.deepEqual([G.vector('{"feel": {"Defiant": 0.7, "sad": 3}}'), G.vector('{"sad": 0}'),
    G.vector('{"feeling": {"irritable": 0.55, "cheeky": 0.6}}'),
    G.vector('{"feelings": [{"feeling": "calm", "strength": 0.7}, {"name": "shy", "intensity": 0.2}]}')], V.vector)
  assert.equal(G.vector('{"sad": "x"}'), null)
  const every = { ...Object.fromEntries(G.ENDS.map(end => [end, 0])), sad: 0.1, sweet: 0.7 }
  assert.deepEqual(G.written(JSON.stringify({ mood: -1, feel: every })), { feel: { sad: 0.1, sweet: 0.7 }, mood: -1 })
  assert.ok(G.ENDS.every(end => G.NOTE.includes(` ${end},`) || G.NOTE.includes(` ${end}.`))) // her note scores them all
  assert.deepEqual(['今天好累', '今日好攰', 'おはよう', 'hello'].map(G.languageOf), V.languages)
})

test('both ends of a bar at once, and lessons from before teach only the seven they knew', () => {
  let net = new G.Net()
  teachMany(net, 'a', { sweet: 0.9, scornful: 0.9 }, 40)
  net.sleep()
  const felt = net.vector(FORM, 85)
  assert.ok(Math.min(felt.sweet, felt.scornful) > 0.6, 'love-hate')
  net = new G.Net()
  const defiant = net.vector(FORM, 85).defiant
  teachMany(net, 'a', { jealous: 0.8 }, 30, { known: G.OLD })
  net.sleep()
  assert.ok(net.vector(FORM, 85).jealous > 0.5)
  assert.equal(net.vector(FORM, 85).defiant, defiant)
  assert.ok(net.vector(FORM, 85).happy < defiant)
})

test('a new bar goes last; born suspicious, she can still trust one person', () => {
  assert.deepEqual([G.ENDS.length, G.ENDS[23], G.ENDS.slice(24)], [26, 'aching', ['suspicious', 'trusting']])
  const net = new G.Net()
  teachMany(net, 'b', { suspicious: 0.9 }, 60) // who she became: doubting what anyone means by it
  net.sleep()
  net.locked = true // (her heart stays so: only how she is with one person moves)
  teachMany(net, 'a', { trusting: 0.9 }, 60)
  net.sleep()
  const alone = net.vector(FORM, 85), withThem = net.vector(FORM, 85, 'a')
  assert.ok(alone.suspicious > 0.6 && alone.trusting < 0.1)
  assert.ok(withThem.trusting > withThem.suspicious)
  assert.deepEqual(net.vector(FORM, 85, 'c'), alone) // someone new meets her heart
})

test('a file from 0.5 is widened: its 24 ends as they were, the new ones as nothing yet', async () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  for (let i = 0; i < 20; i++) gut.teach('discord:1', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 85, ['喵'])
  await gut.sleep()
  for (let i = 0; i < 5; i++) gut.teach('discord:1', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 85, ['喵'])
  gut.close()
  let db = new DatabaseSync(where)
  db.prepare('update lessons set feel = ? where id > 20').run(JSON.stringify({ ...JEALOUS, trusting: 0.9 }))
  db.close()
  const same = path.join(path.dirname(where), 'same.db')
  fs.copyFileSync(where, same)
  const narrow = table => ({ w: Object.fromEntries(Object.entries(table.w).map(([key, row]) => [key, row.slice(0, 24)])),
    b: table.b.slice(0, 24) })
  db = new DatabaseSync(where) // as 0.5 wrote it: 24 ends
  const kept = JSON.parse(zlib.gunzipSync(db.prepare("select value from state where key = 'heart'").get().value))
  kept.heart = narrow(kept.heart)
  for (const found of Object.values(kept.people)) found.table = narrow(found.table)
  db.prepare("update state set value = ? where key = 'heart'").run(zlib.gzipSync(Buffer.from(JSON.stringify(kept))))
  db.prepare('update lessons set ends = 24').run()
  db.close()
  const reference = new G.Gut(same), widened = new G.Gut(where)
  reference.wake()
  widened.wake()
  const before = reference.net.vector(FORM, 85, 'discord:1'), after = widened.net.vector(FORM, 85, 'discord:1')
  for (const end of G.ENDS.slice(0, 24)) assert.ok(Math.abs(after[end] - before[end]) < 1e-12, end)
  assert.ok(before.trusting > G.squash(G.BLANK) + 0.01) // (what 26 ends taught)
  for (const end of ['suspicious', 'trusting']) assert.ok(Math.abs(after[end] - G.squash(G.BLANK)) < 1e-12, end)
  reference.close()
  widened.close()
})

test('her heart grows up, and each person she knows has a way of their own', () => {
  const moved = [0, 5 * G.TAU].map(age => {
    const net = new G.Net()
    net.age = age
    teachMany(net, 'a', JEALOUS, 20)
    net.sleep()
    return net.heart.strengths(G.features(FORM, 85))[G.ENDS.indexOf('jealous')]
  })
  assert.ok(moved[0] > 0.5 && moved[1] < 0.25, String(moved))
  const net = new G.Net()
  for (let i = 0; i < 60; i++) {
    net.teach('alice', FORM, { jealous: 0.9 }, 1, 85)
    net.teach('bob', FORM, { calm: 0.9 }, 1, 85)
  }
  net.sleep()
  const [alice, bob, someone] = ['alice', 'bob', 'carol'].map(who => net.vector(FORM, 85, who).jealous)
  assert.ok(alice > someone + 0.1 && bob < someone - 0.1, `${alice} ${bob} ${someone}`)
  assert.equal(someone, net.vector(FORM, 85).jealous)
  const stranger = new G.Net(), heart = stranger.vector(FORM, 85)
  teachMany(stranger, 'x', JEALOUS, 60, { closeness: 10 })
  stranger.sleep()
  assert.deepEqual(stranger.vector(FORM, 85), heart) // not close enough to teach her heart
  assert.equal(stranger.age, 0)
  assert.ok(stranger.vector(FORM, 10, 'x').jealous > stranger.vector(FORM, 10).jealous + 0.1)
})

test('someone she does not talk to fades back, and comes back; nothing snaps back in her sleep', () => {
  const net = new G.Net()
  for (let day = 0; day < 30; day++) teachMany(net, 'alice', JEALOUS, 2, { today: day })
  const full = net.weight('alice')
  for (let day = 30; day < 120; day++) teachMany(net, 'bob', { calm: 0.9 }, 1, { today: day })
  assert.ok(Math.abs(net.weight('alice') - full * (1 - G.PULL) ** 89) < 1e-9)
  teachMany(net, 'alice', JEALOUS, 40, { today: 120 })
  assert.ok(net.weight('alice') > full * 0.95)
  const fresh = new G.Net()
  teachMany(fresh, 'a', JEALOUS, 15)
  const awake = fresh.vector(FORM, 85).jealous
  fresh.sleep()
  assert.ok(fresh.vector(FORM, 85).jealous > awake)
  assert.equal(G.balance(new G.Net(), 0), 0) // nothing lived: her head alone
})

test('kept: she wakes as she slept, forgets a person but not what they did, and lives an old file again', async () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  for (let i = 0; i < 30; i++) gut.teach('discord:1', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 85, ['喵'])
  for (let i = 0; i < 10; i++) gut.teach('discord:2', 'zh', FORM, { feel: { calm: 0.9 }, mood: 1 }, 85, [])
  assert.equal(gut.teach('x', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 39.9, ['喵']), false)
  await gut.sleep()
  for (let i = 0; i < 5; i++) gut.teach('discord:1', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 85, ['喵'])
  const felt = gut.net.vector(FORM, 85), theirs = gut.net.vector(FORM, 85, 'discord:2')
  assert.equal(gut.report().age, 45)
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.equal(again.report().lessons, 46)
  near(again.net.vector(FORM, 85), felt)
  near(again.net.vector(FORM, 85, 'discord:2'), theirs)
  await again.sleep()
  const heart = again.net.vector(FORM, 85)
  assert.equal(await again.forget('discord:1'), 35)
  assert.deepEqual(again.net.vector(FORM, 85), heart) // what they did to her heart stays
  assert.ok(!('discord:1' in again.report().people))
  const named = again.db.prepare('select subject, count(*) as n from lessons group by subject order by subject').all()
  assert.deepEqual(named.map(row => [row.subject, row.n]), [['', 35], ['discord:2', 10], ['x', 1]])
  again.close()
  const old = file(), db = new DatabaseSync(old)
  db.exec(`create table lessons (id integer primary key, subject text not null, at real not null,
    language text not null, form text not null, feel text not null, mood integer not null, closeness real not null,
    words text not null);
    create table state (key text primary key, value blob not null);`)
  for (let i = 0; i < 30; i++) {
    db.prepare('insert into lessons (subject, at, language, form, feel, mood, closeness, words) values ' +
      "(?, ?, 'zh', ?, ?, 1, 85, '[]')").run('discord:1', 1.8e9 + i * 3600, JSON.stringify(FORM),
      JSON.stringify(JEALOUS))
  }
  const old04 = '{"w": {}, "b": [0,0,0,0,0,0,0], "lessons": 30}' // (0.2's own net, lived again in its place)
  db.prepare("insert into state values ('net', ?)").run(zlib.gzipSync(Buffer.from(old04)))
  db.close()
  const lived = new G.Gut(old)
  lived.wake()
  const report = lived.report()
  assert.deepEqual([report.lessons, report.age, report.people['discord:1'].lessons], [30, 30, 30])
  assert.ok(lived.net.vector(FORM, 85).jealous > 0.5)
  assert.ok(Math.abs(lived.net.vector(FORM, 85).defiant - G.squash(G.BLANK)) < 1e-12)
  assert.deepEqual(lived.db.prepare('select key from state').all().map(row => row.key), ['heart'])
  lived.close()
})

test('a starter is a lean; one from before knew seven; a broken one says so', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gut-')), starter = path.join(folder, 's.json.gz')
  const rows = [...Array(30).fill([FORM, 'jealous', 1, 85]), ...Array(30).fill([OTHER, 'none', 0, 85])]
  const words = { zh: { n: 60, words: { 的: 40 } } }
  fs.writeFileSync(starter, zlib.gzipSync(Buffer.from(JSON.stringify({ rows, words }))))
  const gut = new G.Gut(path.join(folder, 'g.db'), { starter })
  gut.wake()
  const felt = gut.net.vector(FORM, 85), other = gut.net.vector(OTHER, 85)
  assert.ok(felt.jealous > other.jealous + 0.1 && other.calm > felt.calm + 0.1)
  assert.ok(Math.abs(felt.defiant - G.squash(G.BLANK)) < 1e-12)
  assert.equal(gut.marks.base.zh.n, 60)
  gut.close()
  const broken = path.join(folder, 'broken.json.gz')
  fs.writeFileSync(broken, 'not gzip')
  assert.throws(() => new G.Gut(path.join(folder, 'b.db'), { starter: broken }).wake())
  const none = new G.Gut(path.join(folder, 'n.db'), { starter: path.join(folder, 'none.json.gz') })
  none.wake() // no file: a blank gut
  none.close()
})

test('her settings stay, a tune fades as she lives, and an age can be set young again', async () => {
  const where = file()
  const gut = new G.Gut(where)
  gut.wake()
  assert.deepEqual(gut.configure({ tau: 300, sensitivity: 0.5 }), { tau: 300, sensitivity: 0.5, nudge: {}, locked: false,
    people: {}, side: null })
  for (const bad of [{ tau: 0 }, { tau: true }, { sensitivity: 2 }, { locked: 1 }]) {
    assert.throws(() => gut.configure(bad))
  }
  gut.tune('irritable', { nature: -2 })
  assert.throws(() => gut.tune('angry', { now: 0.3 }))
  assert.throws(() => gut.tune('irritable', { nature: 4 }))
  assert.ok(gut.net.vector(FORM, 85).irritable < 0.01)
  gut.tune('sad', { now: 0.5 })
  assert.ok(Math.abs(gut.tone.lean({ sad: 0.1 }).sad - 0.6) < 1e-12)
  for (let i = 0; i < 300; i++) gut.teach('a', 'zh', FORM, { feel: JEALOUS, mood: 1 }, 85, [])
  await gut.sleep()
  assert.equal(gut.report().learning, py.round(G.FLOOR + (1 - G.FLOOR) * Math.exp(-1), 3)) // (tau 300, after 300)
  const felt = gut.net.vector(FORM, 85)
  gut.setAge(0)
  assert.deepEqual([gut.report().age, gut.report().learning], [0, 1])
  assert.deepEqual(gut.net.vector(FORM, 85), felt)
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.settings, { tau: 300, sensitivity: 0.5, nudge: { irritable: -2 }, locked: false, people: {},
    side: null })
  assert.equal(again.report().age, 0)
  await again.wipe()
  assert.equal(again.settings.tau, 300) // a wipe takes what she learned, not her settings
  again.close()
})

test('locked by hand: her heart, each person, a side shown in its share of turns', async () => {
  const where = file(), gut = new G.Gut(where)
  gut.wake()
  const teach = (count, feel = JEALOUS, subject = 'discord:1') => {
    for (let i = 0; i < count; i++) gut.teach(subject, 'zh', FORM, { feel, mood: 1 }, 85, ['喵'])
  }
  teach(30)
  gut.configure({ locked: true })
  const felt = gut.net.vector(FORM, 85), age = gut.net.age
  teach(60, { scornful: 0.9 })
  await gut.sleep()
  assert.deepEqual([gut.net.vector(FORM, 85), gut.net.age], [felt, age]) // her heart: as it was
  assert.ok(gut.net.vector(FORM, 85, 'discord:1').scornful > 0.3) // how she is with them: still learning
  gut.configure({ locked: false })
  const learned = gut.net.weight('discord:1')
  const before = [gut.net.vector(FORM, 85, 'discord:1'), gut.net.vector(FORM, 85, 'discord:2')]
  assert.deepEqual(gut.tunePerson('discord:1', { end: 'sweet', nature: 2.5 }), { nudge: { sweet: 2.5 } })
  const sweet = before[0].sweet / (1 - before[0].sweet) * Math.exp(2.5) // (a nudge is added before the end is read)
  assert.ok(Math.abs(gut.net.vector(FORM, 85, 'discord:1').sweet - sweet / (1 + sweet)) < 1e-9)
  assert.deepEqual(gut.net.vector(FORM, 85, 'discord:2'), before[1]) // with them alone
  gut.tunePerson('discord:1', { weight: 0 })
  assert.equal(gut.net.weight('discord:1'), 0)
  gut.tunePerson('discord:1', { weight: 'learned' })
  assert.equal(gut.net.weight('discord:1'), learned)
  for (const bad of [{ end: 'sweet' }, { end: 'angry', nature: 1 }, { end: 'sweet', nature: 4 }, { weight: 1.5 },
    { weight: 'some' }, { locked: 'yes' }]) assert.throws(() => gut.tunePerson('discord:1', bad))
  gut.tunePerson('discord:1', { locked: true })
  const theirs = gut.net.vector(FORM, 85, 'discord:1')
  teach(40, { scornful: 0.9 })
  for (let day = 1; day < 60; day++) {
    gut.teach('discord:2', 'zh', OTHER, { feel: { calm: 0.5 }, mood: 0 }, 20, [], 1.8e9 + day * 86400)
  }
  await gut.sleep()
  assert.equal(gut.net.weight('discord:1'), learned) // a locked person does not fade, and teaches nothing
  assert.ok(Math.abs(gut.net.vector(FORM, 85, 'discord:1').sweet - theirs.sweet) < 1e-6)
  assert.throws(() => gut.lockSide('病娇'), /give it a sentence/)
  assert.throws(() => gut.lockSide('龙傲天', { what: '你很狂。' }))
  assert.throws(() => gut.lockSide('病娇', { often: 2, what: '你离不开对方。' }))
  gut.writeSide('御姐', '你从容，不撒娇。', 50)
  gut.lockSide('病娇', { often: 0.25, what: '你离不开对方，别人一靠近就紧张。' })
  assert.deepEqual(gut.holding(), ['病娇'])
  const rolls = [0.1, 0.5, 0.9, 0.3]
  let turn = 0
  gut.roll = () => rolls[turn++ % 4]
  const shown = Array.from({ length: 40 }, () => gut.feel(FORM, null, 10, 0, 'zh').told.includes('病娇'))
  assert.equal(shown.filter(Boolean).length, 10) // one turn in four, and for a stranger too
  assert.deepEqual(gut.holding(Date.now() / 1000 + 400 * 86400), ['病娇']) // no month ends it
  gut.close()
  const again = new G.Gut(where)
  again.wake()
  assert.deepEqual(again.report().side, { name: '病娇', often: 0.25 })
  assert.deepEqual(again.report().hands, { 'discord:1': { nudge: { sweet: 2.5 }, locked: true } })
  again.unlockSide()
  assert.deepEqual([again.settings.side, again.holding()], [null, ['病娇']]) // a month in it first, then drawn
  again.lockSide('御姐')
  again.dropSide('御姐')
  assert.equal(again.settings.side, null)
  again.tunePerson('discord:3', { end: 'stern', nature: 1 })
  await again.forget('discord:3')
  assert.equal(Object.hasOwn(again.settings.people, 'discord:3'), false) // forgotten: what was set for them goes too
  again.close()
})

test('how much a side is wanted, and what her readings come to', () => {
  const day = 86400
  ;[40, 60, 85, 100].forEach((closeness, index) => assert.ok(Math.abs(G.strength([[0, true, closeness],
    [day, true, closeness], [2 * day, false, 60]], 10 * day) - V.strength[index]) < 2e-9))
  assert.deepEqual(['{"side": null}', 'nothing', '{"side": {"name": " 「小 绿茶」 ", "more": false, "what": " 说 她\\n不好 "}}',
    `{"side": {"name": "御姐", "what": "${'从容'.repeat(40)}"}}`, '{"side": {"name": ""}}'].map(G.shaping), V.shaping)
  ;[40, 85].forEach((closeness, index) => assert.ok(Math.abs(G.strength([[0, true, closeness], [2 * day, false, 60]],
    100 * day, G.KEEPS) - V['strength over months'][index]) < 2e-9))
  assert.deepEqual([[1, 0], [1, 0.5], [1, 0.99], [2, 0.5], [5, 0.2]].map(([count, roll]) =>
    G.draw({ 御姐: 3, 病娇: 1, 三无: 0.5 }, count, () => roll)), V.draw)
  assert.deepEqual(G.NAMES, V.names)
  ;[['你先夸她，再让她不如你。', '你先夸她，再 让她不如你！'], ['你从容。', '你先夸她。'], ['', 'x']].forEach(([one, other], index) =>
    assert.ok(Math.abs(G.overlap(one, other) - V.overlap[index]) < 2e-9))
  assert.deepEqual(['{"name": "（御姐）", "what": "你从容（不急）\\n，不撒娇。"}', '{"name": "x"}', 'no'].map(G.grownSide),
    V['grown side'])
})

test('her word habits: in her line for everyone, or with `wordsFrom` only for people that close', () => {
  const heads = { zh: { names: ['主人'], w: {}, b: [5.0] } } // (a habit she has with everyone)
  const said = (gut, closeness) => gut.feel(forms[0], { calm: 0.5, happy: 0.5 }, closeness, 0, 'zh').told
  const everyone = new G.Gut(file())
  everyone.wake()
  everyone.marks.heads = heads
  assert.ok(said(everyone, 20).includes('you keep saying 主人'))
  const close = new G.Gut(file(), { wordsFrom: G.TEACH_FROM })
  close.wake()
  close.marks.heads = heads
  assert.ok(said(close, G.TEACH_FROM).includes('you keep saying 主人'))
  const stranger = said(close, 20)
  assert.ok(stranger.startsWith('(Right now you feel') && !stranger.includes('keep saying'), stranger)
  everyone.close()
  close.close()
})

test('a word she says mostly to one person is theirs', async () => {
  const marks = new G.Marks({ zh: { words: new Map(), n: 100 } })
  for (let index = 0; index < 30; index++) {
    marks.teach('zh', FORM, 1, 85, index % 2 ? ['阿杰', '喵'] : ['喵'], index % 2 ? 'jie' : 'sis')
  }
  marks.heads = await marks.trained()
  assert.deepEqual(marks.heads.zh.owners, { 阿杰: 'jie' })
  assert.ok(marks.speaks('zh', FORM, 85, 2.0, 0.35, 'jie').includes('阿杰'))
  assert.ok(!marks.speaks('zh', FORM, 85, 2.0, 0.35, 'sis').includes('阿杰'))
  assert.ok(!marks.speaks('zh', FORM, 85).includes('阿杰')) // someone new
  assert.ok(marks.speaks('zh', FORM, 85).includes('喵'))
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
    const slow = () => new Promise(resolve => setTimeout(resolve, 2000, '{}').unref())
    const turn = new G.Turn(gut, slow, '', 'hello', 'a')
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

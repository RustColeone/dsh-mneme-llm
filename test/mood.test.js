// The mood: drifting back, the guardrails, judging, telling once. Ported from mneme-llm's tests/test_mood.py.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Answer } from '../lib/decide.js'
import * as exchanges from '../lib/exchange.js'
import { Mood, MoodSettings } from '../lib/mood.js'
import { Store } from '../lib/store.js'

const HOUR = 3600
const near = (actual, expected, places = 3) => assert.ok(Math.abs(actual - expected) < 10 ** -places,
  `${actual} against ${expected}`)

function mood (settings = {}) {
  const clock = { now: Date.UTC(2026, 9, 24, 12) / 1000 }
  return [new Mood(new Store(':memory:'), 't', { settings: new MoodSettings(settings), companionName: '大肥鱼',
    clock: () => clock.now }), clock]
}

/** A judge that returns a fixed mood verdict and records what it was asked. */
class Judge {
  constructor ({ change = null, feeling = null, reason = '' } = {}) {
    Object.assign(this, { change, feeling, reason, asked: [], name: 'judge' })
  }

  async decide (input, questions) {
    this.asked.push([input, Object.fromEntries(questions.map(q => [q.name, q]))])
    const found = {}
    const most = given => Math.max(...given.values())
    if (this.change) {
      found.mood_change = new Answer('mood_change', this.change, most(this.change), this.name, this.reason)
    }
    if (this.feeling) found.feeling = new Answer('feeling', this.feeling, most(this.feeling), this.name)
    return found
  }
}

async function judged (m, judge, exchange, { source = 'user', userName = 'Leo' } = {}) {
  const framed = exchanges.frame(exchange, { source, userName, companionName: m.companionName })
  const answers = await judge.decide(framed, m.questions())
  return m.applyAnswers('u', answers, exchange, { source, userName })
}

test('it starts at the baseline and drifts back', () => {
  const [m, clock] = mood()
  assert.equal(m.state('u').value, 70)
  m.apply('u', { delta: 20, emotions: { happy: 40 } })
  clock.now += 3 * HOUR
  const state = m.state('u')
  near(state.value, 80)
  near(state.emotions.happy, 40 * 0.5 ** 2) // a 90-minute half-life
})

test('it drops only from aching, worry or sadness, within its floor, by the source\'s weight', () => {
  let [m] = mood()
  assert.equal(m.apply('u', { delta: -10, emotions: { jealous: 0.4 } }), null) // nothing left to record
  assert.equal(m.state('u').value, 70)
  near(m.apply('u', { delta: -10, emotions: { worried: 30 } }).value, 60)
  ;[m] = mood({ floor: 40 })
  m.apply('u', { delta: -50, emotions: { sad: 50 } })
  assert.equal(m.state('u').value, 40)
  m.reset('u')
  m.apply('u', { delta: 10, emotions: { happy: 10 }, source: 'duty' })
  near(m.state('u').value, 75)
  assert.throws(() => m.apply('u', { delta: NaN }), /finite numbers/)
})

test('judging moves it by the expected level and spreads the feelings', async () => {
  const judge = new Judge({ change: new Map([['-2', 0], ['-1', 0.04], ['0', 0.45], ['1', 0.4], ['2', 0.11]]),
    feeling: new Map([['tender', 0.94], ['happy', 0.06]]) })
  const [m] = mood()
  const event = await judged(m, judge, [['Leo', '今天考试又没考好……'], ['大肥鱼', '才不笨！']])
  near(event.delta, 0.58 * 6, 2)
  assert.deepEqual(Object.keys(event.emotions), ['tender']) // 6% of happy is below the noise floor
  assert.equal(event.reason, 'Leo said “今天考试又没考好……”') // the feeling is said by the cue
  assert.equal(event.judge, 'judge')
})

test('the question follows who started it', async () => {
  const judge = new Judge({ feeling: new Map([['sweet', 0.9], ['happy', 0.1]]) })
  const [m] = mood()
  await judged(m, judge, '大肥鱼: 想你了', { source: 'speak-up' })
  const [input, questions] = judge.asked[0]
  assert.match(input, /reached out to Leo on their own/)
  assert.doesNotMatch(questions.mood_change.instructions, /Leo/) // names live in the text, not the question
  assert.equal(m.applyAnswers('u', {}, 'x', { source: 'runtime' }), null)
  assert.equal(m.applyAnswers('u', {}, 'hello'), null)
})

test('news says what to feel, once, and only when confident', () => {
  let [m] = mood()
  m.apply('u', { delta: 6, emotions: { happy: 40 }, reason: 'Leo passed the exam', confidence: 0.9 })
  assert.equal(m.news('u'), '(Your mood 76/100 (good); feeling: happy 40 right now. What just moved you: Leo ' +
    'passed the exam. Something worth celebrating: you feel happy.)')
  m.displayLanguage = 'zh'
  m.apply('u', { delta: -3, emotions: { worried: 40 }, reason: 'Leo发烧了', confidence: 0.9 })
  assert.match(m.news('u'), /这让你放心不下：你在担心对方。/)
  ;[m] = mood({ threshold: 0.6 })
  m.apply('u', { delta: 4, emotions: { happy: 30 }, reason: '被夸了', confidence: 0.9 })
  assert.match(m.news('u'), /被夸了/)
  assert.equal(m.news('u'), null)
  m.apply('u', { delta: 4, emotions: { happy: 30 }, reason: '猜的', confidence: 0.3 })
  assert.equal(m.news('u'), null)
  assert.equal(m.timeline('u')[0].reason, '猜的') // still on the record
  ;[m] = mood({ tell: 'off' })
  m.apply('u', { delta: 4, emotions: { happy: 30 }, reason: 'r' })
  assert.equal(m.news('u'), null)
  ;[m] = mood({ tell: 'mood' })
  m.apply('u', { delta: 4, emotions: { happy: 30 }, reason: 'r' })
  assert.doesNotMatch(m.news('u'), /r\)/)
})

test('the Chinese description, and its faces', () => {
  const [m] = mood()
  m.displayLanguage = 'zh'
  m.apply('u', { delta: 15, emotions: { sweet: 40 } })
  assert.equal(m.describe('u'), '心情 85/100（欢喜）；甜蜜 40')
  m.apply('u', { delta: -70, emotions: { sad: 90 } })
  assert.equal(m.state('u').face, 'sad')
})

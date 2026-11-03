// What the tests share: a companion in memory, on a clock the test moves (as in mneme-llm's own tests).
import { Mneme } from '../lib/mneme.js'

export const DAY = 86400
export const START = Date.UTC(2026, 0, 1, 12) / 1000
export const UTC = { offset: 0 }

/** A companion on a clock the test moves; no embedder unless one is given (no test reaches a network). */
export function companion ({ config = null, complete = null, at = START, file = ':memory:', name = '小鲸', embed = false,
  memoryLanguage = null, judge = null, ...options } = {}) {
  const clock = { now: at }
  const m = new Mneme(file, 't', { config, zone: UTC, clock: () => clock.now, companionName: name, complete, embed,
    memoryLanguage, judge, ...options })
  return [m, clock]
}

export const small = (floor = 100, cap = 100000, days = 2) => ({ memory: { surface_floor: floor, surface_cap: cap,
  surface_days: days } })

export const say = (m, clock, said, reply = '好', subject = 'u') =>
  m.episodes.keep(subject, [['Leo', said], ['小鲸', reply]], { at: clock.now })

/** The forms and feelings mneme-llm's gut vectors are made from. */
export const FORMS = [
  { people: ['coworker'], gender: ['woman'], topic: ['lunch'], event: ['ate'], sender_feels: 'happy',
    toward_you: 'none' },
  { people: [], gender: [], topic: ['rain', 'Bus'], event: ['got wet'], sender_feels: 'tired', toward_you: 'asking' },
  { people: ['mother'], gender: ['woman'], topic: ['health'], event: ['fell'], sender_feels: 'worried',
    toward_you: 'affection' }]
export const FEELS = [{ jealous: 0.7, sweet: 0.3 }, { tender: 1.0 }, { worried: 0.6, sad: 0.4 }]

/** Each mood of `actual` within `within` of `expected`'s. */
export function near (assert, actual, expected, within = 2e-9) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < within, `${key}: ${actual[key]} against ${expected[key]}`)
  }
}

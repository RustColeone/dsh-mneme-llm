// What the tests share: a companion in memory, on a clock the test moves (as in mneme-llm's own tests).
import { Mneme } from '../lib/mneme.js'

export const DAY = 86400
export const START = Date.UTC(2026, 0, 1, 12) / 1000
export const UTC = { offset: 0 }

export function companion ({ config = null, complete = null, at = START, file = ':memory:', name = '小鲸' } = {}) {
  const clock = { now: at }
  const m = new Mneme(file, 't', { config, zone: UTC, clock: () => clock.now, companionName: name, complete })
  return [m, clock]
}

export const small = (floor = 100, cap = 100000, days = 2) => ({ memory: { surface_floor: floor, surface_cap: cap,
  surface_days: days } })

export const say = (m, clock, said, reply = '好', subject = 'u') => m.episodes.keep(subject, [['Leo', said], ['小鲸', reply]],
  { at: clock.now })

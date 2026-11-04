// Her heart as a star map. Her 24 ends sit evenly around a circle, in `ENDS` order, the first at the top. Every row of
// her heart (one thing she can notice, such as topic=rain or close=high, with a weight for each end) is a star: it
// sits where that row alone pulls her (a softmax of its weights, each end's share drawn out along that end's arm), as
// bright as the row leans at all (its strongest weight less its weakest), in the colour of the bar of its strongest
// end.
// The arms are how much more or less she feels each end now than the day she was born, over her own latest lessons.
// Each person she knows is one star more, placed the same way by what is different with them (their table's bias).
//
//     const map = starmap(gut)   // { ends, reach, probed, rows, stars: [[x, y, bright, end, key]], people: [...] }
import { ENDS, Net, features, readStarter } from './gut.js'
import * as py from './python.js'

export const SPREAD = 8.0 // how far a leaning row travels toward its end (her rows lean little: mostly under 1)
export const STARS = 1500 // stars sent: the rows that lean most
export const PROBE = 300 // her own latest lessons, which her arms are measured on
export const LEAST = 20 // with fewer lessons than this, every arm is as she was born
export const SHORTEST = 0.5, LONGEST = 2.4 // how far an arm can shrink or grow
export const ANGLES = ENDS.map((end, k) => -Math.PI / 2 + 2 * Math.PI * k / ENDS.length)
const ONE = ENDS.map(() => 1.0)

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

/** Where a row sits: each end's share of a softmax of its weights, along that end's arm. */
export function spot (row, reach = ONE) {
  const top = Math.max(...row)
  const pulls = row.map(weight => Math.exp(SPREAD * (weight - top)))
  const total = pulls.reduce((sum, pull) => sum + pull, 0)
  let x = 0, y = 0
  pulls.forEach((pull, k) => {
    x += pull / total * reach[k] * Math.cos(ANGLES[k])
    y += pull / total * reach[k] * Math.sin(ANGLES[k])
  })
  return [x, y]
}

/** How much a row leans at all: its strongest weight less its weakest. */
export const brightness = row => Math.max(...row) - Math.min(...row)

/** The end a row pulls toward most (the first, of equals). */
export const strongest = row => row.indexOf(Math.max(...row))

/** How strongly a table feels each end, on average over some moments ([form, closeness] each). */
export function strengths (table, probe) {
  const sums = ENDS.map(() => 0.0)
  for (const [form, closeness] of probe) {
    table.strengths(features(form, closeness)).forEach((value, k) => { sums[k] += value })
  }
  return sums.map(value => value / Math.max(1, probe.length))
}

/** Her arms: how much she feels each end now against as she was born, square root, from SHORTEST to LONGEST. With
 * fewer than LEAST moments to measure on, each is 1. */
export function arms (heart, born, probe) {
  if (probe.length < LEAST) return [...ONE]
  const now = strengths(heart, probe), then = strengths(born, probe)
  return now.map((value, k) => then[k] > 0 ? Math.min(LONGEST, Math.max(SHORTEST, Math.sqrt(value / then[k]))) : 1.0)
}

const births = new Map() // starter file → her heart as she was born, which never changes

/** Her heart as she was born: her starter, as `Gut.wake` starts a gut with no heart kept. */
export function born (starter) {
  const file = starter ? String(starter) : ''
  if (!births.has(file)) {
    const [rows, , known] = file ? readStarter(file) : [[], {}, ENDS]
    const net = new Net()
    if (rows.length) net.start(rows, known)
    births.set(file, net.heart)
  }
  return births.get(file)
}

/** The moments of her own latest lessons, [form, closeness] each, the newest first. */
export function probeOf (gut, count = PROBE) {
  const rows = gut._open().prepare('select form, closeness from lessons order by id desc limit ?').all(count)
  return rows.flatMap(row => {
    try {
      const form = JSON.parse(row.form)
      return form && typeof form === 'object' && !Array.isArray(form) ? [[form, row.closeness]] : []
    } catch {
      return []
    }
  })
}

/** Her star map: up to `most` stars, the rows that lean most, and a star for each person she knows. */
export function starmap (gut, { most = STARS } = {}) {
  const net = gut.net, probe = probeOf(gut)
  const reach = arms(net.heart, born(gut.starter), probe)
  const rows = [...net.heart.w].map(([key, row]) => [key, row, brightness(row)])
    .sort((one, other) => other[2] - one[2] || py.compare(one[0], other[0])).slice(0, most)
  const stars = rows.map(([key, row, bright]) => {
    const [x, y] = spot(row, reach)
    return [round(x, 4), round(y, 4), round(bright, 3), strongest(row), key]
  })
  const people = [...net.people].map(([subject, found]) => {
    const [x, y] = spot(found.table.b, reach)
    return { subject, x: round(x, 4), y: round(y, 4), weight: round(net.weight(subject), 3), lessons: py.round(found.n),
      end: strongest(found.table.b) }
  }).sort((one, other) => other.weight - one.weight || py.compare(one.subject, other.subject))
  return { ends: ENDS, reach: reach.map(value => round(value, 3)), probed: probe.length, rows: net.heart.w.size, stars,
    people }
}

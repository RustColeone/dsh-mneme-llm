// Her heart as a star map. Her 24 ends sit evenly around a circle, in `ENDS` order, the first at the top. Every row of
// her heart (one thing she can notice, such as topic=rain or close=high, with a weight for each end) is a star: it
// sits where that row alone pulls her (a softmax of its weights, each end's share drawn out along that end's arm), as
// bright as the row leans at all (its strongest weight less its weakest), in the colour of the bar of its strongest
// end.
// The arms are how much more or less she feels each end now than the day she was born, over her own latest lessons.
// Each person she knows is one star more, placed the same way by what is different with them (their table's bias).
//
// In three dimensions (`DIRECTIONS`), her 13 bars are spread evenly over a sphere, the first at the top, and the two
// ends of a bar sit side by side, a little apart: a row that pulls toward both ends of a bar (sweet and scornful, say)
// goes out between them rather than back to the middle. Each star and person has a place on the sphere too.
//
//     const map = starmap(gut)   // { ends, reach, probed, rows, directions, stars: [[x, y, bright, end, key, X, Y, Z]],
//                                //   people: [{ subject, x, y, at: [X, Y, Z], weight, lessons, end }] }
import { BARS, ENDS, Net, features, readStarter } from './gut.js'
import * as py from './python.js'

export const SPREAD = 8.0 // how far a leaning row travels toward its end (her rows lean little: mostly under 1)
export const STARS = 1500 // stars sent: the rows that lean most
export const PROBE = 300 // her own latest lessons, which her arms are measured on
export const LEAST = 20 // with fewer lessons than this, every arm is as she was born
export const SHORTEST = 0.3, LONGEST = 2.4 // how far an arm can shrink or grow
export const GAIN = 3.0 // an arm grows by this much for each 1 of strength she has gained on an end (0 to 1)
export const APART = 12 * Math.PI / 180 // in 3D, each end of a bar this far from the bar's own direction
// and how each bar's pair is turned about its direction, in degrees: the turns that keep every other bar's ends at
// least 41 degrees away, while a bar's own two ends are 24 apart (found once, by trying each bar's turn in steps)
export const TURNS = [108, 163, 173, 173, 165, 163, 160, 163, 173, 178, 173, 0, 0]
export const ANGLES = ENDS.map((end, k) => -Math.PI / 2 + 2 * Math.PI * k / ENDS.length)

/** In 3D, each end's direction: the bars on a sphere (a Fibonacci spiral from the top, y up), and a bar's two ends
 * side by side, turned by TURNS. */
export const DIRECTIONS = (() => {
  const unit = ([x, y, z]) => {
    const length = Math.hypot(x, y, z)
    return [x / length, y / length, z / length]
  }
  const cross = ([a, b, c], [d, e, f]) => [b * f - c * e, c * d - a * f, a * e - b * d]
  const golden = Math.PI * (3 - Math.sqrt(5))
  return BARS.flatMap(([, , left], index) => {
    const y = 1 - 2 * (index + 0.5) / BARS.length, r = Math.sqrt(1 - y * y), turn = index * golden
    const centre = [Math.cos(turn) * r, y, Math.sin(turn) * r]
    if (!left) return [centre]
    const across = unit(cross(centre, Math.abs(y) > 0.99 ? [1, 0, 0] : [0, 1, 0])), up = cross(centre, across)
    const phi = TURNS[index] * Math.PI / 180
    const side = across.map((value, k) => value * Math.cos(phi) + up[k] * Math.sin(phi))
    return [-1, 1].map(sign => unit(centre.map((value, k) => value * Math.cos(APART) + sign * side[k] * Math.sin(APART))))
  })
})()

const ONE = ENDS.map(() => 1.0)

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits

/** Each end's share of where a row sits: a softmax of its weights. */
function shares (row) {
  const top = Math.max(...row)
  const pulls = row.map(weight => Math.exp(SPREAD * (weight - top)))
  const total = pulls.reduce((sum, pull) => sum + pull, 0)
  return pulls.map(pull => pull / total)
}

/** Where a row sits: each end's share of a softmax of its weights, along that end's arm. */
export function spot (row, reach = ONE) {
  let x = 0, y = 0
  shares(row).forEach((share, k) => {
    x += share * reach[k] * Math.cos(ANGLES[k])
    y += share * reach[k] * Math.sin(ANGLES[k])
  })
  return [x, y]
}

/** Where a row sits in 3D: the same shares, along each end's direction on the sphere. */
export function spot3 (row, reach = ONE) {
  const at = [0, 0, 0]
  shares(row).forEach((share, k) => DIRECTIONS[k].forEach((value, axis) => { at[axis] += share * reach[k] * value }))
  return at
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

/** Her arms: 1 as she was born, longer by GAIN for each 1 of strength she has gained on an end since, shorter for
 * what she has lost, from SHORTEST to LONGEST. A difference, not a ratio, so a feeling she was born with little of
 * does not fly out for a small gain. With fewer than LEAST moments to measure on, each is 1. */
export function arms (heart, born, probe) {
  if (probe.length < LEAST) return [...ONE]
  const now = strengths(heart, probe), then = strengths(born, probe)
  return now.map((value, k) => Math.min(LONGEST, Math.max(SHORTEST, 1 + GAIN * (value - then[k]))))
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
    return [round(x, 4), round(y, 4), round(bright, 3), strongest(row), key, ...spot3(row, reach).map(v => round(v, 4))]
  })
  const people = [...net.people].map(([subject, found]) => {
    const [x, y] = spot(found.table.b, reach)
    return { subject, x: round(x, 4), y: round(y, 4), at: spot3(found.table.b, reach).map(value => round(value, 4)),
      weight: round(net.weight(subject), 3), lessons: py.round(found.n), end: strongest(found.table.b) }
  }).sort((one, other) => other.weight - one.weight || py.compare(one.subject, other.subject))
  return { ends: ENDS, reach: reach.map(value => round(value, 3)), probed: probe.length, rows: net.heart.w.size,
    directions: DIRECTIONS.map(direction => direction.map(value => round(value, 5))), stars, people }
}

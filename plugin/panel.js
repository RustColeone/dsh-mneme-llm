// The panel's server half: what the plugin's settings on DSH's Plugins page and her sidebar tab read, and the changes
// the settings make to her gut. Three routes on DSH's own API, behind its sign-in and for its owner only:
//
//     GET  /api/mneme-llm.gut       her gut as the panel shows it (`view`)
//     GET  /api/mneme-llm.starmap   her star map (`lib/starmap.js`), worked out again only when her heart has changed
//     POST /api/mneme-llm.change    { tau, sensitivity, age, tune: [{ end, now, nature }] }, any of them (`change`)
//
// A change goes to the running gut and is kept in her gut file (`configure`, `setAge`, `tune`), so it is the latest
// word: the plugin's own `tau` and `sensitivity` only start a gut that has no settings of its own.
import { BARS, CHINESE, ENDS } from '../lib/gut.js'
import * as py from '../lib/python.js'
import { starmap } from '../lib/starmap.js'

export const ROUTES = { gut: '/api/mneme-llm.gut', starmap: '/api/mneme-llm.starmap', change: '/api/mneme-llm.change' }

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits

/** What changes her star map: a lesson, a sleep, her age set by hand, someone forgotten. */
export function stamp (gut) {
  const net = gut.net
  return [net.lessons, net.waiting.length, round(net.age, 6), net.people.size].join(':')
}

/** Her gut as the panel shows it: her report, each bar lately against usual (the strength of its second end less its
 * first), and each end as she is tuned. `you` is the subject that is the person she belongs to. */
export function view (gut, { you = 'owner', companion = '' } = {}) {
  const report = gut.report(), tone = gut.tone
  return { companion, you, stamp: stamp(gut), report,
    bars: BARS.map(([bar, zh, left, right]) => ({ bar, zh, ends: [left ? left[0] : null, right[0]],
      lately: round(tone.level(bar)), usual: round(tone.level(bar, 'usual')) })),
    ends: ENDS.map(end => ({ end, zh: CHINESE[end], now: round(tone.shift[end] ?? 0.0, 4),
      nature: gut.settings.nudge[end] ?? 0.0 })) }
}

/** A number from `low` to `high`, or the error saying what it should be. */
function within (value, low, high, what) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) {
    throw new py.ValueError(`${what} is a number from ${low} to ${high}`)
  }
  return value
}

/** One change from the settings, checked whole before any of it lands, so it lands whole or not at all. */
export function change (gut, asked) {
  if (!isTable(asked)) throw new py.ValueError('a change is an object: tau, sensitivity, age or tune')
  const tau = asked.tau ?? null, sensitivity = asked.sensitivity ?? null, age = asked.age ?? null
  if (tau !== null && (typeof tau !== 'number' || !Number.isFinite(tau) || !(tau > 0))) {
    throw new py.ValueError('tau is a number of lessons above 0')
  }
  if (sensitivity !== null) within(sensitivity, -1, 1, 'sensitivity')
  if (age !== null && (typeof age !== 'number' || !Number.isFinite(age) || age < 0)) {
    throw new py.ValueError('an age is a number of lessons, 0 or more')
  }
  const tunes = asked.tune === undefined || asked.tune === null ? [] : [asked.tune].flat()
  for (const tune of tunes) {
    if (!isTable(tune) || !ENDS.includes(tune.end)) throw new py.ValueError(`not an end of hers: ${tune?.end}`)
    if (tune.now !== undefined && tune.now !== null) within(tune.now, -1, 1, `now for ${tune.end}`)
    if (tune.nature !== undefined && tune.nature !== null) within(tune.nature, -3, 3, `nature for ${tune.end}`)
  }
  if (tau !== null || sensitivity !== null) gut.configure({ tau, sensitivity })
  if (age !== null) gut.setAge(age)
  for (const tune of tunes) gut.tune(tune.end, { now: tune.now ?? null, nature: tune.nature ?? null })
}

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** The routes, on DSH's API (`ctx.connection.fetch`, which signs people in and lets only its owner through). `awake`
 * gives her gut, awake, or null when the plugin keeps none. A gut's star map is kept until her heart changes. */
export function serve (connection, awake, about = {}) {
  let kept = { stamp: null, gut: null, map: null }
  const guarded = work => async request => {
    try {
      const gut = awake()
      return gut ? answer(await work(gut, request)) : answer({ error: 'no gut: the plugin keeps none' }, 404)
    } catch (error) {
      return answer({ error: String(error?.message ?? error) }, error instanceof py.ValueError ? 400 : 500)
    }
  }
  const route = (path, method, work) => connection.fetch.register({ path, methods: [method], requestBody: 'buffered',
    fetch: guarded(work) })
  route(ROUTES.gut, 'GET', gut => view(gut, about))
  route(ROUTES.starmap, 'GET', gut => {
    const now = stamp(gut)
    if (kept.stamp !== now || kept.gut !== gut) kept = { stamp: now, gut, map: { stamp: now, ...starmap(gut) } }
    return kept.map
  })
  route(ROUTES.change, 'POST', async (gut, request) => {
    let asked
    try {
      asked = await request.json()
    } catch {
      throw new py.ValueError('a change is JSON')
    }
    change(gut, asked)
    return view(gut, about)
  })
}

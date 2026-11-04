// The panel's server half: what the plugin's settings on DSH's Plugins page and her sidebar tab read, and the changes
// the settings make to her gut. Three routes on DSH's own API, behind its sign-in and for its owner only:
//
//     GET  /api/mneme-llm.gut       her gut as the panel shows it (`view`)
//     GET  /api/mneme-llm.starmap   her star map (`lib/starmap.js`), worked out again only when her heart has changed
//     POST /api/mneme-llm.change    { tau, sensitivity, age, locked, tune: [{ end, now, nature }],
//                                     people: [{ subject, tune: [{ end, nature }], weight, locked, closeness, hold,
//                                       forget }], sides: [{ name, what, weight, drop }], side: { name, often } | null },
//                                     any of them (`change`)
//
// A change goes to the running gut and is kept in her gut file (`configure`, `setAge`, `tune`, `tunePerson`,
// `writeSide`, `dropSide`, `lockSide`, `unlockSide`, `forget`), so it is the latest word: the plugin's own `tau` and
// `sensitivity` only start a gut that has no settings of its own. Closeness and its lock go to her memory file
// (`Relations.set`, `lock`, `unlock`).
import * as G from '../lib/gut.js'
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

/** Who has a role in her memory, with the band of that role and whether closeness is locked. */
function closenessOf (memory) {
  if (!memory) return {}
  const relations = memory.relations, locks = relations.locks()
  return Object.fromEntries(relations.all().map(found => {
    const kind = relations.roles.get(found.role) || { floor: 0, ceiling: 100 }
    return [found.subject, { role: found.role, value: round(found.closeness, 2), floor: kind.floor,
      ceiling: kind.ceiling, locked: Object.hasOwn(locks, found.subject) }]
  }))
}

/** Her gut as the panel shows it: her report, each bar lately against usual (the strength of its second end less its
 * first), each end as she is tuned, each person she knows (how she is with them by hand, and their closeness from her
 * memory), and her sides. `you` is the subject that is the person she belongs to. */
export function view (gut, { you = 'owner', companion = '', memory = null } = {}) {
  const report = gut.report(), tone = gut.tone, close = closenessOf(memory)
  const subjects = [...new Set([...gut.net.people.keys(), ...Object.keys(gut.settings.people), ...Object.keys(close)])]
  const people = subjects.map(subject => {
    const found = gut.net.people.get(subject), hand = gut.settings.people[subject] || {}
    return { subject, lessons: found ? py.round(found.n) : 0, weight: round(gut.net.weight(subject)),
      nudge: { ...(hand.nudge || {}) }, set: hand.weight ?? null, locked: Boolean(hand.locked),
      closeness: close[subject] ?? null }
  }).sort((one, other) => (other.subject === you) - (one.subject === you) || other.lessons - one.lessons ||
    py.compare(one.subject, other.subject))
  const hers = { ...gut.tags, ...gut.grown }
  const sides = Object.keys(hers).map(name => ({ name, what: hers[name], given: Object.hasOwn(gut.tags, name),
    own: gut.weights[name] ?? 0, weight: py.round(gut.weight(name), 1) }))
  return { companion, you, stamp: stamp(gut), report, locked: gut.settings.locked, people, sides,
    side: gut.settings.side ? { ...gut.settings.side } : null, names: [...gut.names],
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

const listOf = value => value === undefined || value === null ? [] : [value].flat()
const given = value => value !== undefined && value !== null

/** One change from the settings, checked whole before any of it lands, so it lands whole or not at all. `memory`: her
 * memory, for closeness. */
export function change (gut, asked, memory = null) {
  if (!isTable(asked)) throw new py.ValueError('a change is an object: tau, sensitivity, age, locked, tune, people, ' +
    'sides or side')
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
    if (tune.nature !== undefined && tune.nature !== null) {
      within(tune.nature, -G.NATURE, G.NATURE, `nature for ${tune.end}`)
    }
  }
  const locked = asked.locked ?? null
  if (locked !== null && typeof locked !== 'boolean') throw new py.ValueError('locked is true or false')
  const close = closenessOf(memory)
  const people = listOf(asked.people)
  for (const person of people) {
    if (!isTable(person) || typeof person.subject !== 'string' || !py.strip(person.subject)) {
      throw new py.ValueError('a person is { subject, ... }')
    }
    for (const tune of listOf(person.tune)) {
      if (!isTable(tune) || !ENDS.includes(tune.end)) throw new py.ValueError(`not an end of hers: ${tune?.end}`)
      within(tune.nature, -G.NATURE, G.NATURE, `nature for ${tune.end} with ${person.subject}`)
    }
    if (given(person.weight) && person.weight !== 'learned') within(person.weight, 0, 1, 'weight')
    for (const key of ['locked', 'hold', 'forget']) {
      if (given(person[key]) && typeof person[key] !== 'boolean') throw new py.ValueError(`${key} is true or false`)
    }
    if (given(person.closeness) || given(person.hold)) {
      const found = close[person.subject]
      if (!found) throw new py.ValueError(`${person.subject} has no role: closeness needs one`)
      if (given(person.closeness)) within(person.closeness, found.floor, found.ceiling, `closeness for ${found.role}`)
    }
  }
  const sides = listOf(asked.sides), written = new Set()
  for (const side of sides) {
    if (!isTable(side) || !gut.names.includes(side.name)) throw new py.ValueError(`not a side she can have: ${side?.name}`)
    if (given(side.what) && (typeof side.what !== 'string' || !py.strip(side.what) || side.what.length > 200)) {
      throw new py.ValueError('a sentence is some words, at most 200 characters')
    }
    if (given(side.weight) && (typeof side.weight !== 'number' || !Number.isFinite(side.weight) || side.weight < 0)) {
      throw new py.ValueError('a weight is a number, 0 or more')
    }
    if (!side.drop && !given(side.what) && !Object.hasOwn(gut.grown, side.name)) {
      throw new py.ValueError(`${side.name} is not one of her sides yet: give it a sentence`)
    }
    if (given(side.what)) written.add(side.name)
  }
  const side = asked.side
  if (given(side)) {
    if (!isTable(side) || !gut.names.includes(side.name)) throw new py.ValueError(`not a side she can have: ${side?.name}`)
    within(side.often ?? 1, 0, 1, 'often')
    if (!Object.hasOwn(gut.tags, side.name) && !Object.hasOwn(gut.grown, side.name) && !written.has(side.name)) {
      throw new py.ValueError(`${side.name} is not one of her sides yet: give it a sentence`)
    }
  }
  if (tau !== null || sensitivity !== null || locked !== null) gut.configure({ tau, sensitivity, locked })
  if (age !== null) gut.setAge(age)
  for (const tune of tunes) gut.tune(tune.end, { now: tune.now ?? null, nature: tune.nature ?? null })
  for (const item of sides) {
    if (item.drop) gut.dropSide(item.name)
    else gut.writeSide(item.name, item.what ?? gut.grown[item.name], item.weight ?? gut.weights[item.name] ?? G.GROWS)
  }
  if (side === null) gut.unlockSide()
  else if (side !== undefined) gut.lockSide(side.name, { often: side.often ?? 1 })
  for (const person of people) {
    const subject = person.subject
    if (person.forget) {
      gut.forget(subject).catch(() => {}) // (its work is done at once: nothing in it waits)
      continue
    }
    for (const tune of listOf(person.tune)) gut.tunePerson(subject, { end: tune.end, nature: tune.nature })
    if (given(person.weight) || given(person.locked)) {
      gut.tunePerson(subject, { weight: person.weight ?? null, locked: person.locked ?? null })
    }
    if (memory && (given(person.closeness) || given(person.hold))) {
      const relations = memory.relations, found = close[subject]
      if (person.hold === false) relations.unlock(subject)
      const holding = person.hold ?? found.locked
      if (holding) relations.lock(subject, person.closeness ?? null)
      else if (given(person.closeness)) relations.set(subject, found.role, { closeness: person.closeness })
    }
  }
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
    change(gut, asked, about.memory ?? null)
    return view(gut, about)
  })
}

// The panel's server half: what the plugin's settings on DSH's Plugins page and her sidebar tab read, and the changes
// the settings make. Routes on DSH's own API, behind its sign-in and for its owner only:
//
//     GET  /api/mneme-llm.settings  every setting of the page's four tabs, Her · People · Memory · Gut (`settings`)
//     POST /api/mneme-llm.settings  { her: { name, language, zone, card: { text, on } | null }, me: { name, link,
//                                     unlink }, people: [{ subject, role, closeness, hold, tune, weight, locked,
//                                     forget }], others, memory: { surface_days, ... }, rows: { chat, complete },
//                                     gut: <a change, as below, without people> }, any of them; or { start }
//                                     alone (`settle`)
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
// (`Relations.set`, `lock`, `unlock`), as do her name, zone, card, roles, links and her memory's settings
// (`Mneme.change`); the plugin's own settings the page changes are kept over them (kept.js).
import { check } from '../lib/config.js'
import * as G from '../lib/gut.js'
import { BARS, CHINESE, ENDS } from '../lib/gut.js'
import * as py from '../lib/python.js'
import { starmap } from '../lib/starmap.js'

export const ROUTES = { gut: '/api/mneme-llm.gut', starmap: '/api/mneme-llm.starmap', change: '/api/mneme-llm.change',
  settings: '/api/mneme-llm.settings' }

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
  prepare(gut, asked, memory)()
}

/** `change` checked, and the work that makes it, for a caller that checks more before any of it lands. */
function prepare (gut, asked, memory) {
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
  return () => {
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
}

// ---- the page's four tabs: Her · People · Memory · Gut --------------------------------------------------------------

/** The language she answers in, by the name the page shows: auto (each person's own) or one of these. */
export const LANGUAGES = { auto: '', english: 'en', chinese: 'zh', cantonese: 'yue', japanese: 'ja' }
const NAMED = { en: 'english', zh: 'chinese', mandarin: 'chinese', yue: 'cantonese', ja: 'japanese' }
// What the Memory tab sets of her memory file's config (`memory.<key>`): the surface's size and the look of what was said.
export const MEMORY = ['surface_days', 'surface_floor', 'surface_cap', 'surface_window', 'said_budget', 'said_words']
export const STARTS = ['fresh', 'deep', 'gut'] // what $new does: what she keeps of lately; and of everyone; and her gut
const ACCOUNT = /^[A-Za-z][\w.-]{0,31}:\S{1,200}$/ // an account on a chat channel, as the channel names it: qq:10001
const GUT_ONLY = ['tune', 'weight', 'locked', 'forget'] // of a person, what lives in her gut
const LONGEST = 80 // characters of a name

/** A language as the page names it, from the plugin's setting (a name or a code; '' or none: auto). */
export function languageName (language) {
  const said = String(language ?? '').trim().toLowerCase()
  if (!said || said === 'auto') return 'auto'
  if (Object.hasOwn(LANGUAGES, said)) return said
  const named = NAMED[said]
  if (!named) throw new py.ValueError('language is auto, english, chinese, cantonese or japanese')
  return named
}

/** Her accounts' links: the accounts that are `subject` to her. */
const accountsOf = (memory, subject) => Object.entries(memory.people.all()).filter(([account, person]) =>
  person === subject && account !== subject).map(([account]) => account).sort(py.compare)

/** Everyone the People tab lists: you first, then whoever has a role in her memory or taught her gut, the most taught
 * first. Each with their role and closeness (her memory) and how she is with them (her gut), where there is one. */
function peopleOf (memory, gut, gutView, you) {
  const close = closenessOf(memory), taught = new Map((gutView?.people ?? []).map(item => [item.subject, item]))
  const subjects = [...new Set([you, ...taught.keys(), ...Object.keys(close)])]
  return subjects.map(subject => {
    const found = taught.get(subject)
    return { subject, you: subject === you, role: close[subject]?.role ?? '', closeness: close[subject] ?? null,
      gut: found ? { lessons: found.lessons, weight: found.weight, nudge: found.nudge, set: found.set,
        locked: found.locked } : (gut ? { lessons: 0, weight: 0, nudge: {}, set: null, locked: false } : null) }
  }).sort((one, other) => (other.you - one.you) || ((other.gut?.lessons ?? 0) - (one.gut?.lessons ?? 0)) ||
    py.compare(one.subject, other.subject))
}

/** Every setting the page shows, for a host (the plugin's hooks; see `settings` there): her name, the language she
 * answers in, her zone and Character Card (Her); you, your accounts, the role of people she meets and everyone she
 * knows (People); the surface's size and the look (Memory); and her gut, when she has one (Gut). `rows` are the host's
 * own settings, each on a tab, with its words. */
export function settings (host) {
  const memory = host.mneme, gut = host.gut(), config = host.settings(), own = memory.config
  const gutView = gut ? view(gut, { you: host.subject, companion: memory.companionName, memory }) : null
  const card = host.card()
  const roles = [...memory.relations.roles.values()].map(role => ({ key: role.key, floor: role.floor,
    ceiling: role.ceiling, start: role.start, unique: role.unique, names: { ...role.names } }))
  return {
    version: 1, companion: memory.companionName, you: host.subject,
    her: { name: memory.companionName, language: languageName(config.language), zone: own.get('companion.zone'),
      card: card ? { text: card.text, on: Boolean(card.on), how: card.how } : null },
    me: { name: String(config.user || ''), accounts: accountsOf(memory, host.subject) },
    others: config.others === undefined ? 'acquaintance' : String(config.others || ''),
    roles, people: peopleOf(memory, gut, gutView, host.subject),
    memory: Object.fromEntries(MEMORY.map(key => [key, own.get(`memory.${key}`)])),
    rows: host.rows.map(row => ({ ...row, value: config[row.key] ?? row.fallback ?? null })),
    starts: gut ? STARTS : STARTS.slice(0, 2),
    gut: gutView
  }
}

/** A name: some words, at most 80 characters. */
function nameOf (value, what) {
  if (typeof value !== 'string' || !py.strip(value) || value.length > LONGEST) {
    throw new py.ValueError(`${what} is some words, at most ${LONGEST} characters`)
  }
  return py.strip(value)
}

/** One save from the page (`settings`'s shape, any part of it), checked whole before any of it lands, so it lands
 * whole or not at all; `start` is sent alone, as `$new` is typed alone. Returns the settings as they are then. */
export async function settle (host, asked) {
  if (!isTable(asked)) throw new py.ValueError('a change is an object: her, me, people, others, memory, rows, gut or start')
  const unknown = Object.keys(asked).filter(key => !['her', 'me', 'people', 'others', 'memory', 'rows', 'gut',
    'start'].includes(key))
  if (unknown.length) throw new py.ValueError(`not a part of the settings: ${unknown.join(', ')}`)
  const memory = host.mneme, own = memory.config, gut = host.gut(), you = host.subject
  if (given(asked.start)) {
    if (Object.keys(asked).length > 1) throw new py.ValueError('start is sent alone')
    if (!(gut ? STARTS : STARTS.slice(0, 2)).includes(asked.start)) {
      throw new py.ValueError(`start is ${(gut ? STARTS : STARTS.slice(0, 2)).join(', ')}`)
    }
    await host.start(asked.start === 'fresh' ? '' : asked.start)
    return settings(host)
  }
  const keep = {}, config = {}, work = []
  const roles = memory.relations.roles
  const roleOf = (value, what) => {
    if (value === '' || value === null) return ''
    if (typeof value !== 'string' || !roles.has(value)) throw new py.ValueError(`${what} is one of her roles, or ''`)
    return value
  }
  // Her
  const her = asked.her ?? {}
  if (!isTable(her)) throw new py.ValueError('her is { name, language, zone, card }')
  if (given(her.name)) {
    config['companion.name'] = nameOf(her.name, 'her name')
    keep.companion = config['companion.name']
  }
  if (given(her.language)) keep.language = languageName(her.language)
  if (given(her.zone)) config['companion.zone'] = check('companion.zone', her.zone)
  if (her.card !== undefined) {
    const card = her.card
    if (card !== null && !isTable(card)) throw new py.ValueError('a card is { text, on }, or null to take it away')
    if (card && given(card.text) && (typeof card.text !== 'string' || !py.strip(card.text))) {
      throw new py.ValueError('a card is some words')
    }
    if (card && given(card.on) && typeof card.on !== 'boolean') throw new py.ValueError('on is true or false')
    if (card && card.on === true && !given(card.text) && !host.card()) throw new py.ValueError('there is no card yet')
    work.push(() => {
      const surface = memory.surface
      if (card === null) surface.dropCard(you)
      else {
        if (given(card.text)) surface.setCard(you, card.text)
        if (given(card.on)) surface.cardOn(you, card.on)
      }
    })
  }
  // People: you, your accounts, everyone she knows, and the role of people she meets
  const me = asked.me ?? {}
  if (!isTable(me)) throw new py.ValueError('me is { name, link, unlink }')
  if (given(me.name)) keep.user = me.name === '' ? '' : nameOf(me.name, 'your name')
  const linking = listOf(me.link), unlinking = listOf(me.unlink), mine = accountsOf(memory, you)
  for (const account of linking) {
    if (typeof account !== 'string' || !ACCOUNT.test(account) || account === you) {
      throw new py.ValueError(`not an account: ${account} (a channel and an id, such as qq:10001)`)
    }
    const other = memory.person(account)
    if (other !== account && other !== you) throw new py.ValueError(`${account} is ${other}'s: unlink it there first`)
  }
  for (const account of unlinking) {
    if (!mine.includes(account)) throw new py.ValueError(`${account} is not one of your accounts`)
  }
  if (linking.length || unlinking.length) {
    keep.accounts = [...new Set([...mine, ...linking])].filter(account => !unlinking.includes(account))
      .sort(py.compare)
    work.push(() => {
      for (const account of unlinking) memory.unlink(account)
      for (const account of linking) {
        memory.link(account, you)
        if (gut) gut.link(account, you)
      }
    })
  }
  if (asked.others !== undefined) keep.others = roleOf(asked.others, 'others')
  const close = closenessOf(memory), toGut = []
  for (const person of listOf(asked.people)) {
    if (!isTable(person) || typeof person.subject !== 'string' || !py.strip(person.subject)) {
      throw new py.ValueError('a person is { subject, ... }')
    }
    const subject = person.subject
    const role = given(person.role) ? roleOf(person.role, `the role of ${subject}`) : undefined
    const kind = role === undefined ? (close[subject] ? roles.get(close[subject].role) : null) : roles.get(role)
    if ((given(person.closeness) || given(person.hold)) && !kind) {
      throw new py.ValueError(`${subject} has no role: closeness needs one`)
    }
    if (given(person.closeness)) within(person.closeness, kind.floor, kind.ceiling, `closeness for ${kind.key}`)
    if (given(person.hold) && typeof person.hold !== 'boolean') throw new py.ValueError('hold is true or false')
    if (kind?.unique && role !== undefined && role !== close[subject]?.role) {
      const holder = Object.entries(close).find(([other, found]) => other !== subject && found.role === kind.key)
      if (holder) throw new py.ValueError(`${holder[0]} is her ${kind.key} already: there is one`)
    }
    const forGut = Object.fromEntries(GUT_ONLY.filter(key => given(person[key])).map(key => [key, person[key]]))
    if (Object.keys(forGut).length) {
      if (!gut) throw new py.ValueError('she has no gut: the plugin keeps none')
      toGut.push({ subject, ...forGut })
    }
    if (role !== undefined && subject === you) keep.role = role
    work.push(() => {
      const relations = memory.relations
      if (role === '') relations.remove(subject)
      else if (role !== undefined && role !== close[subject]?.role) {
        relations.set(subject, role, { closeness: given(person.closeness) ? person.closeness : null })
      }
      if (role === '') return
      const locked = Object.hasOwn(relations.locks(), subject)
      if (person.hold === false) relations.unlock(subject)
      const holding = person.hold ?? locked
      if (holding) relations.lock(subject, person.closeness ?? null)
      else if (given(person.closeness)) relations.set(subject, role ?? close[subject].role, { closeness: person.closeness })
    })
  }
  // Memory
  const values = asked.memory ?? {}
  if (!isTable(values)) throw new py.ValueError('memory is { surface_days, ... }')
  for (const [key, value] of Object.entries(values)) {
    if (!MEMORY.includes(key)) throw new py.ValueError(`not a memory setting the page sets: ${key}`)
    config[`memory.${key}`] = check(`memory.${key}`, value)
  }
  // The host's own rows
  const rows = asked.rows ?? {}
  if (!isTable(rows)) throw new py.ValueError('rows is { key: value }')
  for (const [key, value] of Object.entries(rows)) {
    const row = host.rows.find(item => item.key === key)
    if (!row) throw new py.ValueError(`not a setting here: ${key}`)
    if (row.kind === 'bool' && typeof value !== 'boolean') throw new py.ValueError(`${key} is true or false`)
    if (row.kind === 'choice' && !row.options.some(option => option.value === value)) {
      throw new py.ValueError(`${key} is ${row.options.map(option => option.value).join(', ')}`)
    }
    keep[key] = value
  }
  // Gut
  if (asked.gut !== undefined && asked.gut !== null && !gut) throw new py.ValueError('she has no gut: the plugin keeps none')
  const gutWork = gut && (isTable(asked.gut) || toGut.length)
    ? prepare(gut, { ...(isTable(asked.gut) ? asked.gut : {}),
      ...(toGut.length ? { people: [...listOf(asked.gut?.people), ...toGut] } : {}) }, null)
    : null
  if (Object.keys(config).length) memory.change(config)
  if (gut && 'companion.zone' in config) gut.zone = memory.memory.zone
  for (const item of work) item()
  gutWork?.()
  if (Object.keys(keep).length) host.keep(keep)
  return settings(host)
}

const answer = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** The routes, on DSH's API (`ctx.connection.fetch`, which signs people in and lets only its owner through). `awake`
 * gives her gut, awake, or null when the plugin keeps none. A gut's star map is kept until her heart changes. With a
 * `host` (the plugin's hooks), every setting of the page's four tabs too, with or without a gut. */
export function serve (connection, awake, about = {}) {
  let kept = { stamp: null, gut: null, map: null }
  const failed = error => answer({ error: String(error?.message ?? error) }, error instanceof py.ValueError ? 400 : 500)
  const guarded = work => async request => {
    try {
      const gut = awake()
      return gut ? answer(await work(gut, request)) : answer({ error: 'no gut: the plugin keeps none' }, 404)
    } catch (error) { return failed(error) }
  }
  const route = (path, method, work) => connection.fetch.register({ path, methods: [method], requestBody: 'buffered',
    fetch: guarded(work) })
  const now = () => ({ ...about, companion: about.memory?.companionName ?? about.companion })
  const read = async request => {
    try {
      return await request.json()
    } catch {
      throw new py.ValueError('a change is JSON')
    }
  }
  if (about.host) {
    const host = about.host
    connection.fetch.register({ path: ROUTES.settings, methods: ['GET', 'POST'], requestBody: 'buffered',
      fetch: async request => {
        try {
          return answer(request.method === 'POST' ? await settle(host, await read(request)) : settings(host))
        } catch (error) { return failed(error) }
      } })
  }
  route(ROUTES.gut, 'GET', gut => view(gut, now()))
  route(ROUTES.starmap, 'GET', gut => {
    const now = stamp(gut)
    if (kept.stamp !== now || kept.gut !== gut) kept = { stamp: now, gut, map: { stamp: now, ...starmap(gut) } }
    return kept.map
  })
  route(ROUTES.change, 'POST', async (gut, request) => {
    change(gut, await read(request), about.memory ?? null)
    return view(gut, now())
  })
}

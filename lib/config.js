// A companion's config: its name and languages, its memory, mood and relationship settings, its roles and feelings,
// the instructions it gives models and the sentences it shows. Kept in its database, per space, so the companion
// carries them wherever the file goes. A port of mneme_llm/config.py, every key and rule: a new space is written whole
// with the same rows, value for value, as Python writes them.
//
//     first open   a space with no config takes the built-in defaults, with a config table over them
//     later        the database's copy is used, whatever table is given; it changes by `set`, `apply` and
//                  `loadDefaults`, never by itself
//     in code      an option given to `new Mneme(...)` wins for that process, and is not stored
//
// Keys are flat: `companion.name`, `mood.threshold`, `roles`, `prompts.note_writer`, `messages.zh.notes.header`.
// Every value is checked when it is set or applied; a stored value that no longer passes is passed over for the
// default. TOML config files come with the command line: here a config is a table (an object).
import fs from 'node:fs'
import path from 'node:path'
import { MESSAGES, placeholders } from './i18n.js'
import { PROMPTS } from './prompts.js'
import * as py from './python.js'
import { ROLES, Role } from './relations.js'
import { dumps } from './store.js'

export const ORIGINS = ['default', 'file', 'set', 'import']
export const SECTIONS = ['companion', 'memory', 'mood', 'relations', 'prompts'] // tables of plain keys
const WORD = /^[a-z][a-z0-9_-]{0,39}$/
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/
const OPEN_KEYS = ['emotion.', 'cue.', 'role.'] // sentences for a feeling or a role of the companion's own
const OFFSET = new RegExp(`^UTC(?:([+-])(${py.DIGIT}{1,2})(?::?(${py.DIGIT}{2}))?)?$`, 'u')
const now = () => Date.now() / 1000
const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const given = (row, field, fallback) => Object.hasOwn(row, field) ? row[field] : fallback // (Python's row.get)

// The parts these defaults come from in Python (episodes.py, surface.py, mood.py), as they are there.
const EPISODES = { DAYS: 30.0, BUDGET: 6000, CUT: 0.08, CUT_FADED: 0.16 }
const SURFACE = { DAYS: 30, FLOOR: 70000, CAP: 504000, WINDOW: 1048576 }
const MOOD = { baseline: 70.0, floor: 0.0, ceiling: 100.0, mood_half_life_h: 3.0, emotion_half_life_min: 90.0, step: 6.0,
  gain: 40.0, threshold: 0.6, tell: 'event', weights: { user: 1.0, 'speak-up': 0.7, duty: 0.5 }, skip: ['runtime', 'time'] }
const EMOTIONS = [['happy', false], ['calm', false], ['sweet', false], ['tender', true], ['worried', true], ['sad', true],
  ['jealous', false]]

const roleRow = role => ({ key: role.key, floor: role.floor, ceiling: role.ceiling, start: role.start, fades: role.fades,
  unique: role.unique, names: { ...role.names } })

function defaults () {
  const found = {
    'companion.name': 'the assistant', 'companion.display_language': 'en',
    'companion.memory_language': 'English', 'companion.zone': '',
    'memory.half_life_days': 30.0, 'memory.daily_quota': 8, 'memory.max_notes': 50000,
    'memory.semantic_window': 5000, 'memory.said_days': EPISODES.DAYS, 'memory.said_budget': EPISODES.BUDGET,
    'memory.said_cut': EPISODES.CUT, 'memory.said_cut_faded': EPISODES.CUT_FADED,
    'memory.surface_days': SURFACE.DAYS, 'memory.surface_floor': SURFACE.FLOOR, 'memory.surface_cap': SURFACE.CAP,
    'memory.surface_window': SURFACE.WINDOW,
    ...Object.fromEntries(Object.entries(MOOD).map(([name, value]) => [`mood.${name}`, value])),
    'relations.growth': 1.0, 'relations.fade_days': 30.0,
    roles: ROLES.map(roleRow),
    emotions: EMOTIONS.map(([key, lowers]) => ({ key, lowers, names: {} }))
  }
  for (const [name, text] of Object.entries(PROMPTS)) found[`prompts.${name}`] = text
  for (const [lang, table] of Object.entries(MESSAGES)) {
    for (const [key, text] of Object.entries(table)) found[`messages.${lang}.${key}`] = text
  }
  return found
}

export const DEFAULTS = Object.freeze(defaults())

// ---- checking one value ---------------------------------------------------------------------------------------------
/** `value` as `key` keeps it, or ValueError saying what is wrong. */
export function check (key, value) {
  const rule = ruleOf(key)
  if (!rule) throw new py.ValueError(`${key}: no such setting`)
  try {
    return rule(key, value)
  } catch (error) {
    if (error instanceof py.ValueError) throw error
    throw new py.ValueError(`${key}: ${error.message}`) // a value no rule foresaw is a wrong value too
  }
}

/** Whether this version has such a setting. */
export const known = key => ruleOf(key) !== null

function ruleOf (key) {
  if (key.startsWith('messages.')) return messageParts(key) ? message : null
  if (key.startsWith('prompts.')) return Object.hasOwn(DEFAULTS, key) ? prompt : null
  return Object.hasOwn(RULES, key) ? RULES[key] : null
}

function text (limit, empty = false) {
  return (key, value) => {
    if (typeof value !== 'string' || py.len(value) > limit || (!empty && !py.strip(value)) || !value.isWellFormed()) {
      throw new py.ValueError(`${key}: text of at most ${limit} characters` + (empty ? '' : ', not empty'))
    }
    return value
  }
}

function number (low, high, integer = false) {
  const rule = (key, value) => {
    const finite = typeof value === 'number' && Number.isFinite(value)
    if (!finite || !(low <= value && value <= high) || (integer && !Number.isInteger(value))) {
      throw new py.ValueError(`${key}: ${integer ? 'a whole number' : 'a number'} from ${py.g(low)} to ${py.g(high)}`)
    }
    return value
  }
  rule.floats = !integer // (Python keeps it as a float, and writes 30 as 30.0)
  return rule
}

function oneOf (...choices) {
  return (key, value) => {
    if (!choices.includes(value)) throw new py.ValueError(`${key}: one of ${choices.join(', ')}`)
    return value
  }
}

function numbers (low, high) {
  const rule = (key, value) => {
    if (!isTable(value)) throw new py.ValueError(`${key}: a table of names and numbers`)
    const amount = number(low, high)
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [word(`${key} name`, name),
      amount(`${key}.${name}`, item)]))
  }
  rule.floats = true
  return rule
}

function words (key, value) {
  if (!Array.isArray(value)) throw new py.ValueError(`${key}: a list of words`)
  return [...new Set(value.map(item => word(key, item)))].sort(py.compare)
}

function word (key, value) {
  if (typeof value !== 'string' || !WORD.test(value)) {
    throw new py.ValueError(`${key}: ${py.reprOf(value)} is not a word (lowercase letters, digits, _ and -, at most 40)`)
  }
  return value
}

function names (key, value) {
  if (!isTable(value)) throw new py.ValueError(`${key}: a table of names by language`)
  const found = {}
  for (const [lang, name] of Object.entries(value)) {
    if (!LANGUAGE.test(lang)) {
      throw new py.ValueError(`${key}: ${py.reprOf(lang)} is not a language code (en, zh, ja, pt-BR…)`)
    }
    found[lang] = text(80)(`${key}.${lang}`, name)
  }
  return found
}

function zone (key, value) {
  text(60, true)(key, value)
  zoneOf(value)
  return value
}

const ROLE_FIELDS = ['key', 'floor', 'ceiling', 'start', 'fades', 'unique', 'names']

function roles (key, value) {
  if (!Array.isArray(value) || !value.length) throw new py.ValueError(`${key}: a list of roles, at least one`)
  const found = [], seen = new Set()
  value.forEach((row, index) => {
    const where = `${key}[${index}]`
    if (!isTable(row) || Object.keys(row).some(field => !ROLE_FIELDS.includes(field))) {
      throw new py.ValueError(`${where}: a table of key, floor, ceiling, start, fades, unique and names`)
    }
    const name = word(`${where}.key`, row.key)
    if (seen.has(name)) throw new py.ValueError(`${where}: role ${name} given twice`)
    seen.add(name)
    const clean = { names: names(`${where}.names`, given(row, 'names', {})) }
    for (const field of ['floor', 'ceiling', 'start']) {
      if (Object.hasOwn(row, field)) clean[field] = number(0, 100)(`${where}.${field}`, row[field])
    }
    for (const field of ['fades', 'unique']) {
      if (Object.hasOwn(row, field)) {
        if (typeof row[field] !== 'boolean') throw new py.ValueError(`${where}.${field}: true or false`)
        clean[field] = row[field]
      }
    }
    found.push(roleRow(new Role(name, clean))) // (Role checks its band)
  })
  return found
}
roles.checkedFloats = true // (a checked role's numbers are floats; the defaults' are whole)

function emotions (key, value) {
  if (!Array.isArray(value) || !(value.length >= 1 && value.length <= 20)) {
    throw new py.ValueError(`${key}: a list of 1 to 20 feelings`)
  }
  const found = [], seen = new Set()
  value.forEach((row, index) => {
    const where = `${key}[${index}]`
    if (!isTable(row) || Object.keys(row).some(field => !['key', 'lowers', 'names'].includes(field))) {
      throw new py.ValueError(`${where}: a table of key, lowers and names`)
    }
    const name = word(`${where}.key`, row.key)
    if (seen.has(name) || name === 'none') throw new py.ValueError(`${where}: feeling ${name} given twice (or named none)`)
    seen.add(name)
    const lowers = given(row, 'lowers', false)
    if (typeof lowers !== 'boolean') throw new py.ValueError(`${where}.lowers: true or false`)
    found.push({ key: name, lowers, names: names(`${where}.names`, given(row, 'names', {})) })
  })
  return found
}

function prompt (key, value) {
  text(20000)(key, value)
  allowed(key, value, placeholders(DEFAULTS[key]))
  return value
}

function messageParts (key) {
  const parts = key.split('.')
  if (parts.length < 3 || !LANGUAGE.test(parts[1])) return null
  const name = parts.slice(2).join('.')
  const open = OPEN_KEYS.some(prefix => name.startsWith(prefix)) && WORD.test(name.slice(name.indexOf('.') + 1))
  return Object.hasOwn(MESSAGES.en, name) || open ? [parts[1], name] : null
}

function message (key, value) {
  text(2000, true)(key, value) // (a separator may be a space; an empty sentence is the default's)
  const [, name] = messageParts(key)
  allowed(key, value, placeholders(MESSAGES.en[name] ?? ''))
  return value
}

function allowed (key, value, names) {
  const unknown = [...placeholders(value)].filter(name => !names.has(name)).sort(py.compare)
  if (unknown.length) {
    const offer = [...names].sort(py.compare).map(name => `{${name}}`).join(', ') || 'none'
    throw new py.ValueError(`${key}: no placeholder ${unknown.map(name => `{${name}}`).join(', ')} here (it may use ` +
      `${offer})`)
  }
}

function language (key, value) {
  if (typeof value !== 'string' || !LANGUAGE.test(value)) {
    throw new py.ValueError(`${key}: a language code (en, zh, ja, pt-BR…)`)
  }
  return value
}

export const MOST = 10 ** 12 // tokens a surface may be set to: as many as someone wants to pay for
const RULES = {
  'companion.name': text(80), 'companion.display_language': language,
  'companion.memory_language': text(40, true), 'companion.zone': zone,
  'memory.half_life_days': number(0.01, 100000), 'memory.daily_quota': number(0, 10000, true),
  'memory.max_notes': number(10, 10000000, true),
  'memory.semantic_window': number(10, 1000000, true),
  'memory.said_days': number(0.01, 100000), 'memory.said_budget': number(0, 200000, true),
  'memory.said_cut': number(-1, 1), 'memory.said_cut_faded': number(-1, 1),
  'memory.surface_days': number(1, 100000, true), 'memory.surface_floor': number(0, MOST, true),
  'memory.surface_cap': number(1000, MOST, true), 'memory.surface_window': number(1000, MOST, true),
  'mood.baseline': number(0, 100), 'mood.floor': number(0, 100), 'mood.ceiling': number(0, 100),
  'mood.mood_half_life_h': number(0.01, 100000), 'mood.emotion_half_life_min': number(0.01, 1000000),
  'mood.step': number(0, 50), 'mood.gain': number(0, 100), 'mood.threshold': number(0, 1),
  'mood.tell': oneOf('event', 'mood', 'off'), 'mood.weights': numbers(0, 10),
  'mood.skip': words,
  'relations.growth': number(0, 100), 'relations.fade_days': number(0, 1000000),
  roles, emotions
}

const ZONEINFO = '/usr/share/zoneinfo'

/** A zone from its name: "" for the machine's (null), "UTC+8" or "UTC-05:30" for a fixed offset ({ offset } in
 * seconds), or an IANA name ({ name }), which Python's zoneinfo must know as well, in the same case. */
export function zoneOf (name) {
  if (!name) return null
  const offset = OFFSET.exec(name)
  if (offset) {
    const [, sign, hours, minutes] = offset
    const delta = py.int(hours ?? '0') * 3600 + py.int(minutes ?? '0') * 60
    if (py.int(minutes ?? '0') > 59 || delta > 14 * 3600) {
      throw new py.ValueError(`companion.zone: ${name} is more than 14 hours from UTC`)
    }
    return { offset: sign === '-' ? -delta : delta }
  }
  let known = false
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone
    known = resolved === name || fs.existsSync(path.join(ZONEINFO, name))
  } catch {}
  if (!known || name.includes('..') || path.isAbsolute(name)) {
    throw new py.ValueError(`companion.zone: no time zone ${py.reprOf(name)} (an IANA name such as Asia/Shanghai, or ` +
      'UTC+8)')
  }
  return { name }
}

/** The rules between keys. */
function together (values) {
  const [low, base, high] = ['floor', 'baseline', 'ceiling'].map(name => values[`mood.${name}`])
  if (!(low <= base && base <= high)) {
    throw new py.ValueError(`mood: floor (${py.g(low)}) <= baseline (${py.g(base)}) <= ceiling (${py.g(high)})`)
  }
}

/** A value as the file keeps it, as Python's json.dumps writes it: a float as 30.0, where a rule or a check makes floats
 * (`checked`: the value came through `check`, not from the defaults). */
export function written (key, value, checked = true) {
  const rule = ruleOf(key)
  return dumps(value, { floats: Boolean(rule?.floats || (checked && rule?.checkedFloats)) })
}

// ---- tables ---------------------------------------------------------------------------------------------------------
/** A config table, as flat keys; ValueError names a wrong key. */
export function load (source) {
  if (!isTable(source)) {
    throw new TypeError('a config is a table (an object) here; TOML files come with the command line')
  }
  const flat = {}
  for (const [name, value] of Object.entries(source)) {
    if (SECTIONS.includes(name)) {
      if (!isTable(value)) throw new py.ValueError(`${name}: a table`)
      for (const [key, item] of Object.entries(value)) flat[`${name}.${key}`] = item
    } else if (name === 'roles' || name === 'emotions') {
      flat[name] = value
    } else if (name === 'messages') {
      if (!isTable(value) || !Object.values(value).every(isTable)) throw new py.ValueError('messages: a table per language')
      for (const [lang, items] of Object.entries(value)) { // `notes.header = …` unquoted is a TOML table: the same key
        for (const [key, item] of dotted(items)) flat[`messages.${lang}.${key}`] = item
      }
    } else {
      throw new py.ValueError(`${name}: no such section (the sections are ${SECTIONS.join(', ')}, roles, emotions and ` +
        'messages)')
    }
  }
  return flat
}

function * dotted (table, prefix = '') {
  for (const [key, value] of Object.entries(table)) {
    if (isTable(value)) yield * dotted(value, `${prefix}${key}.`)
    else yield [`${prefix}${key}`, value]
  }
}

/** Python's == for what JSON holds: 30 is 30.0, and tables are equal whatever their order. */
export function same (one, other) {
  if (one === other) return true
  if (Array.isArray(one) || Array.isArray(other)) {
    return Array.isArray(one) && Array.isArray(other) && one.length === other.length && one.every((item, i) => same(item,
      other[i]))
  }
  if (isTable(one) && isTable(other)) {
    const keys = Object.keys(one)
    return keys.length === Object.keys(other).length && keys.every(key => Object.hasOwn(other, key) &&
      same(one[key], other[key]))
  }
  return false
}

// ---- the stored config ----------------------------------------------------------------------------------------------
export const BAND = ['mood.floor', 'mood.baseline', 'mood.ceiling']

/** The config of one space in one file. Every call reads the file, so it is never out of date with what any process
 * wrote; a running `Mneme` reads it once, when it opens. */
export class Config {
  constructor (store, space, clock = now) {
    this.store = store
    this.space = space
    this.clock = clock
  }

  // ---- reading -------------------------------------------------------------------------------------------------
  /** The valid rows by key, the stored keys whose value does not pass (and why), and the keys this version does not
   * know, as the file has them now. */
  _stored () {
    const rows = {}, invalid = {}, unknown = []
    for (const row of this.store.rows('select * from config where space = ?', [this.space])) {
      const key = row.key
      if (ruleOf(key) === null) {
        unknown.push(key)
        continue
      }
      try {
        rows[key] = { value: check(key, JSON.parse(row.value)), origin: row.origin, updated_at: row.updated_at }
      } catch (error) {
        invalid[key] = error.message
      }
    }
    try {
      together({ ...DEFAULTS, ...Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row.value])) })
    } catch (error) { // a band spoiled by hand: the mood's defaults instead
      for (const key of BAND) {
        invalid[key] = error.message
        delete rows[key]
      }
    }
    return [rows, invalid, unknown.sort(py.compare)]
  }

  get empty () {
    return this.store.row('select 1 from config where space = ? limit 1', [this.space]) === null
  }

  /** Stored keys whose value does not pass, and why (the default is used for them). */
  get invalid () {
    return this._stored()[1]
  }

  /** Stored keys this version does not know (kept, not used). */
  get unknown () {
    return this._stored()[2]
  }

  /** A key's value: stored, else this version's default. */
  get (key) {
    if (BAND.includes(key)) return this.values()[key] // (one of three that must agree)
    if (ruleOf(key) === null) throw new Error(`no setting ${key}`)
    const row = this.store.row('select value from config where space = ? and key = ?', [this.space, key])
    if (row) {
      try {
        return check(key, JSON.parse(row.value))
      } catch {}
    }
    return DEFAULTS[key]
  }

  /** Every key's value (the stored ones over this version's defaults). */
  values () {
    const [rows] = this._stored()
    return { ...DEFAULTS, ...Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, row.value])) }
  }

  rows () {
    return Object.entries(this._stored()[0]).sort(([one], [other]) => py.compare(one, other))
      .map(([key, row]) => ({ key, ...row }))
  }

  /** Keys stored from a default that this version has changed, and keys this version adds. */
  newerDefaults () {
    const [rows, invalid] = this._stored()
    const changed = Object.entries(rows).filter(([key, row]) => row.origin === 'default' && Object.hasOwn(DEFAULTS, key) &&
      !same(row.value, DEFAULTS[key])).map(([key]) => key)
    return [...changed, ...Object.keys(DEFAULTS).filter(key => !Object.hasOwn(rows, key) && !Object.hasOwn(invalid, key))]
      .sort(py.compare)
  }

  prompts () {
    const values = this.values()
    return Object.fromEntries(Object.keys(PROMPTS).map(name => [name, values[`prompts.${name}`]]))
  }

  messages () {
    const found = {}
    for (const [key, value] of Object.entries(this.values())) {
      if (!key.startsWith('messages.')) continue
      const [, lang, ...name] = key.split('.')
      ;(found[lang] ??= {})[name.join('.')] = value
    }
    return found
  }

  roles () {
    return this.get('roles').map(({ key, ...row }) => new Role(key, row))
  }

  zone () {
    return zoneOf(this.get('companion.zone'))
  }

  // ---- changing ------------------------------------------------------------------------------------------------
  /** A space's first config: the defaults, with `source` (a config table) over them. Only for a space that has none
   * (for any other, `source` is not even read); returns whether it was seeded. */
  seed (source = null) {
    return this.store.transaction(() => {
      if (!this.empty) return false
      const found = source !== null && source !== undefined ? load(source) : {}
      this._write(DEFAULTS, 'default', false)
      this._apply(found, 'file')
      return true
    })
  }

  /** Write every key a config table gives, all of them checked first; returns how many. */
  apply (source, { origin = 'file' } = {}) {
    if (!ORIGINS.includes(origin)) throw new py.ValueError(`origin: one of ${ORIGINS.join(', ')}`)
    const found = load(source)
    return this.store.transaction(() => this._apply(found, origin))
  }

  set (key, value) {
    this.store.transaction(() => this._apply({ [key]: value }, 'set'))
  }

  /** This version's defaults for `keys` (every key when none are given); returns how many were written. Loading only
   * some of the mood's floor, baseline and ceiling must leave them in order. */
  loadDefaults (keys = null) {
    keys = keys === null ? Object.keys(DEFAULTS) : [...keys]
    const missing = keys.filter(key => !Object.hasOwn(DEFAULTS, key))
    if (missing.length) throw new py.ValueError(`no default for ${missing.join(', ')}`)
    return this.store.transaction(() => {
      const found = Object.fromEntries(keys.map(key => [key, DEFAULTS[key]]))
      together({ ...this.values(), ...found })
      this._write(found, 'default', false)
      return keys.length
    })
  }

  /** Check and write, inside the caller's transaction (so the keys it is checked against are the file's). */
  _apply (found, origin) {
    const checked = Object.fromEntries(Object.entries(found).map(([key, value]) => [key, check(key, value)]))
    together({ ...this.values(), ...checked })
    this._write(checked, origin, true)
    return Object.keys(checked).length
  }

  _write (values, origin, checked) {
    const at = this.clock()
    for (const [key, value] of Object.entries(values)) {
      this.store.execute('insert or replace into config (space, key, value, origin, updated_at) values (?, ?, ?, ?, ?)',
        [this.space, key, written(key, value, checked), origin, at])
    }
  }

  // ---- moving between files ------------------------------------------------------------------------------------
  exportRows () {
    return { config: this.rows().map(row => ({ key: row.key, value: row.value, origin: row.origin })) }
  }

  /** Apply an export's config, each valid row (an unknown key or a wrong value is skipped; the mood's floor, baseline
   * and ceiling go in together or not at all); returns how many keys were applied. */
  importRows (rows = []) {
    const found = {}
    for (const row of rows) if (isTable(row) && typeof row.key === 'string') found[row.key] = row.value
    const groups = Object.entries(found).filter(([key]) => !BAND.includes(key)).map(([key, value]) => ({ [key]: value }))
    groups.push(Object.fromEntries(Object.entries(found).filter(([key]) => BAND.includes(key))))
    let applied = 0
    this.store.transaction(() => {
      for (const group of groups) {
        try {
          applied += this.store.transaction(() => this._apply(group, 'import')) // (a savepoint: a failed group leaves nothing)
        } catch (error) {
          if (!(error instanceof py.ValueError)) throw error
        }
      }
    })
    return applied
  }
}

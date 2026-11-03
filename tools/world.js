// test/fixtures/world.json through dsh-mneme-llm: notes, mood, the judge, the note writer, meaning, tools, links,
// erasing, export and import, with the rules of tools/models.js for the models. tools/world.py does the same through
// Python's mneme-llm; the two must agree, call for call and row for row.
//
//     node tools/world.js write FILE        the scenario's `ops` into FILE (a new file): what was asked and given
//     node tools/world.js run FILE KEY      the scenario's ops under KEY ("more", "reads") on a file
//     node tools/world.js export FILE SPACE         SPACE of FILE as an export, as JSON
//     node tools/world.js import FILE SPACE DATA    an export (a JSON file) added to SPACE of FILE, with its config
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Embeddings } from '../lib/meaning/index.js'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import { Toolbox } from '../lib/tools.js'
import * as models from './models.js'

export const WORLD = fileURLToPath(new URL('../test/fixtures/world.json', import.meta.url))
export const world = () => JSON.parse(fs.readFileSync(WORLD, 'utf8'))

const CAMEL = { happened_at: 'happenedAt', user_name: 'userName' }
const camel = options => Object.fromEntries(Object.entries(options ?? {}).map(([key, value]) => [CAMEL[key] ?? key,
  value]))

/** The spaces of one file, opened as the scenario says, on one clock and one model. */
export class World {
  constructor (file, given, state) {
    Object.assign(this, { file, given, state, asked: [], spaces: new Map(), boxes: new Map() })
  }

  space (name) {
    if (!this.spaces.has(name)) {
      const embed = this.given.embedded.includes(name) ? new Embeddings(models.toy, 'toy:1') : false
      this.spaces.set(name, new Mneme(this.file, name, { config: this.given.config, complete: models.model(this.asked),
        embed, clock: () => this.state.t }))
    }
    return this.spaces.get(name)
  }

  box (name, subject) {
    const key = JSON.stringify([name, subject])
    if (!this.boxes.has(key)) this.boxes.set(key, [name, new Toolbox(this.space(name), subject)])
    return this.boxes.get(key)[1]
  }

  close () {
    for (const m of this.spaces.values()) m.close()
  }
}

const noteOf = note => [note.id, note.subject, note.text, note.kind, note.key, note.importance, note.feeling,
  note.happenedAt, note.createdAt, note.recalls, note.source, note.recalledAt, note.supersededBy, note.deletedAt,
  note.gloss]

const eventOf = found => found === null ? null : [found.id, found.at, found.delta, found.emotions, found.reason,
  found.confidence, found.source, found.judge, found.value]

const recalled = found => ({ chosen: found.chosen.map(item => [item.note.id, item.why, py.repr(item.score),
  item.matched]), skipped: found.skipped.map(([item, reason]) => [item.id, reason]), tier: found.tier,
explain: found.explain() })

function snapshot (m) {
  const subjects = m.memory.subjects()
  const keys = Object.fromEntries(subjects.map(subject => [subject, [...new Set(m.store.rows('select key from ' +
    'memories where space = ? and subject = ? and key is not null', [m.space, subject]).map(row => row.key))]
    .sort(py.compare)]))
  const people = [...new Set([...subjects, ...m.episodes.subjects(), ...m.store.rows('select subject from moods ' +
    'where space = ? union select subject from relationships where space = ?', [m.space, m.space])
    .map(row => row.subject)])].sort(py.compare)
  const each = (list, fn) => Object.fromEntries(list.map(subject => [subject, fn(subject)]))
  return {
    everyone: m.everyone(), links: m.people.all(), aliases: m.aliases.all(),
    relations: m.relations.all().map(r => [r.subject, r.role, r.closeness, r.since, r.updatedAt]),
    notes: each(subjects, subject => m.memory.notes(subject).map(noteOf)),
    history: each(subjects, subject => Object.fromEntries(keys[subject].map(key => [key,
      m.memory.history(subject, key).map(item => item.id)]))),
    profiles: each(people, subject => [m.memory.profile(subject), m.memory.profileUpdatedAt(subject)]),
    recalls: each(subjects, subject => m.memory.recalls(subject, 5)),
    mood: each(people, subject => {
      const state = m.mood.state(subject)
      return [state.value, state.emotions, state.face, m.mood.describe(subject),
        m.mood.timeline(subject, 5).map(eventOf), m.mood.news(subject, { mark: false })]
    }),
    lines: each(people, subject => [m.relations.line(subject, 'Leo'), m.aliases.line(subject, 'Leo')]),
    report: m.report(),
    floor: m.meaning ? [m.meaning.floor, m.meaning.setFloor] : null,
    toml: m.config.toToml('mood.')
  }
}

/** One operation; what it gives, as JSON. */
async function call (w, kind, rest) {
  const m = () => w.space(rest[0])
  if (kind === 'clock') {
    w.state.t = rest[0]
    return null
  }
  if (kind === 'relate') {
    const found = m().relate(rest[1], rest[2], { closeness: rest[3] })
    return [found.subject, found.role, found.closeness, found.since, found.updatedAt]
  }
  if (kind === 'alias') return m().alias(rest[1], rest[2])
  if (kind === 'remember') {
    const [outcome, found] = m().memory.keep(rest[1], rest[2], camel(rest[3]))
    return [outcome, found === null ? null : noteOf(found)]
  }
  if (kind === 'forget') return m().forget(rest[1], rest[2])
  if (kind === 'purge') return m().purge(rest[1])
  if (kind === 'profile') {
    m().memory.setProfile(rest[1], rest[2])
    return null
  }
  if (kind === 'observe') {
    const [, at, subject, conversation, lines, options] = rest
    w.state.t = at
    const seen = await m().observe(subject, lines, { conversation, ...camel(options) })
    return [eventOf(seen.mood), seen.notes.map(noteOf), seen.worth, seen.error, seen.episode ? seen.episode.id : null]
  }
  if (kind === 'capture') return (await m().capture(rest[1], rest[2], camel(rest[3]))).map(noteOf)
  if (kind === 'reflect') return await m().reflect(rest[1], { userName: rest[2] })
  if (kind === 'regloss') return await m().regloss(rest[1], { everything: rest[2] })
  if (kind === 'link') return m().link(rest[1], rest[2])
  if (kind === 'unlink') return m().unlink(rest[1])
  if (kind === 'erase') return m().erase(rest[1])
  if (kind === 'wipe') return m().wipe(rest[1])
  if (kind === 'mood') return eventOf(m().mood.apply(rest[1], camel(rest[2])))
  if (kind === 'tool') {
    const box = w.box(rest[0], rest[1])
    return rest[4] ? await box.acall(rest[2], rest[3]) : box.call(rest[2], rest[3])
  }
  if (kind === 'new_turn') {
    for (const [name, box] of w.boxes.values()) if (name === rest[0]) box.newTurn()
    return null
  }
  if (kind === 'search') {
    const [, subject, query, refresh, meaning] = rest
    const found = meaning ? await m().episodes.asearch(subject, query, { refresh })
      : m().episodes.search(subject, query, { refresh })
    return found.map(item => item.id)
  }
  if (kind === 'recall') {
    const [, subject, query, options, meaning] = rest
    return recalled(meaning ? await m().arecall(subject, query, camel(options)) : m().recall(subject, query,
      camel(options)))
  }
  if (kind === 'context') {
    const [, subject, query, user, meaning] = rest
    return meaning ? await m().memory.acontext(subject, query, { userName: user })
      : m().memory.context(subject, query, { userName: user })
  }
  if (kind === 'prompt') {
    const [, subject, query, options, meaning] = rest
    return meaning ? await m().aprompt(subject, query, camel(options)) : m().prompt(subject, query, camel(options))
  }
  if (kind === 'look') {
    const [, subject, query, options, meaning] = rest
    return meaning ? await m().alook(subject, query, camel(options)) : m().look(subject, query, camel(options))
  }
  if (kind === 'prepare') return await m().episodes.prepare(rest[1])
  if (kind === 'config_set') {
    m().config.set(rest[1], rest[2])
    return null
  }
  if (kind === 'config_apply') {
    const file = w.file + '.apply.toml'
    fs.writeFileSync(file, rest[1])
    try {
      return m().config.apply(file, { origin: rest[2] })
    } catch (error) {
      if (error instanceof py.ValueError) throw new py.ValueError(error.message.replaceAll(file, 'FILE'))
      throw error
    }
  }
  if (kind === 'export_import') {
    const data = m().exportData()
    const added = w.space(rest[1]).importData(JSON.parse(JSON.stringify(data)), { config: rest[2] })
    delete data.exported_at
    return [added, data]
  }
  if (kind === 'bulk') {
    const [, subject, count, prefix] = rest
    const topics = ['my cat', 'the math exam', 'jasmine tea', 'black coffee', 'a Shanghai trip', 'the cello']
    const kinds = ['fact', 'preference', 'episode', 'plan', 'reflection']
    let kept = 0
    for (let index = 0; index < count; index++) {
      if (m().memory.keep(subject, `${prefix} ${index} ${topics[index % 6]}`, { kind: kinds[index % 5] })[0] ===
        'kept') kept++
    }
    return kept
  }
  if (kind === 'read') return snapshot(m())
  throw new py.ValueError(`no operation ${kind}`)
}

export async function run (w, ops) {
  const out = []
  for (const [kind, ...rest] of ops) {
    let found
    try {
      found = await call(w, kind, rest)
    } catch (error) {
      if (!(error instanceof py.ValueError || error instanceof TypeError)) throw error
      found = ['error', error.name, error.message]
    }
    if (kind !== 'clock') out.push([kind, clean(found)])
  }
  return out
}

/** JSON of what this port gives: a number that is not finite as text, as Python's side writes it. */
function clean (value) {
  if (typeof value === 'number' && !Number.isFinite(value)) return py.repr(value)
  if (value instanceof Map) value = Object.fromEntries(value)
  if (Array.isArray(value)) return value.map(clean)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]))
  }
  return value === undefined ? null : value
}

/** The scenario's ops (or those under `key`) on `file`: what was asked and given. */
export async function play (file, key = 'ops') {
  const given = world(), ops = given[key]
  const w = new World(file, given, { t: ops[0][1] })
  const out = await run(w, ops)
  w.close()
  return { asked: w.asked, out }
}

export const IMPORTED = 1767488400.0 // the clock an export is made and added on

/** An export of `space`, or `data` (an export) added to it, with its config. */
export function moved (file, space, data = null) {
  const w = new World(file, world(), { t: IMPORTED })
  try {
    return data === null ? w.space(space).exportData() : w.space(space).importData(data, { config: true })
  } finally {
    w.close()
  }
}

async function main ([command, file, key, data]) {
  if (command === 'write' || command === 'run') {
    console.log(JSON.stringify(await play(file, command === 'write' ? 'ops' : key)))
  } else if (command === 'export') {
    console.log(JSON.stringify(moved(file, key)))
  } else if (command === 'import') {
    console.log(JSON.stringify(moved(file, key, JSON.parse(fs.readFileSync(data, 'utf8')))))
  } else {
    console.error('node tools/world.js write|run FILE [KEY]')
    process.exitCode = 2
  }
}

const started = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
if (started) await main(process.argv.slice(2))

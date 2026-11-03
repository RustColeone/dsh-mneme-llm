// test/fixtures/scenario.json through dsh-mneme-llm: its operations into a file, then what reading the file gives, and
// every row of the file in a canonical form. tools/scenario.py does the same through Python's mneme-llm; the two must
// agree.
//
//     node tools/scenario.js write FILE        the operations into FILE (a new file)
//     node tools/scenario.js read FILE         what reading FILE gives, as JSON
//     node tools/scenario.js dump FILE         every row of FILE, as JSON
//     node tools/scenario.js more FILE         the scenario's `more`: what a host adds to a file it was given
import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'

export const SCENARIO = fileURLToPath(new URL('../test/fixtures/scenario.json', import.meta.url))

export const scenario = () => JSON.parse(fs.readFileSync(SCENARIO, 'utf8'))

export const opened = (file, given, state) => new Mneme(file, given.space, { config: given.config, embed: false,
  memoryLanguage: null, clock: () => state.t })

/** The operations, in order; what the summary writer was asked, and what each let-go came to. */
export async function apply (m, state, ops) {
  const asked = []
  for (const [kind, ...rest] of ops) {
    if (kind === 'clock') state.t = rest[0]
    else if (kind === 'relate') m.relate(rest[0], rest[1], { closeness: rest[2] })
    else if (kind === 'observe') {
      const [at, subject, conversation, lines] = rest
      state.t = at
      await m.observe(subject, lines, { conversation })
    } else if (kind === 'search') m.episodes.search(rest[0], rest[1], { refresh: rest[2] })
    else if (kind === 'let_go') {
      const [subject, user, summary] = rest
      const complete = async (system, text) => {
        asked.push([system, text])
        return summary
      }
      asked.push(await m.surface.letGo(subject, { userName: user, complete }))
    } else if (kind === 'set_first') m.surface.setFirst(...rest)
    else if (kind === 'send_first') m.surface.sendFirst(...rest)
    else if (kind === 'drop_first') m.surface.dropFirst(...rest)
    else if (kind === 'clear') m.surface.clear(...rest)
    else throw new Error(`no operation ${kind}`)
  }
  return asked
}

export function read (m, state, given) {
  const reads = given.reads
  const out = { config: { name: m.companionName, language: m.displayLanguage, zone: m.config.get('companion.zone'),
    surface: [m.surface.span, m.surface.floor, m.surface.cap, m.surface.window], said: [m.saidBudget, m.saidCut],
    roles: m.config.roles().map(role => role.key), newer: m.config.newerDefaults(), invalid: m.config.invalid },
  everyone: m.everyone(), links: m.people.all(), moments: [] }
  const ids = m.store.rows('select id from episodes order by id').map(row => row.id)
  out.shown = ids.map(id => m.episodes.shown(m.episodes.get(id)))
  out.around = ids.slice(0, 6).map(id => m.episodes.around(m.episodes.get(id).subject, id).map(episode => episode.id))
  for (const at of reads.at) {
    state.t = at
    const moment = { at, people: [], episodes: [], search: [], look: [], looked: [] }
    for (const [subject, user, here] of reads.people) {
      const view = m.surface.read(subject, { userName: user, here })
      const first = m.surface.first(subject), relation = m.relations.get(subject)
      moment.people.push({
        subject, messages: view.messages, tokens: view.tokens, keep: view.keep, top: view.top, upto: view.upto,
        slice: m.surface.slice(subject, 400), began: m.surface.began(subject),
        first: first ? [first.text, first.at, first.byCommand, first.send] : null,
        days: m.episodes.talkingDays(subject), count: m.episodes.count(subject),
        tokens_after: m.episodes.tokensAfter(subject, 0, { days: 3 }), latest: m.episodes.latest(subject),
        relation: relation ? [relation.role, relation.closeness, relation.since, relation.updatedAt] : null,
        line: m.relations.line(subject, user), weight: m.relations.weight(subject)
      })
    }
    for (const id of ids) {
      const episode = m.episodes.get(id)
      moment.episodes.push([id, episode.subject, episode.at, episode.day, episode.stability, episode.recalledAt,
        episode.recalls, episode.tokens, m.episodes.retention(episode)])
    }
    for (const [subject, query] of reads.queries) {
      moment.search.push(m.episodes.search(subject, query, { refresh: false }).map(episode => episode.id))
      moment.looked.push(m.episodes.look(subject, query, { budget: 1500 }).map(episode => episode.id))
    }
    for (const [subject, query, budget, search, own] of reads.looks) {
      moment.look.push(m.look(subject, query, { budget, search, own }))
    }
    out.moments.push(moment)
  }
  return out
}

function value (kind, item) {
  if (kind === 'real') return ['real', py.repr(item)]
  if (kind === 'integer') return ['integer', String(item)]
  if (kind === 'blob') return ['blob', Buffer.from(item).toString('hex')]
  return [kind, item]
}

/** Every row of the file, each value with its storage class, in the order the file keeps them; and its schema. */
export function dump (file) {
  const db = new DatabaseSync(file)
  const out = { schema: db.prepare('select type, name, tbl_name, sql from sqlite_master order by type, name').all()
    .map(row => [row.type, row.name, row.tbl_name, row.sql]) }
  for (const { name: table } of db.prepare("select name from sqlite_master where type = 'table' order by name").all()) {
    const columns = db.prepare(`pragma table_info(${table})`).all().map(row => row.name)
    const sql = db.prepare('select sql from sqlite_master where name = ?').get(table).sql
    const order = sql.includes('without rowid') ? columns.map((_, i) => i + 1).join(', ') : 'rowid'
    const picked = columns.map(column => `typeof("${column}"), "${column}"`).join(', ')
    const statement = db.prepare(`select ${picked} from "${table}" order by ${order}`)
    statement.setReturnArrays?.(true)
    out[table] = statement.all().map(row => {
      const values = Array.isArray(row) ? row : Object.values(row)
      const found = []
      for (let i = 0; i < values.length; i += 2) found.push(value(values[i], values[i + 1]))
      return found
    })
  }
  db.close()
  return out
}

async function main ([command, file]) {
  const given = scenario(), state = { t: 0 }
  if (command === 'write' || command === 'more') {
    const ops = command === 'write' ? given.ops : given.more
    state.t = ops[0][1]
    const m = opened(file, given, state)
    const asked = await apply(m, state, ops)
    m.close()
    console.log(JSON.stringify({ asked }))
  } else if (command === 'read') {
    const m = opened(file, given, state)
    console.log(JSON.stringify(read(m, state, given)))
    m.close()
  } else if (command === 'dump') {
    console.log(JSON.stringify(dump(file)))
  } else {
    console.error('node tools/scenario.js write|read|dump|more FILE')
    process.exitCode = 2
  }
}

const run = process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])
if (run) await main(process.argv.slice(2))

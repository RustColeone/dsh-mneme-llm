// Memories about people: written as short notes, recalled by evidence, rendered with human dates. A port of
// mneme_llm/memory.py.
//
// A note is one sentence about a subject ("Has a cat named 年糕"). Kinds say how it ages:
//
//     fact, preference    lasting; never fade ("lives in Shanghai", "hates coriander")
//     episode, plan       fade with a half-life (30 days by default) unless recalled again
//     reflection          the companion's own impression; fades like an episode
//
// A `key` ("user.city", "cat.name": what the note is about, never its value) makes a newer note replace the older
// one, and the old version stays in the history. Recall scores each note by evidence (query terms it shares, weighted
// by how rare they are among this person's notes, plus, with `arecall`, how close it is in meaning) times freshness,
// importance and feeling, then fills a small budget; every recall can explain what was chosen and what was skipped
// and why. Notes are rendered as data, never as instructions (see `context`).
import * as dates from './dates.js'
import { Speaks, Words, say } from './i18n.js'
import { Found } from './meaning/index.js'
import { drop } from './meaning/vectors.js'
import { Resolves } from './people.js'
import * as py from './python.js'
import { dumps } from './store.js'
import * as texts from './text.js'

export const KINDS = ['fact', 'preference', 'episode', 'plan', 'reflection']
export const LASTING = new Set(['fact', 'preference'])
export const MAX_KEY = 48
export const MAX_TEXT = 500
export const MAX_PROFILE = 1200
export const PINNED = 5 // importance at which a note is always in context
export const SEMANTIC_WEIGHT = 4.0 // a close match in meaning counts about as much as one rare shared word
export const CANDIDATES = 1000 // notes scored in full per recall: those with the most evidence (the rest could not win)
export const KEY_RULE = "a key names what the note is about, like 'user.city' or 'cat.name' (no spaces, at most 4 " +
  'parts and 48 characters); the value goes in the text'
const now = () => Date.now() / 1000

const keyPart = part => part !== '' && [...part].every(character => character === '_' ||
  'LN'.includes(py.category(character)[0]) || (character >= '㐀' && character <= '鿿'))

/** Python's KEY pattern: one to four parts of word characters, joined by dots. */
const isKey = key => {
  const parts = key.split('.')
  return parts.length <= 4 && parts.every(keyPart)
}

/** A key as it is stored: stripped and lowercase (null for no key). */
export const normalKey = key => typeof key === 'string' ? py.strip(key).toLowerCase() || null : null

/** A note's fields held to the rules of writing: one clean line of text, a known kind, a key that names a topic,
 * importance 1-5, feeling -1..1, a time in seconds. Strict (a host's or a model's call): a wrong value throws
 * ValueError or TypeError. Lenient (an import, the note writer's items): a wrong value is dropped or replaced by the
 * default, and null comes back only when there is no text to keep. */
export function noteFields (text, { kind = null, key = null, importance = 2, feeling = 0.0, happenedAt = null,
  gloss = null, strict = true } = {}) {
  const wrong = (error, fallback) => {
    if (strict) throw error
    return fallback
  }
  if (typeof text !== 'string') {
    return wrong(new TypeError(`a memory's text must be a string, not ${py.typeName(text)}`), null)
  }
  text = texts.clip(text, MAX_TEXT)
  if (texts.blank(text)) return wrong(new py.ValueError('a memory needs some text'), null)
  if (kind !== null && !KINDS.includes(kind)) {
    kind = wrong(new py.ValueError(`kind must be one of ${KINDS.join(', ')}`), null)
  }
  if (key !== null && typeof key !== 'string') key = wrong(new py.ValueError("a key is text, like 'user.city'"), null)
  key = normalKey(key)
  if (key !== null && (py.len(key) > MAX_KEY || !isKey(key))) key = wrong(new py.ValueError(KEY_RULE), null)
  if (gloss !== null && typeof gloss !== 'string') gloss = wrong(new py.ValueError('a gloss is text'), null)
  gloss = gloss ? texts.clip(gloss, MAX_TEXT) || null : null
  try {
    importance = Math.max(1, Math.min(5, py.int(importance)))
  } catch (error) {
    if (error instanceof py.OverflowError) importance = importance > 0 ? 5 : 1 // (an infinity)
    else importance = wrong(new py.ValueError('importance is a whole number from 1 to 5'), 2)
  }
  try {
    feeling = py.float(feeling)
  } catch {
    feeling = wrong(new py.ValueError('feeling is a number from -1 to 1'), 0.0)
  }
  feeling = Number.isFinite(feeling) ? Math.max(-1.0, Math.min(1.0, feeling)) : 0.0
  if (happenedAt !== null && dates.seconds(happenedAt) === null) {
    happenedAt = wrong(new py.ValueError('happened_at is a time in seconds, between 1970 and the year 3000'), null)
  }
  return { text, kind, key, importance, feeling, happened_at: happenedAt === null ? null : py.float(happenedAt),
    gloss }
}

export class Note {
  constructor ({ id, subject, text, kind, key = null, importance, feeling, happenedAt, createdAt, recalls = 0,
    source = null, recalledAt = null, supersededBy = null, deletedAt = null, gloss = null }) {
    Object.assign(this, { id, subject, text, kind, key, importance, feeling, happenedAt, createdAt, recalls, source,
      recalledAt, supersededBy, deletedAt, gloss })
    Object.freeze(this)
  }

  static of (row) {
    return new Note({ id: row.id, subject: row.subject, text: row.text, kind: row.kind, key: row.key,
      importance: row.importance, feeling: row.feeling, happenedAt: row.happened_at, createdAt: row.created_at,
      recalls: row.recalls, source: row.source, recalledAt: row.recalled_at, supersededBy: row.superseded_by,
      deletedAt: row.deleted_at, gloss: row.gloss })
  }

  /** The same note with other fields (Python's dataclasses.replace). */
  with (fields) {
    return new Note({ ...this, ...fields })
  }
}

/** A note a recall chose: `why` is "pinned", "matched: 考试, 复习", "similar 0.62", "important" or "recent". */
export class Recalled {
  constructor (note, score, why, matched = []) {
    Object.assign(this, { note, score, why, matched })
    Object.freeze(this)
  }
}

/** What a recall chose, and the closest misses with why (`skipped`: [note, reason] pairs); `tier` is the meaning
 * tier that helped ("embeddings", "unify"), "" for words alone. */
export class Recall {
  constructor (query, chosen, skipped = [], tier = '') {
    Object.assign(this, { query, chosen, skipped, tier })
    Object.freeze(this)
  }

  explain () {
    const lines = [`recall for ${py.reprString(this.query)}` + (this.tier ? ` (meaning: ${this.tier})` : '') + ':']
    for (const item of this.chosen) {
      const score = py.fixed(item.score, 2)
      lines.push(`  + #${item.note.id} ${item.why} (score ${score}): ${texts.clip(item.note.text, 70)}`)
    }
    for (const [note, reason] of this.skipped) lines.push(`  - #${note.id} ${reason}: ${texts.clip(note.text, 70)}`)
    return lines.join('\n')
  }
}

/** Every live note of the file in the term index again: the terms of its text, its key's parts and its gloss. */
export function reindexNotes (store) {
  store.execute('delete from note_terms')
  indexNotes(store, store.rows('select * from memories where deleted_at is null and superseded_by is null')
    .map(Note.of))
}

/** These notes in the term index, by their search terms (text, key parts and gloss), in place of what it had of them;
 * under the note's subject as it is now (a link may have moved it since it was read). */
function indexNotes (store, notes) {
  store.transaction(() => {
    for (const note of notes) {
      store.execute('delete from note_terms where memory_id = ?', [note.id])
      for (const term of texts.terms([note.text, (note.key || '').replaceAll('.', ' '), note.gloss || ''].join(' '))) {
        store.execute('insert or ignore into note_terms (space, subject, term, memory_id) select space, subject, ?, ' +
          'id from memories where id = ?', [term, note.id])
      }
    }
  })
}

const LIVE = 'space = ? and subject = ? and deleted_at is null and superseded_by is null'

/** The notes of one space. Every method takes the subject the note is about (or, with `people`, any subject the person
 * goes by). */
export class Memory extends Speaks(Resolves) {
  constructor (store, space, { halfLifeDays = 30.0, dailyQuota = 8, maxNotes = 50000, semanticWindow = 5000,
    zone = null, displayLanguage = 'en', meaning = null, people = null, clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.people = people
    this.halfLifeDays = halfLifeDays
    this.dailyQuota = dailyQuota
    this.maxNotes = maxNotes
    this.semanticWindow = semanticWindow // the most notes meaning is searched among (words reach them all)
    this.words = Words.of(displayLanguage)
    this.zone = zone
    this.meaning = meaning
    this.clock = clock
    store.index('note_terms', () => reindexNotes(store))
  }

  // ---- writing ---------------------------------------------------------------------------------------------------
  /** Keep a note; returns it (or the existing note it repeats), or null when an automatic note is over quota.
   * `source: 'auto'` marks notes a model chose to keep without being asked; at most `dailyQuota` of those per subject
   * per talking day are kept unless they are important (4+). Anything else always lands. */
  remember (subject, text, options = {}) {
    return this.keep(subject, text, options)[1]
  }

  /** `remember`, also saying what happened: "kept", "replaced" (a key's older note), "known" (the same text was
   * already there) or "over quota". `gloss` is the note in the unifying language, if known. `kind` is "episode" when
   * not given (and a note taking over a key keeps its own). */
  keep (subject, text, { kind = null, key = null, importance = 2, feeling = 0.0, happenedAt = null, source = null,
    gloss = null } = {}) {
    texts.required(subject, 'subject')
    const fields = noteFields(text, { kind, key, importance, feeling, happenedAt, gloss })
    const at = this.clock()
    let outcome, id
    this.writing(subject, subject => {
      let same = this._sameText(subject, fields.text)
      if (fields.key !== null) {
        // Under a key, only a note with that key or with none is the same note (a keyless one may take the key
        // over); a note under another key is a different fact that happens to read the same.
        same = same.filter(note => note.key === null || note.key === fields.key)
      }
      if (same.length) {
        ;[outcome, id] = this._merge(subject, same.find(note => note.key === fields.key) ?? same[0], fields)
        return
      }
      if (source === 'auto' && fields.importance < 4 && this._autoToday(subject, at) >= this.dailyQuota) {
        outcome = 'over quota'
        return
      }
      id = this._insert(subject, { ...fields, kind: fields.kind || 'episode',
        happened_at: fields.happened_at === null ? at : fields.happened_at, created_at: at, source })
      const replaced = fields.key !== null ? this._supersede(subject, fields.key, id) : 0
      this._index([this.get(id)]) // indexed as it is written, so recall never has a backlog
      this._prune(subject, at, id)
      outcome = replaced ? 'replaced' : 'kept'
    })
    return [outcome, id === undefined ? null : this.get(id)]
  }

  /** The same words are already kept: the note keeps the higher importance and gains a gloss; under a key it did not
   * have, it takes the key, the kind it is now given (and its day and feeling, when given), and replaces the key's
   * older value. */
  _merge (subject, note, fields) {
    this.store.execute('update memories set importance = max(importance, ?), gloss = coalesce(gloss, ?) where id = ?',
      [fields.importance, fields.gloss, note.id])
    if (fields.key === null || note.key === fields.key) {
      if (fields.gloss && !note.gloss) this._index([this.get(note.id)]) // new words to find it by
      return ['known', note.id]
    }
    this.store.execute('update memories set key = ?, kind = ?, happened_at = ?, feeling = ? where id = ?',
      [fields.key, fields.kind || note.kind, fields.happened_at === null ? note.happenedAt : fields.happened_at,
        fields.feeling || note.feeling, note.id])
    const replaced = this._supersede(subject, fields.key, note.id)
    this._index([this.get(note.id)]) // its key's parts are search terms too
    return [replaced ? 'replaced' : 'kept', note.id]
  }

  /** A new note's row, with its case-folded text; vectors left under a reused id are dropped first. */
  _insert (subject, row) {
    row = { ...row, space: this.space, subject, folded: texts.fold(row.text) }
    const columns = Object.keys(row)
    const id = this.store.execute(`insert into memories (${columns.join(', ')}) values (${columns.map(() => '?')
      .join(', ')})`, Object.values(row)).lastrowid
    drop(this.store, [id]) // SQLite reuses the id of a deleted note; nothing of it may stay
    this.store.execute('delete from note_terms where memory_id = ?', [id])
    return id
  }

  /** Point the key's other live notes to `by`, its value now; returns how many it replaced. */
  _supersede (subject, key, by) {
    return this.store.execute('update memories set superseded_by = ? where space = ? and subject = ? and key = ? and ' +
      'id != ? and superseded_by is null and deleted_at is null', [by, this.space, subject, key, by]).rowcount
  }

  /** Remove a note (by `id`) or the live note of a `key`; returns how many were removed. History stays on disk (soft
   * delete) until `purge`. */
  forget (subject, { id = null, key = null } = {}) {
    if ((id === null) === (key === null)) throw new py.ValueError('forget takes exactly one of id or key')
    const [where, value] = id !== null ? ['id = ?', id] : ['key = ?', normalKey(key)]
    return this.writing(subject, subject => this.store.execute(`update memories set deleted_at = ? where space = ? ` +
      `and subject = ? and ${where} and deleted_at is null and superseded_by is null`,
    [this.clock(), this.space, subject, value]).rowcount)
  }

  /** Erase removed and replaced notes for good (all subjects when none is given). */
  purge (subject = null) {
    let sql = 'delete from memories where space = ? and (deleted_at is not null or superseded_by is not null)'
    let parameters = [this.space]
    return this.store.transaction(() => {
      if (subject !== null) {
        sql += ' and subject = ?'
        parameters = [this.space, this.who(subject)]
      }
      const ids = this.store.rows(sql.replace('delete from', 'select id from'), parameters).map(row => row.id)
      drop(this.store, ids)
      this.store.rowsIn('delete from note_terms where memory_id in ({})', ids)
      return this.store.execute(sql, parameters).rowcount
    })
  }

  /** Every note about a subject gone for good, with their history, vectors, profile card and recall log. */
  erase (subject) {
    return this.writing(subject, subject => {
      drop(this.store, this.store.rows('select id from memories where space = ? and subject = ?', [this.space,
        subject]).map(row => row.id))
      const count = this.store.execute('delete from memories where space = ? and subject = ?', [this.space, subject])
        .rowcount
      for (const table of ['recalls', 'profiles', 'note_terms']) {
        this.store.execute(`delete from ${table} where space = ? and subject = ?`, [this.space, subject])
      }
      return count
    })
  }

  /** `old` is the person `fresh` now (`People.link`): its notes, their index and its recall log become the person's,
   * held to the rules writing keeps (one live note per key, the newest; no text twice); of two profile cards the
   * newer is kept. */
  join (old, fresh) {
    this.store.transaction(() => {
      for (const table of ['memories', 'note_terms', 'recalls']) {
        this.store.execute(`update ${table} set subject = ? where space = ? and subject = ?`, [fresh, this.space, old])
      }
      const cards = new Map(this.store.rows('select * from profiles where space = ? and subject in (?, ?)',
        [this.space, old, fresh]).map(row => [row.subject, row]))
      if (cards.has(old) && (!cards.has(fresh) || cards.get(old).updated_at > cards.get(fresh).updated_at)) {
        this._putProfile(fresh, cards.get(old).text, cards.get(old).updated_at)
      }
      this.store.execute('delete from profiles where space = ? and subject = ?', [this.space, old])
      this._settle(fresh, this.clock())
    })
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  get (id) {
    const row = this.store.row('select * from memories where id = ? and space = ?', [id, this.space])
    return row ? Note.of(row) : null
  }

  /** The live notes of a subject, newest first. */
  notes (subject, { kinds = null } = {}) {
    const found = this._liveWhere(this.who(subject))
    if (kinds === null) return found
    const wanted = new Set(kinds)
    return found.filter(note => wanted.has(note.kind))
  }

  /** The most important live notes of a subject, the newest first among equals (for the profile card). */
  leading (subject, limit) {
    return this.store.rows(`select * from memories where ${LIVE} order by importance desc, id desc limit ?`,
      [this.space, this.who(subject), limit]).map(Note.of)
  }

  /** Every version a key has had, oldest first (the last is live unless it was forgotten; an older note that took the
   * key over comes after the ones it replaced). */
  history (subject, key) {
    const notes = this.store.rows('select * from memories where space = ? and subject = ? and key = ? order by id',
      [this.space, this.who(subject), normalKey(key)]).map(Note.of)
    const successor = new Map(notes.map(note => [note.id, note.supersededBy]))
    const ahead = note => { // how many replacements came after it
      let steps = 0, at = note.id
      const seen = new Set()
      while (successor.has(successor.get(at)) && !seen.has(at)) {
        seen.add(at)
        at = successor.get(at)
        steps++
      }
      return steps
    }
    const steps = new Map(notes.map(note => [note.id, ahead(note)]))
    return notes.sort((one, other) => steps.get(other.id) - steps.get(one.id) || one.id - other.id)
  }

  /** Everyone a note is kept of, hidden ones too: they stay until `purge`. */
  subjects () {
    return this.store.rows('select distinct subject from memories where space = ? order by subject', [this.space])
      .map(row => row.subject)
  }

  /** 1.0 for lasting kinds; otherwise halves every `halfLifeDays` since it happened or was last recalled. */
  freshness (note, at = null) {
    if (LASTING.has(note.kind)) return 1.0
    at = at === null ? this.clock() : at
    const touched = Math.max(note.happenedAt, note.recalledAt || 0.0)
    return Math.pow(0.5, Math.max(0.0, at - touched) / 86400 / this.halfLifeDays)
  }

  /** The notes worth bringing up for `query`: pinned ones, then the best evidence, then fillers. Word matching only,
   * with no network (glosses the unify tier wrote earlier count as words); `arecall` adds the meaning tiers. `budget`
   * caps the characters of note text chosen. When there is room left, `important` adds that many lasting notes of
   * importance 4+ that did not match, and `recent` that many of the newest episodes. */
  recall (subject, query, { limit = 6, budget = 800, important = 2, recent = 1, log = true } = {}) {
    return this._rank(this.who(subject), texts.query(query), new Found(), limit, budget, important, recent, log)
  }

  /** `recall` with the meaning tiers: notes close in meaning count as evidence too, in any language. `complete` gives
   * the unify tier a chat model for this call. */
  async arecall (subject, query, { limit = 6, budget = 800, important = 2, recent = 1, log = true,
    complete = null } = {}) {
    subject = this.who(subject)
    query = texts.query(query)
    const window = this.meaning !== null && py.strip(query) ? this._window(subject) : []
    if (!window.length) return this._rank(subject, query, new Found(), limit, budget, important, recent, log)
    const found = await this.meaning.find(window, query, { complete })
    if (found.glosses.size) this.writeGlosses(found.glosses)
    return this._rank(subject, query, found, limit, budget, important, recent, log)
  }

  /** A block ready for a system prompt: a header saying these are data and not instructions, the profile card, then
   * the recalled notes with human dates. `userName` is how the header names the person (their id otherwise). "" when
   * there is nothing to say. */
  context (subject, query = '', { userName = null, limit = 6, budget = 800, important = 2, recent = 1,
    header = null } = {}) {
    subject = this.who(subject)
    const found = this.recall(subject, query, { limit, budget, important, recent })
    return this._render(subject, found, userName, header)
  }

  /** `context` with the meaning tiers (see `arecall`). */
  async acontext (subject, query = '', { userName = null, limit = 6, budget = 800, important = 2, recent = 1,
    header = null, complete = null } = {}) {
    subject = this.who(subject)
    const found = await this.arecall(subject, query, { limit, budget, important, recent, complete })
    return this._render(subject, found, userName, header)
  }

  _render (subject, found, userName, header) {
    const card = this.profile(subject)
    if (!found.chosen.length && !card) return ''
    const at = this.clock()
    const lines = [header || say(this.words, 'notes.header', { who: userName || subject })]
    if (card) lines.push(say(this.words, 'notes.impression') + texts.clip(card, MAX_PROFILE))
    for (const { note } of found.chosen) {
      lines.push(LASTING.has(note.kind) ? `- ${note.text}`
        : `- [${dates.when(note.happenedAt, at, this.zone, this.words)}] ${note.text}`)
    }
    return lines.join('\n')
  }

  /** One recall: evidence from the term index (never a scan of every note), closeness from the meaning tier, then the
   * budget. */
  _rank (subject, query, found, limit, budget, important, recent, log) {
    const at = this.clock()
    this.store.reindex()
    const count = this.store.row(`select count(*) as n from memories where ${LIVE}`, [this.space, subject]).n
    const queryTerms = texts.terms(query + (found.words ? ' ' + found.words : ''))
    const [weights, matches] = this._evidence(subject, queryTerms, count)
    const similar = new Map([...found.similarities].filter(([, value]) => value > found.floor))
    // Only the notes with the most evidence are read and scored in full: freshness, importance and feeling weigh a
    // note by a factor of at most about 10, which decides among them, not against all of them.
    const relevance = new Map([...matches].map(([id, terms]) => [id, py.sum(terms.map(term => weights.get(term)))]))
    const span = Math.max(1e-6, 1 - found.floor) // (a host's own floor of 1 divides by nothing)
    for (const [id, value] of similar) {
      relevance.set(id, (relevance.get(id) ?? 0.0) + SEMANTIC_WEIGHT * (value - found.floor) / span)
    }
    const best = [...relevance.keys()].sort((one, other) => relevance.get(other) - relevance.get(one))
      .slice(0, CANDIDATES)
    const scored = this._score(this._getMany(best), weights, matches, similar, found.floor, at)
    const pick = (extra, order, size) => this.store.rows(`select * from memories where ${LIVE} and ${extra} order by ` +
      `${order} limit ?`, [this.space, subject, size]).map(Note.of)
    const lasting = "kind in ('fact', 'preference')"
    const [chosen, skipped] = this._choose(scored, limit, budget, important, recent, {
      pinned: pick(`importance >= ${PINNED}`, 'id desc', limit * 4),
      importantOnes: pick(`${lasting} and importance >= 4`, 'importance desc, id desc', important + limit * 4),
      recentOnes: pick(`not (${lasting})`, 'id desc', recent + limit * 4),
      newest: pick('1', 'id desc', limit * 4 + 10) })
    const result = new Recall(query, chosen, skipped.slice(0, 10), found.tier)
    if (log && chosen.length) this._log(subject, result, at)
    return result
  }

  /** How much each query term says (rarer among this person's notes says more; one in more than half of them says
   * nothing) and which notes have it, from the term index. */
  _evidence (subject, queryTerms, count) {
    const live = 'm.deleted_at is null and m.superseded_by is null'
    const df = new Map(this.store.rowsIn('select t.term, count(*) as n from note_terms t join memories m on m.id = ' +
      't.memory_id where t.space = ? and t.subject = ? and t.term in ({}) and ' + live + ' group by t.term',
    queryTerms, [this.space, subject]).map(row => [row.term, row.n]))
    const weights = new Map()
    for (const term of queryTerms) {
      if (df.get(term) && (count < 8 || df.get(term) <= count / 2)) {
        weights.set(term, py.log((count + 1) / (df.get(term) + 0.5)))
      }
    }
    const matches = new Map()
    for (const row of this.store.rowsIn('select t.term, t.memory_id from note_terms t join memories m on m.id = ' +
      't.memory_id where t.space = ? and t.subject = ? and t.term in ({}) and ' + live, [...weights.keys()],
    [this.space, subject])) {
      if (!matches.has(row.memory_id)) matches.set(row.memory_id, [])
      matches.get(row.memory_id).push(row.term)
    }
    return [weights, matches]
  }

  /** The notes with any evidence for the query, best first: rare shared terms (and closeness in meaning, above the
   * tier's floor), times freshness, importance and feeling. */
  _score (notes, weights, matches, similar, floor, at) {
    const scored = []
    for (const note of notes) {
      const terms = matches.get(note.id) ?? []
      const matched = [...weights.keys()].filter(term => terms.includes(term))
      const evidence = py.sum(matched.map(term => weights.get(term)))
      const similarity = similar.get(note.id)
      const closeness = similarity !== undefined ? Math.max(0.0, (similarity - floor) / Math.max(1e-6, 1 - floor))
        : 0.0
      const relevance = evidence + SEMANTIC_WEIGHT * closeness
      if (relevance <= 0) continue
      const fresh = this.freshness(note, at)
      const score = relevance * (0.25 + 0.75 * fresh) * (0.4 + 0.15 * note.importance) * (1 + 0.3 *
        Math.abs(note.feeling))
      const why = [matched.length ? 'matched: ' + matched.slice(0, 4).join(', ') : '',
        closeness > 0 ? `similar ${py.fixed(similarity, 2)}` : ''].filter(Boolean).join(', ')
      scored.push([score, note, matched, why])
    }
    return scored.sort((one, other) => other[0] - one[0] || other[1].id - one[1].id)
  }

  /** Within `limit` notes and `budget` characters: pinned notes, then the best evidence, then fillers (the important
   * lasting notes and the newest episodes); and why the closest others were left out. */
  _choose (scored, limit, budget, important, recent, { pinned, importantOnes, recentOnes, newest }) {
    const chosen = [], skipped = []
    let used = 0
    const take = item => {
      if (chosen.length >= limit) {
        skipped.push([item.note, `over the limit of ${limit} notes`])
        return
      }
      if (used + py.len(item.note.text) > budget && chosen.length) {
        skipped.push([item.note, `over the ${budget}-character budget`])
        return
      }
      chosen.push(item)
      used += py.len(item.note.text)
    }
    for (const note of pinned) take(new Recalled(note, 0.0, 'pinned')) // newest first
    let taken = new Set(chosen.map(item => item.note.id))
    for (const [score, note, matched, why] of scored) {
      if (!taken.has(note.id)) take(new Recalled(note, score, why, matched))
    }
    const fill = (candidates, count, why) => {
      for (const note of candidates) {
        if (count <= 0 || chosen.length >= limit) return
        if (chosen.some(item => item.note.id === note.id) || used + py.len(note.text) > budget) continue
        chosen.push(new Recalled(note, 0.0, why))
        used += py.len(note.text)
        count--
      }
    }
    fill(importantOnes, important, 'important')
    fill(recentOnes, recent, 'recent')
    taken = new Set(chosen.map(item => item.note.id))
    const passed = new Set(skipped.map(([note]) => note.id))
    const missed = newest.filter(note => !taken.has(note.id) && !passed.has(note.id))
    skipped.push(...missed.slice(0, 5).map(note => [note, 'nothing in common with the query']))
    return [chosen, skipped]
  }

  /** The notes meaning is looked for among: all of them up to `semanticWindow`; beyond that the lasting ones (most
   * important first) and then the freshest of the rest, so the cost of meaning stays bounded. */
  _window (subject) {
    const count = this.store.row(`select count(*) as n from memories where ${LIVE}`, [this.space, subject]).n
    if (count <= this.semanticWindow) return this._liveWhere(subject)
    const rows = this.store.rows(`select * from memories where ${LIVE} and kind in ('fact', 'preference') order by ` +
      'importance desc, id desc limit ?', [this.space, subject, Math.floor(this.semanticWindow / 2)])
    rows.push(...this.store.rows(`select * from memories where ${LIVE} and kind not in ('fact', 'preference') order ` +
      'by max(happened_at, coalesce(recalled_at, 0)) desc limit ?', [this.space, subject,
      this.semanticWindow - rows.length]))
    return rows.map(Note.of)
  }

  _getMany (ids) {
    return this.store.rowsIn('select * from memories where id in ({})', ids).map(Note.of)
  }

  // ---- profile card ----------------------------------------------------------------------------------------------
  profile (subject) {
    return this.store.row('select text from profiles where space = ? and subject = ?', [this.space,
      this.who(subject)])?.text ?? null
  }

  /** When the profile card was last written (null if there is none), so hosts can refresh it daily. */
  profileUpdatedAt (subject) {
    return this.store.row('select updated_at from profiles where space = ? and subject = ?', [this.space,
      this.who(subject)])?.updated_at ?? null
  }

  /** A short standing impression of the subject (a few sentences), shown above the notes. */
  setProfile (subject, text) {
    texts.required(subject, 'subject')
    if (text !== null && typeof text !== 'string') {
      throw new TypeError(`a profile must be a string, not ${py.typeName(text)}`)
    }
    this.writing(subject, subject => this._putProfile(subject, text, this.clock()))
  }

  _putProfile (subject, text, at) {
    if (!text || texts.blank(texts.clip(text, MAX_PROFILE))) {
      this.store.execute('delete from profiles where space = ? and subject = ?', [this.space, subject])
      return
    }
    this.store.execute('insert into profiles (space, subject, text, updated_at) values (?, ?, ?, ?) on conflict' +
      '(space, subject) do update set text = excluded.text, updated_at = excluded.updated_at',
    [this.space, subject, texts.clip(text, MAX_PROFILE), at])
  }

  /** The most recent recalls of a subject, newest first: what was asked, chosen and skipped. */
  recalls (subject, limit = 20) {
    return this.store.rows('select * from recalls where space = ? and subject = ? order by id desc limit ?',
      [this.space, this.who(subject), limit]).map(row => ({ at: row.at, query: row.query,
      chosen: JSON.parse(row.chosen), skipped: JSON.parse(row.skipped) }))
  }

  // ---- inside ----------------------------------------------------------------------------------------------------
  _index (notes) {
    indexNotes(this.store, notes)
  }

  // ---- moving between files --------------------------------------------------------------------------------------
  /** This space's notes and profile cards as plain rows (without the case-folded text, made again on import). */
  exportRows () {
    const memories = this.store.rows('select * from memories where space = ? order by id', [this.space])
      .map(({ folded, ...row }) => row)
    const profiles = this.store.rows('select * from profiles where space = ? order by rowid', [this.space])
      .map(row => ({ ...row }))
    return { memories, profiles }
  }

  /** Add exported notes and profile cards to this space, held to the rules of writing (`clean`): ids are renumbered
   * and links between notes follow; then each subject keeps one live note per key (the newest) and no live text
   * twice. Returns how many notes were added. */
  importRows (memories, profiles = []) {
    const renumbered = new Map(), links = [], subjects = new Set(), added = [], at = this.clock()
    this.store.transaction(() => {
      for (const original of memories) {
        const row = isTable(original) ? Memory.clean(original) : null
        if (row === null) continue
        const { subject, ...rest } = row
        const fresh = this._insert(subject, rest)
        subjects.add(original.subject)
        added.push(fresh)
        if (typeof original.id === 'number' || typeof original.id === 'string') renumbered.set(original.id, fresh)
        if (original.superseded_by !== null && original.superseded_by !== undefined) { // one that is no id points
          const successor = original.superseded_by // nowhere
          links.push([fresh, typeof successor === 'number' || typeof successor === 'string' ? successor : null])
        }
      }
      for (const [fresh, successor] of links) { // a link to a note that did not come along becomes "replaced" (-1)
        this.store.execute('update memories set superseded_by = ? where id = ?', [renumbered.get(successor) ?? -1,
          fresh])
      }
      for (const subject of subjects) this._settle(subject, at)
      this._index(this._getMany(added))
      for (const row of profiles) {
        if (isTable(row) && typeof row.subject === 'string' && py.strip(row.subject) && typeof row.text === 'string') {
          const updated = dates.seconds(row.updated_at)
          this._putProfile(row.subject, row.text, updated === null ? at : updated)
        }
      }
    })
    return added.length
  }

  /** An exported note held to the rules of writing (`noteFields`, lenient), with its subject and the columns an export
   * carries (times in seconds, counts, source); null when there is no text or subject. */
  static clean (row) {
    const get = (name, fallback = null) => Object.hasOwn(row, name) ? row[name] : fallback
    const subject = get('subject')
    const fields = noteFields(get('text'), { kind: get('kind'), key: get('key'), importance: get('importance', 2),
      feeling: get('feeling', 0.0), happenedAt: get('happened_at'), gloss: get('gloss'), strict: false })
    if (fields === null || typeof subject !== 'string' || !py.strip(subject)) return null
    let created = dates.seconds(get('created_at'))
    created = created === null ? Date.now() / 1000 : created
    let recalls
    try {
      recalls = Math.max(0, Math.min(2 ** 31, py.int(py.truthy(get('recalls')) ? get('recalls') : 0)))
    } catch {
      recalls = 0
    }
    const moment = name => { // an optional time: kept when it is one, the note's own when not, absent when absent
      const found = dates.seconds(get(name))
      return get(name) === null ? null : found === null ? created : found
    }
    return { ...fields, subject, kind: fields.kind || 'episode',
      happened_at: fields.happened_at === null ? created : fields.happened_at, created_at: created, recalls,
      recalled_at: moment('recalled_at'), deleted_at: moment('deleted_at'),
      source: typeof get('source') === 'string' ? get('source') : null }
  }

  /** After an import or a link, the rules writing keeps: one live note per key (the newest wins, the others become its
   * history) and no live text twice (a copy with a key is kept over one without, then the oldest). */
  _settle (subject, at) {
    const rows = this.store.rows(`select id, key, folded from memories where ${LIVE} order by created_at, id`,
      [this.space, subject])
    const newest = new Map()
    for (const row of rows) if (row.key !== null) newest.set(row.key, row.id)
    for (const [key, by] of newest) this._supersede(subject, key, by)
    const groups = new Map()
    for (const row of rows) {
      if (row.key === null || newest.get(row.key) === row.id) {
        if (!groups.has(row.folded)) groups.set(row.folded, [])
        groups.get(row.folded).push(row)
      }
    }
    for (const group of groups.values()) {
      let keep = new Set(group.filter(row => row.key !== null).map(row => row.id))
      if (!keep.size) keep = new Set([group[0].id])
      for (const row of group) {
        if (!keep.has(row.id)) {
          this.store.execute("update memories set deleted_at = ?, source = coalesce(source, '') || ' duplicate' " +
            'where id = ?', [at, row.id])
        }
      }
    }
  }

  /** Glosses the unify tier wrote, by note id (a Map): kept unless the note got one meanwhile (or, with `replace`,
   * over the one it has); its search terms then change. */
  writeGlosses (glosses, { replace = false } = {}) {
    const onlyNew = replace ? '' : ' and gloss is null'
    this.store.transaction(() => {
      for (const [id, gloss] of glosses) {
        if (this.store.execute(`update memories set gloss = ? where id = ? and space = ?${onlyNew}`,
          [texts.clip(gloss, MAX_TEXT) || null, id, this.space]).rowcount) this._index([this.get(id)])
      }
    })
  }

  /** Live notes with the same words, whatever the letters' case in any alphabet: by the case-folded text kept beside
   * each note. */
  _sameText (subject, text) {
    return this._liveWhere(subject, 'folded = ?', [texts.fold(text)])
  }

  _liveWhere (subject, extra = '', parameters = []) {
    return this.store.rows(`select * from memories where ${LIVE}` + (extra ? ` and ${extra}` : '') +
      ' order by id desc', [this.space, subject, ...parameters]).map(Note.of)
  }

  _autoToday (subject, at) {
    return this.store.row("select count(*) as n from memories where space = ? and subject = ? and source = 'auto' " +
      'and created_at >= ?', [this.space, subject, dates.dayBegan(at, this.zone)]).n
  }

  /** Over `maxNotes`, the least valuable fading notes are forgotten, down to a twentieth below it. */
  _prune (subject, at, keep = null) {
    const count = this.store.row(`select count(*) as n from memories where ${LIVE}`, [this.space, subject]).n
    if (count <= this.maxNotes) return
    const live = this._liveWhere(subject)
    const value = note => note.importance * (0.25 + 0.75 * this.freshness(note, at))
    const fading = live.filter(note => !LASTING.has(note.kind) && note.importance < PINNED && note.id !== keep)
      .map(note => [value(note), note]).sort((one, other) => one[0] - other[0]).map(([, note]) => note)
    for (const note of fading.slice(0, Math.max(0, live.length - (this.maxNotes - Math.floor(this.maxNotes / 20))))) {
      this.store.execute("update memories set deleted_at = ?, source = coalesce(source, '') || ' pruned' where id = ?",
        [at, note.id])
    }
  }

  _log (subject, result, at) {
    const ids = result.chosen.filter(item => item.why.startsWith('matched') || item.why.startsWith('similar'))
      .map(item => item.note.id)
    this.writing(subject, subject => { // (a recall takes a while: the person may have been linked since)
      this.store.execute('insert into recalls (space, subject, at, query, chosen, skipped) values (?, ?, ?, ?, ?, ?)',
        [this.space, subject, at, texts.clip(result.query, 300), dumps(result.chosen.map(item => [item.note.id,
          item.why])), dumps(result.skipped.map(([note, reason]) => [note.id, reason]))])
      if (ids.length) {
        this.store.execute(`update memories set recalled_at = ?, recalls = recalls + 1 where id in (${ids.map(() => '?')
          .join(', ')})`, [at, ...ids])
      }
      this.store.execute('delete from recalls where space = ? and subject = ? and id not in (select id from recalls ' +
        'where space = ? and subject = ? order by id desc limit 200)', [this.space, subject, this.space, subject])
    })
  }
}

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Everyone a note is kept of, hidden ones too: they stay until a purge. */
export const noteSubjects = (store, space) => store.rows(
  'select distinct subject from memories where space = ? order by subject', [space]).map(row => row.subject)

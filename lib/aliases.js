// What each person calls the companion: a name of their own for it, beside the name it has for everyone. A port of
// mneme_llm/aliases.py.
//
//     alias       one per person ("鲸酱" for Leo, while the companion's own name stays 大肥鱼 for everyone else), at
//                 most 40 characters on one line. Set by the host, never by a model
//     telling     `line()` says it for the system prompt ("(Leo calls you 鲸酱.)")
import * as dates from './dates.js'
import { Speaks, Words, say } from './i18n.js'
import { Resolves } from './people.js'
import * as py from './python.js'
import * as texts from './text.js'

export const LIMIT = 40 // characters: a name, not a sentence (it goes into every prompt for that person)
const now = () => Date.now() / 1000

export class Aliases extends Speaks(Resolves) {
  constructor (store, space, { displayLanguage = 'en', people = null, clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.people = people
    this.clock = clock
    this.words = Words.of(displayLanguage)
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  get (subject) {
    return this.store.row('select alias from aliases where space = ? and subject = ?', [this.space,
      this.who(subject)])?.alias ?? null
  }

  /** Every person's alias for the companion, by subject. */
  all () {
    return Object.fromEntries(this.store.rows('select subject, alias from aliases where space = ? order by subject',
      [this.space]).map(row => [row.subject, row.alias]))
  }

  /** What the person calls the companion, for the system prompt ("" for a person without an alias). */
  line (subject, userName = null) {
    const alias = this.get(subject)
    return alias ? say(this.words, 'alias.line', { who: userName || subject, alias }) : ''
  }

  // ---- changing --------------------------------------------------------------------------------------------------
  /** Record what the person calls the companion (the host's call, never a model's): cleaned onto one line and cut to
   * 40 characters. Returns the alias as stored. */
  set (subject, alias) {
    texts.required(subject, 'subject')
    texts.required(alias, 'alias')
    alias = texts.clip(alias, LIMIT)
    if (texts.blank(alias)) throw new py.ValueError('alias must not be empty')
    this.writing(subject, subject => this.store.execute('insert or replace into aliases (space, subject, alias, ' +
      'updated_at) values (?, ?, ?, ?)', [this.space, subject, alias, this.clock()]))
    return alias
  }

  remove (subject) {
    return this.writing(subject, subject => Boolean(this.store.execute(
      'delete from aliases where space = ? and subject = ?', [this.space, subject]).rowcount))
  }

  /** `old` is the person `fresh` now (`People.link`): of two aliases the newer is kept. */
  join (old, fresh) {
    this.store.transaction(() => {
      const rows = new Map(this.store.rows('select * from aliases where space = ? and subject in (?, ?)',
        [this.space, old, fresh]).map(row => [row.subject, row]))
      if (rows.has(old) && (!rows.has(fresh) || rows.get(old).updated_at > rows.get(fresh).updated_at)) {
        this.store.execute('insert or replace into aliases (space, subject, alias, updated_at) values (?, ?, ?, ?)',
          [this.space, fresh, rows.get(old).alias, rows.get(old).updated_at])
      }
      this.store.execute('delete from aliases where space = ? and subject = ?', [this.space, old])
    })
  }

  // ---- moving between files --------------------------------------------------------------------------------------
  exportRows () {
    return { aliases: this.store.rows('select * from aliases where space = ? order by rowid', [this.space]) }
  }

  /** Add exported aliases to this space, replacing a person's present one; an alias is held to the same rule as `set`
   * (one line, 40 characters), and a row without a subject or an alias is skipped. */
  importRows (rows = []) {
    const at = this.clock()
    this.store.transaction(() => {
      for (const row of rows) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
        const subject = row.subject
        let alias = row.alias
        if (typeof subject !== 'string' || !py.strip(subject) || typeof alias !== 'string') continue
        alias = texts.clip(alias, LIMIT)
        if (texts.blank(alias)) continue
        const updated = dates.seconds(row.updated_at ?? null)
        this.store.execute('insert or replace into aliases (space, subject, alias, updated_at) values (?, ?, ?, ?)',
          [this.space, subject, alias, updated === null ? at : Math.min(at, updated)])
      }
    })
  }
}

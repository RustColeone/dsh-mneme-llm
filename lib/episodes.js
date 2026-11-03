// Episodes: what was said, kept word for word, found again when it matters, fading the way people forget.
//
// They come back two ways:
//
//     look     what comes to mind unprompted, for the message at hand: the best matches within a budget of
//              characters, shown in the order they were said. With meaning, an exchange must be close enough to the
//              message, and the more it has faded, the closer. Often nothing comes
//     search   what the model looks for itself: by relevance alone, however faded; what it finds is rehearsed, and
//              fades slower from then on
//
// Ranking is BM25 over the search terms (`text.terms`), fused by reciprocal rank with closeness in meaning (tier 1's
// vectors); with no embedder, BM25 alone. Retention is R = e^(−t/S): t the talking days since the exchange was said or
// last rehearsed, S its stability (`days`, 30 to start). Only days the person talked count, and a day turns at 4 in the
// morning (`dates.talkingDay`). A rehearsal multiplies S by 1.5 + 3·(1 − R), at most once a talking day, and the
// exchange is fresh again. An exchange rehearses the earlier ones it is about: its three nearest in meaning, when they
// are closer than 98% of the pairs of this person's exchanges.
import * as dates from './dates.js'
import * as exchanges from './exchange.js'
import { Speaks, Words, say } from './i18n.js'
import { Matrix, pack, raw } from './meaning/vectors.js'
import { Resolves } from './people.js'
import * as py from './python.js'
import { dumps } from './store.js'
import * as texts from './text.js'

export const NEAREST = 3 // the earlier exchanges one exchange may rehearse
export const SPREAD = 0.98 // ... when closer than this share of the person's pairs
export const SPREAD_PAIRS = 100 // pairs seen before any exchange rehearses another
export const BINS = 200 // the spread's histogram: similarity from −1 to 1 in steps of 0.01
export const BATCH = 64 // exchanges embedded per request
export const MATRICES = 16 // people whose vectors stay in memory (the most recently looked at)
export const PREPARED = 256 // exchanges a prepare embeds at most (the rest the next time)
export const LOOK_WAIT = 3.0 // seconds a look waits for its query's vector before it ranks by words alone

export const MAX_LINE = 8000 // characters of one line kept (its opening and its end, when longer)
export const MAX_LINES = 40 // lines of one exchange
export const MAX_NAME = 80 // characters of who said a line
export const SHOWN_LINE = 2000 // characters of one line a look or a search shows (`shown(…, { whole })` shows it whole)
export const RRF = 61 // reciprocal rank fusion: a ranking's place p counts 1 / (RRF + p)
export const SCANNED = 200 // the best-ranked exchanges a look reads to fill its budget, at most
export const READ = 20 // ... this many at a time
export const BEYOND = Number.MAX_SAFE_INTEGER // past every id
export const CUT = 0.08 // a look's bar: an exchange this much closer to the query than the embedder's floor ...
export const CUT_FADED = 0.16 // ... and, fully faded, this much (in between by its retention); a search has no bar
export const BUDGET = 6000 // characters a look shows
export const DAYS = 30.0 // S an exchange starts with
export const STRONGEST = 1e6 // days: stability stops growing here
export const EXCHANGE = 2.4 // tokens two messages cost beyond their words
export const NEWEST = 64 // exchanges read at a time, the newest first
const now = () => Date.now() / 1000

export class Episode {
  constructor ({ id, subject, at, conversation, lines, stability, recalledAt = null, recalls = 0, day = 0,
    tokens = 0.0 }) {
    Object.assign(this, { id, subject, at, conversation, lines, stability, recalledAt, recalls, day, tokens })
    Object.freeze(this)
  }

  get text () {
    return exchanges.textOf(this.lines)
  }

  static of (row) {
    return new Episode({ id: row.id, subject: row.subject, at: row.at, conversation: row.conversation,
      lines: JSON.parse(row.lines).map(([who, said]) => [py.str(who), py.str(said)]), stability: row.stability,
      recalledAt: row.recalled_at, recalls: row.recalls, day: row.day, tokens: row.tokens })
  }
}

/** An exchange's lines as they are kept: who said each (one line) and what (cleaned; the opening and the end of a very
 * long one), empty ones left out, at most MAX_LINES. */
export function linesOf (exchange) {
  const kept = []
  for (const [who, said] of exchanges.asLines(exchange)) {
    const text = py.strip(texts.clean(said))
    if (texts.blank(text)) continue
    kept.push([texts.clip(who, MAX_NAME), texts.fit(text, MAX_LINE)])
  }
  return kept.slice(0, MAX_LINES)
}

/** About how many tokens an exchange comes to in a model's context. */
export const cost = lines => texts.tokens(exchanges.textOf(lines)) + EXCHANGE

/** What an exchange is found by: what was said, not who said it (they are in every one). */
export const termsOf = lines => texts.terms(lines.map(([, said]) => said).join(' '))

export const spreadBin = value => Math.max(0, Math.min(BINS - 1, Math.trunc((value + 1) / 2 * BINS)))

/** The similarity a share of the pairs is under (the lower edge of its bin), or null with too few pairs. */
export function threshold (bins, pairs, share = SPREAD) {
  if (pairs < SPREAD_PAIRS) return null
  let above = 0
  const wanted = Math.max(1, Math.ceil((1 - share) * pairs - 1e-9))
  for (let index = BINS - 1; index >= 0; index--) {
    above += bins[index]
    if (above >= wanted) return -1 + 2 * index / BINS
  }
  return -1.0
}

/** Count these similarities into the spread's histogram; returns how many pairs they were. */
export function tally (bins, similarities) {
  for (const value of similarities) bins[spreadBin(value)] += 1
  return similarities.length
}

/** Python's bisect_left and bisect_right on a sorted list of numbers. */
function bisect (list, value, right = false) {
  let low = 0, high = list.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (right ? list[middle] <= value : list[middle] < value) low = middle + 1
    else high = middle
  }
  return low
}

/** The exchanges of one space, kept under the person each was with (or, with `people`, any subject the person goes
 * by). */
export class Episodes extends Speaks(Resolves) {
  constructor (store, space, { days = DAYS, zone = null, displayLanguage = 'en', meaning = null, people = null,
    clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.days = days
    this.people = people
    this.words = Words.of(displayLanguage)
    this.zone = zone
    this.meaning = meaning
    this.clock = clock
    this.lookWait = LOOK_WAIT
    this._matrices = new Map() // [subject, embedder] → Matrix
    this._queries = new Map() // recent queries' vectors (a turn asks again)
    store.index('episode_terms', () => this._reindex())
  }

  // ---- writing ---------------------------------------------------------------------------------------------------
  /** Keep an exchange word for word (a string, or `[who, said]` pairs or chat messages); returns it, or null when it
   * has no words. `at` is when it was said (now when not given); `conversation` is where (a chat, a channel: any name
   * of the host's). */
  keep (subject, exchange, { at = null, conversation = '' } = {}) {
    texts.required(subject, 'subject')
    const lines = linesOf(exchange)
    if (!lines.length) return null
    const when = at === null || at === undefined ? this.clock() : dates.seconds(at)
    if (when === null) throw new py.ValueError('at is a time in seconds, between 1970 and the year 3000')
    if (typeof conversation !== 'string') {
      throw new TypeError(`a conversation is named by a string, not ${py.typeName(conversation)}`)
    }
    const id = this.writing(subject, subject => this._insert(subject, { at: when,
      conversation: texts.clip(conversation, 200), lines, stability: this.days, recalledAt: null, recalls: 0 }))
    return this.get(id)
  }

  /** `keep`, then its vector (meaning tier 1), with which it rehearses the earlier exchanges it is about. */
  async akeep (subject, exchange, options = {}) {
    const episode = this.keep(subject, exchange, options)
    if (episode !== null) await this.prepare(episode.subject, { first: [episode.id] })
    return episode
  }

  _insert (subject, row) {
    const terms = termsOf(row.lines)
    const id = this.store.execute('insert into episodes (space, subject, at, day, conversation, lines, size, tokens, ' +
      'stability, recalled_at, recalls) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [this.space, subject, row.at,
      dates.talkingDay(row.at, this.zone), row.conversation, dumps(row.lines), terms.length, cost(row.lines),
      row.stability, row.recalledAt, row.recalls]).lastrowid
    this._index(this.space, subject, id, terms)
    return id
  }

  _index (space, subject, id, terms) {
    for (const term of terms) {
      this.store.execute('insert into episode_terms (space, subject, term, episode_id) values (?, ?, ?, ?)',
        [space, subject, term, id])
    }
  }

  /** Every exchange of the file in the term index again (`Store.reindex`). */
  _reindex () {
    this.store.execute('delete from episode_terms')
    for (const row of this.store.rows('select id, space, subject, lines from episodes')) {
      const terms = termsOf(JSON.parse(row.lines))
      this.store.execute('update episodes set size = ? where id = ?', [terms.length, row.id])
      this._index(row.space, row.subject, row.id, terms)
    }
  }

  /** Vectors for the person's exchanges that have none from this embedder yet: those in `first` (the ones just kept),
   * then the rest in the order they were said, at most `limit` in all. Each one, as it gets its vector, rehearses the
   * earlier exchanges it is about. Returns how many were added (0 with no embedder, or while it is not answering:
   * those exchanges are found by their words meanwhile). */
  async prepare (subject, { limit = PREPARED, first = [] } = {}) {
    const meaning = this.meaning
    if (meaning === null || !meaning.embedder) return 0
    subject = this.who(subject)
    const name = meaning.name
    const missing = 'select * from episodes e where space = ? and subject = ? and not exists (select 1 from ' +
      'episode_vectors v where v.episode_id = e.id and v.embedder = ?)'
    first = [...first].map(id => py.int(id)).slice(0, Math.max(0, limit))
    let rows = this.store.rowsIn(`${missing} and id in ({}) order by at, id`, first, [this.space, subject, name])
    const firsts = new Set(first)
    rows = rows.concat(this.store.rows(`${missing} order by at, id limit ?`, [this.space, subject, name, limit])
      .filter(row => !firsts.has(row.id)).slice(0, Math.max(0, limit - rows.length)))
    let added = 0
    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH).map(Episode.of)
      const vectors = await meaning.embed(batch.map(episode => this._embedded(episode)))
      if (vectors === null) break
      // One transaction from here on: an exchange erased (or moved by a link) while it was embedded is left alone,
      // and one another caller embedded meanwhile rehearses nothing twice.
      this.store.transaction(() => {
        const matrix = this._matrix(subject, name)
        let [bins, pairs] = this._spread(subject, name)
        batch.forEach((episode, index) => {
          const vector = vectors[index]
          if (vector === null || vector === undefined || this.store.row('select 1 from episodes where id = ? and ' +
            'space = ? and subject = ?', [episode.id, this.space, subject]) === null) return
          if (!this.store.execute('insert or ignore into episode_vectors (episode_id, embedder, vector) values ' +
            '(?, ?, ?)', [episode.id, name, pack(vector)]).rowcount) return
          const similarities = matrix.similarities(vector)
          pairs += tally(bins, similarities)
          const line = threshold(bins, pairs)
          if (line !== null) this._rehearse(matrix.nearest(similarities, episode.at, line, NEAREST), episode.at)
          matrix.add(episode.id, vector, episode.at)
          added++
        })
        this._putSpread(subject, name, bins, pairs)
      })
    }
    return added
  }

  /** What is embedded: the exchange under its date in words ("08 May 2023, 14:05"), as a person would say it. */
  _embedded (episode) {
    return `[${dates.strftime(episode.at, this.zone, '%d %B %Y, %H:%M')}]\n${episode.text}`
  }

  /** The person's talking days, in order: the days an exchange of theirs was kept. */
  talkingDays (subject) {
    return this.store.rows('select distinct day from episodes where space = ? and subject = ? order by day',
      [this.space, this.who(subject)]).map(row => row.day)
  }

  /** R of an exchange's row: t counts the talking days after its last day, up to `today`, which is one because they
   * are talking now. */
  _kept (row, today, days) {
    let since = row.day
    if (row.recalled_at !== null && row.recalled_at > row.at) since = dates.talkingDay(row.recalled_at, this.zone)
    const passed = today > since ? bisect(days, today) - bisect(days, since, true) + 1 : 0
    return py.exp(-passed / Math.max(row.stability, 1e-6))
  }

  /** Each exchange recalled at `at`, at most once a talking day: its stability grows, the more the further it had
   * faded, and it is fresh. */
  _rehearse (ids, at) {
    const today = dates.talkingDay(at, this.zone), talked = new Map()
    for (const row of this.store.rowsIn(
      'select id, subject, at, day, recalled_at, stability from episodes where id in ({})', ids)) {
      if (row.recalled_at !== null && dates.talkingDay(row.recalled_at, this.zone) >= today) continue
      if (!talked.has(row.subject)) talked.set(row.subject, this.talkingDays(row.subject))
      const kept = this._kept(row, today, talked.get(row.subject))
      this.store.execute('update episodes set stability = ?, recalled_at = ?, recalls = recalls + 1 where id = ?',
        [Math.min(STRONGEST, row.stability * (1.5 + 3 * (1 - kept))), Math.max(row.at, row.recalled_at || 0.0, at),
          row.id])
    }
  }

  /** An exchange gone for good, its words, index and vectors with it (1), or nothing of this person's by that id
   * (0). */
  forget (subject, id) {
    return this.writing(subject, subject => {
      const found = this.store.row('select id from episodes where id = ? and space = ? and subject = ?',
        [id, this.space, subject])
      if (found) this._delete([found.id])
      this._matrices.clear()
      return found ? 1 : 0
    })
  }

  /** Every exchange with a person gone for good, with what was learned of their spread; returns how many. */
  erase (subject) {
    return this.writing(subject, subject => {
      const ids = this.store.rows('select id from episodes where space = ? and subject = ?', [this.space, subject])
        .map(row => row.id)
      this._delete(ids)
      this.store.execute('delete from episode_spread where space = ? and subject = ?', [this.space, subject])
      this._matrices.clear()
      return ids.length
    })
  }

  _delete (ids) {
    for (const table of ['episode_terms', 'episode_vectors']) {
      this.store.rowsIn(`delete from ${table} where episode_id in ({})`, ids)
    }
    this.store.rowsIn('delete from episodes where id in ({})', ids)
  }

  /** `old` is the person `fresh` now (`People.link`): its exchanges and their index are the person's, and the two
   * spreads one. */
  join (old, fresh) {
    this.store.transaction(() => {
      for (const table of ['episodes', 'episode_terms']) {
        this.store.execute(`update ${table} set subject = ? where space = ? and subject = ?`, [fresh, this.space, old])
      }
      for (const row of this.store.rows('select * from episode_spread where space = ? and subject = ?',
        [this.space, old])) {
        const [bins, pairs] = this._spread(fresh, row.embedder)
        const theirs = JSON.parse(row.bins)
        this._putSpread(fresh, row.embedder, bins.map((count, i) => count + (theirs[i] ?? 0)).slice(0,
          Math.min(bins.length, theirs.length)), pairs + row.pairs)
      }
      this.store.execute('delete from episode_spread where space = ? and subject = ?', [this.space, old])
    })
    this._matrices.clear()
  }

  _spread (subject, name) {
    const row = this.store.row(
      'select bins, pairs from episode_spread where space = ? and subject = ? and embedder = ?',
      [this.space, subject, name])
    if (!row) return [new Array(200).fill(0), 0]
    const bins = JSON.parse(row.bins)
    return [Array.isArray(bins) && bins.length === 200 ? bins : new Array(200).fill(0), py.int(row.pairs)]
  }

  _putSpread (subject, name, bins, pairs) {
    this.store.execute('insert into episode_spread (space, subject, embedder, bins, pairs) values (?, ?, ?, ?, ?) ' +
      'on conflict(space, subject, embedder) do update set bins = excluded.bins, pairs = excluded.pairs',
    [this.space, subject, name, dumps(bins), pairs])
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  get (id) {
    const row = this.store.row('select * from episodes where id = ? and space = ?', [id, this.space])
    return row ? Episode.of(row) : null
  }

  /** The person's exchanges with an id after `startId` (and before `before`), the newest first, whole, within
   * `budget` tokens when one is given, and always the newest, even alone over it. They are read a few at a time, so a
   * small budget reads little however much there is. */
  after (subject, startId, budget = null, { before = BEYOND } = {}) {
    subject = this.who(subject)
    const found = []
    let used = 0.0
    for (;;) {
      const rows = this.store.rows(
        'select * from episodes where space = ? and subject = ? and id > ? and id < ? order by id desc limit ?',
        [this.space, subject, startId, before, NEWEST])
      for (const row of rows) {
        if (budget !== null && found.length && used + row.tokens > budget) return found
        found.push(Episode.of(row))
        used += row.tokens
      }
      if (rows.length < NEWEST) return found
      before = rows.at(-1).id
    }
  }

  /** How many tokens the person's exchanges after `startId` come to; with `days`, only those of their last so many
   * talking days. */
  tokensAfter (subject, startId, { days = null } = {}) {
    subject = this.who(subject)
    const edge = days ? this.talkingDays(subject).slice(-days).slice(0, 1) : []
    return this.store.row('select coalesce(sum(tokens), 0) as n from episodes where space = ? and subject = ? and ' +
      'id > ? and day >= ?', [this.space, subject, startId, edge.length ? edge[0] : 0]).n
  }

  /** The highest id among the person's exchanges said before `before`, and the latest moment one was said ([0, 0.0]
   * with none). */
  latest (subject, before = dates.LATEST) {
    const row = this.store.row('select coalesce(max(id), 0) as id, coalesce(max(at), 0.0) as at from episodes where ' +
      'space = ? and subject = ? and at < ?', [this.space, this.who(subject), before])
    return [row.id, row.at]
  }

  /** Whether any exchange is kept under exactly this subject, linked or not. */
  holds (subject) {
    return this.store.row('select 1 from episodes where space = ? and subject = ? limit 1', [this.space, subject]) !==
      null
  }

  /** Everyone an exchange is kept of. */
  subjects () {
    return this.store.rows('select distinct subject from episodes where space = ? order by subject', [this.space])
      .map(row => row.subject)
  }

  count (subject = null) {
    if (subject === null) return this.store.row('select count(*) as n from episodes where space = ?', [this.space]).n
    return this.store.row('select count(*) as n from episodes where space = ? and subject = ?',
      [this.space, this.who(subject)]).n
  }

  /** How much of it is still remembered (R, from 1 when it was said or rehearsed down to 0). */
  retention (episode, at = null) {
    at = at ?? this.clock()
    const row = { at: episode.at, day: episode.day, recalled_at: episode.recalledAt, stability: episode.stability }
    return this._kept(row, dates.talkingDay(at, this.zone), this.talkingDays(episode.subject))
  }

  /** What comes to mind for `query` (words only; `alook` adds meaning): the best matches within `budget` characters
   * as `render` shows them, in the order they were said. With the query's vector (`found`), an exchange must clear a
   * bar: its cosine with the query at least the embedder's floor as the bundled set placed it plus `cut[0]` when
   * fresh, plus `cut[1]` when fully faded, in between by its retention (`cut: null`: no bar; with words alone there is
   * none). `more` adds that many more of the best by relevance alone, however faded, as a search would find them,
   * rehearsing nothing. */
  look (subject, query, { budget = BUDGET, cut = [CUT, CUT_FADED], more = 0, found = null } = {}) {
    subject = this.who(subject)
    query = texts.query(query)
    const [order, cleared] = this._ranked(subject, query, found, { cut })
    const chosen = []
    let used = 0
    for (const episode of this._getMany(order.filter(id => cleared.has(id)).slice(0, SCANNED))) {
      const size = py.len(this.shown(episode)) + 2
      if (used + size <= budget) {
        chosen.push(episode)
        used += size
      }
      if (used > budget - 60) break
    }
    const taken = new Set(chosen.map(episode => episode.id))
    chosen.push(...this._getMany(order.filter(id => !taken.has(id)).slice(0, Math.max(0, more))))
    return chosen.sort(inOrder)
  }

  /** `look` with meaning: the query's vector, if it comes within `lookWait` seconds. */
  async alook (subject, query, options = {}) {
    const found = await this._found(texts.query(query), { wait: this.lookWait })
    return this.look(subject, query, { ...options, found })
  }

  /** What a model looks for (words only; `asearch` adds meaning): the best `limit` matches by relevance alone, leaving
   * out those in `seen`, in the order they were said. With `refresh`, each is rehearsed: it was remembered. */
  search (subject, query, { limit = 5, seen = [], refresh = true, found = null } = {}) {
    subject = this.who(subject)
    query = texts.query(query)
    seen = new Set(seen instanceof Map ? seen.keys() : seen)
    const fresh = this._ranked(subject, query, found)[0].filter(id => !seen.has(id)).slice(0, Math.max(0, limit))
    if (refresh && fresh.length) this.store.transaction(() => this._rehearse(fresh, this.clock()))
    return [...this._getMany(fresh)].sort(inOrder)
  }

  async asearch (subject, query, options = {}) {
    const found = await this._found(texts.query(query))
    return this.search(subject, query, { ...options, found })
  }

  /** An exchange of this person's with the ones said before and after it in the same conversation ([] when there is
   * no such exchange of theirs). */
  around (subject, id, { before = 1, after = 1 } = {}) {
    subject = this.who(subject)
    const episode = this.get(id)
    if (!episode || episode.subject !== subject) return []
    const where = 'space = ? and subject = ? and conversation = ?'
    const values = [this.space, subject, episode.conversation, episode.at, episode.id]
    const earlier = this.store.rows(
      `select * from episodes where ${where} and (at, id) < (?, ?) order by at desc, id desc limit ?`,
      [...values, before])
    const later = this.store.rows(
      `select * from episodes where ${where} and (at, id) > (?, ?) order by at, id limit ?`, [...values, after])
    return [...earlier.reverse().map(Episode.of), episode, ...later.map(Episode.of)]
  }

  // ---- showing ---------------------------------------------------------------------------------------------------
  /** A block for a prompt: a header saying these are data and asking for the person check, then each exchange with its
   * number and date. `own`: it is the person's own conversation with the companion, so the header only says what this
   * is. `search`: the model has the search tool, and is told to look before it says it does not remember; with nothing
   * to show, that is all it is told ("" without `search`). */
  render (episodes, { userName = null, search = false, own = false } = {}) {
    if (!episodes.length) return search ? say(this.words, 'said.none_search') : ''
    const header = say(this.words, own ? 'said.own' : 'said.header', { who: userName || episodes[0].subject }) +
      say(this.words, search ? 'said.unsure_search' : 'said.unsure')
    return [header, ...episodes.map(episode => this.shown(episode))].join('\n\n')
  }

  /** One exchange as a model reads it: `#id [date time]`, then its lines, each up to SHOWN_LINE characters (its opening
   * and its end) unless `whole`; a line's own line breaks are indented, so nothing said can pose as another
   * exchange. */
  shown (episode, { whole = false } = {}) {
    const lines = [`#${episode.id} [${dates.stamp(episode.at, this.zone)}]`]
    for (const [who, said] of episode.lines) {
      const text = (whole ? said : texts.fit(said, SHOWN_LINE)).replaceAll('\n', '\n  ')
      lines.push(who ? `${who}: ${text}` : `  ${text}`)
    }
    return lines.join('\n')
  }

  // ---- ranking ---------------------------------------------------------------------------------------------------
  /** The person's exchanges for `query`, best first (BM25 over the search terms, each term once per exchange, and
   * closeness to the query's vector, fused by reciprocal rank), and which of them clear the bar of `cut` (see `look`);
   * fading changes nothing else. */
  _ranked (subject, query, found = null, { cut = null } = {}) {
    this.store.reindex()
    const rows = this.store.rows('select id, at, day, recalled_at, stability, size from episodes where space = ? and ' +
      'subject = ?', [this.space, subject])
    if (!rows.length) return [[], new Set()]
    const count = rows.length
    const sizes = new Map(rows.map(row => [row.id, row.size]))
    const average = [...sizes.values()].reduce((sum, size) => sum + size, 0) / count || 1.0
    const words = found?.words || ''
    const wanted = texts.terms(query + (words ? ' ' + words : ''))
    const mine = [this.space, subject]
    const idf = new Map()
    for (const row of this.store.rowsIn(
      'select term, count(*) as n from episode_terms where space = ? and subject = ? and term in ({}) group by term',
      wanted, mine)) {
      idf.set(row.term, py.log(1 + (count - row.n + 0.5) / (row.n + 0.5)))
    }
    const bm25 = new Map()
    for (const row of this.store.rowsIn(
      'select term, episode_id from episode_terms where space = ? and subject = ? and term in ({})', [...idf.keys()],
      mine)) {
      const id = row.episode_id
      if (sizes.has(id)) {
        bm25.set(id, (bm25.get(id) ?? 0.0) + idf.get(row.term) * 2.2 / (1 + 1.2 * (0.25 + 0.75 * sizes.get(id) /
          average)))
      }
    }
    const fused = new Map()
    ;[...bm25.keys()].sort((one, other) => bm25.get(other) - bm25.get(one) || other - one)
      .forEach((id, place) => fused.set(id, 1 / (RRF + place)))
    const vector = found?.vector ?? null
    const close = new Map()
    if (vector !== null && this.meaning !== null && this.meaning.name) {
      const matrix = this._matrix(subject, this.meaning.name)
      const similarities = matrix.similarities(vector)
      let place = 0
      for (const index of matrix.order(similarities)) {
        const id = matrix.ids[index]
        if (sizes.has(id)) { // (still this person's)
          fused.set(id, (fused.get(id) ?? 0.0) + 1 / (RRF + place))
          close.set(id, similarities[index])
          place++
        }
      }
    }
    const order = [...fused.keys()].sort((one, other) => fused.get(other) - fused.get(one) || other - one)
    const cleared = new Set(fused.keys())
    if (cut !== null && close.size) {
      const floor = this.meaning.setFloor
      const fresh = floor + cut[0], faded = floor + cut[1]
      const today = dates.talkingDay(this.clock(), this.zone), days = this.talkingDays(subject)
      for (const row of rows) {
        const id = row.id
        if (close.has(id) && close.get(id) < fresh + (1 - this._kept(row, today, days)) * (faded - fresh)) {
          cleared.delete(id) // (one with no vector yet is not judged)
        }
      }
    }
    return [order, cleared]
  }

  /** What the meaning tiers make of a query (its vector; words, from the unify tier), or null; a recent query is not
   * asked twice. With `wait`, it is given up after that many seconds (what was found for it before, if anything). */
  async _found (query, { wait = null } = {}) {
    if (this.meaning === null || !py.strip(query)) return null
    const known = this._queries.get(query) ?? null
    if (known !== null && (known.tier === 'embeddings' || !this.meaning.rest.up())) {
      this._queries.delete(query)
      this._queries.set(query, known)
      return known
    }
    let found
    if (wait) {
      let timer
      const late = new Promise(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), wait * 1000) })
      try {
        found = await Promise.race([this.meaning.query(query), late])
      } finally {
        clearTimeout(timer)
      }
      if (found === TIMED_OUT) return known // (what a lower tier made of it, if it was asked before)
    } else found = await this.meaning.query(query)
    if ((found?.vector ?? null) !== null || found?.words) {
      this._queries.delete(query)
      this._queries.set(query, found)
      while (this._queries.size > 32) this._queries.delete(this._queries.keys().next().value)
    }
    return found
  }

  /** The person's vectors from `name`, as they are in the file now (another process may have added some). */
  _matrix (subject, name) {
    const key = JSON.stringify([subject, name])
    let matrix = this._matrices.get(key) ?? null
    const state = this.store.row('select count(*) as n, max(v.episode_id) as last from episode_vectors v join ' +
      'episodes e on e.id = v.episode_id where e.space = ? and e.subject = ? and v.embedder = ?', [this.space, subject,
      name])
    const count = state.n, last = state.last || 0
    const select = 'select v.episode_id, e.at, v.vector from episode_vectors v join episodes e on e.id = ' +
      'v.episode_id where e.space = ? and e.subject = ? and v.embedder = ?'
    if (matrix !== null && count > matrix.read && last > matrix.last) {
      for (const row of this.store.rows(select + ' and v.episode_id > ? order by v.episode_id', [this.space, subject,
        name, matrix.last])) matrix.add(row.episode_id, raw(row.vector), row.at)
    }
    if (matrix === null || matrix.read !== count || matrix.last !== last) {
      matrix = new Matrix()
      for (const row of this.store.rows(select + ' order by v.episode_id', [this.space, subject, name])) {
        matrix.add(row.episode_id, raw(row.vector), row.at)
      }
    }
    this._matrices.delete(key)
    this._matrices.set(key, matrix)
    while (this._matrices.size > MATRICES) this._matrices.delete(this._matrices.keys().next().value)
    return matrix
  }

  /** These exchanges, in the order given, read a few at a time: a look stops at its budget. */
  * _getMany (ids) {
    for (let start = 0; start < ids.length; start += READ) {
      const chunk = ids.slice(start, start + READ)
      const found = new Map(this.store.rowsIn('select * from episodes where id in ({})', chunk)
        .map(row => [row.id, Episode.of(row)]))
      for (const id of chunk) if (found.has(id)) yield found.get(id)
    }
  }

  // ---- moving between files --------------------------------------------------------------------------------------
  /** This space's exchanges as plain rows (without the caches: terms and vectors). */
  exportRows () {
    return { episodes: this.store.rows('select * from episodes where space = ? order by id', [this.space])
      .map(row => ({ id: row.id, subject: row.subject, at: row.at, conversation: row.conversation,
        lines: JSON.parse(row.lines), stability: row.stability, recalled_at: row.recalled_at, recalls: row.recalls })) }
  }

  /** Add exported exchanges to this space, held to the rules of keeping (`clean`), each one once: an exchange already
   * here (same person, time, conversation and words) is not added again. Returns how many were. */
  importRows (rows) {
    let added = 0
    this.store.transaction(() => {
      for (const original of rows) {
        const row = original !== null && typeof original === 'object' && !Array.isArray(original)
          ? Episodes.clean(original, this.days) : null
        if (row === null) continue
        const subject = this.who(row.subject)
        if (this.store.row('select 1 from episodes where space = ? and subject = ? and at = ? and conversation = ? ' +
          'and lines = ?', [this.space, subject, row.at, row.conversation, dumps(row.lines)])) continue
        this._insert(subject, row)
        added++
      }
    })
    this._matrices.clear()
    return added
  }

  /** An exported exchange held to the rules of keeping, or null when it has no words, subject or time. */
  static clean (row, days = DAYS) {
    const get = name => Object.hasOwn(row, name) ? row[name] : null
    const subject = get('subject'), at = dates.seconds(get('at')), given = get('lines')
    if (typeof subject !== 'string' || !py.strip(subject) || at === null || !Array.isArray(given)) return null
    const lines = linesOf(given.filter(item => Array.isArray(item) && item.length === 2 &&
      typeof item[0] === 'string' && typeof item[1] === 'string').map(item => [item[0], item[1]]))
    if (!lines.length) return null
    let stability
    try {
      stability = py.float(get('stability'))
    } catch {
      stability = days
    }
    stability = Number.isFinite(stability) && stability > 0 ? Math.min(STRONGEST, stability) : days
    let recalls
    try {
      recalls = Math.max(0, Math.min(2 ** 31, py.int(py.truthy(get('recalls')) ? get('recalls') : 0)))
    } catch {
      recalls = 0
    }
    const conversation = get('conversation')
    return { subject, at, lines, stability, conversation: typeof conversation === 'string' ? texts.clip(conversation,
      200) : '', recalledAt: dates.seconds(get('recalled_at')), recalls }
  }
}

const inOrder = (one, other) => one.at - other.at || one.id - other.id
const TIMED_OUT = Symbol('timed out')

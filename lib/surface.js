// The surface: what was said lately, as real turns, in front of the deep memory that holds every word. A port of
// mneme_llm/surface.py.
//
// Everything said is kept word for word the moment it is said (`episodes.js`): that is deep memory, and compaction
// never touches it. The surface is not a second store: it is only where the newest part of deep memory starts, the
// exchanges with an id after `start_id`. A host that sends `read` lets `letGo` shorten it; one that keeps a context of
// its own compacts that itself, and reads only what must be the same on any host (`slice`).
//
// How much it keeps counts talking days, as fading does. It keeps what the last `days` talking days hold, but never
// less than `floor` tokens. Nothing leaves until it holds twice that; then the older part becomes one summary, its
// words still in deep memory. `cap` is the top whatever the rest says, or 80% of `window` on a smaller model:
//
//     keep = min(max(floor, last days), 2/3 cap)      top = min(2 keep, cap)
//
// A person's first prompt is kept here too: the first thing they said, usually who they want the companion to be. The
// person can set it (`setFirst`), and it goes in front of the surface only if they ask (`sendFirst`). Dropped, its row
// stays with no text, so the next thing they say does not become it. So a new chat reads {first prompt} + {surface} +
// {the new message}, and the surface follows the person into any chat.
import * as dates from './dates.js'
import { Speaks, Words, fill, say } from './i18n.js'
import { Resolves } from './people.js'
import { PROMPTS } from './prompts.js'
import { Rest, ask } from './providers.js'
import * as py from './python.js'
import * as texts from './text.js'

export const FLOOR = 70000 // tokens it never keeps less than
export const CAP = 504000 // tokens it never holds more than
export const WINDOW = 1048576 // tokens the model reads at most
export const SHARE = 0.8 // of them the surface may fill
export const DAYS = 30 // talking days it keeps
export const SLICE = 3000 // tokens of it that what reads a fixed slice reads
export const GIVE_UP = 600.0 // seconds after a failed summary before another try
export const SUMMARY = 8000 // characters of a summary
export const FIRST = 8000 // characters of a first prompt
const now = () => Date.now() / 1000

/** What the surface keeps and what it may reach, given the tokens of its last talking days. */
export function bounds (recent, floor = FLOOR, cap = CAP, window = WINDOW) {
  const top = Math.min(cap, Math.trunc(window * SHARE))
  const keep = Math.min(Math.max(floor, Math.trunc(recent)), (top * 2 - (top * 2) % 3) / 3)
  return [keep, Math.min(2 * keep, top)]
}

/** Exchanges in the order they were said. */
const inOrder = items => [...items].sort((one, other) => one.at - other.at || one.id - other.id)

/** The surface as it stands: its messages for a model, oldest first, how many tokens its turns come to, what it keeps
 * and may reach, and `upto`, when the newest of it from the host's chat was said: a host adds what came after. */
export class View {
  constructor (messages, tokens, keep, top, upto) {
    Object.assign(this, { messages, tokens, keep, top, upto })
    Object.freeze(this)
  }
}

/** A person's first prompt: `byCommand` when they set it themselves, `send` when it goes in front of the surface. */
export class First {
  constructor (text, at, byCommand, send) {
    Object.assign(this, { text, at, byCommand, send })
    Object.freeze(this)
  }
}

export { Rest } // (it is providers.js's)

export class Surface extends Speaks(Resolves) {
  constructor (store, space, episodes, { days = DAYS, floor = FLOOR, cap = CAP, window = WINDOW, companionName = '',
    displayLanguage = 'en', prompts = null, people = null, complete = null, clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.episodes = episodes
    this.people = people
    this.complete = complete
    this.span = Math.max(1, days)
    this.floor = floor
    this.cap = cap
    this.window = window
    this.companionName = companionName
    this.prompts = prompts || PROMPTS
    this.clock = clock
    this.words = Words.of(displayLanguage)
    this.rest = new Rest(GIVE_UP) // after a summary failed: a long surface is resent whole by each try
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  _row (subject) {
    return this.store.row('select start_id, cleared_at, summary from surfaces where space = ? and subject = ?',
      [this.space, subject])
  }

  _start (subject) {
    return this._row(subject)?.start_id ?? 0
  }

  /** When it was last cleared or shortened: 0 until then. */
  began (subject) {
    return this._row(this.who(subject))?.cleared_at ?? 0.0
  }

  _bounds (subject, start) {
    return bounds(this.episodes.tokensAfter(subject, start, { days: this.span }), this.floor, this.cap, this.window)
  }

  /** Whether a line is the companion's: by her name, or as a chat message's role. */
  _hers (who) {
    return who === this.companionName || who === 'assistant'
  }

  /** An exchange as chat messages: the companion's own lines are hers. Anyone else's are the other side's, named when
   * there are several of them: a group, or a classmate she heard. */
  turns (episode) {
    const others = new Set(episode.lines.filter(([who]) => !this._hers(who)).map(([who]) => who))
    return episode.lines.map(([who, said]) => this._hers(who) ? { role: 'assistant', content: said }
      : { role: 'user', content: others.size > 1 && who ? `${who}: ${said}` : said })
  }

  /** What goes in front of a new message, in any conversation with this person: their first prompt if they asked for
   * it, what stands for the older part, and at most `top` tokens of the newest turns (always the newest exchange),
   * whole exchanges, in the order they were said. `here` is the chat it goes into: what was left unanswered there
   * stays the host's to show, whatever was said in another chat since. */
  read (subject, { userName = null, here = '' } = {}) {
    subject = this.who(subject)
    const row = this._row(subject), first = this.first(subject)
    const start = row ? row.start_id : 0
    const [keep, top] = this._bounds(subject, start)
    const kept = this.episodes.after(subject, start, top)
    const head = first && first.send ? [{ role: 'user', content: first.text }] : []
    if (row && row.summary) {
      head.push({ role: 'user', content: say(this.words, 'surface.summary', { who: userName || subject,
        summary: row.summary }) })
    }
    const place = texts.clip(here, 200)
    const upto = kept.filter(item => !here || item.conversation === place).reduce((latest, item) =>
      Math.max(latest, item.at), 0.0)
    return new View([...head, ...inOrder(kept).flatMap(item => this.turns(item))],
      Math.trunc(kept.reduce((sum, item) => sum + item.tokens, 0)), keep, top, upto)
  }

  /** The newest `tokens` of it as chat messages (always the newest exchange): the same on any host, for what must not
   * depend on one. */
  slice (subject, tokens = SLICE) {
    subject = this.who(subject)
    return inOrder(this.episodes.after(subject, this._start(subject), tokens)).flatMap(item => this.turns(item))
  }

  // ---- letting go ------------------------------------------------------------------------------------------------
  /** If it has reached its top, the older part becomes a summary and it holds `keep` tokens again, and true. Their
   * words stay in deep memory. For a host that sends the surface; one that compacts its own never calls this. With no
   * model (`complete(system, user)`, or the one given at start), or a failing one, nothing changes: `read` still stops
   * at the top, and it tries again after GIVE_UP seconds. An erase, a clear or a link while the model writes leaves it
   * as they left it. */
  async letGo (subject, { userName = null, complete = null } = {}) {
    subject = this.who(subject)
    complete = complete || this.complete
    const row = this._row(subject)
    const start = row ? row.start_id : 0
    const [keep, top] = this._bounds(subject, start)
    if (!complete || !this.rest.up() || this.episodes.tokensAfter(subject, start) < top) return false
    const staying = this.episodes.after(subject, start, keep)
    const leaving = staying.length ? this.episodes.after(subject, start, null, { before: staying.at(-1).id }) : []
    if (!leaving.length) return false
    const earlier = row && row.summary ? fill(this.prompts.surface_earlier, { summary: row.summary }) : ''
    const turns = inOrder(leaving).flatMap(item => item.lines.map(([who, said]) => `${who}: ${said}`)).join('\n')
    const system = fill(this.prompts.surface_summary, { user: userName || subject, name: this.companionName, earlier,
      lang: say(this.words, 'reflect.language'), turns })
    let summary
    try {
      summary = py.strip(await ask(complete, system, this.prompts.surface_now))
    } catch (error) {
      this.rest.failed(error)
      return false
    }
    if (!summary) {
      this.rest.failed(new py.ValueError('the summary came back empty'))
      return false
    }
    const first = staying.at(-1)
    return this.writing(subject, person => {
      const found = this.episodes.get(first.id)
      if (person !== subject || !found || found.subject !== subject || this._start(subject) !== start) return false
      this._put(subject, leaving[0].id, first.at, texts.fit(summary, SUMMARY))
      return true
    })
  }

  _put (subject, startId, clearedAt, summary) {
    this.store.execute('insert into surfaces (space, subject, start_id, cleared_at, summary) values (?, ?, ?, ?, ?) ' +
      'on conflict(space, subject) do update set start_id = excluded.start_id, cleared_at = excluded.cleared_at, ' +
      'summary = excluded.summary', [this.space, subject, startId, clearedAt, summary])
  }

  /** One surface for `subject` out of two [start_id, cleared_at, summary]: from the lower start, with both summaries
   * (one that holds the other is enough). None left to keep, no row. */
  _combine (subject, one, other) {
    const start = Math.min(one[0], other[0]), cleared = Math.min(one[1], other[1])
    const summary = one[2].includes(other[2]) ? one[2]
      : other[2].includes(one[2]) ? other[2] : `${one[2]}\n\n${other[2]}`
    if (start || summary) this._put(subject, start, cleared, texts.fit(summary, SUMMARY))
    else this.store.execute('delete from surfaces where space = ? and subject = ?', [this.space, subject])
  }

  /** It starts empty from now on. Deep memory, and the first prompt, stay. */
  clear (subject) {
    this.writing(subject, subject => {
      const [last, said] = this.episodes.latest(subject)
      this._put(subject, last, py.nextUp(Math.max(said, this.clock())), '')
    })
  }

  // ---- the first prompt ------------------------------------------------------------------------------------------
  first (subject) {
    const row = this.store.row("select * from first_prompts where space = ? and subject = ? and text != ''",
      [this.space, this.who(subject)])
    return row ? new First(row.text, row.at, Boolean(row.by_command), Boolean(row.send)) : null
  }

  /** What was said to the companion, as `[who, said]` lines: the first time, a copy of the first line not hers
   * stays. */
  noticed (subject, lines) {
    const said = lines.find(([who]) => !this._hers(who))?.[1] ?? ''
    const text = texts.fit(py.strip(texts.clean(said)), FIRST)
    if (text) {
      this.writing(subject, subject => this.store.execute(
        'insert or ignore into first_prompts (space, subject, text, at, by_command, send) values (?, ?, ?, ?, 0, 0)',
        [this.space, subject, text, this.clock()]))
    }
  }

  /** The person's first prompt is `text` from now on, by their own word. Whether it is sent stays as it was. */
  setFirst (subject, text) {
    text = texts.fit(py.strip(texts.clean(texts.required(text, 'a first prompt'))), FIRST)
    this.writing(subject, subject => this.store.execute(
      'insert into first_prompts (space, subject, text, at, by_command, send) values (?, ?, ?, ?, 1, 0) on ' +
      'conflict(space, subject) do update set text = excluded.text, at = excluded.at, by_command = 1',
      [this.space, subject, text, this.clock()]))
    return this.first(subject)
  }

  /** Whether it goes in front of the surface; false when they have none. */
  sendFirst (subject, send = true) {
    return this.writing(subject, subject => this.store.execute(
      "update first_prompts set send = ? where space = ? and subject = ? and text != ''",
      [send ? 1 : 0, this.space, subject]).rowcount > 0)
  }

  /** They have none from now on: their row stays with no text, so the next message does not become it. */
  dropFirst (subject) {
    return this.writing(subject, subject => this.store.execute("update first_prompts set text = '', by_command = 0, " +
      "send = 0 where space = ? and subject = ? and text != ''", [this.space, subject]).rowcount > 0)
  }

  // ---- keeping up ------------------------------------------------------------------------------------------------
  /** Everyone a surface or a first prompt is kept of. */
  subjects () {
    return this.store.rows('select subject from surfaces where space = ? union select subject from first_prompts ' +
      'where space = ? order by subject', [this.space, this.space]).map(row => row.subject)
  }

  erase (subject) {
    this.writing(subject, subject => {
      for (const table of ['surfaces', 'first_prompts']) {
        this.store.execute(`delete from ${table} where space = ? and subject = ?`, [this.space, subject])
      }
    })
  }

  /** `old` is the person `fresh` now: their surfaces are one, from the lower start (none counts as 0, all of it), with
   * both summaries; their own first prompt stays, or `old`'s when they have none. Before the exchanges move: an
   * account that holds nothing changes nothing. */
  join (old, fresh) {
    this.store.transaction(() => {
      const theirs = this._row(old)
      if (theirs || this.episodes.holds(old)) {
        const mine = this._row(fresh)
        const plain = row => row ? [row.start_id, row.cleared_at, row.summary] : [0, 0.0, '']
        this._combine(fresh, plain(theirs), plain(mine))
      }
      this.store.execute('delete from surfaces where space = ? and subject = ?', [this.space, old])
      this.store.execute('update or ignore first_prompts set subject = ? where space = ? and subject = ?',
        [fresh, this.space, old])
      this.store.execute('delete from first_prompts where space = ? and subject = ?', [this.space, old])
    })
  }

  // ---- moving between files --------------------------------------------------------------------------------------
  /** Ids mean nothing in another file, so a surface goes by the time it starts. */
  exportRows () {
    const plain = rows => rows.map(row => ({ ...row }))
    return { surfaces: plain(this.store.rows('select subject, cleared_at, summary from surfaces where space = ?',
      [this.space])),
    first_prompts: plain(this.store.rows('select subject, text, at, by_command, send from first_prompts where ' +
      'space = ?', [this.space])) }
  }

  /** Add what an export kept, held to the rules of writing, after its exchanges: a surface starts at the last exchange
   * said before its `cleared_at`, and joins one that is here as `join` does; a first prompt that is here stays. */
  importRows (surfaces, firsts) {
    const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    this.store.transaction(() => {
      for (const row of surfaces) {
        if (!isTable(row)) continue
        const cleared = dates.seconds(row.cleared_at ?? null)
        let subject = row.subject
        if (typeof subject === 'string' && py.strip(subject) && typeof row.summary === 'string' && cleared !== null) {
          subject = this.who(subject)
          const mine = this._row(subject)
          const given = [this.episodes.latest(subject, cleared)[0], cleared, texts.fit(texts.clean(row.summary),
            SUMMARY)]
          if (mine === null) this._put(subject, ...given)
          else this._combine(subject, [mine.start_id, mine.cleared_at, mine.summary], given)
        }
      }
      for (const row of firsts) {
        if (!isTable(row)) continue
        const at = dates.seconds(row.at ?? null)
        if (typeof row.subject === 'string' && py.strip(row.subject) && typeof row.text === 'string' && at !== null) {
          this.store.execute('insert or ignore into first_prompts (space, subject, text, at, by_command, send) ' +
            'values (?, ?, ?, ?, ?, ?)', [this.space, this.who(row.subject),
            texts.fit(py.strip(texts.clean(row.text)), FIRST), at, py.truthy(row.by_command) ? 1 : 0,
            py.truthy(row.send) ? 1 : 0])
        }
      }
    })
  }
}

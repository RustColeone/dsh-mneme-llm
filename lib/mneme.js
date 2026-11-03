// mneme-llm in JavaScript: one space of one file, in one object. A port of the `Mneme` of mneme_llm/__init__.py, as
// far as this version goes: who people are to the companion, what was said word for word, the surface and first
// prompts, and the config. Notes, mood and the meaning tiers come later, and a file keeps whatever Python put there.
//
//     import { Mneme } from 'dsh-mneme-llm/lib'
//     const m = new Mneme('companion.db', 'dafeiyu', { config: { companion: { name: '大肥鱼' } } })
//     m.relate('discord:42', 'creator')
//     m.observe('discord:42', [['Leo', message], ['大肥鱼', reply]])   // kept word for word
//     const context = m.surface.read('discord:42').messages            // what was said lately, as real turns
//
// Point Python's mneme-llm at the same file and it reads all of it, and the other way round.
import { Config } from './config.js'
import { Episodes } from './episodes.js'
import * as exchanges from './exchange.js'
import { Words } from './i18n.js'
import { noteSubjects } from './memory.js'
import { People } from './people.js'
import * as py from './python.js'
import { Relations } from './relations.js'
import { Store } from './store.js'
import { Surface } from './surface.js'

export const VERSION = '0.1.0'
export const SEARCHED = 5 // exchanges a search adds to a look

/** Memory of one space, in one object. Options left out come from the companion's config in the file (`m.config`),
 * which the file takes once, when it first meets the space (`config`, a table); one given here wins for this process
 * and is not stored.
 *
 *     displayLanguage   the language of everything shown to people and to the chat model ("en", "zh", ...)
 *     companionName     the companion's own name (the person's is given per call, as `userName`)
 *     zone              null for the machine's, { name: 'Asia/Shanghai' } or { offset: 28800 } (`config.zoneOf`)
 *     roles             what people can be to the companion (`relate`)
 *     surfaceDays, surfaceFloor, surfaceCap, surfaceWindow   how much of the conversation stays as real turns
 *     complete          your chat model, `async complete(system, user) => text`: it writes the surface's summary
 *     clock             seconds now (`Date.now() / 1000`) */
export class Mneme {
  constructor (file = 'mneme.db', space = 'default', { config = null, displayLanguage, companionName, zone, roles,
    surfaceDays, surfaceFloor, surfaceCap, surfaceWindow, complete = null, clock = () => Date.now() / 1000 } = {}) {
    this.store = new Store(file)
    try {
      this.config = new Config(this.store, space, clock)
      this.config.seed(config) // a new companion: the table over the defaults; otherwise its own copy
    } catch (error) {
      this.store.close()
      throw error
    }
    const own = this.config
    const stored = (given, key) => given === undefined ? own.get(key) : given
    this.space = space
    this.complete = complete
    this.prompts = own.prompts()
    this.companionName = stored(companionName, 'companion.name')
    zone = zone === undefined ? own.zone() : zone
    const words = new Words(stored(displayLanguage, 'companion.display_language'), own.messages())
    this.people = new People(this.store, space)
    this.relations = new Relations(this.store, space, { roles: roles === undefined ? own.roles() : roles,
      growth: own.get('relations.growth'), fadeDays: own.get('relations.fade_days'), zone, displayLanguage: words,
      people: this.people, clock })
    this.episodes = new Episodes(this.store, space, { days: own.get('memory.said_days'), zone, displayLanguage: words,
      people: this.people, clock })
    this.surface = new Surface(this.store, space, this.episodes, { days: stored(surfaceDays, 'memory.surface_days'),
      floor: stored(surfaceFloor, 'memory.surface_floor'), cap: stored(surfaceCap, 'memory.surface_cap'),
      window: stored(surfaceWindow, 'memory.surface_window'), companionName: this.companionName, displayLanguage: words,
      prompts: this.prompts, people: this.people, complete, clock })
    this.saidBudget = own.get('memory.said_budget')
    const fresh = own.get('memory.said_cut') // (a faded exchange's bar is never under a fresh one's)
    this.saidCut = [fresh, Math.max(fresh, own.get('memory.said_cut_faded'))]
  }

  get displayLanguage () {
    return this.episodes.displayLanguage
  }

  set displayLanguage (language) {
    for (const part of [this.relations, this.episodes, this.surface]) part.displayLanguage = language
  }

  // ---- the few calls most programs need ------------------------------------------------------------------------
  /** Say who a person is to the companion (see `Relations.set`): "creator" (one per space), "family", "friend",
   * "acquaintance" or a role of your own, with a closeness from 0 to 100 within the role's band. */
  relate (subject, role, { closeness = null } = {}) {
    return this.relations.set(subject, role, { closeness })
  }

  /** The person a subject stands for: the subject it is linked to, or itself. */
  person (subject) {
    return this.people.of(subject)
  }

  /** Everyone anything is kept of, in order. */
  everyone () {
    return [...new Set([...noteSubjects(this.store, this.space), ...this.episodes.subjects(),
      ...this.surface.subjects()])].sort(py.compare)
  }

  /** What was said before that bears on `query` (word matching), ready for a prompt: the best matches word for word
   * within `budget` characters (`memory.said_budget`, 6,000, when not given), under a header that asks for the person
   * check. `search`: your model has a search tool; then `found` exchanges by relevance alone come with the look, and
   * the model is told to search before it says it does not remember (in a group give `found: 0`). `own`: this is the
   * person's own conversation with the companion, so no data label, and their same question asked before is left
   * out. "" when nothing bears on it and there is no search. */
  look (subject, query = '', { userName = null, budget = null, search = false, own = false, found = SEARCHED } = {}) {
    const came = this.episodes.look(subject, query, { budget: this._said(budget), more: search ? found : 0 })
    return this._cameBack(came, query, userName, search, own)
  }

  _cameBack (came, query, userName, search, own) {
    const same = py.split(query).join('')
    came = came.filter(item => py.split(item.lines[0][1]).join('') !== same)
    return this.episodes.render(came, { userName, search, own })
  }

  _said (budget) {
    return budget === null ? this.saidBudget : Math.max(0, Math.trunc(budget))
  }

  /** Call after each exchange, once the reply is out: keeps it word for word, with when (`at`, now when not given)
   * and where (`conversation`) it was said, if the person started it (`source: 'user'`), and makes it a day of contact
   * for their closeness. The first thing a person says is kept as their first prompt. This is Python's `observe` with
   * no model: the mood and notes come in a later version. */
  observe (subject, exchange, { source = 'user', keep = true, conversation = '', at = null } = {}) {
    const lines = exchanges.asLines(exchange)
    const episode = keep && source === 'user' ? this.episodes.keep(subject, lines, { at, conversation }) : null
    if (source === 'user') {
      this.relations.seen(subject)
      if (keep) this.surface.noticed(subject, lines)
    }
    return { mood: null, notes: [], worth: null, error: '', episode }
  }

  close () {
    this.store.close()
  }
}

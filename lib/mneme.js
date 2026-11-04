// `Mneme`: memory and mood for AI companions, in one SQLite file that any model, and any project, can use. It holds
// every part (notes, deep memory and the surface, mood, who is who, aliases, meaning, the config) and joins them.
//
//     import { Mneme } from 'dsh-mneme-llm/lib'
//     const m = new Mneme('companion.db', 'dafeiyu', { config: 'dafeiyu.toml', complete: myModel })
//     m.relate('discord:42', 'creator')
//     m.alias('discord:42', '鲸酱')
//     m.link('web:leo', 'discord:42')   // the same person on another account
//     m.remember('discord:42', '养了一只叫年糕的猫', { kind: 'fact', key: 'pet.name', importance: 4 })
//     systemPrompt += await m.aprompt('discord:42', message, { userName: 'Leo', said: 6000 })
//     await m.observe('discord:42', [['Leo', message], ['大肥鱼', reply]], { userName: 'Leo' })
//     const context = m.surface.read('discord:42').messages   // what was said lately, as real turns
import { Aliases } from './aliases.js'
import { WORTH_NAME, notesIn, reflectPrompt, worth, writerPrompt } from './capture.js'
import { Config } from './config.js'
import * as dates from './dates.js'
import { Prompt } from './decide.js'
import { Episodes } from './episodes.js'
import * as exchanges from './exchange.js'
import { Words, say } from './i18n.js'
import { Embeddings, Meaning, OpenAIEmbeddings, Unify } from './meaning/index.js'
import { Memory } from './memory.js'
import { LEVELS, Mood } from './mood.js'
import { People } from './people.js'
import * as providers from './providers.js'
import * as py from './python.js'
import { Relations } from './relations.js'
import { SCHEMA_VERSION, Store } from './store.js'
import { Surface } from './surface.js'
import * as texts from './text.js'

export const VERSION = '0.3.0'
export const SEARCHED = 5 // exchanges a search adds to a look
export const WRITER_INPUT = 12000 // characters of an exchange the note writer reads: its opening and its newest words

/** What `observe` made of one exchange: the mood change (null when nothing moved), the notes kept, how likely the
 * exchange held something worth remembering (when it was asked), why notes could not be written (when the note
 * writer failed), and the exchange itself, kept word for word. */
export class Observation {
  constructor ({ mood = null, notes = [], worth = null, error = '', episode = null } = {}) {
    Object.assign(this, { mood, notes, worth, error, episode })
    Object.freeze(this)
  }
}

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Memory, mood, and the decision and meaning tiers of one space, in one object. Options left out come from the
 * companion's config in the file (`m.config`), which the file takes once, when it first meets the space (`config`, a
 * TOML file or a table); one given here wins for this process and is not stored.
 *
 *     displayLanguage   the language of everything shown to people and to the chat model ("en", "zh", ...)
 *     companionName     the companion's own name (the person's is given per call, as `userName`)
 *     complete          your chat model, `async complete(system, user) => text`: it answers the small decisions, is
 *                       the last tier of meaning, and writes notes, the profile card and the surface's summary
 *     judge             a judge of your own, `{ async decide(input, questions) }`, in place of `complete`
 *     embed             meaning tier 1: true uses OpenAI embeddings when OPENAI_API_KEY is set; or any embedder
 *                       (`new Embeddings(fn, name)`), or a function of yours; false leaves it out
 *     memoryLanguage    meaning tier 2: the language notes are unified into ("English" by default), or a `Unify` of
 *                       your own; null turns it off
 *     mood, roles       the mood's settings (`MoodSettings`), what people can be to the companion (`Role`s)
 *     zone              null for the machine's, { name: 'Asia/Shanghai' } or { offset: 28800 } (`config.zoneOf`)
 *     halfLifeDays, dailyQuota, surfaceDays, surfaceFloor, surfaceCap, surfaceWindow
 *     clock             seconds now (`Date.now() / 1000`) */
export class Mneme {
  constructor (file = 'mneme.db', space = 'default', { config = null, displayLanguage, companionName, zone,
    complete = null, judge = null, embed = true, memoryLanguage, mood, roles, halfLifeDays, dailyQuota, surfaceDays,
    surfaceFloor, surfaceCap, surfaceWindow, clock = () => Date.now() / 1000 } = {}) {
    this.store = new Store(file)
    try {
      this.config = new Config(this.store, space, clock)
      this.config.seed(config) // a new companion: the file over the defaults; otherwise its own copy
    } catch (error) {
      this.store.close()
      throw error
    }
    const own = this.config
    const stored = (given, key) => given === undefined ? own.get(key) : given
    if (memoryLanguage === undefined) memoryLanguage = own.get('companion.memory_language') || null // "": off
    this.space = space
    this.complete = complete
    this.prompts = own.prompts()
    this.companionName = stored(companionName, 'companion.name')
    zone = zone === undefined ? own.zone() : zone
    const words = new Words(stored(displayLanguage, 'companion.display_language'), own.messages())
    this.judge = judge
    this.decisions = { answered: 0, abstained: 0, failed: 0, last_error: '' }
    this.meaning = this._meaning(embed, memoryLanguage, complete)
    this.people = new People(this.store, space)
    this.memory = new Memory(this.store, space, { halfLifeDays: stored(halfLifeDays, 'memory.half_life_days'),
      dailyQuota: stored(dailyQuota, 'memory.daily_quota'), maxNotes: own.get('memory.max_notes'),
      semanticWindow: own.get('memory.semantic_window'), zone, displayLanguage: words, meaning: this.meaning,
      people: this.people, clock })
    this.mood = new Mood(this.store, space, { settings: mood === undefined ? own.moodSettings() : mood,
      companionName: this.companionName, displayLanguage: words, prompts: this.prompts, people: this.people, clock })
    this.relations = new Relations(this.store, space, { roles: roles === undefined ? own.roles() : roles,
      liking: own.get('relations.liking'), fadeDays: own.get('relations.fade_days'), zone, displayLanguage: words,
      people: this.people, clock })
    this.aliases = new Aliases(this.store, space, { displayLanguage: words, people: this.people, clock })
    this.episodes = new Episodes(this.store, space, { days: own.get('memory.said_days'), zone, displayLanguage: words,
      meaning: this.meaning, people: this.people, clock })
    this.surface = new Surface(this.store, space, this.episodes, { days: stored(surfaceDays, 'memory.surface_days'),
      floor: stored(surfaceFloor, 'memory.surface_floor'), cap: stored(surfaceCap, 'memory.surface_cap'),
      window: stored(surfaceWindow, 'memory.surface_window'), companionName: this.companionName, displayLanguage: words,
      prompts: this.prompts, people: this.people, complete, clock })
    this.saidBudget = own.get('memory.said_budget')
    const fresh = own.get('memory.said_cut') // (a faded exchange's bar is never under a fresh one's; −1: none)
    this.saidCut = [fresh, Math.max(fresh, own.get('memory.said_cut_faded'))]
  }

  get displayLanguage () {
    return this.memory.displayLanguage
  }

  set displayLanguage (language) {
    for (const part of [this.memory, this.mood, this.relations, this.aliases, this.episodes, this.surface]) {
      part.displayLanguage = language
    }
  }

  _meaning (embed, memoryLanguage, complete) {
    let embedder = null
    if (embed === true) embedder = new OpenAIEmbeddings()
    else if (typeof embed === 'function') embedder = new Embeddings(embed, `custom:${embed.name || 'function'}`)
    else if (embed) embedder = embed
    let unify = null
    if (typeof memoryLanguage === 'string' && py.strip(memoryLanguage)) { // a language: the tier, made here
      unify = new Unify(complete, memoryLanguage, { prompts: this.prompts })
    } else if (memoryLanguage) unify = memoryLanguage // a tier of the host's own
    if (embedder === null && unify === null) return null
    return new Meaning(this.store, embedder, unify)
  }

  // ---- the few calls most programs need ------------------------------------------------------------------------
  /** Keep a note (see `Memory.remember`). */
  remember (subject, text, options = {}) {
    return this.memory.remember(subject, text, options)
  }

  /** Word matching only, no network; `arecall` adds the meaning tiers. */
  recall (subject, query, options = {}) {
    return this.memory.recall(subject, query, options)
  }

  async arecall (subject, query, options = {}) {
    return await this.memory.arecall(subject, query, options)
  }

  /** Say who a person is to the companion (see `Relations.set`): "creator" (one per space), "family", "friend",
   * "acquaintance" or a role of your own, with a closeness from 0 to 100 within the role's band. Their words then move
   * the mood by their closeness, and the prompt says who they are. */
  relate (subject, role, { closeness = null } = {}) {
    return this.relations.set(subject, role, { closeness })
  }

  /** Record what a person calls the companion (see `Aliases.set`), or take it away with null. Your code sets it, never
   * a model. */
  alias (subject, alias) {
    if (alias === null || alias === undefined) {
      this.aliases.remove(subject)
      return null
    }
    return this.aliases.set(subject, alias)
  }

  /** Record that `subject` is the same person as `person` (another account of theirs; see `People`): from now on every
   * call with either means them, and what was kept under `subject` joins what is kept under `person`. Your code links
   * accounts it knows to be one person, never a model. Returns the person's own subject. */
  link (subject, person) {
    return this.store.transaction(() => {
      const [found, fresh] = this.people.link(subject, person)
      if (fresh) this._join(subject, found)
      return found
    })
  }

  /** `subject` is its own person again from now on; what was joined stays with the person it was linked to. */
  unlink (subject) {
    return this.people.unlink(subject)
  }

  /** The person a subject stands for: the subject it is linked to, or itself. */
  person (subject) {
    return this.people.of(subject)
  }

  _join (old, fresh) {
    for (const part of [this.memory, this.mood, this.relations, this.aliases, this.surface, this.episodes]) {
      part.join(old, fresh)
    }
  }

  /** Hide a note (by `id`) or a `key`'s live note; it stays in the history until `purge`. */
  forget (subject, { id = null, key = null } = {}) {
    return this.memory.forget(subject, { id, key })
  }

  /** Erase hidden and replaced notes for good (all subjects when none is given). */
  purge (subject = null) {
    return this.memory.purge(subject)
  }

  /** Everything about a person, gone for good ("forget me"): notes, history, vectors, profile card, recall log, every
   * exchange kept word for word, the surface and their first prompt, mood and its timeline, their role, their alias
   * and the links of their other accounts. Returns how many notes there were. */
  erase (subject) {
    return this.store.transaction(() => {
      subject = this.people.of(subject)
      const count = this.memory.erase(subject)
      this.episodes.erase(subject)
      this.surface.erase(subject)
      this.mood.reset(subject)
      this.relations.remove(subject)
      this.aliases.remove(subject)
      this.people.remove(subject)
      return count
    })
  }

  /** Everyone anything is kept of, in order. */
  everyone () {
    return [...new Set([...this.memory.subjects(), ...this.episodes.subjects(), ...this.surface.subjects()])]
      .sort(py.compare)
  }

  /** What she remembers of a person gone for good: notes, profile card, every exchange, the surface and their first
   * prompt. Who they are to her stays: their role, closeness, alias, mood and accounts. Returns how many exchanges
   * there were. */
  wipe (subject) {
    return this.store.transaction(() => {
      subject = this.people.of(subject)
      this.memory.erase(subject)
      const count = this.episodes.erase(subject)
      this.surface.erase(subject)
      return count
    })
  }

  /** What to add to the system prompt this turn (word matching only): who the person is to the companion and what
   * they call it, notes for `query`, with `said` (a budget of characters) what was said before that bears on it
   * (`look`), and the mood's news, told once. The notes' options are as in `Memory.context`, the rest as in `look`. */
  prompt (subject, query = '', { userName = null, mark = true, limit = 6, budget = 800, important = 2, recent = 1,
    header = null, said = 0, search = false, own = false } = {}) {
    const notes = this.memory.context(subject, query, { userName, limit, budget, important, recent, header })
    const words = said ? this.look(subject, query, { userName, budget: said, search, own }) : ''
    return this._prompt(subject, userName, notes, words, mark)
  }

  /** `prompt` with the meaning tiers. */
  async aprompt (subject, query = '', { userName = null, mark = true, limit = 6, budget = 800, important = 2,
    recent = 1, header = null, complete = null, said = 0, search = false, own = false } = {}) {
    const notes = await this.memory.acontext(subject, query, { userName, limit, budget, important, recent, header,
      complete })
    const words = said ? await this.alook(subject, query, { userName, budget: said, search, own }) : ''
    return this._prompt(subject, userName, notes, words, mark)
  }

  _prompt (subject, userName, notes, said, mark) {
    return [this.relations.line(subject, userName), this.aliases.line(subject, userName), notes, said,
      this.mood.news(subject, { mark }) || ''].filter(Boolean).join('\n\n')
  }

  /** What was said before that bears on `query` (word matching only), ready for a prompt: the best matches word for
   * word within `budget` characters (`memory.said_budget`, 6,000, when not given), under a header that asks for the
   * person check. With meaning (`alook`), only what is close enough comes, and the more an exchange has faded, the
   * closer it must be (`memory.said_cut`, `memory.said_cut_faded`): often nothing.
   *
   * `search`: your model has the search tool (`tools.js`). Then `found` exchanges by relevance alone come with the
   * look, and the model is told to search before it says it does not remember (in a group give `found: 0`). `own`:
   * this is the person's own conversation with the companion, so no data label, and their same question asked before
   * is left out. "" when nothing bears on it and there is no search. */
  look (subject, query = '', { userName = null, budget = null, search = false, own = false, found = SEARCHED } = {}) {
    const came = this.episodes.look(subject, query, { budget: this._said(budget), cut: this.saidCut,
      more: search ? found : 0 })
    return this._cameBack(came, query, userName, search, own)
  }

  /** `look` with meaning (the query's embedding, when it comes within a few seconds). */
  async alook (subject, query = '', { userName = null, budget = null, search = false, own = false,
    found = SEARCHED } = {}) {
    const came = await this.episodes.alook(subject, query, { budget: this._said(budget), cut: this.saidCut,
      more: search ? found : 0 })
    return this._cameBack(came, query, userName, search, own)
  }

  _cameBack (came, query, userName, search, own) {
    const same = py.split(query).join('')
    came = came.filter(item => py.split(item.lines[0][1]).join('') !== same)
    return this.episodes.render(came, { userName, search, own })
  }

  _said (budget) {
    return budget === null || budget === undefined ? this.saidBudget : Math.max(0, py.int(budget))
  }

  /** Call after each exchange, once the reply is out: keeps it word for word, judges the mood and keeps what is worth
   * remembering. An exchange the person started (`source: 'user'`) is kept word for word first (`keep`; no model
   * call), with when (`at`, now when not given) and where (`conversation`) it was said, and then embedded. One
   * decision request answers both the mood questions and "worth remembering?", so the note writer is only called when
   * there is something to write. Notes, too, are only taken from exchanges the person started, and such an exchange
   * is a day of contact for their closeness. `complete` gives this call a chat model in place of the one given at
   * start. If the note writer fails, the mood is still applied and the failure is in `Observation.error`. With no
   * model and no embedder, everything is done by the time the call returns. */
  async observe (subject, exchange, { source = 'user', userName = 'the user', complete = null, mood = true,
    capture = true, gate = 0.5, keep = true, conversation = '', at = null } = {}) {
    const lines = exchanges.asLines(exchange) // once; a wrong one is the caller's mistake
    const text = exchanges.textOf(lines)
    const episode = keep && source === 'user' ? this.episodes.keep(subject, lines, { at, conversation }) : null
    const writer = complete || this.complete
    const judgeMood = mood && !this.mood.settings.skip.has(source)
    const keepNotes = capture && source === 'user' && Boolean(writer)
    const questions = [...(judgeMood ? this.mood.questions() : []), ...(keepNotes ? [this._worth()] : [])]
    const answers = this._decides(questions, complete) ? await this._decide(text, questions, source, userName, complete)
      : {}
    const event = judgeMood ? this.mood.applyAnswers(subject, answers, text, { source, userName,
      weight: this.relations.weight(subject) }) : null
    if (source === 'user') {
      const change = judgeMood && Object.hasOwn(answers, 'mood_change') ? answers.mood_change : null
      this.relations.seen(subject, change ? change.mean(LEVELS) : null)
      if (keep) this.surface.noticed(subject, lines)
    }
    const worthy = Object.hasOwn(answers, WORTH_NAME) ? answers[WORTH_NAME] : null
    let notes = [], error = ''
    if (keepNotes) {
      try {
        notes = await this._capture(subject, text, userName, worthy, gate, writer)
      } catch (failure) { // the note writer is the host's model: report it, keep the mood
        error = py.slice(py.describe(failure), 0, 300)
      }
    }
    if (episode !== null && this.meaning?.embedder) {
      await this.episodes.prepare(episode.subject, { first: [episode.id] }) // it rehearses what it is about
    }
    return new Observation({ mood: event, notes, worth: worthy !== null ? worthy.probability : null, error, episode })
  }

  /** Notes kept from one exchange, without judging the mood (source "auto", so the daily quota applies). "Worth
   * remembering?" is asked first when there is a judge; the note writer only when it says yes. */
  async capture (subject, exchange, { userName = 'the user', gate = 0.5, complete = null } = {}) {
    const questions = gate > 0 ? [this._worth()] : []
    const answers = this._decides(questions, complete) ? await this._decide(exchange, questions, 'user', userName,
      complete) : {}
    return await this._capture(subject, exchange, userName, Object.hasOwn(answers, WORTH_NAME) ? answers[WORTH_NAME]
      : null, gate, complete || this.complete)
  }

  _worth () {
    return worth(this.prompts.worth)
  }

  /** Whether `_decide` would ask anyone. */
  _decides (questions, complete) {
    return questions.length > 0 && Boolean(this.judge || complete || this.complete)
  }

  /** What the host's judge, or else the chat model (this call's own when it gives one), answers about an exchange. One
   * that fails is counted and answers nothing. */
  async _decide (exchange, questions, source, userName, complete) {
    complete = complete || this.complete
    if (!questions.length || (!this.judge && !complete)) return {}
    const decider = this.judge || new Prompt(complete, { system: this.prompts.judge })
    const framed = exchanges.frame(exchange, { source, userName, companionName: this.companionName,
      prompts: this.prompts })
    let answers
    try {
      answers = await decider.decide(framed, questions)
    } catch (error) {
      this.decisions.failed++
      this.decisions.last_error = py.slice(py.describe(error), 0, 300)
      return {}
    }
    const given = name => answers instanceof Map ? answers.get(name) : isTable(answers) && Object.hasOwn(answers, name)
      ? answers[name] : undefined
    const found = Object.fromEntries(questions.filter(question => given(question.name))
      .map(question => [question.name, given(question.name)]))
    this.decisions.answered += Object.keys(found).length
    this.decisions.abstained += questions.length - Object.keys(found).length
    return found
  }

  async _capture (subject, exchange, userName, worthy, gate, complete) {
    if (worthy !== null && worthy.probability < gate) return []
    exchange = texts.fit(exchanges.asText(exchange), WRITER_INPUT) // a huge exchange: its opening and its end
    const memory = this.memory
    const known = memory.recall(subject, exchange, { log: false }).chosen.map(item => item.note.text)
    const unify = this.meaning ? this.meaning.unify : null
    const today = dates.strftime(memory.clock(), memory.zone, '%Y-%m-%d (%A)')
    const system = writerPrompt(userName, known, today, unify ? unify.language ?? null : null,
      { prompts: this.prompts })
    const reply = await providers.ask(complete, system, exchange)
    const kept = []
    for (const fields of notesIn(reply, memory.clock(), memory.zone)) {
      const note = memory.remember(subject, fields.text, { kind: fields.kind, key: fields.key,
        importance: fields.importance, feeling: fields.feeling, happenedAt: fields.happened_at, gloss: fields.gloss,
        source: 'auto' })
      if (note !== null) kept.push(note)
    }
    if (kept.length && this.meaning) await this.meaning.prepareVectors(kept) // embed now, not at the next recall
    return kept
  }

  /** Rewrite the person's profile card from their most important and newest notes (once a day is plenty); returns the
   * new card. */
  async reflect (subject, { userName = 'the user', limit = 60, complete = null } = {}) {
    const notes = this.memory.leading(subject, limit)
    if (!notes.length) return null
    const system = reflectPrompt(userName, this.companionName, say(this.memory.words, 'reflect.language'), notes,
      { prompts: this.prompts })
    const card = py.strip(await providers.ask(complete || this.complete, system, this.prompts.reflect_now))
    if (card) this.memory.setProfile(subject, card)
    return card || null
  }

  /** Gloss again, in full, the notes that need it (one subject, or all): those with no gloss, and those whose gloss is
   * still their own text in another script; with `everything`, every note in another script. Unlike a recall, this
   * asks as many times as it takes and forgets what failed before. Returns how many glosses were written. */
  async regloss (subject = null, { everything = false, complete = null } = {}) {
    const unify = this.meaning ? this.meaning.unify : null
    if (!unify) return 0
    let written = 0
    for (const who of subject !== null ? [subject] : this.memory.subjects()) {
      const notes = this.memory.notes(who).filter(note => unify.needsTranslation(note.text) &&
        (everything || !note.gloss || note.gloss === note.text))
      unify.forgetFailures(notes.map(note => note.id))
      const pending = notes.map(note => note.with({ gloss: null }))
      const found = await unify.glosses(pending, { complete, calls: pending.length * 2 + 1 })
      this.memory.writeGlosses(found, { replace: true })
      written += found.size
    }
    return written
  }

  /** What the judge has answered, abstained on or failed, and what the meaning tiers did and cost. */
  report () {
    return { decisions: { ...this.decisions }, meaning: this.meaning ? this.meaning.report() : null }
  }

  // ---- moving between projects ---------------------------------------------------------------------------------
  /** This space as plain JSON (mneme-llm's docs/FORMAT.md), its config included. */
  exportData () {
    return { mneme_llm: SCHEMA_VERSION, space: this.space, exported_at: Date.now() / 1000,
      ...this.memory.exportRows(), ...this.mood.exportRows(), ...this.relations.exportRows(),
      ...this.aliases.exportRows(), ...this.people.exportRows(), ...this.episodes.exportRows(),
      ...this.surface.exportRows(), ...this.config.exportRows() }
  }

  /** Add an export to this space, held to the rules of writing; returns how many notes were added. Its links come along
   * (an account this file links to someone else stays so), and what it kept under a linked account joins the person.
   * The export's config (its prompts are instructions to your models) is applied only with `config: true`, and is in
   * use once the file is next opened. */
  importData (data, { config = false } = {}) {
    if (!isTable(data)) throw new TypeError('an export is a JSON object')
    const rows = Object.fromEntries(['memories', 'profiles', 'moods', 'mood_events', 'relationships', 'aliases',
      'people', 'episodes', 'surfaces', 'first_prompts', 'config'].map(name => [name,
      Array.isArray(data[name]) && Object.hasOwn(data, name) ? data[name] : []]))
    return this.store.transaction(() => {
      const added = this.memory.importRows(rows.memories, rows.profiles)
      this.mood.importRows(rows.moods, rows.mood_events)
      this.relations.importRows(rows.relationships)
      this.aliases.importRows(rows.aliases)
      this.episodes.importRows(rows.episodes)
      this.surface.importRows(rows.surfaces, rows.first_prompts)
      for (const [subject, person] of this.people.rowsOf(rows.people)) {
        try {
          this.link(subject, person)
        } catch (error) { // linked to someone else here: this file's link stays
          if (!(error instanceof py.ValueError)) throw error
        }
      }
      for (const [subject, person] of Object.entries(this.people.all())) {
        this._join(subject, person) // what the export kept under a linked account is the person's
      }
      if (config) this.config.importRows(rows.config)
      return added
    })
  }

  close () {
    this.store.close()
  }

  [Symbol.dispose] () {
    this.close()
  }
}

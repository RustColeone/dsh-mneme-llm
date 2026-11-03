// A companion's mood toward each person: one value (0-100) and a few feelings, judged after every exchange. A port of
// mneme_llm/mood.py.
//
//     value       drifts back to `baseline` (70) with a half-life of 3 hours
//     emotions    each fades toward 0 with a half-life of 90 minutes
//     judgement   after an exchange the judge answers two questions (how her mood moved on a -2..+2 scale, and which
//                 feeling was strongest); expected values move the state, so an unsure judge moves it little
//     guardrails  her mood only drops from aching for them, worry or sadness, never from being cross with them;
//                 exchanges that change nothing leave no record; a judgement below `threshold` confidence is recorded
//                 but never told to her
//     telling     `news()` gives the newest change once, for the system prompt; `describe()` any time
//
// Where an exchange came from matters: a person talking to her (`user`), her reaching out on her own (`speak-up`), or
// her doing a scheduled task (`duty`) are judged differently; `runtime` turns are skipped. `weight` (from
// `relations.js`, through `Mneme`) makes a close person's words count more. Decay is computed when read.
import * as dates from './dates.js'
import { Choice, Score } from './decide.js'
import * as exchanges from './exchange.js'
import { LANGUAGES, Speaks, Words, code, has, say } from './i18n.js'
import { Resolves } from './people.js'
import { PROMPTS } from './prompts.js'
import * as py from './python.js'
import { dumps } from './store.js'
import * as texts from './text.js'

const now = () => Date.now() / 1000

/** A feeling the companion can have. The built-in ones are named in `i18n`; a host's own feeling brings its names, by
 * language (`{ en: 'proud', zh: '骄傲' }`). */
export class Emotion {
  constructor (key, { lowers = false, names = {} } = {}) {
    Object.assign(this, { key, lowers, names: { ...names } }) // `lowers`: may this feeling pull her mood down?
    Object.freeze(this)
  }

  label (lang) {
    if (Object.hasOwn(this.names, code(lang))) return this.names[code(lang)]
    const key = `emotion.${this.key}`
    return has(key, lang) ? say(lang, key) : this.names.en ?? this.key
  }

  /** For the judge: the name in English, then in the other languages ("happy (开心)"). */
  description () {
    const labels = [...new Set(LANGUAGES.map(lang => this.label(lang)))]
    return labels.length > 1 ? `${labels[0]} (${labels.slice(1).join(', ')})` : labels[0]
  }
}

export const EMOTIONS = [new Emotion('happy'), new Emotion('calm'), new Emotion('sweet'),
  new Emotion('tender', { lowers: true }), new Emotion('worried', { lowers: true }),
  new Emotion('sad', { lowers: true }), new Emotion('jealous')]
export const FACES = [[80, 'great'], [62, 'good'], [42, 'ok'], [25, 'worry'], [0, 'sad']] // i18n face.<name>
export const LEVELS = new Map([['-2', -2.0], ['-1', -1.0], ['0', 0.0], ['1', 1.0], ['2', 2.0]])

/** How the mood moves: the band and its baseline, the half-lives, the points per level, the threshold of telling,
 * the feelings, and how much each source of an exchange counts. */
export class MoodSettings {
  constructor ({ baseline = 70.0, floor = 0.0, ceiling = 100.0, moodHalfLifeH = 3.0, emotionHalfLifeMin = 90.0,
    step = 6.0, gain = 40.0, threshold = 0.6, tell = 'event', emotions = EMOTIONS,
    weights = { user: 1.0, 'speak-up': 0.7, duty: 0.5 }, skip = ['runtime', 'time'] } = {}) {
    // step: mood points per scale level (+2 → +12 at most per exchange); gain: emotion points for a certain feeling;
    // threshold: below this the change is kept but not told; tell: "event", "mood" (only how she feels) or "off"
    Object.assign(this, { baseline, floor, ceiling, moodHalfLifeH, emotionHalfLifeMin, step, gain, threshold, tell,
      emotions: [...emotions], weights: { ...weights }, skip: new Set(skip) })
    Object.freeze(this)
  }
}

export class MoodState {
  constructor (value, emotions, face, updatedAt) {
    Object.assign(this, { value, emotions, face, updatedAt }) // face: great, good, ok, worry or sad
    Object.freeze(this)
  }

  strongest (count = 2, above = 5.0) {
    const ranked = Object.entries(this.emotions).map((item, index) => [item, index])
      .sort((one, other) => other[0][1] - one[0][1] || one[1] - other[1]).map(([item]) => item)
    return ranked.slice(0, count).filter(([, value]) => value >= above)
  }
}

export class MoodEvent {
  constructor ({ id, at, delta, emotions, reason, confidence, source, judge, value }) {
    Object.assign(this, { id, at, delta, emotions, reason, confidence, source, judge, value })
    Object.freeze(this)
  }
}

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const feelings = text => dumps(text, { floats: true })

export class Mood extends Speaks(Resolves) {
  constructor (store, space, { settings = new MoodSettings(), companionName = 'the assistant', displayLanguage = 'en',
    prompts = PROMPTS, people = null, clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.settings = settings
    this.people = people
    this.words = Words.of(displayLanguage)
    this.prompts = prompts
    this.companionName = companionName
    this.clock = clock
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  state (subject, at = null) {
    at = at === null ? this.clock() : at
    subject = this.who(subject)
    const row = this.store.row('select * from moods where space = ? and subject = ?', [this.space, subject])
    const s = this.settings
    if (row === null) return this._state(s.baseline, {}, null)
    const hours = Math.max(0.0, at - row.updated_at) / 3600
    const value = s.baseline + (row.value - s.baseline) * Math.pow(0.5, hours / s.moodHalfLifeH)
    const fade = Math.pow(0.5, hours * 60 / s.emotionHalfLifeMin)
    const emotions = Object.fromEntries(Object.entries(py.loads(row.emotions)).map(([key, amount]) => [key,
      amount * fade]))
    return this._state(value, emotions, row.updated_at)
  }

  /** How the companion feels now, in one line ("Mood 74/100 (good); feeling: aching for them 31"). */
  describe (subject) {
    const state = this.state(subject)
    const lang = this.words
    const names = new Map(this.settings.emotions.map(e => [e.key, e.label(lang)]))
    const feelings = state.strongest().map(([key, value]) => `${names.get(key) ?? key} ${py.round(value)}`)
      .join(say(lang, 'mood.separator'))
    const line = say(lang, 'mood.line', { value: py.round(state.value), face: say(lang, `face.${state.face}`) })
    return line + (feelings ? say(lang, 'mood.feelings', { feelings }) : '')
  }

  /** The newest confident change, once (null if there is nothing new to tell or telling is off): the mood, what moved
   * it (with `tell: "event"`), and a plain cue of how to feel ("Something worth celebrating: you feel happy."). */
  news (subject, { mark = true } = {}) {
    const s = this.settings
    if (s.tell === 'off') return null
    const event = this.writing(subject, subject => { // read and marked together, so two prompts don't both tell it
      const row = this.store.row('select * from moods where space = ? and subject = ?', [this.space, subject])
      if (row === null || row.last_event === null || row.last_event === row.told_event) return null
      const event = this.store.row('select * from mood_events where id = ?', [row.last_event])
      if (event === null || event.confidence < s.threshold) return null
      if (mark) {
        this.store.execute('update moods set told_event = ? where space = ? and subject = ?', [row.last_event,
          this.space, subject])
      }
      return event
    })
    if (event === null) return null
    const lang = this.words
    let mood = this.describe(subject)
    const cue = this._cue(py.loads(event.emotions || '{}'))
    const reason = s.tell === 'event' ? py.rstrip(event.reason, ' .。!！') : ''
    const key = (reason ? 'mood.news' : 'mood.now') + (cue ? '_cue' : '')
    if (lang.source(key) === 'en') mood = py.slice(mood, 0, 1).toLowerCase() + py.slice(mood, 1)
    return say(lang, key, { mood, reason, cue })
  }

  timeline (subject, limit = 40) {
    return this.store.rows('select * from mood_events where space = ? and subject = ? order by id desc limit ?',
      [this.space, this.who(subject), limit]).map(row => new MoodEvent({ id: row.id, at: row.at, delta: row.delta,
      emotions: py.loads(row.emotions), reason: row.reason, confidence: row.confidence, source: row.source,
      judge: row.judge, value: row.value }))
  }

  // ---- changing --------------------------------------------------------------------------------------------------
  /** What the judge is asked. The wording names nobody: who is who, and who started it, is said in the judged text
   * (`exchange.frame`). */
  questions () {
    const choices = new Map(this.settings.emotions.map(e => [e.key, e.description()]))
    choices.set('none', 'nothing in particular')
    return [
      new Score('mood_change', this.prompts.mood_change, [['-2', 'clearly worse'], ['-1', 'a little worse'],
        ['0', 'no real change'], ['1', 'a little better'], ['2', 'clearly better']]),
      new Choice('feeling', this.prompts.feeling, choices)
    ]
  }

  /** Move the mood from the judge's answers to `questions()` (other answers are ignored). */
  applyAnswers (subject, answers, exchange, { source = 'user', userName = 'the user', weight = 1.0 } = {}) {
    const s = this.settings
    if (s.skip.has(source)) return null
    exchange = exchanges.asText(exchange)
    const change = Object.hasOwn(answers, 'mood_change') ? answers.mood_change : null
    const feeling = Object.hasOwn(answers, 'feeling') ? answers.feeling : null
    if (!change && !feeling) return null
    let reason = (change ? change.reason : '') || (feeling ? feeling.reason : '')
    if (!reason && feeling && feeling.choice !== 'none') reason = this._reason(exchange, source, userName)
    const [confidence, judge] = confidenceOf(change, feeling)
    return this.apply(subject, { delta: change ? change.mean(LEVELS) * s.step : 0.0,
      emotions: this._bumps(feeling), reason, confidence, source, judge, weight })
  }

  /** Move the mood directly (hosts with their own judge use this), under the guardrails above. The change is scaled by
   * `weight` and by the source's weight. */
  apply (subject, { delta = 0.0, emotions = null, reason = '', confidence = 1.0, source = 'manual', judge = 'manual',
    weight = 1.0 } = {}) {
    texts.required(subject, 'subject')
    const s = this.settings
    let given = Object.entries(emotions || {}).filter(([, value]) => py.truthy(value))
      .map(([key, value]) => [key, py.float(value)])
    if (![py.float(delta), py.float(confidence), ...given.map(([, value]) => value)].every(Number.isFinite)) {
      throw new py.ValueError('a mood change, its feelings and its confidence are finite numbers')
    }
    if (!Number.isFinite(py.float(weight)) || weight < 0) {
      throw new py.ValueError('a weight is a finite number, 0 or more')
    }
    weight = (Object.hasOwn(s.weights, source) ? s.weights[source] : 1.0) * weight
    delta *= weight
    given = given.map(([key, value]) => [key, value * weight])
    const lowering = new Set(s.emotions.filter(e => e.lowers).map(e => e.key))
    if (delta < 0) {
      let strongest = null, most = null
      for (const [key, value] of given) if (strongest === null || value > most) [strongest, most] = [key, value]
      if (!lowering.has(strongest)) delta = 0.0
    }
    if (Math.abs(delta) < 0.5 && given.every(([, value]) => value < 1.0)) return null
    const moved = Object.fromEntries(given)
    let at, state, value
    const event = this.writing(subject, subject => { // read and write together, so concurrent judgements lose none
      at = this.clock()
      state = this.state(subject, at)
      value = Math.min(s.ceiling, Math.max(s.floor, state.value + delta))
      const mixed = new Map(Object.entries(state.emotions))
      for (const [key, amount] of given) mixed.set(key, Math.min(100.0, (mixed.get(key) ?? 0.0) + amount))
      const kept = Object.fromEntries([...mixed].filter(([, amount]) => amount >= 0.5)
        .map(([key, amount]) => [key, py.round(amount, 2)]))
      const id = this.store.execute('insert into mood_events (space, subject, at, delta, value, emotions, reason, ' +
        'confidence, source, judge) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [this.space, subject, at,
        py.round(value - state.value, 2), py.round(value, 2), feelings(moved), texts.clip(reason, 200),
        py.round(confidence, 3), source, judge]).lastrowid
      this.store.execute('insert into moods (space, subject, value, emotions, updated_at, last_event) values (?, ?, ' +
        '?, ?, ?, ?) on conflict(space, subject) do update set value = excluded.value, emotions = ' +
        'excluded.emotions, updated_at = excluded.updated_at, last_event = excluded.last_event', [this.space, subject,
        value, feelings(kept), at, id])
      return id
    })
    return new MoodEvent({ id: event, at, delta: value - state.value, emotions: moved, reason, confidence, source,
      judge, value })
  }

  /** Back to baseline with no feelings and an empty timeline. */
  reset (subject) {
    this.writing(subject, subject => {
      this.store.execute('delete from moods where space = ? and subject = ?', [this.space, subject])
      this.store.execute('delete from mood_events where space = ? and subject = ?', [this.space, subject])
    })
  }

  /** `old` is the person `fresh` now (`People.link`): the timelines become one, and of two moods the newer is kept,
   * with what it has told. */
  join (old, fresh) {
    this.store.transaction(() => {
      const rows = new Map(this.store.rows('select * from moods where space = ? and subject in (?, ?)',
        [this.space, old, fresh]).map(row => [row.subject, row]))
      this.store.execute('update mood_events set subject = ? where space = ? and subject = ?', [fresh, this.space, old])
      if (rows.has(old) && (!rows.has(fresh) || rows.get(old).updated_at > rows.get(fresh).updated_at)) {
        const row = rows.get(old)
        this.store.execute('insert or replace into moods (space, subject, value, emotions, updated_at, last_event, ' +
          'told_event) values (?, ?, ?, ?, ?, ?, ?)', [this.space, fresh, row.value, row.emotions, row.updated_at,
          row.last_event, row.told_event])
      }
      this.store.execute('delete from moods where space = ? and subject = ?', [this.space, old])
    })
  }

  // ---- moving between files --------------------------------------------------------------------------------------
  exportRows () {
    const table = name => this.store.rows(`select * from ${name} where space = ? order by rowid`, [this.space])
    return { moods: table('moods'), mood_events: table('mood_events') }
  }

  /** Add exported moods and timelines to this space, held to the mood's rules: values within the floor and ceiling,
   * feelings as intensities 0-100, times in seconds; a row without a subject is skipped, and so is an event the
   * timeline already has. A mood comes without its links to events (nothing new is told). */
  importRows (moods = [], events = []) {
    const s = this.settings, at = this.clock()
    this.store.transaction(() => {
      for (const row of moods) {
        const subject = subjectOf(row)
        if (subject === null) continue
        this.store.execute('insert or replace into moods (space, subject, value, emotions, updated_at, last_event, ' +
          'told_event) values (?, ?, ?, ?, ?, null, null)', [this.space, subject, texts.number(row.value ?? null,
          s.baseline, s.floor, s.ceiling), feelings(feelingsOf(row.emotions ?? null)),
        momentOf(row.updated_at ?? null, at)])
      }
      const columns = 'space, subject, at, delta, value, emotions, reason, confidence, source, judge'
      for (const row of events) {
        const subject = subjectOf(row)
        if (subject === null) continue
        const event = [this.space, subject, momentOf(row.at ?? null, at), texts.number(row.delta ?? null, 0.0, -100,
          100), texts.number(row.value ?? null, s.baseline, s.floor, s.ceiling),
        feelings(feelingsOf(row.emotions ?? null)), typeof row.reason === 'string' ? texts.clip(row.reason, 200) : '',
        texts.number(row.confidence ?? null, 0.0, 0.0, 1.0), wordOf(row.source ?? null, 'import'),
        wordOf(row.judge ?? null, 'import')]
        if (this.store.row(`select 1 from mood_events where (${columns}) = (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          event) === null) {
          this.store.execute(`insert into mood_events (${columns}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, event)
        }
      }
    })
  }

  // ---- inside ----------------------------------------------------------------------------------------------------
  _state (value, emotions, updatedAt) {
    for (const [floor, face] of FACES) {
      if (py.round(value) >= floor) return new MoodState(value, emotions, face, updatedAt)
    }
    return new MoodState(value, emotions, FACES.at(-1)[1], updatedAt)
  }

  _bumps (feeling) {
    if (!feeling) return {}
    const known = new Set(this.settings.emotions.map(e => e.key))
    return Object.fromEntries([...feeling.probabilities].filter(([key, p]) => known.has(key) && p >= 0.15)
      .map(([key, p]) => [key, this.settings.gain * p]))
  }

  /** What moved the mood, when the judge gave no reason: the person's last words (one line, quoted, at most 40
   * characters), or that the companion reached out. The feeling itself is said by the cue. */
  _reason (exchange, source, userName) {
    const lang = this.words
    if (source === 'speak-up') return say(lang, 'mood.reason_reached', { user: userName })
    for (const line of py.splitlines(exchange).reverse()) {
      if (line.startsWith(`${userName}:`)) {
        const said = texts.clip(py.strip(line.slice(line.indexOf(':') + 1)), 40) // one quoted line, never more
        return said ? say(lang, 'mood.reason', { user: userName, said }) : ''
      }
    }
    return ''
  }

  /** How to feel about a change: its strongest feeling, said plainly (a host's own feeling: "You feel …"). */
  _cue (emotions) {
    const entries = Object.entries(emotions)
    if (!entries.length) return ''
    let key = null, most = null
    for (const [name, value] of entries) if (key === null || value > most) [key, most] = [name, value]
    const lang = this.words
    if (has(`cue.${key}`, lang)) return say(lang, `cue.${key}`)
    const emotion = this.settings.emotions.find(e => e.key === key)
    return say(lang, 'cue.other', { feeling: emotion ? emotion.label(lang) : key })
  }
}

const subjectOf = row => isTable(row) && typeof row.subject === 'string' && py.strip(row.subject) ? row.subject : null

function momentOf (value, fallback) {
  const found = dates.seconds(value)
  return found === null ? fallback : found
}

const wordOf = (value, fallback) => typeof value === 'string' ? texts.clip(value, 40) || fallback : fallback

/** Feelings as stored: a JSON object (or a table) of intensities, each kept within 0-100. */
function feelingsOf (value) {
  if (typeof value === 'string') {
    try {
      value = py.loads(value)
    } catch (error) {
      if (!(error instanceof py.ValueError || error instanceof RangeError)) throw error
      value = {}
    }
  }
  if (!isTable(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [py.slice(key, 0, 40),
    texts.number(amount, 0.0, 0.0, 100.0)]).filter(([, amount]) => amount > 0))
}

/** How sure the judge was, and who said so: the feeling's when there is one, else the change's. */
function confidenceOf (change, feeling) {
  if (feeling && feeling.choice !== 'none') return [feeling.confidence, feeling.by]
  return change ? [change.confidence, change.by] : [0.0, '']
}

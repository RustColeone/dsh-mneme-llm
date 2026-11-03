// Tier 2 of meaning: one language for all notes, written by your own chat model.
//
// Notes are kept in whatever language they were written in, and people ask in theirs. This tier has the chat model
// write each note once more in one language of your choice (English by default), stored beside the original as its
// `gloss`; and when a query is written in another script, it translates the query first. Word matching then runs on
// both, so "我的猫" finds "Has a cat named 年糕". Translated queries are remembered for the session.
import { fill } from '../i18n.js'
import { PROMPTS } from '../prompts.js'
import { Rest, ask, jsonIn } from '../providers.js'
import * as py from '../python.js'
import * as texts from '../text.js'

// The script each language is written in, as `text.scripts` names it; a language not listed is taken as Latin.
export const SCRIPTS = {
  han: ['chinese', 'mandarin', 'cantonese', '中文', '汉语', '漢語', '普通话', '粤语'],
  kana: ['japanese', '日本語'],
  hangul: ['korean', '한국어'],
  cyrillic: ['russian', 'ukrainian', 'bulgarian', 'serbian', 'belarusian', 'kazakh', 'kyrgyz', 'macedonian',
    'mongolian', 'tajik', 'русский', 'українська'],
  greek: ['greek', 'ελληνικά'],
  armenian: ['armenian', 'հայերեն'],
  georgian: ['georgian', 'ქართული'],
  hebrew: ['hebrew', 'yiddish', 'עברית'],
  arabic: ['arabic', 'persian', 'farsi', 'dari', 'urdu', 'pashto', 'kurdish', 'uyghur', 'العربية', 'فارسی', 'اردو'],
  thaana: ['dhivehi'],
  ethiopic: ['amharic', 'tigrinya', 'አማርኛ'],
  devanagari: ['hindi', 'marathi', 'nepali', 'sanskrit', 'हिन्दी', 'मराठी'],
  bengali: ['bengali', 'bangla', 'assamese', 'বাংলা'],
  gurmukhi: ['punjabi', 'ਪੰਜਾਬੀ'],
  gujarati: ['gujarati', 'ગુજરાતી'],
  oriya: ['odia', 'oriya', 'ଓଡ଼ିଆ'],
  tamil: ['tamil', 'தமிழ்'],
  telugu: ['telugu', 'తెలుగు'],
  kannada: ['kannada', 'ಕನ್ನಡ'],
  malayalam: ['malayalam', 'മലയാളം'],
  sinhala: ['sinhala', 'sinhalese', 'සිංහල'],
  thai: ['thai', 'ไทย'],
  lao: ['lao', 'ລາວ'],
  khmer: ['khmer', 'cambodian', 'ខ្មែរ'],
  myanmar: ['burmese', 'myanmar', 'မြန်မာ'],
  tibetan: ['tibetan', 'བོད་ཡིག']
}
export const LANGUAGE_SCRIPTS = new Map(Object.entries(SCRIPTS).flatMap(([script, languages]) =>
  languages.map(language => [language, script])))
export const MIXED = 0.2 // a text with at least this share of letters in other scripts is translated

/** The chat model answered a batch of notes with the wrong number of glosses (or with no list at all). */
export class Miscounted extends py.ValueError {
  constructor (message) { super(message); this.name = 'Miscounted' }
}

export class Unify {
  constructor (complete, language = 'English', { cache = 256, prompts = PROMPTS } = {}) {
    this.name = 'unify'
    this.complete = complete
    this.language = language
    this.size = cache
    this.prompts = prompts
    this.script = LANGUAGE_SCRIPTS.get(py.strip(language).toLowerCase()) ?? 'latin'
    this.rest = new Rest()
    this.calls = 0
    this.answered = 0 // requests that came back right: a note's failures count only while others succeed
    this._cache = new Map()
    this._caps = new Map() // note id → the largest batch it is asked in, after a batch failed
    this._strikes = new Map() // note id → [failures alone, `answered`, when]
  }

  /** Whether this tier can be asked now: there is a chat model (given at start or for this call), and it is not
   * resting. Without a model it is simply not asked; that is no failure. */
  ready (complete = null) {
    return Boolean(complete || this.complete) && this.rest.up()
  }

  /** Whether at least a fifth of the text's letters are in another script than the unifying language's. */
  needsTranslation (text) {
    const shares = texts.scripts(text)
    return Object.keys(shares).length > 0 && 1 - (shares[this.script] ?? 0.0) >= MIXED
  }

  async _ask (system, user, complete) {
    this.calls++
    return py.strip(await ask(complete || this.complete, system, user))
  }

  /** Each note in the unifying language, in one request (a note already in it is kept as it is). */
  async gloss (notes, { complete = null } = {}) {
    const glosses = notes.map(note => this.needsTranslation(note) ? '' : note)
    const todo = glosses.flatMap((gloss, index) => gloss ? [] : [index])
    if (todo.length) {
      const listing = todo.map((index, number) => `${number + 1}. ${notes[index]}`).join('\n')
      const system = fill(this.prompts.gloss, { language: this.language })
      const items = jsonIn(await this._ask(system, listing, complete), '[')
      if (!Array.isArray(items) || items.length !== todo.length) {
        throw new Miscounted(`expected ${todo.length} glosses, got ${Array.isArray(items) ? items.length : 0}`)
      }
      todo.forEach((index, at) => { // an empty or missing gloss keeps the note itself
        const gloss = typeof items[at] === 'string' ? texts.clip(items[at], 500) : ''
        glosses[index] = gloss || notes[index]
      })
    }
    return glosses
  }

  /** Glosses for the notes that have none, by note id (a Map): the most important and newest first, in at most `calls`
   * requests. A batch that fails is split in half, and its notes are asked in the smaller batches from then on, so a
   * note the model won't gloss is soon asked alone; alone, a wrong answer, or a third error, leaves it its own text.
   * An error also rests this tier. */
  async glosses (notes, { complete = null, calls = 2 } = {}) {
    const missing = notes.filter(note => !note.gloss)
      .sort((one, other) => other.importance - one.importance || other.createdAt - one.createdAt)
    const cap = note => this._caps.get(note.id) ?? GLOSS_BATCH
    const queue = []
    for (const note of missing) { // no batch larger than one of its notes allows
      if (queue.length && queue.at(-1).length < Math.min(...[...queue.at(-1), note].map(cap))) queue.at(-1).push(note)
      else queue.push([note])
    }
    const written = new Map()
    while (queue.length && calls > 0 && this.ready(complete)) {
      const batch = queue.shift()
      calls--
      let found
      try {
        found = await this.gloss(batch.map(note => note.text), { complete })
        this.answered++
      } catch (error) {
        if (!(error instanceof Miscounted)) this.rest.failed(error)
        if (batch.length > 1) {
          const half = Math.floor(batch.length / 2)
          for (const note of batch) this._caps.set(note.id, half)
          queue.unshift(batch.slice(0, half), batch.slice(half))
          continue
        }
        if (!(error instanceof Miscounted) && this._strike(batch[0].id) < 3) continue
        found = [batch[0].text] // a note it can't gloss keeps its own text, and isn't asked again
      }
      batch.forEach((note, index) => {
        if (index >= found.length) return
        written.set(note.id, found[index])
        this._caps.delete(note.id)
        this._strikes.delete(note.id)
      })
    }
    return written
  }

  /** Ask these notes again from scratch (`Mneme.regloss`): their batch limits and failures are dropped. */
  forgetFailures (ids) {
    for (const id of ids) {
      this._caps.delete(id)
      this._strikes.delete(id)
    }
  }

  /** One more failure of this note asked alone: counted when the tier answered something since the last one, or when
   * the last one was long enough ago. */
  _strike (id) {
    let [count, seen, at] = this._strikes.get(id) ?? [0, -1, 0.0]
    const now = performance.now() / 1000
    if (seen !== this.answered || now - at >= STRIKE_GAP_S) [count, seen, at] = [count + 1, this.answered, now]
    this._strikes.set(id, [count, seen, at])
    return count
  }

  async translate (query, { complete = null } = {}) {
    const key = py.strip(query)
    if (this._cache.has(key)) {
      const known = this._cache.get(key)
      this._cache.delete(key)
      this._cache.set(key, known)
      return known
    }
    const system = fill(this.prompts.translate, { language: this.language })
    const translated = texts.clip(await this._ask(system, key, complete), 1000)
    this._cache.set(key, translated)
    while (this._cache.size > this.size) this._cache.delete(this._cache.keys().next().value)
    return translated
  }

  report () {
    return { language: this.language, calls: this.calls }
  }
}

export const GLOSS_BATCH = 16 // notes per gloss request
export const STRIKE_GAP_S = 600.0 // a note's failures alone count this far apart when nothing else succeeds meanwhile
Unify.GLOSS_BATCH = GLOSS_BATCH
Unify.STRIKE_GAP_S = STRIKE_GAP_S

// What the note writer and the profile writer are asked, and how their replies are read. A port of
// mneme_llm/capture.py.
//
// After an exchange, `Mneme.observe` (or `capture`) asks the judge a cheap yes/no first (`worth`: did they share
// anything worth remembering?), so the note writer is only called when there is something to write. This module only
// builds the prompts and reads the replies; `Mneme` makes the calls.
import * as dates from './dates.js'
import { Predicate } from './decide.js'
import { fill } from './i18n.js'
import { noteFields } from './memory.js'
import { PROMPTS } from './prompts.js'
import { jsonIn } from './providers.js'

export const WORTH_NAME = 'worth_remembering'

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const get = (item, name, fallback) => Object.hasOwn(item, name) ? item[name] : fallback

/** The yes/no question asked before the note writer: did they share anything worth remembering? */
export const worth = (instructions = PROMPTS.worth) => new Predicate(WORTH_NAME, instructions)

/** The note writer's system prompt (`prompts.note_writer`); the exchange itself is the user message. */
export function writerPrompt (userName, known, today, glossLanguage = null, { prompts = PROMPTS } = {}) {
  const gloss = glossLanguage ? fill(prompts.note_gloss, { language: glossLanguage }) : ''
  return fill(prompts.note_writer, { user: userName, known: known.map(text => `- ${text}`).join('\n') || '-', gloss,
    today })
}

/** The writer's reply as note fields for `Memory.keep` (at most three), each held to the rules of writing: a field of
 * the wrong type is dropped, an item without text is skipped. A plan's day comes from its `date`, or else from a day
 * written in its sentence, the first such day from today on. */
export function notesIn (reply, now, zone) {
  const items = jsonIn(reply, '[')
  const found = []
  for (const item of Array.isArray(items) ? items.slice(0, 3) : []) {
    if (!isTable(item)) continue
    const kind = get(item, 'kind', null)
    let happened = typeof item.date === 'string' && Object.hasOwn(item, 'date') ? dates.noon(item.date, zone) : null
    if (happened === null && kind === 'plan' && typeof get(item, 'text', null) === 'string') {
      happened = dates.find(item.text, now, zone, { ahead: true }) // writers often put the day in the sentence
    }
    const fields = noteFields(get(item, 'text', null), { kind, key: get(item, 'key', null),
      importance: get(item, 'importance', 2), feeling: get(item, 'feeling', 0.0), happenedAt: happened,
      gloss: get(item, 'gloss', null), strict: false })
    if (fields !== null) found.push(fields)
  }
  return found
}

/** The profile writer's system prompt (`prompts.reflect`), over the most important and newest notes. */
export function reflectPrompt (userName, companionName, language, notes, { prompts = PROMPTS } = {}) {
  const listing = notes.map(note => `- (${note.kind}) ${note.text}`).join('\n')
  return fill(prompts.reflect, { user: userName, name: companionName, lang: language, notes: listing })
}

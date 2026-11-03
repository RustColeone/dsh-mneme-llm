// An exchange (one turn of a conversation) as the judges and the note writer read it. A port of
// mneme_llm/exchange.py.
import { fill } from './i18n.js'
import { PROMPTS } from './prompts.js'
import * as py from './python.js'

/** An exchange as `[who, said]` pairs: a string is one line by nobody in particular; a list of pairs or of chat
 * messages (`{role or name, content}`) is one line each. */
export function asLines (exchange) {
  if (typeof exchange === 'string') return [['', exchange]]
  if (exchange === null || exchange === undefined || exchange instanceof Uint8Array || typeof exchange !== 'object' ||
      typeof exchange[Symbol.iterator] !== 'function') {
    throw new TypeError('an exchange is a string, or a list of [who, said] pairs or of chat messages')
  }
  const lines = []
  for (const item of exchange) {
    let who, said
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      who = py.truthy(item.name) ? item.name : py.truthy(item.role) ? item.role : ''
      said = item.content
      if (Array.isArray(said)) { // content given as parts: keep the text ones
        said = said.filter(part => part !== null && typeof part === 'object' && !Array.isArray(part))
          .map(part => part.text ?? '').join(' ')
      }
    } else {
      [who, said] = item
    }
    lines.push([py.truthy(who) ? py.str(who) : '', said === null || said === undefined ? '' : py.str(said)])
  }
  return lines
}

export const textOf = lines => lines.map(([who, said]) => who ? `${who}: ${said}` : said).join('\n')

/** An exchange as one text: a string as it is, or a list of pairs or of chat messages, one line each. */
export const asText = exchange => typeof exchange === 'string' ? exchange : textOf(asLines(exchange))

/** What a judge reads: who is who and who started it, then the exchange. The questions name nobody; the names are
 * said here instead. */
export function frame (exchange, { source = 'user', userName = 'the user', companionName = 'the assistant',
  prompts = PROMPTS } = {}) {
  const names = { user: userName, assistant: companionName }
  const started = { user: 'started_user', 'speak-up': 'started_speak_up', duty: 'started_duty' }[source]
  const said = started ? fill(prompts[started], names) : ''
  return fill(prompts.frame, { started: said, ...names }) + '\n' + asText(exchange)
}

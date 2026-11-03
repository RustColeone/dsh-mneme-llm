// What reaching a model or a service takes: calling the host's function (sync or async), posting JSON to an API,
// reading JSON out of a model's reply, and resting a provider that just failed. A port of mneme_llm/providers.py.
//
// One policy for failures, used by the meaning tiers: a provider that fails, for whatever reason, is skipped for
// `Rest.seconds` (60) instead of being waited on at every call. A judge is never rested: nothing else can answer in
// its place.
import * as py from './python.js'

/** A tier cannot answer right now (no key, no network, not configured). */
export class Unavailable extends Error {
  constructor (message) { super(message); this.name = 'Unavailable' }
}

/** `fn(...args)`, awaited if it gives a promise. */
export async function call (fn, ...args) {
  return await fn(...args)
}

/** The host's chat model's reply, as text. */
export async function ask (complete, system, user) {
  if (!complete) throw new Unavailable('no chat model (`complete`) was given')
  const reply = await call(complete, system, user)
  return py.truthy(reply) ? py.str(reply) : ''
}

/** POST `body` as JSON with a bearer key; any failure becomes `Unavailable` saying what failed. */
export async function postJson (url, apiKey, body, { timeout, what, fetch = globalThis.fetch }) {
  let response
  try {
    response = await fetch(url, { method: 'POST', body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout * 1000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } })
  } catch (error) {
    throw new Unavailable(`${what} unreachable: ${error?.message ?? error}`)
  }
  let text
  try {
    text = await response.text()
  } catch (error) {
    throw new Unavailable(`${what} unreachable: ${error?.message ?? error}`)
  }
  if (!response.ok) throw new Unavailable(`${what} answered ${response.status}: ${py.slice(text, 0, 300)}`)
  try {
    return py.loads(text)
  } catch (error) {
    throw new Unavailable(`${what} unreachable: ${error.message}`)
  }
}

/** The first JSON list (`opener` "[") or object ("{") in a model's reply, or null when there is none that parses
 * (prose around it is ignored; a document nested too deep counts as none). `floats`: as `python.loads`. */
export function jsonIn (reply, opener = '[', { floats = false } = {}) {
  const found = (reply || '').match(opener === '[' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/)
  if (!found) return null
  try {
    return py.loads(found[0], { floats })
  } catch (error) {
    if (error instanceof py.ValueError || error instanceof RangeError) return null
    throw error
  }
}

/** Skips a provider for `seconds` after a failure (see the policy above), and remembers the last one. */
export class Rest {
  constructor (seconds = 60.0) {
    this.seconds = seconds
    this.until = 0.0
    this.error = ''
  }

  up () {
    return performance.now() / 1000 >= this.until
  }

  failed (error) {
    this.error = py.slice(py.describe(error), 0, 200)
    this.until = performance.now() / 1000 + this.seconds
  }
}

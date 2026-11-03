// TOML as Python's tomllib reads it (TOML 1.0), for the config files mneme-llm reads: the same tables, numbers and
// strings, and a file tomllib refuses is refused here, with the same words. A port of tomllib's parser; and the
// writer of mneme-llm's config files (`toToml`, Python's config.to_toml).
//
// Dates and times are read into a `TomlDate` (no mneme-llm setting takes one).
import fs from 'node:fs'
import * as py from './python.js'

/** A document tomllib would refuse (a ValueError, as Python's TOMLDecodeError is one). */
export class TOMLDecodeError extends py.ValueError {
  constructor (message) { super(message); this.name = 'TOMLDecodeError' }
}

/** A date, a time or a date-time, as written. */
export class TomlDate {
  constructor (text) { this.text = text }
  repr () { return this.text }
}

const ASCII_CTRL = new Set([...Array(32).keys(), 127].map(code => String.fromCharCode(code)))
const without = (set, chars) => new Set([...set].filter(character => !chars.includes(character)))
const ILLEGAL_BASIC = without(ASCII_CTRL, '\t')
const ILLEGAL_MULTILINE_BASIC = without(ASCII_CTRL, '\t\n')
const ILLEGAL_COMMENT = ILLEGAL_BASIC
const WS = new Set(' \t')
const WS_AND_NEWLINE = new Set(' \t\n')
const BARE_KEY = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_')
const KEY_INITIAL = new Set([...BARE_KEY, '"', "'"])
const HEX = new Set('0123456789abcdefABCDEF')
const ESCAPES = { '\\b': '\b', '\\t': '\t', '\\n': '\n', '\\f': '\f', '\\r': '\r', '\\"': '"', '\\\\': '\\' }

const TIME = '([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(?:\\.([0-9]{1,6})[0-9]*)?'
const NUMBER = new RegExp('0(?:x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*|b[01](?:_?[01])*|o[0-7](?:_?[0-7])*)' +
  '|[+-]?(?:0|[1-9](?:_?[0-9])*)((?:\\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?)', 'y')
const LOCALTIME = new RegExp(TIME, 'y')
const DATETIME = new RegExp(`([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(?:[Tt ]${TIME}` +
  '(?:([Zz])|([+-])([01][0-9]|2[0-3]):([0-5][0-9]))?)?', 'y')

/** A key as Python writes a tuple of strings: ('a', 'b'), or ('a',). */
const keyRepr = key => `(${key.map(part => py.reprString(part)).join(', ')}${key.length === 1 ? ',' : ''})`

function put (table, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(table, key, { value, writable: true, enumerable: true, configurable: true })
  } else table[key] = value
}

/** A source of code points, read as tomllib reads its str. */
class Source {
  constructor (text) {
    this.chars = Array.from(text.replaceAll('\r\n', '\n'))
    this.text = this.chars.join('')
    this.length = this.chars.length
    this._units = null
  }

  at (pos) {
    return this.chars[pos]
  }

  startsWith (expect, pos) {
    const want = Array.from(expect)
    return want.every((character, index) => this.chars[pos + index] === character)
  }

  indexOf (expect, pos) {
    const want = Array.from(expect)
    for (let at = pos; at + want.length <= this.length; at++) {
      if (want.every((character, index) => this.chars[at + index] === character)) return at
    }
    return -1
  }

  slice (start, end) {
    return this.chars.slice(start, end).join('')
  }

  /** A sticky regular expression matched at a code point position: [match, end position] or null. */
  match (pattern, pos) {
    if (this._units === null) { // (code point position → UTF-16 position)
      this._units = [0]
      for (const character of this.chars) this._units.push(this._units.at(-1) + character.length)
    }
    pattern.lastIndex = this._units[pos]
    const found = pattern.exec(this.text)
    if (!found) return null
    let end = pos
    while (this._units[end] < pattern.lastIndex) end++
    return [found, end]
  }

  error (pos, message) {
    let where = 'end of document'
    if (pos < this.length) {
      let line = 1, lastBreak = -1
      for (let index = 0; index < pos; index++) {
        if (this.chars[index] === '\n') {
          line++
          lastBreak = index
        }
      }
      where = `line ${line}, column ${line === 1 ? pos + 1 : pos - lastBreak}`
    }
    return new TOMLDecodeError(`${message} (at ${where})`)
  }
}

const FROZEN = 0, EXPLICIT_NEST = 1

class Flags {
  constructor () {
    this._flags = new Map()
    this._pending = []
  }

  addPending (key, flag) {
    this._pending.push([key, flag])
  }

  finalizePending () {
    for (const [key, flag] of this._pending) this.set(key, flag, false)
    this._pending = []
  }

  unsetAll (key) {
    let cont = this._flags
    for (const part of key.slice(0, -1)) {
      if (!cont.has(part)) return
      cont = cont.get(part).nested
    }
    cont.delete(key.at(-1))
  }

  set (key, flag, recursive) {
    let cont = this._flags
    for (const part of key.slice(0, -1)) {
      if (!cont.has(part)) cont.set(part, { flags: new Set(), recursive: new Set(), nested: new Map() })
      cont = cont.get(part).nested
    }
    const stem = key.at(-1)
    if (!cont.has(stem)) cont.set(stem, { flags: new Set(), recursive: new Set(), nested: new Map() })
    cont.get(stem)[recursive ? 'recursive' : 'flags'].add(flag)
  }

  is (key, flag) {
    if (!key.length) return false // the document root has no flags
    let cont = this._flags
    for (const part of key.slice(0, -1)) {
      if (!cont.has(part)) return false
      const inner = cont.get(part)
      if (inner.recursive.has(flag)) return true
      cont = inner.nested
    }
    const stem = key.at(-1)
    if (!cont.has(stem)) return false
    const found = cont.get(stem)
    return found.flags.has(flag) || found.recursive.has(flag)
  }
}

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  !(value instanceof TomlDate)

class NoNest extends Error {}

class Nested {
  constructor () {
    this.dict = {}
  }

  getOrCreateNest (key, accessLists = true) {
    let cont = this.dict
    for (const part of key) {
      if (!Object.hasOwn(cont, part)) put(cont, part, {})
      cont = cont[part]
      if (accessLists && Array.isArray(cont)) cont = cont.at(-1)
      if (!isTable(cont)) throw new NoNest('There is no nest behind this key')
    }
    return cont
  }

  appendNestToList (key) {
    const cont = this.getOrCreateNest(key.slice(0, -1))
    const last = key.at(-1)
    if (Object.hasOwn(cont, last)) {
      if (!Array.isArray(cont[last])) throw new NoNest('An object other than list found behind this key')
      cont[last].push({})
    } else put(cont, last, [{}])
  }
}

function skipChars (src, pos, chars) {
  while (pos < src.length && chars.has(src.at(pos))) pos++
  return pos
}

function skipUntil (src, pos, expect, errorOn, errorOnEof) {
  let next = src.indexOf(expect, pos)
  if (next < 0) {
    next = src.length
    if (errorOnEof) throw src.error(next, `Expected ${py.reprString(expect)}`)
  }
  for (let at = pos; at < next; at++) {
    if (errorOn.has(src.at(at))) throw src.error(at, `Found invalid character ${py.reprString(src.at(at))}`)
  }
  return next
}

function skipComment (src, pos) {
  if (src.at(pos) === '#') return skipUntil(src, pos + 1, '\n', ILLEGAL_COMMENT, false)
  return pos
}

function skipCommentsAndArrayWs (src, pos) {
  for (;;) {
    const before = pos
    pos = skipComment(src, skipChars(src, pos, WS_AND_NEWLINE))
    if (pos === before) return pos
  }
}

function createDictRule (src, pos, out) {
  pos = skipChars(src, pos + 1, WS)
  let key
  ;[pos, key] = parseKey(src, pos)
  if (out.flags.is(key, EXPLICIT_NEST) || out.flags.is(key, FROZEN)) {
    throw src.error(pos, `Cannot declare ${keyRepr(key)} twice`)
  }
  out.flags.set(key, EXPLICIT_NEST, false)
  try {
    out.data.getOrCreateNest(key)
  } catch (error) {
    if (error instanceof NoNest) throw src.error(pos, 'Cannot overwrite a value')
    throw error
  }
  if (!src.startsWith(']', pos)) throw src.error(pos, "Expected ']' at the end of a table declaration")
  return [pos + 1, key]
}

function createListRule (src, pos, out) {
  pos = skipChars(src, pos + 2, WS)
  let key
  ;[pos, key] = parseKey(src, pos)
  if (out.flags.is(key, FROZEN)) throw src.error(pos, `Cannot mutate immutable namespace ${keyRepr(key)}`)
  out.flags.unsetAll(key) // free the namespace now that it points to another empty list item...
  out.flags.set(key, EXPLICIT_NEST, false) // ...but this key precisely is still prohibited from table declaration
  try {
    out.data.appendNestToList(key)
  } catch (error) {
    if (error instanceof NoNest) throw src.error(pos, 'Cannot overwrite a value')
    throw error
  }
  if (!src.startsWith(']]', pos)) throw src.error(pos, "Expected ']]' at the end of an array declaration")
  return [pos + 2, key]
}

function keyValueRule (src, pos, out, header) {
  let key, value
  ;[pos, key, value] = parseKeyValuePair(src, pos)
  const parent = key.slice(0, -1), stem = key.at(-1)
  const absolute = [...header, ...parent]
  for (let i = 1; i < key.length; i++) {
    const contKey = [...header, ...key.slice(0, i)]
    if (out.flags.is(contKey, EXPLICIT_NEST)) throw src.error(pos, `Cannot redefine namespace ${keyRepr(contKey)}`)
    out.flags.addPending(contKey, EXPLICIT_NEST)
  }
  if (out.flags.is(absolute, FROZEN)) throw src.error(pos, `Cannot mutate immutable namespace ${keyRepr(absolute)}`)
  let nest
  try {
    nest = out.data.getOrCreateNest(absolute)
  } catch (error) {
    if (error instanceof NoNest) throw src.error(pos, 'Cannot overwrite a value')
    throw error
  }
  if (Object.hasOwn(nest, stem)) throw src.error(pos, 'Cannot overwrite a value')
  if (isTable(value) || Array.isArray(value)) out.flags.set([...header, ...key], FROZEN, true)
  put(nest, stem, value)
  return pos
}

function parseKeyValuePair (src, pos) {
  let key, value
  ;[pos, key] = parseKey(src, pos)
  if (src.at(pos) !== '=') throw src.error(pos, "Expected '=' after a key in a key/value pair")
  pos = skipChars(src, pos + 1, WS)
  ;[pos, value] = parseValue(src, pos)
  return [pos, key, value]
}

function parseKey (src, pos) {
  let part
  ;[pos, part] = parseKeyPart(src, pos)
  const key = [part]
  pos = skipChars(src, pos, WS)
  while (src.at(pos) === '.') {
    pos = skipChars(src, pos + 1, WS)
    ;[pos, part] = parseKeyPart(src, pos)
    key.push(part)
    pos = skipChars(src, pos, WS)
  }
  return [pos, key]
}

function parseKeyPart (src, pos) {
  const character = src.at(pos)
  if (BARE_KEY.has(character)) {
    const start = pos
    pos = skipChars(src, pos, BARE_KEY)
    return [pos, src.slice(start, pos)]
  }
  if (character === "'") return parseLiteralStr(src, pos)
  if (character === '"') return parseBasicStr(src, pos + 1, false)
  throw src.error(pos, 'Invalid initial character for a key part')
}

function parseArray (src, pos) {
  const array = []
  pos = skipCommentsAndArrayWs(src, pos + 1)
  if (src.startsWith(']', pos)) return [pos + 1, array]
  for (;;) {
    let value
    ;[pos, value] = parseValue(src, pos)
    array.push(value)
    pos = skipCommentsAndArrayWs(src, pos)
    const character = src.at(pos)
    if (character === ']') return [pos + 1, array]
    if (character !== ',') throw src.error(pos, 'Unclosed array')
    pos = skipCommentsAndArrayWs(src, pos + 1)
    if (src.startsWith(']', pos)) return [pos + 1, array]
  }
}

function parseInlineTable (src, pos) {
  const nested = new Nested(), flags = new Flags()
  pos = skipChars(src, pos + 1, WS)
  if (src.startsWith('}', pos)) return [pos + 1, nested.dict]
  for (;;) {
    let key, value
    ;[pos, key, value] = parseKeyValuePair(src, pos)
    const parent = key.slice(0, -1), stem = key.at(-1)
    if (flags.is(key, FROZEN)) throw src.error(pos, `Cannot mutate immutable namespace ${keyRepr(key)}`)
    let nest
    try {
      nest = nested.getOrCreateNest(parent, false)
    } catch (error) {
      if (error instanceof NoNest) throw src.error(pos, 'Cannot overwrite a value')
      throw error
    }
    if (Object.hasOwn(nest, stem)) throw src.error(pos, `Duplicate inline table key ${py.reprString(stem)}`)
    put(nest, stem, value)
    pos = skipChars(src, pos, WS)
    const character = src.at(pos)
    if (character === '}') return [pos + 1, nested.dict]
    if (character !== ',') throw src.error(pos, 'Unclosed inline table')
    if (isTable(value) || Array.isArray(value)) flags.set(key, FROZEN, true)
    pos = skipChars(src, pos + 1, WS)
  }
}

function parseBasicStrEscape (src, pos, multiline) {
  const escape = src.slice(pos, pos + 2)
  pos += 2
  if (multiline && (escape === '\\ ' || escape === '\\\t' || escape === '\\\n')) {
    // Skip whitespace until the next non-whitespace character or the end of the document; an error if anything else
    // comes before a newline.
    if (escape !== '\\\n') {
      pos = skipChars(src, pos, WS)
      if (pos >= src.length) return [pos, '']
      if (src.at(pos) !== '\n') throw src.error(pos, "Unescaped '\\' in a string")
      pos++
    }
    return [skipChars(src, pos, WS_AND_NEWLINE), '']
  }
  if (escape === '\\u') return parseHexChar(src, pos, 4)
  if (escape === '\\U') return parseHexChar(src, pos, 8)
  if (Object.hasOwn(ESCAPES, escape)) return [pos, ESCAPES[escape]]
  throw src.error(pos, "Unescaped '\\' in a string")
}

function parseHexChar (src, pos, length) {
  const digits = src.slice(pos, pos + length)
  if (Array.from(digits).length !== length || ![...digits].every(character => HEX.has(character))) {
    throw src.error(pos, 'Invalid hex value')
  }
  pos += length
  const code = parseInt(digits, 16)
  if (!((code >= 0 && code <= 55295) || (code >= 57344 && code <= 1114111))) {
    throw src.error(pos, 'Escaped character is not a Unicode scalar value')
  }
  return [pos, String.fromCodePoint(code)]
}

function parseLiteralStr (src, pos) {
  const start = pos + 1
  pos = skipUntil(src, start, "'", ILLEGAL_BASIC, true)
  return [pos + 1, src.slice(start, pos)]
}

function parseMultilineStr (src, pos, literal) {
  pos += 3
  if (src.startsWith('\n', pos)) pos++
  let delim, result
  if (literal) {
    delim = "'"
    const end = skipUntil(src, pos, "'''", ILLEGAL_MULTILINE_BASIC, true)
    result = src.slice(pos, end)
    pos = end + 3
  } else {
    delim = '"'
    ;[pos, result] = parseBasicStr(src, pos, true)
  }
  // At most two extra quotes when the end sequence is 4 or 5 long rather than 3.
  if (!src.startsWith(delim, pos)) return [pos, result]
  pos++
  if (!src.startsWith(delim, pos)) return [pos, result + delim]
  return [pos + 1, result + delim + delim]
}

function parseBasicStr (src, pos, multiline) {
  const errorOn = multiline ? ILLEGAL_MULTILINE_BASIC : ILLEGAL_BASIC
  let result = '', start = pos
  for (;;) {
    if (pos >= src.length) throw src.error(pos, 'Unterminated string')
    const character = src.at(pos)
    if (character === '"') {
      if (!multiline) return [pos + 1, result + src.slice(start, pos)]
      if (src.startsWith('"""', pos)) return [pos + 3, result + src.slice(start, pos)]
      pos++
      continue
    }
    if (character === '\\') {
      result += src.slice(start, pos)
      let escaped
      ;[pos, escaped] = parseBasicStrEscape(src, pos, multiline)
      result += escaped
      start = pos
      continue
    }
    if (errorOn.has(character)) throw src.error(pos, `Illegal character ${py.reprString(character)}`)
    pos++
  }
}

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function parseValue (src, pos) {
  const character = src.at(pos)
  if (character === '"') {
    if (src.startsWith('"""', pos)) return parseMultilineStr(src, pos, false)
    return parseBasicStr(src, pos + 1, false)
  }
  if (character === "'") {
    if (src.startsWith("'''", pos)) return parseMultilineStr(src, pos, true)
    return parseLiteralStr(src, pos)
  }
  if (character === 't' && src.startsWith('true', pos)) return [pos + 4, true]
  if (character === 'f' && src.startsWith('false', pos)) return [pos + 5, false]
  if (character === '[') return parseArray(src, pos)
  if (character === '{') return parseInlineTable(src, pos)
  let found = src.match(DATETIME, pos)
  if (found) {
    const [match, end] = found
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    if (year < 1 || day > (month === 2 && !leap ? 28 : DAYS_IN[month - 1])) {
      throw src.error(pos, 'Invalid date or datetime')
    }
    return [end, new TomlDate(match[0])]
  }
  found = src.match(LOCALTIME, pos)
  if (found) return [found[1], new TomlDate(found[0][0])]
  found = src.match(NUMBER, pos)
  if (found) {
    const [match, end] = found
    return [end, Number(match[0].replaceAll('_', ''))]
  }
  const three = src.slice(pos, pos + 3), four = src.slice(pos, pos + 4)
  if (three === 'inf' || three === 'nan') return [pos + 3, three === 'inf' ? Infinity : NaN]
  if (['-inf', '+inf', '-nan', '+nan'].includes(four)) {
    return [pos + 4, four.endsWith('nan') ? NaN : four[0] === '-' ? -Infinity : Infinity]
  }
  throw src.error(pos, 'Invalid value')
}

/** tomllib.loads(text): the document as a table. */
export function loads (text) {
  const src = new Source(text)
  const out = { data: new Nested(), flags: new Flags() }
  let pos = 0, header = []
  for (;;) {
    pos = skipChars(src, pos, WS)
    if (pos >= src.length) break
    const character = src.at(pos)
    if (character === '\n') {
      pos++
      continue
    }
    if (KEY_INITIAL.has(character)) {
      pos = skipChars(src, keyValueRule(src, pos, out, header), WS)
    } else if (character === '[') {
      out.flags.finalizePending()
      ;[pos, header] = src.at(pos + 1) === '[' ? createListRule(src, pos, out) : createDictRule(src, pos, out)
      pos = skipChars(src, pos, WS)
    } else if (character !== '#') {
      throw src.error(pos, 'Invalid statement')
    }
    pos = skipComment(src, pos)
    if (pos >= src.length) break
    if (src.at(pos) !== '\n') throw src.error(pos, 'Expected newline or end of document after a statement')
    pos++
  }
  return out.data.dict
}

/** tomllib.load of a file: its bytes as UTF-8 (a byte order mark is read as a character, as Python reads it). */
export function load (file) {
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file))
  } catch (error) {
    if (error instanceof TypeError) throw new py.ValueError(`'utf-8' codec can't decode ${file}: ${error.message}`)
    throw error
  }
  return loads(text)
}

// ---- writing ----------------------------------------------------------------------------------------------------
/** A key as a config file writes it: bare when it can be, else quoted. */
export const key = name => /^[A-Za-z0-9_-]+$/.test(name) ? name : py.dumps(name, { ascii: false })

/** A value as a config file writes it; `floats` says whether a number (under `field`) is a Python float. */
export function value (item, floats = () => false, field = null) {
  if (typeof item === 'boolean') return item ? 'true' : 'false'
  if (typeof item === 'number') {
    return floats(field) || !Number.isInteger(item) ? py.repr(item) : BigInt(item).toString()
  }
  if (typeof item === 'string') return string(item)
  if (Array.isArray(item)) return '[' + item.map(inner => value(inner, floats, field)).join(', ') + ']'
  if (isTable(item)) {
    return '{' + Object.entries(item).map(([name, inner]) => `${key(name)} = ${value(inner, floats, name)}`)
      .join(', ') + '}'
  }
  throw new TypeError(`no TOML for ${py.typeName(item)}`)
}

/** A TOML string: one line as JSON writes it, more as a multi-line string, escaped where TOML needs it. */
export function string (text) {
  if (!text.includes('\n')) return py.dumps(text, { ascii: false }).replaceAll('\x7f', '\\u007f')
  let body = text.replaceAll('\\', '\\\\')
  body = body.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, found => `\\u${found.charCodeAt(0).toString(16).padStart(4, '0')}`)
  // a quote before another quote, or at the very end, is escaped: no run of quotes can close the string early
  body = body.replace(/"(?="|$)/g, '\\"')
  return '"""\n' + body + '"""'
}

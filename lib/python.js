// What Python does that JavaScript does otherwise, done Python's way, so a file reads the same from either: text
// counted by code points, Python's whitespace and Unicode tables (lib/unicode.js), json.dumps, the repr of a float,
// round, int and float of a value, and the order of strings.
import { CATEGORIES, CODES, FOLDS, RUNS, SPACES, ZEROS } from './unicode.js'

export class ValueError extends Error {
  constructor (message) { super(message); this.name = 'ValueError' }
}

// ---- text by code points ---------------------------------------------------------------------------------------------
const SURROGATES = /[\ud800-\udfff]/

/** The code points of `text`, as strings (a lone surrogate is one, as in Python). */
export const chars = text => SURROGATES.test(text) ? Array.from(text) : text.split('')

/** len(text). */
export const len = text => SURROGATES.test(text) ? Array.from(text).length : text.length

/** text[start:end], by code points (negative ends count from the end, as in Python). */
export function slice (text, start = 0, end) {
  if (!SURROGATES.test(text)) return text.slice(start, end)
  return Array.from(text).slice(start, end).join('')
}

export const isascii = text => /^[\x00-\x7f]*$/.test(text)

/** Python's order of two strings: by code point. */
export function compare (one, other) {
  if (!SURROGATES.test(one) && !SURROGATES.test(other)) return one < other ? -1 : one > other ? 1 : 0
  const a = Array.from(one), b = Array.from(other)
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const difference = a[i].codePointAt(0) - b[i].codePointAt(0)
    if (difference) return difference < 0 ? -1 : 1
  }
  return a.length - b.length < 0 ? -1 : a.length > b.length ? 1 : 0
}

// ---- Python's Unicode tables -----------------------------------------------------------------------------------------
const STARTS = [], KINDS = []
{
  let at = 0
  for (const [, length, code] of RUNS.matchAll(/([0-9a-z]+)([A-Z!#$%])/g)) {
    STARTS.push(at)
    KINDS.push(CODES.indexOf(code))
    at += parseInt(length, 36)
  }
}
const BMP = new Uint8Array(0x10000)
for (let run = 0; run < STARTS.length && STARTS[run] < 0x10000; run++) {
  BMP.fill(KINDS[run], STARTS[run], Math.min(STARTS[run + 1] ?? 0x10000, 0x10000))
}

/** unicodedata.category of one character (or code point). */
export function category (character) {
  const code = typeof character === 'number' ? character : character.codePointAt(0)
  if (code < 0x10000) return CATEGORIES[BMP[code]]
  let low = 0, high = STARTS.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (STARTS[middle] <= code) low = middle
    else high = middle - 1
  }
  return CATEGORIES[KINDS[low]]
}

const FOLDED = new Map()
for (const entry of FOLDS.split('\u0001')) {
  if (!entry) continue
  const colon = entry.indexOf(':')
  FOLDED.set(parseInt(entry.slice(0, colon), 36), entry.slice(colon + 1))
}

/** str.casefold: full case folding, as Python's tables have it. */
export function casefold (text) {
  if (isascii(text)) return text.toLowerCase()
  let out = ''
  for (const character of text) out += FOLDED.get(character.codePointAt(0)) ?? character
  return out
}

/** unicodedata.normalize('NFKC'), for the characters Python knows: one it does not know stays as it is, as there. */
export function nfkc (text) {
  if (isascii(text)) return text
  let out = '', piece = ''
  for (const character of text) {
    if (category(character) === 'Cn') {
      out += piece.normalize('NFKC') + character
      piece = ''
    } else piece += character
  }
  return out + piece.normalize('NFKC')
}

/** The value of a decimal digit of any script (unicodedata.decimal), or -1. */
export function decimal (character) {
  if (category(character) !== 'Nd') return -1
  const code = character.codePointAt(0)
  let zero = ZEROS[0]
  for (const start of ZEROS) if (start <= code) zero = start
  return code - zero
}

// ---- whitespace: str.split, str.strip ----------------------------------------------------------------------------
const SPACE = new Set(SPACES)
export const isspace = character => SPACE.has(character.codePointAt(0))

/** str.split() with no separator: the runs of what is not whitespace. */
export function split (text) {
  const found = []
  let piece = ''
  for (const character of text) {
    if (SPACE.has(character.codePointAt(0))) {
      if (piece) found.push(piece)
      piece = ''
    } else piece += character
  }
  if (piece) found.push(piece)
  return found
}

/** str.strip(chars), str.lstrip and str.rstrip: whitespace when `chars` is not given. */
export function strip (text, chars, { left = true, right = true } = {}) {
  const off = chars === undefined ? isspace : character => chars.includes(character)
  const all = Array.from(text)
  let start = 0, end = all.length
  while (left && start < end && off(all[start])) start++
  while (right && end > start && off(all[end - 1])) end--
  return start === 0 && end === all.length ? text : all.slice(start, end).join('')
}
export const rstrip = (text, chars) => strip(text, chars, { left: false })

// ---- numbers --------------------------------------------------------------------------------------------------------
/** repr(float): the shortest digits that read back, as Python writes them ("30.0", "1e-05", "1e+16"). */
export function repr (number) {
  if (Number.isNaN(number)) return 'nan'
  if (!Number.isFinite(number)) return number > 0 ? 'inf' : '-inf'
  if (number === 0) return Object.is(number, -0) ? '-0.0' : '0.0'
  const sign = number < 0 ? '-' : ''
  const [mantissa, power] = Math.abs(number).toExponential().split('e')
  const digits = mantissa.replace('.', ''), exponent = Number(power)
  if (exponent < -4 || exponent >= 16) {
    const shown = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
    return `${sign}${shown}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`
  }
  if (exponent < 0) return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`
  const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0')
  return `${sign}${whole}.${digits.slice(exponent + 1) || '0'}`
}

function exact (number) {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, Math.abs(number))
  const bits = view.getBigUint64(0)
  const exponent = Number((bits >> 52n) & 0x7ffn), fraction = bits & ((1n << 52n) - 1n)
  return exponent === 0 ? [fraction, -1074] : [fraction | (1n << 52n), exponent - 1075]
}

/** round(number, digits): to the nearest, a tie to the even one, on the number's exact value; with no `digits`, to a
 * whole number. */
export function round (number, digits) {
  if (!Number.isFinite(number)) return number
  if (digits === undefined) {
    const floor = Math.floor(number), part = number - floor
    return part > 0.5 || (part === 0.5 && floor % 2 !== 0) ? floor + 1 : floor
  }
  if (number === 0) return number
  const [mantissa, exponent] = exact(number)
  let top = mantissa, bottom = 1n
  if (exponent >= 0) top <<= BigInt(exponent)
  else bottom <<= BigInt(-exponent)
  if (digits >= 0) top *= 10n ** BigInt(digits)
  else bottom *= 10n ** BigInt(-digits)
  let whole = top / bottom
  const rest = 2n * (top % bottom)
  if (rest > bottom || (rest === bottom && whole % 2n === 1n)) whole += 1n
  const out = Number(digits >= 0 ? `${whole}e-${digits}` : `${whole}e${-digits}`)
  return number < 0 ? -out : out
}

/** math.nextafter(number, math.inf). */
export function nextUp (number) {
  if (Number.isNaN(number) || number === Infinity) return number
  if (number === 0) return Number.MIN_VALUE
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, number)
  view.setBigInt64(0, view.getBigInt64(0) + (number > 0 ? 1n : -1n))
  return view.getFloat64(0)
}

/** The ASCII digits of a number Python would read: its decimal digits of any script as 0-9. */
function digitsOf (text) {
  let out = ''
  for (const character of text) {
    const value = character > '\x7f' ? decimal(character) : -1
    out += value >= 0 ? String(value) : character
  }
  return out
}

/** int(value), for what JSON holds: TypeError or ValueError when Python's int would raise one. */
export function int (value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ValueError(`cannot convert float ${repr(value)} to integer`)
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const text = digitsOf(strip(value))
    if (!/^[+-]?\d(_?\d)*$/.test(text)) throw new ValueError(`invalid literal for int(): '${value}'`)
    return Number(text.replaceAll('_', ''))
  }
  throw new TypeError(`int() argument must be a string or a number, not '${typeName(value)}'`)
}

/** float(value), for what JSON holds: TypeError or ValueError when Python's float would raise one. */
export function float (value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const text = digitsOf(strip(value)).toLowerCase()
    const named = /^([+-]?)(inf|infinity|nan)$/.exec(text)
    if (named) return named[2] === 'nan' ? NaN : named[1] === '-' ? -Infinity : Infinity
    if (!/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)(e[+-]?\d(_?\d)*)?$/.test(text)) {
      throw new ValueError(`could not convert string to float: '${value}'`)
    }
    return Number(text.replaceAll('_', ''))
  }
  throw new TypeError(`float() argument must be a string or a real number, not '${typeName(value)}'`)
}

/** Whether Python counts a value as true. */
export const truthy = value => !(value === null || value === undefined || value === false || value === 0 ||
  value === '' || (Array.isArray(value) && !value.length) ||
  (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length))

/** str(value) for what JSON holds. */
export function str (value) {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return String(value)
}

/** The name Python gives a JSON value's type, for messages. */
export function typeName (value) {
  if (value === null || value === undefined) return 'NoneType'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float'
  if (typeof value === 'string') return 'str'
  return Array.isArray(value) ? 'list' : 'dict'
}

// ---- json.dumps -----------------------------------------------------------------------------------------------------
function quoted (text, ascii) {
  let out = '"'
  for (const character of text) {
    const code = character.codePointAt(0)
    if (character === '"') out += '\\"'
    else if (character === '\\') out += '\\\\'
    else if (character === '\n') out += '\\n'
    else if (character === '\r') out += '\\r'
    else if (character === '\t') out += '\\t'
    else if (character === '\b') out += '\\b'
    else if (character === '\f') out += '\\f'
    else if (code < 0x20 || (ascii && code > 0x7e)) {
      for (let i = 0; i < character.length; i++) out += '\\u' + character.charCodeAt(i).toString(16).padStart(4, '0')
    } else out += character
  }
  return out + '"'
}

/** json.dumps(value): `ascii` as ensure_ascii, `compact` for separators (",", ":"), `floats` when every number is a
 * Python float (JavaScript cannot tell 30.0 from 30, Python writes them apart). */
export function dumps (value, { ascii = true, compact = false, floats = false } = {}) {
  const [comma, colon] = compact ? [',', ':'] : [', ', ': ']
  const write = item => {
    if (item === null || item === undefined) return 'null'
    if (item === true) return 'true'
    if (item === false) return 'false'
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) return Number.isNaN(item) ? 'NaN' : item > 0 ? 'Infinity' : '-Infinity'
      return floats || !Number.isInteger(item) ? repr(item) : BigInt(item).toString()
    }
    if (typeof item === 'string') return quoted(item, ascii)
    if (Array.isArray(item)) return '[' + item.map(write).join(comma) + ']'
    return '{' + Object.entries(item).map(([key, inner]) => quoted(key, ascii) + colon + write(inner)).join(comma) + '}'
  }
  return write(value)
}

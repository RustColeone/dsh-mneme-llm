// Turning text into search terms, the same way for notes and for queries, and the rest of what any part does to a
// value it is given: how many tokens it is, cleaning, checking and cutting it. A port of mneme_llm/text.py without
// jieba: `version()` is Python's own without it, "4", so neither side ever rebuilds the other's index.
//
// Words of any alphabet are case-folded, possessive 's is dropped, and English plurals get a light trim on ASCII
// words; runs of Chinese, Japanese and Korean characters, and of the scripts written without spaces (Thai, Lao, Khmer,
// Burmese), become overlapping two-character pieces plus their single characters ("考试没考好" → 考试 试没 没考 考好 考
// 试). Function words and characters that would match everything are dropped. Every character is read with Python's
// Unicode tables (lib/unicode.js), so a term is the same here as there.
import * as py from './python.js'

const CJK = '㐀-䶿一-鿿豈-﫿぀-ヿ가-힯'
const UNSPACED_RANGES = CJK + '฀-໿က-႟ក-៿'
const UNSPACED = new RegExp(`^[${UNSPACED_RANGES}]$`)
export const STOP_LATIN = new Set(`
a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its
just me my no not of on or our she so than that the their them then there they this to too up us was we were what
when where which who why will with would you your yours i'm it's don't im ok okay yes yeah oh
`.trim().split(/\s+/))
export const STOP_CJK = new Set(`
我们 你们 他们 她们 什么 怎么 这个 那个 一个 不是 是不 就是 还是 可是 但是 因为 所以 如果 然后 已经 没有 可以 知道 觉得
现在 今天 一下 一点 有点 真的 这样 那样 这么 那么 自己 时候 了吧 的话 一样 好的 嗯嗯 哈哈 呜呜 嘿嘿 呵呵 嘻嘻 啊啊
哦哦 噢噢 吗吗 了了 的的
`.trim().split(/\s+/))
export const STOP_CJK_CHARS = new Set('的了是我你他她它们这那在有就也都和与吗呢吧啊呀哦嗯哈嘿呜不没很太还又个一要会能说去来到上下' +
  '对好么着过把被给让从向但而且或之其此该每些')

/** Changes whenever `terms` would split text differently, so cached terms can be rebuilt. */
export const version = () => '4'

const OPTIONAL_MARKS = /[֑-ׇً-ٰٟ]/g // Hebrew points, Arabic vowel marks
const JOINERS = "'-‌‍" // inside a word: an apostrophe, a hyphen, and the (non-)joiners of Persian and Indic

/** Case folded in any alphabet: "Straße" is "strasse", and Turkish "İstanbul" is "istanbul". */
export const fold = text => py.casefold(text).replaceAll('i̇', 'i')

/** NFKC, case-folded, without the vowel marks Hebrew and Arabic usually leave out, with a typographic apostrophe read
 * as a plain one. */
export const normalize = text => fold(py.nfkc(text).replace(OPTIONAL_MARKS, '').replaceAll('’', "'"))

const wordy = character => 'LNM'.includes(py.category(character)[0])

function word (text) {
  text = py.strip(text, "'_-")
  if (text.endsWith("'s")) text = text.slice(0, -2) // a possessive, in any language written with one
  if (py.len(text) < 2 || STOP_LATIN.has(text)) return null
  if (py.isascii(text)) { // the plural trim is English's; other languages' words are kept as they are
    if (text.length > 4 && text.endsWith('ies')) text = text.slice(0, -3) + 'y'
    else if (text.length > 3 && text.endsWith('s') && !text.endsWith('ss')) text = text.slice(0, -1)
  }
  return text
}

/** Runs of an unspaced script, and words: letters, digits and combining marks of any alphabet, apostrophes allowed
 * inside a word. */
function * pieces (text) {
  const all = py.chars(text)
  let piece = [], unspaced = false
  for (let index = 0; index < all.length; index++) {
    const character = all[index]
    const isUnspaced = UNSPACED.test(character)
    const isWord = isUnspaced || wordy(character) || character === '_' || (JOINERS.includes(character) &&
      piece.length > 0 && !unspaced && index + 1 < all.length && wordy(all[index + 1]))
    if (piece.length && (!isWord || isUnspaced !== unspaced)) {
      yield [piece, unspaced]
      piece = []
    }
    if (isWord) {
      if (!piece.length) unspaced = isUnspaced
      piece.push(character)
    }
  }
  if (piece.length) yield [piece, unspaced]
}

/** The distinct search terms of `text`, in order of first appearance. */
export function terms (text) {
  const found = new Set()
  for (const [piece, unspaced] of pieces(normalize(text))) {
    if (unspaced) {
      for (let i = 0; i < piece.length - 1; i++) {
        const pair = piece[i] + piece[i + 1]
        if (!STOP_CJK.has(pair)) found.add(pair)
      }
      for (const character of piece) {
        if (!STOP_CJK_CHARS.has(character) && !py.category(character).startsWith('M')) found.add(character)
      }
    } else {
      const kept = word(piece.join(''))
      if (kept) found.add(kept)
    }
  }
  return [...found]
}

const WIDE_TEXT = /[぀-ヿ㐀-鿿가-힯豈-﫿]/g

/** About how many tokens a model counts in `text`, with no tokenizer: 0.85 a character of Chinese, Japanese or Korean
 * and 0.3 of anything else. */
export function tokens (text) {
  const wide = (text.match(WIDE_TEXT) || []).length
  return wide * 0.85 + (py.len(text) - wide) * 0.3
}

const CONTROL = /[\x00-\x08\x0e-\x1b\x7f-\x84\x86-\x9f]/g // control characters that are not whitespace

/** Text that can be stored and shown to a model: control characters (other than whitespace) dropped, and lone
 * surrogates, which UTF-8 cannot hold, replaced by U+FFFD. */
export const clean = text => text.replace(CONTROL, '').toWellFormed()

/** Whether `text` shows nothing: only spaces, invisible format characters and marks with nothing to mark. */
export function blank (text) {
  for (const character of text) if ('LNPS'.includes(py.category(character)[0])) return false
  return true
}

/** `value`, which must be a non-empty string (a subject, say); TypeError or ValueError otherwise. */
export function required (value, what) {
  if (typeof value !== 'string') throw new TypeError(`${what} must be a string, not ${py.typeName(value)}`)
  if (!py.strip(value)) throw new py.ValueError(`${what} must not be empty`)
  return value
}

/** `value`, which must be a string, as a search takes it (cleaned); TypeError otherwise. */
export function query (value) {
  if (typeof value !== 'string') throw new TypeError(`a query must be a string, not ${py.typeName(value)}`)
  return clean(value)
}

/** `value` as a finite number from `low` to `high`, or `default` when it is none. */
export function number (value, fallback, low, high) {
  try {
    value = py.float(value)
  } catch {
    return fallback
  }
  return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback
}

/** `text` cleaned and on one line, cut to `limit` characters, ending in "…" when something was cut. */
export function clip (text, limit) {
  text = py.split(clean(text)).join(' ')
  return py.len(text) <= limit ? text : py.rstrip(py.slice(text, 0, Math.max(0, limit - 1))) + '…'
}

/** `text` within `limit` characters: the opening (where who-is-who is said) and the end (the newest words) are kept,
 * the middle is cut. */
export function fit (text, limit) {
  const size = py.len(text)
  if (size <= limit) return text
  const head = Math.min(600, Math.floor(limit / 3))
  const tail = limit - head - 5 // (the marker takes 5)
  if (tail <= 0) return py.slice(text, 0, Math.max(0, limit))
  return py.slice(text, 0, head) + '\n[…]\n' + py.slice(text, size - tail)
}

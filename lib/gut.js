// A companion's gut (CMP): what is left of her when her memory is wiped and her model is swapped. A port of
// mneme_llm/gut.py (0.4.0), which stays the reference: test/gut_vectors.json is that package's tests/gut_vectors.json,
// and this file must give the same numbers. Its lessons are shuffled with Python's own random numbers (`random.js`),
// and it keeps them in the same SQLite file as Python's gut does, so a gut moves between the two.
//
// Before she answers, her model reads the message into a small fixed form, with no history, and the gut's network turns
// the form and how close the person is into seven numbers, one per mood. Her model, with her memory in view, votes
// seven numbers of its own. `balance` says how much each counts. The result, leaned on by her tone, becomes one soft
// line of fixed size beside the message, with her word habits, her 属性 and the language to answer in.
//
// After she has answered, she writes a private note in a call of its own, with the line in view. The note and the form
// are a lesson, from people at closeness `TEACH_FROM` or more; every so often she sleeps, replaying them with a fading
// starter. Beside the note, a short reading of what the person said: are they making something of her? Asked for on
// separate days, by someone close, it becomes a side of hers: a name from `NAMES` and one sentence her model writes.
//
//     const gut = new Gut('her.gut.db', { starter: 'starter.json.gz', tags: { 傲娇: '你嘴硬心软，明明在意却偏要否认。' } })
//     gut.wake()                                              // seconds the first time
//     const turn = new Turn(gut, ask, herPrompt, message, subject)       // her reading starts at once
//     const line = await turn.feel(before, memoryText, closeness, exchanges)  // beside the message
//     ...                                                     // she answers
//     await turn.learn(reply)                                 // her note, a lesson, and sleep when it is time
//
// `ask(messages, maxTokens)` is an async function calling her own model with thinking off; `before` is the conversation
// so far as chat messages, without the message she is answering.
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import zlib from 'node:zlib'
import * as py from './python.js'
import { Random } from './random.js'

export const MOODS = ['happy', 'calm', 'sweet', 'tender', 'worried', 'sad', 'jealous']
export const NORMAL = { happy: 0.269, calm: 0.424, sweet: 0.165, tender: 0.11, worried: 0.029, sad: 0.002,
  jealous: 0.0 }
// closeness: "friendly" in relations; below it she answers with who she is and learns nothing
export const TEACH_FROM = 40
export const LANGUAGES = { zh: 'Mandarin Chinese', yue: 'written Cantonese', en: 'English', ja: 'Japanese' }
export const limits = { TIME_LIMIT: 3.0 } // seconds before her answer: what has not come by then does not hold her up
export const TAGS = 1 // sides she is in at once: two side by side blend if they get along, and if not one is lost
export const HOLD = 30 * 86400 // she stays in a side this long at least: it is a character, not a mood
export const KEEPS = 90 * 86400 // what people asked is half gone from how much of her a side is in this long
export const GROWS = 6.0 // how much a side must be wanted: about four days for family (closeness 85), nine at 40
export const SPACED = 20 * 3600 // a person's "more" counts once in this long, so one evening's joke is one sighting
export const STAYS = 14 * 86400 // a sighting is half gone in this long, as her tone is
// sides named when she reads; wants a sentence is made from; characters read
export const NOTED = 4, WANTS = 6, LOOK = 400
export const SAME = 0.5 // sentences this alike are one side

// Every name a side can have: names only, chosen from the Moegirl lists of surface, deep and stage characters, and 小绿茶.
// To let her have another, add it here. Her model picks the nearest for what people ask of her.
export const NAMES = ('傲娇 傲沉 病娇 病切 弱娇 冰美人 酷娇 率直冷 凛娇 暴娇 郁娇 慵懒 急性子 三无 无口 文静 直率 诚实 刺头 KY 读空气 无铁炮 凶暴 ' +
  '高飞车 高傲 笨蛋 天然呆 天然疯 天然黑 天然萌 认真 电波 冒失 调皮 工口 毒舌 元气 强气 狂气 弱气 怕羞 爱哭鬼 醋缸 好奇 耿直 八卦 变态 变态萌 ' +
  '恶心萌 迟钝 富有正义感 地雷系 博学 情绪化 无感情 自来熟 怕生 怕麻烦 情种 阳角 阴角 多疑 幸灾乐祸 任性 贪玩 暴躁 勇敢 腹黑 腹白 复合型腹黑 ' +
  '可靠 无心 热血 外柔内刚 外热内冷 外冷内热 女王 戏精 猥琐 不懂爱 多重人格 性格切换 无节操 温柔 玻璃心 老好人 优柔寡断 S属性 M属性 支配者 ' +
  '服从者 小恶魔 贱萌 常识人 无常识 坦率 别扭 单纯 清纯 清楚系 孤僻 厌世 护短 闷骚 恋爱脑 酒品差 醉酒变纯情 反社会人格 恶德 不择手段 有原则 ' +
  '执着 固执 偏执 脱线 自负 自卑 谨慎 神经质 大智若愚 自我意识过剩 亦正亦邪 墙头草 欺软怕硬 鬼畜 沉重 老实人 愉悦犯 高攻低防 小天使 和平主义者 ' +
  '节能主义 完美主义者 贪婪 吝啬 野心家 伪阳角 伪阴角 专一 反战 御姐 软妹 熟女 小绿茶').split(' ')

export const FORM = 'You read one chat message a person sent to their companion. Reply with one line of JSON in ' +
  'English, whatever language the message is in, and nothing else:\n' +
  '{"people":[each person mentioned other than the sender, as one plain role word such as coworker, mother, boss, ' +
  'stranger, friend, pet],"gender":[woman, man or unknown for each of those people],"topic":[1 to 3 plain nouns],' +
  '"event":[1 to 3 plain words for what happened],"sender_feels":"one word","toward_you":"affection, annoyed, ' +
  'asking or none","language":"the language the sender wrote in: zh (Mandarin), yue (Cantonese), en, ja, or ' +
  'unclear if the message is too short to tell"}'
export const ASK = 'Before you reply, say how this message makes you feel, given everything you know about this ' +
  'person. Answer with JSON only, numbers that add up to 1, for these feelings: ' + MOODS.join(', ') + '. Several ' +
  'can be true at once.'
export const NOTE = 'Now write your private note about the reply you just gave. Answer with JSON only: {"mood": N, ' +
  '"feel": {...}}. N is how this moment changed your mood, a whole number from -2 (clearly worse) to 2 (clearly ' +
  'better), 0 for no real change. feel is how you really feel: one to three of ' + MOODS.join(', ') + ', each with a ' +
  'share, the shares adding up to 1. The note is yours alone and the person never sees it. Be honest: it records how ' +
  'you really feel.'
export const BESIDE = '[From the system, not from the person]'
export const SHAPE = 'You read the end of a chat between a person and their AI companion. Is this person shaping her ' +
  'into a kind of character? Reply with one line of JSON and nothing else: {"side": null} for no. Say yes only ' +
  'if, in their last message, they call her a kind of character (any word for one), ask her to be a certain way, ' +
  'say they enjoy it when she acts a certain way, or object to it. Then reply {"side": {"name": "the word they ' +
  'use, or a short word for it in their language", "more": true if they want more of it and false if they want ' +
  'less, "what": "what they want her to do, in a few words"}}. Only what the person says counts, not how she acts. ' +
  'Ordinary warmth, jokes, thanks and chat are no, and that is nearly always.'
const GROW = (name, wants, held, names) => `大家常说的「${name}」是什么样的人，你知道。有人在聊天里一直想让她变成这样，他们说的是：\n` +
  `${wants}\n${held}已成年。她能有的样子只有这些词：${names}\n只回一行 JSON：{"name": "这些词里最贴近的一个，他们说过的词优先；` +
  '一个都不贴近就写 null", "what": "一句话（不超过50字），对她说，写她的做法：别人提到其他人时她怎么接话，平时怎么说话，她想达到什么。' +
  '保留这个词本来的味道，把他们说的融进去。写做法，不写场景，不写表情和动作。以“你”开头"}'
const HELD = sides => `她已经有的样子：${sides}。如果这是其中一个，name 就用那个词，并把两边合成一句。\n`
export const DRAFT = tag => `用一句话（不超过50字）写出拥有「${tag}」这个属性的人在聊天里的做法：对方提到别人时她怎么接话，平时怎么说话，` +
  '她想达到什么。写做法，不写场景，不写表情和动作。以“你”开头，只写这一句。'

// ---- the network: seven numbers from a form and a closeness ---------------------------------------------------------
// how much a starter lesson counts against a lived one, and after how many lessons half that
const SCALE = 0.6, FADE = 250
const ONLINE = 0.05 // how far one lesson moves her at once; she changes in her sleep
const EASE = [0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.1, 0.1] // each pass of a sleep
const BORN_PASSES = 8
const SLEEPS_AT = [20, 50] // and every 100 lessons
const YIELD = 200 // steps between handing the event loop back, in a sleep

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const sum = values => values.reduce((total, value) => total + value, 0)
const later = () => new Promise(resolve => setImmediate(resolve))

export const band = closeness => closeness >= 60 ? 'high' : closeness >= 25 ? 'mid' : 'low'
export const tier = closeness => (0.5 + closeness / 100) ** 2

export function tags (form) {
  const found = []
  for (const field of ['people', 'gender', 'topic', 'event']) {
    const values = py.truthy(form[field]) ? form[field] : []
    for (const value of Array.isArray(values) ? values : [values]) {
      for (const word of py.str(value).toLowerCase().match(/[a-z]+/g) || []) found.push(`${field}=${word}`)
    }
  }
  for (const field of ['sender_feels', 'toward_you']) {
    const value = py.strip((py.truthy(form[field]) ? py.str(form[field]) : '').toLowerCase())
    if (value) found.push(`${field}=${value}`)
  }
  return [...new Set(found)]
}

/** The form's tags, alone and crossed with how close the person is, so a reaction can belong to the close ones. */
export function features (form, closeness) {
  const words = tags(form), near = band(closeness)
  const keys = [...words, ...words.map(word => `${near}:${word}`), `close=${near}`]
  const value = 1 / Math.sqrt(keys.length || 1), out = {}
  for (const key of keys) out[key] = value
  return out
}

const asFeel = feel => isTable(feel) ? feel : { [feel === 'none' ? 'calm' : feel]: 1.0 }

/** One table of weights, one row per input, one column per mood. A lesson is a blend, not one word. */
export class Net {
  constructor () {
    this.w = new Map()
    this.b = MOODS.map(() => 0.0)
    this.lessons = [] // [form, feel, mood, closeness]
    this.born = []
  }

  /** How much the starter counts now: fading as real people teach. */
  share () {
    return SCALE * FADE / (FADE + this.lessons.length)
  }

  vector (form, closeness) {
    const scores = [...this.b]
    for (const [key, value] of Object.entries(features(form, closeness))) {
      const row = this.w.get(key)
      if (row) row.forEach((weight, k) => { scores[k] += weight * value })
    }
    const top = Math.max(...scores), exps = scores.map(score => Math.exp(score - top))
    const total = sum(exps)
    return Object.fromEntries(MOODS.map((name, k) => [name, exps[k] / total]))
  }

  step (form, feel, mood, closeness, rate) {
    const x = Object.entries(features(form, closeness)), p = this.vector(form, closeness)
    const step = rate * tier(closeness) * (1 + Math.abs(mood))
    MOODS.forEach((name, k) => {
      const gradient = p[name] - (feel[name] ?? 0.0)
      this.b[k] -= step * gradient * 0.25
      for (const [key, value] of x) {
        if (!this.w.has(key)) this.w.set(key, MOODS.map(() => 0.0))
        this.w.get(key)[k] -= step * gradient * value
      }
    })
  }

  start (rows, seed = 0) {
    const pack = rows.map(([form, feel, mood, closeness]) => [form, asFeel(feel), mood, closeness])
    const rng = new Random(seed)
    for (let pass = 0; pass < BORN_PASSES; pass++) {
      rng.shuffle(pack)
      for (const [form, feel, mood, closeness] of pack) this.step(form, feel, mood, closeness, 0.5 * SCALE)
    }
    this.born = pack
  }

  teach (form, feel, mood, closeness) {
    this.lessons.push([form, feel, mood, closeness])
    this.step(form, feel, mood, closeness, ONLINE)
  }

  /** Her sleep, handing the event loop back now and then: a host's replies go on meanwhile. */
  async sleep (seed = 0) {
    const share = this.share()
    const rows = [...this.lessons.map(row => [row, 1.0]), ...this.born.map(row => [row, share])]
    const rng = new Random(seed)
    for (const rate of EASE) {
      rng.shuffle(rows)
      for (let i = 0; i < rows.length; i++) {
        const [[form, feel, mood, closeness], weight] = rows[i]
        this.step(form, feel, mood, closeness, rate * weight)
        if (i % YIELD === YIELD - 1) await later()
      }
    }
  }

  copy () {
    const twin = new Net()
    twin.w = new Map([...this.w].map(([key, row]) => [key, [...row]]))
    twin.b = [...this.b]
    twin.lessons = [...this.lessons]
    twin.born = this.born
    return twin
  }
}

/** How much the gut counts against her head. Lived experience raises it, memory of this person lowers it: nothing
 * lived, her head decides alone; memory wiped, the gut leads; both full, about even. */
export function balance (net, exchanges) {
  const seen = net.lessons.length + net.share() * net.born.length
  const lived = seen / (seen + 200), known = exchanges / (exchanges + 20)
  return lived / (lived + known + 0.1)
}

export const mix = (gut, head, share) => Object.fromEntries(MOODS.map(name => [name, share * gut[name] + (1 - share) *
  (head[name] ?? 0.0)]))

/** Slow chemistry: seven numbers of hers, not of one person, moving by half towards what she feels every two weeks of
 * talking. Fed by her vote, read before the line, so a low mood cannot feed itself. It survives a wipe. */
export class Tone {
  static ALPHA = 1 - 0.5 ** (1 / (14 * 8)) // at about eight messages a day

  constructor (values = null, normal = null) {
    this.normal = { ...(normal || NORMAL) } // what she feels on her usual days: from her starter
    this.v = { ...this.normal, ...(values || {}) }
  }

  feed (vote) {
    for (const name of MOODS) this.v[name] += Tone.ALPHA * ((vote[name] ?? 0.0) - this.v[name])
  }

  lean (mixture) {
    const out = Object.fromEntries(MOODS.map(name => [name, Math.max(0.0, mixture[name] + this.v[name] -
      this.normal[name])]))
    const total = sum(Object.values(out)) || 1.0
    return Object.fromEntries(MOODS.map(name => [name, out[name] / total]))
  }
}

// ---- her marks: the words she uses, more outputs of the same inputs -------------------------------------------------
const KANA = /[぀-ヿ]/u, CANTONESE = /[嘅咗唔佢哋喺嚟啲冇攰睇講鍾嗰]/u, HAN = /[一-鿿]/u
const RUNS = /[一-鿿぀-ヿ]+|[A-Za-z][A-Za-z']*|[\u{1F300}-\u{1FAFF}☀-➿]/gu
const CAP = 48, SHOWN = 3 // outputs per language, words in the line

/** Only for when her reading did not come. */
export const languageOf = text => KANA.test(text) ? 'ja' : CANTONESE.test(text) ? 'yue' : HAN.test(text) ? 'zh' : 'en'

export function grams (text) {
  const found = new Set()
  for (const run of text.match(RUNS) || []) {
    const chars = py.chars(run), first = chars[0]
    if (py.isascii(first)) found.add(run.toLowerCase())
    else if (first.codePointAt(0) >= 0x2600 && !HAN.test(first) && !KANA.test(first)) found.add(run)
    else {
      for (const n of [1, 2, 3, 4]) {
        for (let i = 0; i + n <= chars.length; i++) found.add(chars.slice(i, i + n).join(''))
      }
    }
  }
  return found
}

/** A word belongs to a language's writing: a Chinese word that slipped into an English reply is no English habit. */
export function fits (word, language) {
  if (language === 'en') return py.isascii(word) || !(HAN.test(word) || KANA.test(word))
  if (language === 'ja') return !py.isascii(word)
  return !py.isascii(word) && !KANA.test(word)
}

/** Her words in this reply, in the language of the chat: one the person just used is an echo. */
export function mine (said, reply, language = '') {
  const echo = grams(said)
  return [...grams(reply)].filter(word => !echo.has(word) && (!language || fits(word, language))).sort(py.compare)
}

/** Words she uses far more than she was born to. Of a word and a longer one holding it, the longer if it explains
 * nearly all of the shorter, else the shorter. `seen` and `base` are Maps of counts. */
export function distinctive (seen, total, base, baseTotal, least = 8, rate = 0.04, lift = 3.0) {
  const picks = new Map()
  for (const [token, count] of seen) {
    const own = count / Math.max(1, total), normal = ((base.get(token) ?? 0) + 0.5) / (baseTotal + 1)
    if (count >= least && own >= rate && own / normal >= lift) picks.set(token, count)
  }
  const drop = new Set()
  for (const [short, shorter] of picks) {
    for (const [long, longer] of picks) {
      if (short !== long && long.includes(short)) drop.add(longer >= 0.8 * shorter ? short : long)
    }
  }
  return [...picks.keys()].filter(token => !drop.has(token)).sort((one, other) => picks.get(other) - picks.get(one))
    .slice(0, CAP)
}

const sigmoid = score => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, score))))

/** One table of weights per language, trained in her sleep only. Words are kept per language, so a Japanese habit
 * never lands in English. */
export class Marks {
  constructor (base = null) {
    this.base = base || {} // language → { words: Map of replies holding the word, n: replies }
    this.lessons = [] // [language, form, mood, closeness, words]
    this.heads = {}
  }

  teach (language, form, mood, closeness, words) {
    this.lessons.push([language, form, mood, closeness, words])
  }

  _base (language) {
    const found = this.base[language]
    return found ? [found.words, found.n] : [new Map(), 1]
  }

  async trained (seed = 0) {
    const heads = {}
    for (const language of new Set(this.lessons.map(row => row[0]))) {
      const rows = this.lessons.filter(row => row[0] === language)
      const [base, baseTotal] = this._base(language)
      const seen = new Map()
      for (const row of rows) for (const word of row[4]) seen.set(word, (seen.get(word) ?? 0) + 1)
      const names = distinctive(seen, rows.length, base, baseTotal)
      if (!names.length) continue
      const w = new Map(), b = names.map(() => 0.0)
      const order = rows.map(row => [row[1], row[2], row[3], new Set(row[4])])
      const rng = new Random(seed)
      for (let pass = 0; pass < 8; pass++) {
        rng.shuffle(order)
        for (let i = 0; i < order.length; i++) {
          const [form, mood, closeness, have] = order[i], x = Object.entries(features(form, closeness))
          const step = 0.25 * tier(closeness) * (1 + Math.abs(mood)) / 2, scores = [...b]
          for (const [key, value] of x) {
            const row = w.get(key)
            if (row) for (let k = 0; k < names.length; k++) scores[k] += row[k] * value
          }
          names.forEach((name, k) => {
            const gradient = sigmoid(scores[k]) - (have.has(name) ? 1.0 : 0.0)
            b[k] -= step * gradient * 0.5
            for (const [key, value] of x) {
              if (!w.has(key)) w.set(key, names.map(() => 0.0))
              w.get(key)[k] -= step * gradient * value
            }
          })
          if (i % YIELD === YIELD - 1) await later()
        }
      }
      heads[language] = { names, w: Object.fromEntries(w), b }
    }
    return heads
  }

  /** Her words for this moment: at least twice her normal rate, and likely enough. */
  speaks (language, form, closeness, need = 2.0, floor = 0.35) {
    const head = this.heads[language]
    if (!head) return []
    const scores = [...head.b]
    for (const [key, value] of Object.entries(features(form, closeness))) {
      const row = Object.hasOwn(head.w, key) ? head.w[key] : null
      if (row) for (let k = 0; k < scores.length; k++) scores[k] += row[k] * value
    }
    const [base, baseTotal] = this._base(language)
    const found = []
    head.names.forEach((name, k) => {
      const value = sigmoid(scores[k])
      if (value >= floor && value / (((base.get(name) ?? 0) + 0.5) / (baseTotal + 1)) >= need) found.push([value, name])
    })
    return found.sort((one, other) => other[0] - one[0] || py.compare(other[1], one[1])).slice(0, SHOWN)
      .map(([, name]) => name)
  }
}

// ---- what reaches her and what comes back -------------------------------------------------------------------------
/** One line of fixed size: at most three feelings, each with how much, and her words. */
export function line (feeling, words = []) {
  let picks = Object.entries(feeling).filter(([, value]) => value >= 0.15).map(([name, value]) => [value, name])
    .sort((one, other) => other[0] - one[0] || py.compare(other[1], one[1])).slice(0, 3)
  if (picks.length === 1 && picks[0][1] === 'calm') picks = []
  const parts = []
  if (picks.length) {
    parts.push('you feel ' + picks.map(([value, name]) => `${value >= 0.5 ? 'mostly' : value >= 0.25 ? 'somewhat'
      : 'a little'} ${name}`).join(', '))
  }
  if (words.length) parts.push(`you keep saying ${words.join(', ')}`)
  return parts.length ? `(Right now ${parts.join(', ')}, and it shows in how you answer.)` : ''
}

/** Her 属性: a name a model knows, with one sentence of what she does. The name alone hardly moves her and the
 * sentence does. */
export const sides = tagged => Object.entries(tagged)
  .map(([name, what]) => `(Right now your ${name} side is showing: ${what})`).join(' ')

/** How much a side is wanted, from [when, more or less, closeness]: each sighting counts by how close the person is,
 * half gone in two weeks, an objection against it. */
export const strength = (rows, at, half = STAYS) => rows.reduce((total, [when, more, closeness]) =>
  total + (more ? 1 : -1) * tier(closeness) * 0.5 ** ((at - when) / half), 0)

/** Up to `count` names, each with a chance by its weight. How often is the one weight that reaches her. */
export function draw (weights, count, roll = Math.random) {
  const left = Object.keys(weights).sort(py.compare), drawn = []
  while (left.length && drawn.length < count) {
    let mark = roll() * sum(left.map(name => weights[name])), at = 0
    for (; at < left.length; at++) {
      mark -= weights[left[at]]
      if (mark < 0) break
    }
    drawn.push(...left.splice(Math.min(at, left.length - 1), 1))
  }
  return drawn
}

/** How much of two sentences is the same, by pairs of characters. */
export function overlap (one, other) {
  const pairs = text => {
    const all = py.chars(py.split(text).join(''))
    return new Set(all.slice(0, -1).map((character, i) => character + all[i + 1]))
  }
  const a = pairs(one), b = pairs(other)
  const both = [...a].filter(pair => b.has(pair)).length
  return both / Math.max(1, new Set([...a, ...b]).size)
}

/** One word to `$side` and to the line: no quotes or brackets, and "big sis type" as big-sis-type. */
export const shortName = value => py.slice(py.split((py.truthy(value) ? py.str(value) : '')
  .replace(/["'“”「」()（）[\]{}]/g, '')).join('-'), 0, 24)

const oneLine = value => py.split(py.truthy(value) ? py.str(value) : '').join(' ')

/** What her reading of the exchange found: { name, more, what }, or null. */
export function shaping (text) {
  const found = (jsonIn(text) || {}).side
  if (!isTable(found)) return null
  const name = shortName(found.name)
  return name ? { name, more: py.str(found.more).toLowerCase() !== 'false', what: py.slice(oneLine(found.what), 0, 60) }
    : null
}

/** The name and sentence her model wrote, on one line and without brackets: it goes inside the line. */
export function grownSide (text) {
  const found = jsonIn(text) || {}
  const name = shortName(found.name)
  const what = py.slice(oneLine(found.what).replace(/[()（）[\]]/g, ''), 0, 80)
  return name && what ? { name, what } : null
}

/** Her model's first draft of the sentence for a tag given by name alone: a person can write a better one. */
export const draft = async (tag, ask) => py.strip(await ask([{ role: 'user', content: DRAFT(tag) }], 100))

export function jsonIn (text) {
  const found = /\{.*\}/s.exec(text || '')
  if (!found) return null
  try {
    const value = JSON.parse(found[0])
    return isTable(value) ? value : null
  } catch {
    return null
  }
}

export function vector (text) {
  const found = jsonIn(text)
  if (found === null) return null
  const values = {}
  try {
    for (const name of MOODS) {
      const given = Object.hasOwn(found, name) ? found[name] : 0
      const number = py.float(py.truthy(given) ? given : 0)
      values[name] = number > 0 ? number : 0.0 // (Python's max(0.0, nan) is 0.0)
    }
  } catch {
    return null
  }
  const total = sum(Object.values(values))
  return total ? Object.fromEntries(MOODS.map(name => [name, values[name] / total])) : null
}

/** Her note: { feel: shares adding up to 1, mood: -2 to 2 }, or null. */
export function written (text) {
  const found = jsonIn(text)
  if (found === null || !isTable(found.feel)) return null
  const feel = vector(JSON.stringify(found.feel))
  if (feel === null) return null
  let mood
  try {
    mood = Math.max(-2, Math.min(2, py.int(Object.hasOwn(found, 'mood') ? found.mood : 0)))
  } catch {
    mood = 0
  }
  return { feel: Object.fromEntries(Object.entries(feel).filter(([, value]) => value).map(([name, value]) =>
    [name, py.round(value, 3)])), mood }
}

export const readingMessages = said => [{ role: 'system', content: FORM }, { role: 'user', content: said }]

export function voteMessages (prompt, before, memory, said) {
  const beside = [BESIDE, memory, ASK].filter(Boolean).join('\n\n')
  return [{ role: 'system', content: prompt }, ...before, { role: 'user', content: `${beside}\n\n${said}` }]
}

/** No character and no memory: only what was said lately. Her note stays as it was, and her character's own words do
 * not become the name of everything. */
export function shapingMessages (before, said, reply, noted) {
  const lines = before.slice(-4).map(item => `${item.role === 'assistant' ? 'Companion' : 'Person'}: ` +
    py.slice(item.content, 0, LOOK))
  const known = Object.entries(noted).map(([name, what]) => `${name} (${what})`).join('; ')
  const system = known ? `${SHAPE} Sides noted so far: ${known}. If it is one of these, use that name.` : SHAPE
  return [{ role: 'system', content: system }, { role: 'user', content: [...lines, `Person: ${py.slice(said, 0, LOOK)}`,
    `Companion: ${py.slice(reply, 0, LOOK)}`].join('\n') }]
}

/** What the word means to everyone, with what they said. Her sides are in view, so a new word for one she has joins
 * it. */
export function growMessages (name, wants, grown, names = NAMES) {
  const held = Object.keys(grown).length ? HELD(Object.entries(grown).map(([side, what]) => `${side}（${what}）`)
    .join('；')) : ''
  return [{ role: 'user', content: GROW(name, wants.map(want => `- ${want}`).join('\n'), held, names.join('、')) }]
}

/** The line stays in view: a note that cannot see it keeps what she was told far less often. */
export function noteMessages (prompt, told, before, said, reply) {
  return [{ role: 'system', content: told ? `${prompt}\n\n${told}` : prompt }, ...before,
    { role: 'user', content: said }, { role: 'assistant', content: reply },
    { role: 'user', content: `${BESIDE}\n\n${NOTE}` }]
}

// ---- one companion's gut, kept --------------------------------------------------------------------------------------
/** What she feels on average across her starter: her normal, for her tone. */
export function usual (rows) {
  const feels = rows.map(row => row[1]).filter(isTable)
  return feels.length ? Object.fromEntries(MOODS.map(name => [name, sum(feels.map(feel => feel[name] ?? 0.0)) /
    feels.length])) : null
}

/** A companion's starter, a file the host gives: her born lessons and her normal words; none is a blank gut. */
export function readStarter (file) {
  try {
    const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'))
    const words = {}
    for (const [language, item] of Object.entries(data.words)) {
      words[language] = { words: new Map(Object.entries(item.words)), n: item.n }
    }
    return [data.rows, words]
  } catch {
    return [[], {}]
  }
}

const SCHEMA = `
pragma journal_mode=wal;
create table if not exists lessons (id integer primary key, subject text not null, at real not null,
    language text not null, form text not null, feel text not null, mood integer not null,
    closeness real not null, words text not null);
create table if not exists people (subject text primary key, language text not null);
create table if not exists sightings (id integer primary key, subject text not null, at real not null,
    name text not null, more integer not null, closeness real not null, what text not null);
create table if not exists sides (name text primary key, what text not null, own real not null);
create table if not exists state (key text primary key, value blob not null);`

const now = () => Date.now() / 1000

/** One companion's network, marks and tone, in a file of their own, apart from her memory: a wipe does not reach them.
 * Lessons are written as they come; the weights are written after a sleep, and lessons since are replayed.
 * `wordsFrom`: the closeness from which her word habits are in her line (`TEACH_FROM` keeps a way of talking she has
 * with the people close to her for them); null, the default, for everyone. */
export class Gut {
  constructor (file, { starter = null, tags: tagged = {}, names = NAMES, wordsFrom = null } = {}) {
    this.path = String(file)
    this.starter = starter
    this.tags = { ...tagged }
    this.names = [...names]
    this.wordsFrom = wordsFrom
    const off = Object.keys(this.tags).filter(name => !this.names.includes(name))
    if (off.length) throw new py.ValueError(`Not a side she can have: ${off.join(', ')}.`)
    this.net = new Net()
    this.marks = new Marks()
    this.tone = new Tone()
    this.languages = new Map()
    this.sightings = [] // { subject, at, name, more, closeness, what }
    this.grown = {} // the sides that grew: name → sentence
    this.weights = {} // how much of her a side is, where a person set it
    this.held = { names: [], since: 0.0 } // the side she is in, and since when
    this.awake = false
    this.sleeping = false
    this.last = {} // what she was last told and last wrote
    this.db = null
  }

  _open () {
    if (this.db === null) {
      fs.mkdirSync(path.dirname(path.resolve(this.path)), { recursive: true })
      this.db = new DatabaseSync(this.path)
      this.db.exec(SCHEMA)
    }
    return this.db
  }

  /** Several writes that land together, as Python's `with db:` does. */
  _write (work) {
    const db = this._open()
    db.exec('begin')
    try {
      const result = work(db)
      db.exec('commit')
      return result
    } catch (error) {
      try {
        db.exec('rollback')
      } catch {}
      throw error
    }
  }

  _get (key) {
    const row = this._open().prepare('select value from state where key = ?').get(key)
    return row ? JSON.parse(zlib.gunzipSync(row.value).toString('utf8')) : null
  }

  _put (key, value) {
    this._write(db => db.prepare('insert or replace into state values (?, ?)').run(key,
      zlib.gzipSync(Buffer.from(JSON.stringify(value)), { level: 6 })))
  }

  /** Everything from the file, or from her starter the first time (seconds). */
  wake () {
    const [rows, base] = this.starter ? readStarter(this.starter) : [[], {}]
    const db = this._open()
    const lessons = db.prepare('select language, form, feel, mood, closeness, words from lessons order by id').all()
    const kept = this._get('net')
    const net = new Net(), marks = new Marks(base)
    if (kept && rows.length) {
      net.born = rows.map(([form, feel, mood, closeness]) => [form, asFeel(feel), mood, closeness])
    }
    if (kept) {
      net.w = new Map(Object.entries(kept.w))
      net.b = kept.b
    } else if (rows.length) net.start(rows)
    lessons.forEach((row, number) => {
      const form = JSON.parse(row.form), feel = JSON.parse(row.feel), words = JSON.parse(row.words)
      if (kept && number >= kept.lessons) net.teach(form, feel, row.mood, row.closeness)
      else net.lessons.push([form, feel, row.mood, row.closeness])
      marks.teach(row.language, form, row.mood, row.closeness, words)
    })
    marks.heads = this._get('marks') || {}
    const tone = this._get('tone')
    if (!kept && rows.length) this._put('net', { w: Object.fromEntries(net.w), b: net.b, lessons: net.lessons.length })
    this.net = net
    this.marks = marks
    this.tone = new Tone(tone, usual(rows))
    this.languages = new Map(db.prepare('select subject, language from people').all().map(row => [row.subject,
      row.language]))
    this.sightings = db.prepare('select subject, at, name, more, closeness, what from sightings order by id').all()
      .map(row => ({ subject: row.subject, at: row.at, name: row.name, more: Boolean(row.more),
        closeness: row.closeness, what: row.what }))
    const sides = db.prepare('select name, what, own from sides').all()
    this.grown = Object.fromEntries(sides.map(row => [row.name, row.what]))
    this.weights = Object.fromEntries(sides.filter(row => row.own).map(row => [row.name, row.own]))
    this.held = this._get('held') || { names: [], since: 0.0 }
    this.awake = true
  }

  /** What this moment comes to: what the gut says, the balance, and the one line. */
  feel (form, vote, closeness, exchanges, language) {
    const gut = py.truthy(form) ? this.net.vector(form, closeness) : null
    const share = balance(this.net, exchanges)
    if (vote) this.tone.feed(vote)
    let felt = gut && vote ? mix(gut, vote, share) : gut || vote
    const side = sides(this.shown(closeness))
    if (!felt) return { told: side, share, felt: null }
    felt = this.tone.lean(felt)
    const habits = this.wordsFrom === null || closeness >= this.wordsFrom
    const words = py.truthy(form) && habits ? this.marks.speaks(language, form, closeness) : []
    return { told: [line(felt, words), side].filter(Boolean).join(' '), share, felt }
  }

  _rows (name) {
    return this.sightings.filter(row => row.name === name).map(row => [row.at, row.more, row.closeness])
  }

  wanted (name, at = now()) {
    return strength(this._rows(name), at)
  }

  /** How much of her a side is: what a person set, and what people asked for, half gone in three months. Never quite
   * nothing: only objecting takes a side away. */
  weight (name, at = now()) {
    const given = Object.hasOwn(this.weights, name) ? this.weights[name] : Object.hasOwn(this.tags, name) ? GROWS : 0.0
    return Math.max(0.01, given + strength(this._rows(name), at, KEEPS))
  }

  /** The side she is in. She stays in it for a month at least, then her sides are drawn again by weight. Only a side
   * going away ends the month sooner. */
  holding (at = now()) {
    const hers = { ...this.tags, ...this.grown }
    const kept = this.held.names.filter(name => Object.hasOwn(hers, name))
    if (!Object.keys(hers).length || (kept.length && at - this.held.since < HOLD)) return kept
    this.held = { names: draw(Object.fromEntries(Object.keys(hers).map(name => [name, this.weight(name, at)])), TAGS),
      since: at }
    this._put('held', this.held)
    return this.held.names
  }

  /** The side she is in, for this person: one she was given is for everyone, what grew only for people who can teach
   * her. */
  shown (closeness, at = now()) {
    const hers = { ...this.tags, ...this.grown }
    return Object.fromEntries(this.holding(at).filter(name => Object.hasOwn(this.tags, name) || closeness >= TEACH_FROM)
      .map(name => [name, hers[name]]))
  }

  objected (name, at = now()) {
    return strength(this.sightings.filter(row => row.name === name && !row.more).map(row => [row.at, true,
      row.closeness]), at)
  }

  /** The sides she has noted so far, strongest first, so that one thing keeps one name. */
  noted () {
    const names = [...new Set([...Object.keys(this.grown), ...this.sightings.map(row => row.name)])]
    const latest = Object.fromEntries(this.sightings.map(row => [row.name, row.what]))
    const at = now(), wanted = new Map(names.map(name => [name, this.wanted(name, at)]))
    return Object.fromEntries(names.sort((one, other) => wanted.get(other) - wanted.get(one)).slice(0, NOTED)
      .map(name => [name, this.grown[name] || latest[name] || '']))
  }

  /** One sighting of a person shaping her; the name when it has been wanted enough and has no sentence yet. "More"
   * counts once in a day, "less" every time. Whatever word they use, "less" is about the side she is in. */
  sighted (subject, found, closeness, at = now()) {
    let name = found.name
    const more = found.more
    if (closeness < TEACH_FROM) return null
    const grown = Object.keys(this.grown)
    if (!more && !Object.hasOwn(this.grown, name) && grown.length) {
      const strongest = grown.reduce((best, held) => this.wanted(held) > this.wanted(best) ? held : best)
      name = this.holding(at).find(held => Object.hasOwn(this.grown, held)) ?? strongest
    }
    if (more && this.sightings.some(row => row.subject === subject && row.name === name && row.more &&
        at - row.at < SPACED)) return null
    this.sightings.push({ subject, at, name, more, closeness, what: found.what })
    this._write(db => db.prepare(
      'insert into sightings (subject, at, name, more, closeness, what) values (?, ?, ?, ?, ?, ?)'
    ).run(subject, at, name, more ? 1 : 0, closeness, found.what))
    if (Object.hasOwn(this.grown, name)) {
      if (this.objected(name, at) >= GROWS) this.dropSide(name)
      return null
    }
    return this.wanted(name, at) >= GROWS ? name : null
  }

  /** What people asked of her under this name, the latest last: what her sentence is made from. */
  wants (name) {
    return [...new Set(this.sightings.filter(row => row.name === name && row.more && row.what).map(row => row.what))]
      .slice(-WANTS)
  }

  /** A side of hers from now on. A sentence saying what one of hers says is that side, whatever her model calls it. */
  grow (name, made) {
    const like = Object.keys(this.grown).reduce((best, held) => best === null || overlap(this.grown[held], made.what) >
      overlap(this.grown[best], made.what) ? held : best, null)
    const fresh = like && overlap(this.grown[like], made.what) >= SAME ? like : made.name
    if (!this.names.includes(fresh)) return
    for (const row of this.sightings) if (row.name === name) row.name = fresh
    this.grown[fresh] = made.what
    this._write(db => {
      db.prepare('update sightings set name = ? where name = ?').run(fresh, name)
      db.prepare('insert or replace into sides values (?, ?, ?)').run(fresh, made.what, this.weights[fresh] ?? 0)
    })
  }

  /** A person's own sentence for a side, or a new side by hand, and how much of her it is. By default as much as a side
   * that has just grown. Her next draw takes it in. */
  writeSide (name, what, weight = GROWS) {
    if (!this.names.includes(name)) throw new py.ValueError(`Not a side she can have: ${name}.`)
    this.grown[name] = what
    this.weights[name] = weight
    this._write(db => db.prepare('insert or replace into sides values (?, ?, ?)').run(name, what, weight))
  }

  /** Gone, and what taught it with it, so growing it again starts over. */
  dropSide (name) {
    const found = Object.hasOwn(this.grown, name)
    delete this.grown[name]
    delete this.weights[name]
    this.sightings = this.sightings.filter(row => row.name !== name)
    this._write(db => {
      db.prepare('delete from sides where name = ?').run(name)
      db.prepare('delete from sightings where name = ?').run(name)
    })
    return found
  }

  /** What she answers in: what the reading names; a message too short to tell keeps the last one. */
  language (subject, reading, said) {
    let named = (py.truthy(reading?.language) ? py.str(reading.language) : '').toLowerCase()
    if (!Object.hasOwn(LANGUAGES, named)) {
      named = this.languages.get(subject) || (py.truthy(reading) ? '' : languageOf(said))
    }
    if (named && this.languages.get(subject) !== named) {
      this.languages.set(subject, named)
      this._write(db => db.prepare('insert or replace into people values (?, ?)').run(subject, named))
    }
    return named
  }

  /** One lesson; true when it is time to sleep. Strangers teach nothing. */
  teach (subject, language, form, note, closeness, words) {
    if (closeness < TEACH_FROM) return false
    this.net.teach(form, note.feel, note.mood, closeness)
    this.marks.teach(language, form, note.mood, closeness, words)
    const count = this.net.lessons.length
    this._write(db => db.prepare('insert into lessons (subject, at, language, form, feel, mood, closeness, words) ' +
      'values (?, ?, ?, ?, ?, ?, ?, ?)').run(subject, now(), language, py.dumps(form, { ascii: false }),
      py.dumps(note.feel, { floats: true }), note.mood, closeness, py.dumps(words, { ascii: false })))
    this._put('tone', this.tone.v)
    return SLEEPS_AT.includes(count) || count % 100 === 0
  }

  /** Her lessons replayed on a copy, so she can answer meanwhile; what she learned during it is replayed after. */
  async sleep () {
    if (this.sleeping) return
    this.sleeping = true
    const twin = this.net.copy(), before = this.net.lessons.length
    const marks = new Marks(this.marks.base)
    marks.lessons = [...this.marks.lessons]
    try {
      await twin.sleep(before)
      const heads = await marks.trained(before)
      for (const [form, feel, mood, closeness] of this.net.lessons.slice(before)) {
        twin.teach(form, feel, mood, closeness)
      }
      this.net = twin
      this.marks.heads = heads
      this._put('net', { w: Object.fromEntries(twin.w), b: twin.b, lessons: twin.lessons.length })
      this._put('marks', heads)
    } finally {
      this.sleeping = false
    }
  }

  /** A person asks to be forgotten: what they taught goes, and she is built again from what is left. Her tone cannot be
   * told apart by person, so it goes back to normal. How many lessons went. */
  async forget (subject) {
    const gone = this._write(db => {
      const count = Number(db.prepare('delete from lessons where subject = ?').run(subject).changes)
      db.prepare('delete from people where subject = ?').run(subject)
      db.prepare('delete from sightings where subject = ?').run(subject)
      db.exec('delete from sides where own = 0 and name not in (select name from sightings where more = 1)')
      db.exec('delete from state')
      return count
    })
    this.awake = false
    this.wake()
    await this.sleep()
    return gone
  }

  /** All she learned of anyone goes, her sides and her tone with it, and she is as she was born. How many lessons
   * went. */
  async wipe () {
    const gone = this._write(db => {
      const count = Number(db.prepare('delete from lessons').run().changes)
      for (const table of ['people', 'sightings', 'sides', 'state']) db.exec(`delete from ${table}`)
      return count
    })
    this.awake = false
    this.wake()
    await this.sleep()
    return gone
  }

  report () {
    const at = now()
    return { lessons: this.net.lessons.length, starter: py.round(this.net.share(), 2), born: this.net.born.length,
      tone: Object.fromEntries(Object.entries(this.tone.v).map(([name, value]) => [name, py.round(value, 3)])),
      sides: { ...this.grown }, held: this.holding(),
      days: Math.max(0, py.round((this.held.since + HOLD - at) / 86400)),
      weights: Object.fromEntries(Object.keys(this.grown).map(name => [name, py.round(this.weight(name), 1)])),
      noted: Object.fromEntries(Object.keys(this.noted()).map(name => [name, py.round(this.wanted(name), 1)])),
      ...this.last }
  }

  close () {
    if (this.db !== null) {
      this.db.close()
      this.db = null
    }
  }
}

// ---- one turn: her model's calls around a message -------------------------------------------------------------------
const settled = promise => promise.then(text => ({ text }), error => ({ error }))
const seconds = () => performance.now() / 1000

/** One message on its way to her answer: her reading starts at once, her vote once her memory has been looked up. */
export class Turn {
  constructor (gut, ask, prompt, said, subject) {
    Object.assign(this, { gut, ask, prompt, said, subject })
    this.began = seconds()
    this.reading = settled(Promise.resolve().then(() => ask(readingMessages(said), 300)))
    this.told = ''
    this.closeness = 0.0
    this.language = ''
    this.before = []
  }

  /** Her reading, waiting for it (the note may come long after the answer it was too late for). */
  async form (wait = 30.0) {
    let timer
    const late = new Promise(resolve => { timer = setTimeout(resolve, wait * 1000, {}) })
    const found = await Promise.race([this.reading, late])
    clearTimeout(timer)
    return found.text !== undefined ? jsonIn(found.text) : null
  }

  /** The line beside the message; "" when nothing came in time, and she answers as she would without a gut. */
  async feel (before, memory, closeness, exchanges) {
    this.before = before
    const voting = settled(Promise.resolve().then(() => this.ask(voteMessages(this.prompt, before, memory, this.said),
      160)))
    let voted = null, read = null
    voting.then(found => { voted = found })
    this.reading.then(found => { read = found })
    let timer
    const late = new Promise(resolve => { timer = setTimeout(resolve, Math.max(0.1, limits.TIME_LIMIT -
      (seconds() - this.began)) * 1000) })
    await Promise.race([Promise.all([voting, this.reading]), late])
    clearTimeout(timer)
    const vote = voted?.text !== undefined ? vector(voted.text) : null
    const form = read?.text !== undefined ? jsonIn(read.text) : null
    this.closeness = closeness
    this.language = this.gut.language(this.subject, form, this.said)
    const felt = this.gut.feel(form, vote, closeness, exchanges, this.language)
    this.told = felt.told
    const speak = Object.hasOwn(LANGUAGES, this.language) ? `Reply in ${LANGUAGES[this.language]}.` : ''
    this.gut.last = { told: this.told, share: py.round(felt.share, 2), voted: vote !== null, read: form !== null }
    return [this.told, speak].filter(Boolean).join(' ')
  }

  /** After she has answered: her note, with the form a lesson, and whether this person is shaping her. Nothing here may
   * hold up a reply: run it beside the conversation. The note, or null when there was no form or she wrote none. The
   * two do not depend on each other: a failed reading of the person loses no lesson. */
  async learn (reply) {
    const [note] = await Promise.allSettled([this._note(this.before, reply), this._shape(this.before, reply)])
    if (note.status === 'rejected') throw note.reason
    return note.value
  }

  async _note (before, reply) {
    const form = await this.form()
    if (form === null) return null
    const messages = noteMessages(this.prompt, this.told, before, this.said, reply)
    let note = null
    for (let attempt = 0; attempt < 2; attempt++) {
      note = written(await this.ask(messages, 120))
      if (note) break
    }
    if (note === null) return null
    const gut = this.gut, language = this.language || languageOf(this.said)
    gut.last = { ...gut.last, note }
    const words = mine(this.said, reply, language)
    if (gut.teach(this.subject, language, form, note, this.closeness, words)) await gut.sleep()
    return note
  }

  /** Are they making something of her? Who she already is, in her character, is no side. */
  async _shape (before, reply) {
    const gut = this.gut
    if (this.closeness < TEACH_FROM) return
    const found = shaping(await this.ask(shapingMessages(before, this.said, reply, gut.noted()), 120))
    if (found === null || this.prompt.includes(found.name)) return
    const name = gut.sighted(this.subject, found, this.closeness)
    if (name) {
      const made = grownSide(await this.ask(growMessages(name, gut.wants(name), gut.grown, gut.names), 160))
      if (made) gut.grow(name, made)
    }
  }
}

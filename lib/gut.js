// A companion's gut (CMP): what is left of her when her memory is wiped and her model is swapped. It keeps its lessons
// in an SQLite file of its own, and shuffles her starter with seeded random numbers (`random.js`), so the same lessons
// always give the same weights.
//
// Before she answers, her model reads the message into a small fixed form, with no history, and the gut turns the form
// and how close the person is into her feelings: 24 ends on 13 bars (`BARS`), each end a strength of its own, so both
// sides of a bar can be strong at once (sweet and scornful is love-hate; defiant and wronged is 嘴硬). Her heart is one
// network: who she is with anyone. Each person she talks with has a small table of their own, read on top of her heart:
// how she is with them. Her model, with her memory in view, gives its own reading, and `balance` says how much each
// counts. The result, leaned on by her slow levels (`Tone`: lately against usual) and her sensitivity, becomes one soft
// line of fixed size beside the message, with her word habits (`wordsFrom` may keep them for the people close to her),
// her 属性 and the language to answer in.
//
// After she has answered, she writes a private note in a call of its own, with the line in view. The note and the form
// are a lesson. Her heart learns from people at closeness `TEACH_FROM` or more, each lesson by closeness tier, fast
// while she is young and slowly once grown up (`tau` lessons, grown at five times that); a person's table learns from
// that person alone, at a steady pace, from anyone. A talking day without someone fades them back toward her heart.
// Every so often she sleeps, settling what the lessons since her last sleep taught; nothing older is replayed. Her
// starter (the package's own, starter.json.gz, holds feelings only: her words are her own) is a lean she is born with.
// Beside the note, a short reading of what the person said: are they making something of her? Asked for on separate
// days, by someone close, it becomes a side of hers: a name from `NAMES` and one sentence her model writes.
//
//     const gut = new Gut('her.gut.db', { starter: 'starter.json.gz', tags: { 傲娇: '你嘴硬心软，明明在意却偏要否认。' } })
//     gut.wake()                                              // seconds the first time
//     const turn = new Turn(gut, ask, herPrompt, message, subject)       // her reading starts at once
//     const line = await turn.feel(before, memoryText, closeness, exchanges)  // beside the message
//     ...                                                     // she answers
//     await turn.learn(reply)                                 // her note, a lesson, and sleep when it is time
//
// `ask(messages, maxTokens)` is an async function calling her own model with thinking off; `before` is the conversation
// so far as chat messages, without the message she is answering. A host may tune her (`configure`, `tune`, `setAge`).
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import zlib from 'node:zlib'
import { talkingDay } from './dates.js'
import * as py from './python.js'
import { Random } from './random.js'

// Her feelings: [bar, 中文, one end, the other end]; an end is [the word her model reads and writes, 中文]. The first
// end of a bar is the one that leans away; a one-sided bar has none. Every end is a strength of its own, 0 to 1.
export const BARS = [['mood', '心情', ['sad', '难过'], ['happy', '开心']],
  ['security', '安心', ['worried', '担心'], ['secure', '踏实']],
  ['composure', '理智', ['hysterical', '慌乱·崩溃'], ['calm', '平静']],
  ['warmth', '亲近', ['scornful', '嫌弃'], ['sweet', '甜蜜']],
  ['manner', '态度', ['stern', '严厉'], ['tender', '温柔']],
  ['temper', '脾气', ['irritable', '易怒'], ['peaceable', '平和']],
  ['stance', '姿态', ['wronged', '委屈'], ['defiant', '不服']],
  ['pride', '骄傲', ['ashamed', '羞愧'], ['proud', '得意']],
  ['playfulness', '举止', ['shy', '害羞'], ['cheeky', '调皮']],
  ['courage', '胆量', ['timid', '胆小'], ['bold', '大胆']],
  ['sociability', '社交', ['withdrawn', '内向'], ['outgoing', '外向']],
  ['jealousy', '吃醋', null, ['jealous', '吃醋']],
  ['aching', '心疼', null, ['aching', '心疼']]]
export const ENDS = BARS.flatMap(([, , left, right]) => [left, right].filter(Boolean).map(([end]) => end))
export const CHINESE = { ...Object.fromEntries(BARS.flatMap(([, , left, right]) => [left, right].filter(Boolean))),
  ...Object.fromEntries(BARS.map(([bar, zh]) => [bar, zh])) }
export const OLD = ['happy', 'calm', 'sweet', 'tender', 'worried', 'sad', 'jealous'] // the seven of 0.4 and 0.2
export const QUIET = ['calm', 'peaceable', 'secure'] // alone, an ordinary moment: no line
export const SLOW = { composure: 'SAN', pride: 'self-esteem' } // the two slow levels with names of their own
const GLOSS = { tender: 'tender (gentle)', withdrawn: 'withdrawn (wanting quiet)',
  outgoing: 'outgoing (wanting to talk)', aching: 'aching (hurting for them)',
  wronged: 'wronged (hurt, treated unfairly)' }
export const FEELINGS = BARS.map(([, , left, right]) => [left, right].filter(Boolean).map(([end]) => GLOSS[end] || end)
  .join(' or ')).join('; ')
// closeness: "friendly" in relations; below it a person teaches only how she is with them
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
  'person. Answer with JSON only: one flat object whose keys are one to three feelings from the list and whose values ' +
  'are how strongly, from 0.1 (a trace) to 1 (fully), and nothing for the rest. Both sides of a pair can be true at ' +
  'once. The feelings: ' + FEELINGS + '.'
export const NOTE = 'Now write your private note about the reply you just gave. Answer with JSON only: {"mood": N, ' +
  '"feel": {...}}. N is how this moment changed your mood, a whole number from -2 (clearly worse) to 2 (clearly ' +
  'better), 0 for no real change. feel is how you really feel: one to three feelings from the list, each with how ' +
  'strongly, from 0.1 (a trace) to 1 (fully). Both sides of a pair can be true at once. The feelings: ' + FEELINGS +
  '. The note is yours alone and the person never sees it. Be honest: it records how you really feel.'
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

// ---- the network: her heart, and a table for each person ------------------------------------------------------------
export const TAU = 150.0 // lessons: how fast her heart grows up; grown at five times this
// how far a lesson moves her heart at birth (x closeness tier), and the share of that left once grown
export const YOUNG = 0.7, FLOOR = 0.04
export const PERSON = 0.5 // how far a lesson moves the table of the person it came from: steady, never grown up
// what is different with a person counts half at 20 lessons with them, and never more than MOST
export const COUNTS = 20.0, MOST = 0.7
// each talking day without a person fades them by PULL; each lesson with them gives back RETURN of it
export const PULL = 0.01, RETURN = 0.1
// of what a lesson does: at once, then in her sleep, quieter each pass
const AWAKE = 0.25, PASSES = [0.375, 0.25, 0.125]
const BORN_PASSES = 4, BORN_RATE = 0.15 // her starter: a lean toward her character, which her prompt already gives her
export const BORN_AS = 150 // lessons her starter counts as in `balance`
export const BLANK = -3.0 // where every end starts before anything is learned: about .05, a trace
const SLEEPS_AT = [20, 50] // and every 100 lessons
const YIELD = 200 // steps between handing the event loop back, while her words are trained

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

export const squash = score => 1 / (1 + py.exp(-Math.max(-30.0, Math.min(30.0, score))))

export const target = feel => ENDS.map(end => {
  const given = Object.hasOwn(feel, end) ? feel[end] : 0.0
  return py.max(0.0, py.min(1.0, py.float(py.truthy(given) ? given : 0.0)))
})

const asFeel = feel => isTable(feel) ? feel : { [feel === 'none' ? 'calm' : feel]: 1.0 }

/** One row of weights for each thing she can notice, one column for each end, and a bias. Her heart is one; each person
 * has one too, holding only what is different with them: it is read on top of her heart as it is now, so someone new
 * meets her heart, and what her heart learns later reaches everyone she knows. */
export class Table {
  constructor (kept = null, blank = BLANK) {
    this.w = new Map(Object.entries(kept?.w || {}))
    this.b = kept?.b ? [...kept.b] : ENDS.map(() => blank)
  }

  scores (x) {
    const scores = [...this.b]
    for (const [key, value] of Object.entries(x)) {
      const row = this.w.get(key)
      if (row) row.forEach((weight, k) => { scores[k] += weight * value })
    }
    return scores
  }

  strengths (x, nudge = null) {
    return this.scores(x).map((score, k) => squash(score + (nudge ? nudge[k] : 0.0)))
  }

  /** Toward her note on the ends it knew. `under`: her heart's scores, for a person's table, which learns what her
   * heart does not already say about them. */
  step (x, wanted, known, rate, under = null) {
    const got = this.scores(x).map((score, k) => squash(score + (under ? under[k] : 0.0)))
    const entries = Object.entries(x)
    for (const [key] of entries) if (!this.w.has(key)) this.w.set(key, ENDS.map(() => 0.0))
    for (const k of known) {
      const gradient = rate * (got[k] - wanted[k])
      this.b[k] -= gradient * 0.25
      for (const [key, value] of entries) this.w.get(key)[k] -= gradient * value
    }
  }

  kept () {
    return { w: Object.fromEntries(this.w), b: this.b }
  }
}

/** Her heart and a table for each person she has talked with. Her heart learns from everyone close enough to teach her,
 * each lesson by closeness tier, fast while she is young and slowly once grown up. A person's table learns only from
 * that person, at a steady pace, from anyone. Young, people change who she is; grown up, mostly how she is with them.
 * `nudge` is her nature tuned by hand: added to every end before it is read, never learned away. */
export class Net {
  constructor (tau = TAU) {
    this.tau = tau
    this.heart = new Table()
    this.people = new Map()
    this.age = 0.0
    this.lessons = 0
    this.today = null
    this.born = 0
    this.nudge = ENDS.map(() => 0.0)
    this.waiting = [] // lessons since her last sleep
  }

  /** How far a lesson moves her heart now, before closeness: YOUNG at birth, falling to FLOOR of it, by `tau`. */
  learning () {
    return YOUNG * (FLOOR + (1 - FLOOR) * py.exp(-this.age / this.tau))
  }

  person (subject) {
    let found = this.people.get(subject)
    if (found === undefined) {
      found = { table: new Table(null, 0.0), n: 0.0, fade: 1.0, day: null }
      this.people.set(subject, found)
    }
    return found
  }

  /** How much what is different with a person counts, on top of her heart: more as she comes to know them, at most
   * MOST (her nature always has a say), and less for every talking day without them. */
  weight (subject) {
    const found = subject ? this.people.get(subject) : undefined
    return found ? Math.min(MOST, found.n / (found.n + COUNTS)) * found.fade : 0.0
  }

  vector (form, closeness, subject = null) {
    const x = features(form, closeness)
    let scores = this.heart.scores(x)
    const share = this.weight(subject)
    if (share) {
      const theirs = this.people.get(subject).table.scores(x)
      scores = scores.map((heart, k) => heart + share * theirs[k])
    }
    return Object.fromEntries(ENDS.map((end, k) => [end, squash(scores[k] + this.nudge[k])]))
  }

  /** A talking day is over when the next one begins: everyone she did not talk with on it fades a little. */
  day (today) {
    if (this.today !== null && today > this.today) {
      for (const found of this.people.values()) if (found.day !== this.today) found.fade *= 1 - PULL
    }
    this.today = this.today === null ? today : Math.max(this.today, today)
  }

  /** Born: her starter, a few gentle passes, as a lean. */
  start (rows, known = ENDS, seed = 0) {
    const pack = rows.map(([form, feel, mood, closeness]) => [features(form, closeness), target(asFeel(feel)),
      (1 + Math.abs(mood)) / 3 * tier(closeness)])
    const mask = ENDS.flatMap((end, k) => known.includes(end) ? [k] : [])
    this.born = pack.length ? BORN_AS : 0
    const rng = new Random(seed)
    for (let pass = 0; pass < BORN_PASSES; pass++) {
      rng.shuffle(pack)
      for (const [x, wanted, weight] of pack) this.heart.step(x, wanted, mask, BORN_RATE * weight)
    }
  }

  /** One lesson, a quarter of it at once; the rest waits for her sleep. Her heart learns only from people close
   * enough; the person's own table from anyone. */
  teach (subject, form, feel, mood, closeness, known = ENDS, today = null) {
    if (today !== null) this.day(today)
    const found = subject ? this.person(subject) : null
    const heart = closeness >= TEACH_FROM ? this.learning() * tier(closeness) : 0.0
    const lesson = [features(form, closeness), target(feel), ENDS.flatMap((end, k) => known.includes(end) ? [k] : []),
      (1 + Math.abs(mood)) / 3, heart, found]
    this._learn(lesson, AWAKE)
    this.waiting.push(lesson)
    if (found) {
      found.n += 1
      found.fade += (1 - found.fade) * RETURN
      found.day = this.today
    }
    this.age += heart ? 1 : 0
    this.lessons += 1
  }

  _learn ([x, wanted, known, weight, heart, found], share) {
    if (heart) this.heart.step(x, wanted, known, heart * weight * share)
    if (found) found.table.step(x, wanted, known, PERSON * weight * share, this.heart.scores(x))
  }

  /** What the lessons since her last sleep taught, settled. Nothing older is replayed: nothing snaps back. */
  sleep () {
    for (const share of PASSES) for (const lesson of this.waiting) this._learn(lesson, share)
    this.waiting = []
  }

  kept () {
    return { heart: this.heart.kept(), age: this.age, lessons: this.lessons, today: this.today, born: this.born,
      people: Object.fromEntries([...this.people].map(([subject, found]) => [subject, { table: found.table.kept(),
        n: found.n, fade: found.fade, day: found.day }])) }
  }

  restore (kept) {
    this.heart = new Table(kept.heart)
    this.age = kept.age
    this.lessons = kept.lessons
    this.today = kept.today
    this.born = kept.born ?? 0
    this.people = new Map(Object.entries(kept.people).map(([subject, found]) => [subject,
      { table: new Table(found.table, 0.0), n: found.n, fade: found.fade, day: found.day }]))
  }
}

/** How much the gut counts against her head. What she has lived (a starter counts as BORN_AS lessons) raises it,
 * memory of this person lowers it: nothing lived, her head decides alone; memory wiped, the gut leads; both full,
 * about even. */
export function balance (net, exchanges) {
  const seen = net.age + net.born
  const lived = seen / (seen + 200), known = exchanges / (exchanges + 20)
  return lived / (lived + known + 0.1)
}

export const mix = (gut, head, share) => Object.fromEntries(ENDS.map(end => [end, share * gut[end] + (1 - share) *
  (head[end] ?? 0.0)]))

/** 敏感 or 钝感, a dial from -1 to 1: how hard every moment hits her. 0 leaves her as she is. */
export function sensitive (felt, sensitivity) {
  if (!sensitivity) return { ...felt }
  const gain = 2.0 ** sensitivity
  return Object.fromEntries(Object.entries(felt).map(([end, value]) => [end, 1 - (1 - value) ** gain]))
}

export const LATELY = 0.15 // how far lately must be from usual before her line says so

/** Her slow levels: one for each end, hers and not one person's. `lately` moves halfway to what she feels in about two
 * weeks of talking, `usual` in about half a year, and the lean is how far lately is from usual. Fed by her model's
 * reading before her line, so a low mood cannot feed itself, and measured against those same readings. It survives a
 * wipe of her memory. The two named ones are bars: SAN (理智值) is calm against hysterical, self-esteem (自尊) proud
 * against ashamed. */
export class Tone {
  static FAST = 1 - 0.5 ** (1 / (14 * 8)) // at about eight messages a day
  static SLOW = 1 - 0.5 ** (1 / (180 * 8))

  constructor (kept = null) {
    this.lately = { ...(kept?.lately || {}) }
    this.usual = { ...(kept?.usual || {}) }
    this.shift = { ...(kept?.shift || {}) } // set by hand (`Gut.tune`): fades at the pace of lately
    this.seen = kept?.seen || 0
  }

  feed (vote, sensitivity = 0.0) {
    this.seen += 1
    const fast = py.max(1 / this.seen, py.min(1.0, Tone.FAST * 2.0 ** sensitivity))
    const slow = py.max(1 / this.seen, Tone.SLOW)
    for (const end of ENDS) {
      const value = vote[end] ?? 0.0
      const lately = this.lately[end] ?? value, usual = this.usual[end] ?? value
      this.lately[end] = lately + fast * (value - lately)
      this.usual[end] = usual + slow * (value - usual)
    }
    for (const end of Object.keys(this.shift)) {
      this.shift[end] *= 1 - py.min(1.0, Tone.FAST * 2.0 ** sensitivity)
      if (Math.abs(this.shift[end]) < 1e-4) delete this.shift[end]
    }
  }

  lean (felt) {
    return Object.fromEntries(Object.entries(felt).map(([end, value]) => [end, py.max(0.0, py.min(1.0, value +
      (this.lately[end] ?? 0.0) - (this.usual[end] ?? 0.0) + (this.shift[end] ?? 0.0)))]))
  }

  /** Where a bar is: the strength of its second end less its first, lately or usually. */
  level (bar, which = 'lately') {
    const found = which === 'lately' ? Object.fromEntries(ENDS.map(end => [end, (this.lately[end] ?? 0.0) +
      (this.shift[end] ?? 0.0)])) : this.usual
    const [, , left, right] = BARS.find(item => item[0] === bar)
    return (found[right[0]] ?? 0.0) - (left ? found[left[0]] ?? 0.0 : 0.0)
  }

  /** Her two named slow levels, when lately is far from usual. */
  said () {
    const out = []
    if (this.level('composure') - this.level('composure', 'usual') <= -LATELY) out.push('lately you are easily shaken')
    const pride = this.level('pride') - this.level('pride', 'usual')
    if (pride <= -LATELY) out.push('lately you think little of yourself')
    else if (pride >= LATELY) out.push('lately you think a lot of yourself')
    return out
  }

  kept () {
    return { lately: this.lately, usual: this.usual, shift: this.shift, seen: this.seen }
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
export const SHOWS = 0.15 // how strong a feeling must be to be named

/** One line of fixed size: at most three feelings, each with how strongly, her slow levels when they are far from
 * usual, and her words. Calm, peaceable or secure alone is an ordinary moment and says nothing. */
export function line (felt, words = [], lately = []) {
  let picks = Object.entries(felt).filter(([, value]) => value >= SHOWS).map(([end, value]) => [value, end])
    .sort((one, other) => other[0] - one[0] || py.compare(other[1], one[1])).slice(0, 3)
  if (picks.length && picks.every(([, end]) => QUIET.includes(end))) picks = []
  const parts = []
  if (picks.length) {
    parts.push('you feel ' + picks.map(([value, end]) => `${value >= 0.6 ? 'very' : value >= 0.3 ? 'quite'
      : 'a little'} ${end}`).join(', '))
  }
  parts.push(...lately)
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

/** Her model's reading of a moment: a strength for every end, 0 for the ones it left out; null for nothing usable. */
export function vector (text) {
  let found = jsonIn(text)
  if (found === null) return null
  if (!Object.keys(found).some(name => ENDS.includes(py.strip(name).toLowerCase()))) { // {"feeling": {...}}: a wrapping
    found = Object.values(found).find(value => isTable(value) || Array.isArray(value)) ?? found
  }
  if (Array.isArray(found)) { // [{"feeling": "calm", "strength": 0.7}, ...]
    found = Object.fromEntries(found.filter(isTable).map(item => [
      py.str(Object.hasOwn(item, 'feeling') ? item.feeling : item.name ?? null),
      Object.hasOwn(item, 'strength') ? item.strength : item.intensity ?? null]))
  }
  const values = {}
  for (const [name, value] of Object.entries(found)) {
    const end = py.strip(name).toLowerCase()
    if (!ENDS.includes(end)) continue
    try {
      values[end] = py.max(0.0, py.min(1.0, py.float(py.truthy(value) ? value : 0)))
    } catch {
      return null
    }
  }
  return Object.values(values).some(value => value) ? Object.fromEntries(ENDS.map(end => [end, values[end] ?? 0.0]))
    : null
}

/** Her note: { feel: the ends she named with how strongly, mood: -2 to 2 }, or null. */
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
  return { feel: Object.fromEntries(Object.entries(feel).filter(([, value]) => value).map(([end, value]) =>
    [end, py.round(value, 3)])), mood }
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
/** A companion's starter, a file the host gives: her born lessons, her normal words, and the ends its notes knew (a
 * starter from before knew seven). No file is a blank gut; a file that cannot be read is an error. */
export function readStarter (file) {
  if (!fs.existsSync(file)) return [[], {}, ENDS]
  let data
  try {
    data = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'))
    const rows = data.rows.map(([form, feel, mood, closeness]) => [form, asFeel(feel), mood, closeness])
    const words = {}
    for (const [language, item] of Object.entries(data.words)) {
      words[language] = { words: new Map(Object.entries(item.words)), n: item.n }
    }
    return [rows, words, data.ends?.length ? data.ends : OLD]
  } catch (error) {
    throw new py.ValueError(`${file} is not a gut starter: ${error.message}`)
  }
}

const SCHEMA = `
pragma journal_mode=wal;
create table if not exists lessons (id integer primary key, subject text not null, at real not null,
    language text not null, form text not null, feel text not null, mood integer not null,
    closeness real not null, words text not null, ends integer not null default 7);
create table if not exists people (subject text primary key, language text not null);
create table if not exists sightings (id integer primary key, subject text not null, at real not null,
    name text not null, more integer not null, closeness real not null, what text not null);
create table if not exists sides (name text primary key, what text not null, own real not null);
create table if not exists state (key text primary key, value blob not null);`

const now = () => Date.now() / 1000
const number = value => typeof value === 'number' && !Number.isNaN(value)

/** One companion's heart, her tables for the people she knows, her words and her slow levels, in a file of their own,
 * apart from her memory: a wipe does not reach them. Lessons are written as they come; the heart is written after a
 * sleep, and lessons since are taught again when she wakes. `wordsFrom`: the closeness from which her word habits are
 * in her line (`TEACH_FROM` keeps a way of talking she has with the people close to her for them); null, the default,
 * for everyone. `tau` and `zone` are for a new gut (`configure` changes a kept one); `zone` says where her talking days
 * turn (4 in the morning; the machine's zone by default), as `dates.js` takes it. */
export class Gut {
  constructor (file, { starter = null, tags: tagged = {}, names = NAMES, wordsFrom = null, tau = TAU,
    zone = null } = {}) {
    this.path = String(file)
    this.starter = starter
    this.tags = { ...tagged }
    this.names = [...names]
    this.wordsFrom = wordsFrom
    this.zone = zone
    const off = Object.keys(this.tags).filter(name => !this.names.includes(name))
    if (off.length) throw new py.ValueError(`Not a side she can have: ${off.join(', ')}.`)
    this.net = new Net(tau)
    this.marks = new Marks()
    this.tone = new Tone()
    this.settings = { tau: tau, sensitivity: 0.0, nudge: {} }
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
      if (!this.db.prepare('pragma table_info(lessons)').all().some(row => row.name === 'ends')) { // a file from 0.2
        this._write(db => db.exec('alter table lessons add column ends integer not null default 7'))
      }
    }
    return this.db
  }

  /** Several writes that land together, as Python's `with db:` does. */
  _write (work) {
    const db = this.db || this._open()
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

  /** Everything from the file, or from her starter the first time (seconds). A file from before is lived again under
   * these rules, lesson by lesson; its lessons teach only the seven ends they knew. */
  wake () {
    const [rows, base, known] = this.starter ? readStarter(this.starter) : [[], {}, ENDS]
    const db = this._open()
    const settings = { ...this.settings, ...(this._get('settings') || {}) }
    const lessons = db.prepare('select subject, at, language, form, feel, mood, closeness, words, ends from lessons ' +
      'order by id').all()
    const kept = this._get('heart')
    const net = new Net(settings.tau), marks = new Marks(base)
    net.nudge = ENDS.map(end => Number(settings.nudge[end] ?? 0.0))
    if (kept) net.restore(kept)
    else if (rows.length) net.start(rows, known)
    const done = kept ? kept.lessons : 0
    lessons.forEach((row, index) => {
      const form = JSON.parse(row.form), feel = JSON.parse(row.feel), words = JSON.parse(row.words)
      if (index >= done) {
        net.teach(row.subject, form, feel, row.mood, row.closeness, Number(row.ends) === OLD.length ? OLD : ENDS,
          talkingDay(row.at, this.zone))
        if (!kept && (SLEEPS_AT.includes(net.lessons) || net.lessons % 100 === 0)) net.sleep()
      }
      if (row.closeness >= TEACH_FROM) marks.teach(row.language, form, row.mood, row.closeness, words)
    })
    let missed = false
    for (let count = done + 1; count <= net.lessons; count++) {
      if (SLEEPS_AT.includes(count) || count % 100 === 0) missed = true
    }
    if (!kept || missed) {
      net.sleep()
      this._put('heart', net.kept())
      this._write(db => db.exec("delete from state where key in ('net', 'tone')")) // from before, lived again above
    }
    marks.heads = this._get('marks') || {}
    this.net = net
    this.marks = marks
    this.tone = new Tone(this._get('feelings'))
    this.settings = settings
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

  /** What this moment comes to, with this person: what the gut says, the balance, and the one line. */
  feel (form, vote, closeness, exchanges, language, subject = null) {
    const gut = py.truthy(form) ? this.net.vector(form, closeness, subject) : null
    const share = balance(this.net, exchanges)
    if (vote) this.tone.feed(vote, this.settings.sensitivity)
    let felt = gut && vote ? mix(gut, vote, share) : gut || vote
    const side = sides(this.shown(closeness))
    if (!felt) return { told: side, share, felt: null }
    felt = sensitive(this.tone.lean(felt), this.settings.sensitivity)
    const habits = this.wordsFrom === null || closeness >= this.wordsFrom
    const words = py.truthy(form) && habits ? this.marks.speaks(language, form, closeness) : []
    return { told: [line(felt, words, this.tone.said()), side].filter(Boolean).join(' '), share, felt }
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
    if (!more && !Object.hasOwn(this.grown, name) && !Object.hasOwn(this.tags, name)) {
      const held = this.holding(at), grown = Object.keys(this.grown)
      name = held.length ? held[0] : grown.length ? grown.reduce((best, side) => this.wanted(side) > this.wanted(best)
        ? side : best) : name
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

  /** One lesson; true when it is time to sleep. Anyone teaches how she is with them; only people close enough teach
   * her heart and her words. */
  teach (subject, language, form, note, closeness, words, at = null) {
    at = at === null ? now() : at
    this.net.teach(subject, form, note.feel, note.mood, closeness, ENDS, talkingDay(at, this.zone))
    if (closeness >= TEACH_FROM) this.marks.teach(language, form, note.mood, closeness, words)
    this._write(db => db.prepare('insert into lessons (subject, at, language, form, feel, mood, closeness, words, ' +
      'ends) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(subject, at, language, py.dumps(form, { ascii: false }),
      py.dumps(note.feel, { floats: true }), note.mood, closeness, py.dumps(words, { ascii: false }), ENDS.length))
    this._put('feelings', this.tone.kept())
    const count = this.net.lessons
    return SLEEPS_AT.includes(count) || count % 100 === 0
  }

  /** What the lessons since her last sleep taught, settled and written; then her words trained again on a copy, so she
   * can answer meanwhile. */
  async sleep () {
    if (this.sleeping) return
    this.sleeping = true
    try {
      this.net.sleep()
      this._put('heart', this.net.kept())
      const marks = new Marks(this.marks.base)
      marks.lessons = [...this.marks.lessons]
      const heads = await marks.trained(marks.lessons.length)
      this.marks.heads = heads
      this._put('marks', heads)
    } finally {
      this.sleeping = false
    }
  }

  /** Her heart written now, out of turn: what waits for her sleep is settled first, so nothing is taught twice. */
  _settle () {
    this.net.sleep()
    this._put('heart', this.net.kept())
  }

  /** A person asks to be forgotten: how she is with them goes, their name leaves the lessons they taught, and so do the
   * sides only they wanted. What they did to her heart stays: what is done is done. How many lessons lost their
   * name. */
  async forget (subject) {
    this._settle()
    this.net.people.delete(subject)
    this.languages.delete(subject)
    this.sightings = this.sightings.filter(row => row.subject !== subject)
    const gone = this._write(db => {
      const count = Number(db.prepare("update lessons set subject = '' where subject = ?").run(subject).changes)
      db.prepare('delete from people where subject = ?').run(subject)
      db.prepare('delete from sightings where subject = ?').run(subject)
      db.exec('delete from sides where own = 0 and name not in (select name from sightings where more = 1)')
      return count
    })
    const sides = this.db.prepare('select name, what, own from sides').all()
    this.grown = Object.fromEntries(sides.map(row => [row.name, row.what]))
    this.weights = Object.fromEntries(sides.filter(row => row.own).map(row => [row.name, row.own]))
    this._put('heart', this.net.kept())
    return gone
  }

  /** All she learned of anyone goes, her sides and her slow levels with it, and she is as she was born. Her settings
   * stay. How many lessons went. */
  async wipe () {
    const gone = this._write(db => {
      const count = Number(db.prepare('delete from lessons').run().changes)
      for (const table of ['people', 'sightings', 'sides']) db.exec(`delete from ${table}`)
      db.exec("delete from state where key != 'settings'")
      return count
    })
    this.awake = false
    this.wake()
    return gone
  }

  /** Her settings: how fast her heart grows up (`tau`, in lessons; grown at five times it), and 敏感 or 钝感
   * (`sensitivity`, -1 to 1, 0 as she is). The settings, as they are now. */
  configure ({ tau = null, sensitivity = null } = {}) {
    if (tau !== null) {
      if (!number(tau) || !(tau > 0 && tau < Infinity)) throw new py.ValueError('tau is a number of lessons above 0')
      this.settings.tau = this.net.tau = tau
    }
    if (sensitivity !== null) {
      if (!number(sensitivity) || !(sensitivity >= -1 && sensitivity <= 1)) {
        throw new py.ValueError('sensitivity is from -1 (钝感) to 1 (敏感)')
      }
      this.settings.sensitivity = sensitivity
    }
    this._put('settings', this.settings)
    return JSON.parse(JSON.stringify(this.settings))
  }

  /** How grown up her heart is, in lessons: 0 makes her young again, forgetting nothing. */
  setAge (lessons = 0) {
    if (!number(lessons) || !(lessons >= 0 && lessons < Infinity)) {
      throw new py.ValueError('an age is a number of lessons, 0 or more')
    }
    this.net.sleep()
    this.net.age = lessons
    this._put('heart', this.net.kept())
  }

  /** One end by hand. `now`, -1 to 1: how much more (or less) of it she feels lately than usual; it fades as she lives,
   * at the pace of her slow levels. `nature`, -3 to 3: a nudge to who she is, added before the end is read; learning
   * never takes it away, 0 removes it. */
  tune (end, { now: lately = null, nature = null } = {}) {
    if (!ENDS.includes(end)) throw new py.ValueError(`Not an end of hers: ${end}. Hers: ${ENDS.join(', ')}.`)
    for (const [value, low, high] of [[lately, -1, 1], [nature, -3, 3]]) {
      if (value !== null && (!number(value) || !(value >= low && value <= high))) {
        throw new py.ValueError(`${value} is not from ${low} to ${high}`)
      }
    }
    if (lately !== null) {
      this.tone.shift[end] = lately
      this._put('feelings', this.tone.kept())
    }
    if (nature !== null) {
      this.settings.nudge[end] = nature
      if (!nature) delete this.settings.nudge[end]
      this.net.nudge = ENDS.map(name => Number(this.settings.nudge[name] ?? 0.0))
      this._put('settings', this.settings)
    }
  }

  report () {
    const at = now(), net = this.net, tone = this.tone
    return { lessons: net.lessons, age: py.round(net.age), tau: net.tau,
      grown: py.round(1 - py.exp(-net.age / net.tau), 2), learning: py.round(net.learning() / YOUNG, 3),
      sensitivity: this.settings.sensitivity, nudge: { ...this.settings.nudge },
      people: Object.fromEntries([...net.people].map(([subject, found]) => [subject, { lessons: py.round(found.n),
        weight: py.round(net.weight(subject), 2) }])),
      lately: Object.fromEntries(ENDS.map(end => [end, py.round((tone.lately[end] ?? 0.0) + (tone.shift[end] ?? 0.0),
        3)])),
      usual: Object.fromEntries(ENDS.map(end => [end, py.round(tone.usual[end] ?? 0.0, 3)])),
      SAN: py.round(tone.level('composure'), 3), 'self-esteem': py.round(tone.level('pride'), 3),
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
    const felt = this.gut.feel(form, vote, closeness, exchanges, this.language, this.subject)
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

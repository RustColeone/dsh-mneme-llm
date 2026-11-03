// The plugin's hooks, apart from DeepSeek Harness itself so they can be tested without it: index.js hands in DSH's
// message constructor, how to tell its loop's model calls, and its home folder.
//
// Each turn starts with a message. One you type in DSH is yours; one a chat channel brings carries who sent it, and
// each sender is a person to her (some of those accounts may be yours); a turn anything else starts is her speaking up
// on her own. Before her first step, messages of her own go in front of the message, in the step, which DSH writes to
// the session log after its system prompt, so the session reopens as it was. In a new session's first step (DSH's
// events say she has said nothing in it yet), what she keeps of that person comes first: their first prompt if they
// turned it on, as they wrote it, then what stands for what she let go and the newest of what they said to each other,
// in any session, as text that says when and who said what. DSH keeps and compacts the session from then on, as do
// any other plugins that work on it. Then, in every turn, one block: who they are to her (and, when they are not you,
// who you are), her notes, what was said before that bears on it (her look, with her tools to search the rest), her
// mood's news, and her gut's line, which stays in the session log until DSH compacts it. When the turn ends, the
// exchange is kept word for word, her model judges her mood and writes what is worth remembering, the surface lets go
// of what is old, and she writes a note that teaches her gut. All of it runs on the model you use in DSH.
//
// `$first` and `$new` are commands typed as messages, answered in the session in the language the person writes in,
// with no model call; `/mneme-first` and `/mneme-new` are the same in DSH's own command list.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Gut, TEACH_FROM, Turn, draft, languageOf } from '../lib/gut.js'
import { Words, code, say } from '../lib/i18n.js'
import { Mneme } from '../lib/mneme.js'
import { fit } from '../lib/text.js'
import { Toolbox, specs } from '../lib/tools.js'

const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const DAY = 86400
const REFLECT = 5 // notes before her first impression of a person is written; then once a day at most
const PREFIX = 'mneme_' // her tools: mneme_search and mneme_read
const WRITES = 1500 // tokens her model may write for her memory's calls
const OWN = 'mneme-llm' // the source of her memory's own messages, and her record of each session
const COMMAND = /^\$(first|new)(?:\s+([\s\S]*))?$/
const KEYWORDS = new Set(['on', 'off', 'clear', 'deep', 'gut']) // a command's own words, which are in no language
// A channel brings a person's words inside one element that says who sent them: the first attribute is their account
// (qq="10001" is qq:10001), `nickname` or `name` their name. Text before it is the channel's own (a group's).
const SENT = /^([\s\S]*?)<([A-Za-z_][\w-]*)((?:\s+[\w-]+="[^"]*")+)\s*>\n?([\s\S]*?)\n?<\/\2>\s*$/
const MENTIONS = /^(?:@\d+(?:\s+|$))+/ // the mentions a message opens with, as a channel writes them: "@20002 "

// What the plugin says itself, in English and Chinese: the library's sentences, with these over them.
const SAYS = {
  en: {
    'first.shown': '{text}\n({how}; {when})',
    'first.set': 'you set this',
    'first.said': 'the first thing you said',
    'first.sent': 'she reads it first in every new session',
    'first.only': 'only kept',
    'first.none': 'There is no first prompt yet: set one with $first <text>.',
    'first.kept': 'Kept. $first on has her read it first in every new session.',
    'first.on': 'She reads it first in every new session.',
    'first.off': 'It is only kept now.',
    'first.cleared': 'Taken away.',
    'first.nothing': 'Nothing is kept.',
    'new.fresh': 'A fresh start: a new session begins with nothing of before in front of it. Every word stays in her ' +
      'deep memory.',
    'new.usage': 'Use $new, $new deep or $new gut.',
    'new.yours': 'Only the person she belongs to can do that.',
    'new.deep': '{count} exchanges gone for good, with every note.',
    'new.gut': '{count} exchanges gone for good, with every note, and {lessons} lessons of her gut: she is as she ' +
      'was born.',
    'owner.line': 'Your owner is {owner}.',
    'surface.said': 'What you and {who} said to each other lately, word for word, the oldest first, each with when ' +
      'it was said:',
  },
  zh: {
    'first.shown': '{text}\n（{how}；{when}）',
    'first.set': '这是你设的',
    'first.said': '这是你说的第一句话',
    'first.sent': '每个新会话她都先读它',
    'first.only': '只是记着',
    'first.none': '还没有第一条提示：用 $first <内容> 设一个。',
    'first.kept': '记下了。用 $first on，她在每个新会话都会先读它。',
    'first.on': '以后每个新会话，她都会先读它。',
    'first.off': '现在只是记着，新会话不会先读它。',
    'first.cleared': '拿掉了。',
    'first.nothing': '本来就没有记着什么。',
    'new.fresh': '重新开始：新会话前面不再放以前的内容。说过的每句话都还在她的深层记忆里。',
    'new.usage': '用法：$new、$new deep 或 $new gut。',
    'new.yours': '只有她的主人能这样做。',
    'new.deep': '{count} 段对话连同所有笔记，永久删除了。',
    'new.gut': '{count} 段对话连同所有笔记永久删除了，她的直觉学到的 {lessons} 条也一起删了：她回到了刚出生的样子。',
    'owner.line': '你的主人是{owner}。',
    'surface.said': '你和{who}最近说过的话，逐字保留，从最早的说起，每段都注明了说的时间：',
  },
}
/** The plugin's sentences in a language her gut names (Cantonese reads Chinese; any other, English). */
const wordsIn = language => new Words(language === 'zh' || language === 'yue' ? 'zh' : 'en', SAYS)

const textOf = message => (message?.content || []).filter(block => block.type === 'text').map(block => block.text)
  .join('')

/** Whether what a person said is one of the commands (a mention it opens with aside). */
const commanded = said => COMMAND.test(said.replace(MENTIONS, '').trim())

const KEPT = new Set(['first', 'surface']) // what she keeps of a person, in front of a new session

/** Whether a session has begun for her: she has answered in it (a command's answer is not hers), or what she keeps
 * was put in front of it. */
const SESSION = {
  key: OWN,
  stateVersion: 2,
  stateSchema: { parse: value => ({ began: value?.began === true, command: value?.command === true }) },
  init: () => ({ began: false, command: false }),
  apply: (state, event) => {
    if (state.began) return state
    if (event.type === 'user/message') {
      if (event.data.source?.kind === OWN && KEPT.has(event.data.source?.form)) return { began: true, command: false }
      const sender = senderOf(event.data)
      return sender ? { began: false, command: commanded(sender.said) } : state
    }
    return event.type === 'assistant/message' ? { began: !state.command, command: false } : state
  }
}

/** A model's reply that is the text alone, as DSH reads a stream. */
async function * replying (text) {
  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text: await text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text: await text } }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

function modelOf (agent, config) {
  const header = agent.session?.requestHeader?.()?.config
  if (header?.provider && header?.model) return { provider: header.provider, model: header.model }
  const options = agent.options
  if (options?.provider && options?.model) return { provider: options.provider, model: options.model }
  return config.provider && config.model ? { provider: config.provider, model: config.model } : null
}

/** Who sent a message and what they said: you, typed in DSH (no account); someone a channel names; or null, for a
 * message nobody sent. */
export function senderOf (message) {
  const text = textOf(message)
  if (message?.source?.kind === 'user') return { account: null, name: null, said: text, group: false }
  const found = SENT.exec(text)
  if (!found) return null
  const attributes = [...found[3].matchAll(/([\w-]+)="([^"]*)"/g)]
  const account = attributes.find(([, key]) => key !== 'nickname' && key !== 'name')
  if (!account?.[2]) return null
  return { account: `${account[1]}:${account[2]}`, said: found[4], group: Boolean(found[1].trim()),
    name: attributes.find(([, key]) => key === 'nickname' || key === 'name')?.[2] || null }
}

/** Her memory file and her gut, opened from the plugin's settings (see README.md), in DSH's `home` folder. Her word
 * habits are in her line only with the people close enough to teach her gut. */
export function open (config = {}, home) {
  const name = config.name || 'default'
  const folder = config.folder || path.join(home, 'mneme-llm', name)
  const seed = { companion: { ...(config.companion ? { name: config.companion } : {}),
    ...(config.zone ? { zone: config.zone } : {}) } }
  const mneme = new Mneme(config.file || path.join(folder, 'memory.db'), config.space || name, { config: seed,
    embed: false, memoryLanguage: null, ...(config.companion ? { companionName: config.companion } : {}) })
  const gut = config.gut === false ? null : new Gut(path.join(folder, 'gut.db'), {
    starter: config.starter === false ? null : config.starter || STARTER, tags: config.tags || {},
    wordsFrom: TEACH_FROM, ...(config.names ? { names: config.names } : {})
  })
  return { mneme, gut, folder }
}

export function hooks (ctx, config = {}, { createUserMessage, isAgentLoopRequest = null, home }) {
  const { mneme, gut, folder } = open(config, home)
  const subject = String(config.subject || 'owner')
  const you = { subject, name: String(config.user || 'user') }
  const others = config.others === undefined ? 'acquaintance' : String(config.others || '')
  const character = String(config.character || '')
  const log = text => ctx.logger?.info?.(`mneme-llm: ${text}`)
  const conversation = agent => `dsh:${agent.session?.id ?? ''}`
  const closeness = person => mneme.relations.get(person.subject)?.closeness ??
    (person.subject === subject ? Number(config.closeness ?? 85) : 0)
  const settle = (what, work) => {
    try {
      work()
    } catch (error) { log(`${what}: ${error?.message}`) }
  }
  if (config.role) settle('no role', () => mneme.relate(subject, config.role)) // (the same role again changes nothing)
  for (const account of config.accounts || []) settle(`${account} is not yours`, () => mneme.link(account, subject))
  ctx.sessionProjections.register(SESSION)
  ctx.effect(() => () => {
    mneme.close()
    gut?.close()
  }, 'mneme-llm: her files')

  /** The person a sender is: you (in DSH, or on an account of yours), or someone she meets, who is to her what
   * `others` says until you say more. */
  function personOf (sender) {
    if (!sender.account || mneme.person(sender.account) === subject) return you
    if (others && !mneme.relations.get(sender.account)) {
      settle(`no role for ${sender.account}`, () => mneme.relate(sender.account, others))
    }
    return { subject: sender.account, name: sender.name || sender.account }
  }

  // Her own account in a group. A channel says who sent a message, not who she is there, and a group message to her
  // usually opens with a mention of her ("@20002 我这周末去爬泰山"), which is no part of what they said. A mention is
  // hers once it has opened two group messages, more of them than any other mention on that channel, and nobody has
  // written to her from that account: she never writes to herself, and someone a person mentions has usually written
  // too. From then on it is taken off the start of what she keeps and reads of a group message (the session keeps the
  // message as it came), and it is kept in her folder; anyone writing from that account later undoes it.
  const SELF = path.join(folder, 'self.json')
  const mine = new Set()
  settle('her own accounts unread', () => {
    if (fs.existsSync(SELF)) for (const account of JSON.parse(fs.readFileSync(SELF, 'utf8'))) mine.add(String(account))
  })
  const opening = new Map() // a mention → how many group messages it opened
  const wrote = new Set() // the accounts that wrote to her
  const writer = account => wrote.has(account) || mneme.person(account) !== account ||
    mneme.relations.get(account) !== null || mneme.episodes.holds(account)
  const keepMine = () => settle('her own accounts unkept', () => {
    fs.mkdirSync(folder, { recursive: true })
    fs.writeFileSync(SELF, JSON.stringify([...mine]))
  })

  /** What a sender said, as she keeps and reads it: in a group, without her own mention at its start. */
  function unmentioned (sender) {
    wrote.add(sender.account)
    if (mine.delete(sender.account)) keepMine()
    const opened = sender.group ? MENTIONS.exec(sender.said)?.[0] : null
    if (!opened) return sender.said
    const channel = sender.account.split(':')[0], account = id => `${channel}:${id}`
    const named = [...opened.matchAll(/@(\d+)\s*/g)]
    for (const id of new Set(named.map(found => account(found[1])))) {
      if (!writer(id)) opening.set(id, (opening.get(id) ?? 0) + 1)
    }
    const [most, next] = [...opening].filter(([id]) => id.startsWith(`${channel}:`) && !writer(id))
      .sort((one, other) => other[1] - one[1])
    if (most && most[1] >= 2 && !(next && next[1] === most[1]) && !mine.has(most[0])) {
      mine.add(most[0])
      keepMine()
    }
    return named.filter(found => !mine.has(account(found[1]))).map(found => found[0]).join('') +
      sender.said.slice(opened.length)
  }

  async function ask (agent, messages, maxTokens) {
    const target = modelOf(agent, config)
    if (!target) throw new Error('no model yet')
    const system = messages[0].role === 'system' ? messages[0].content : undefined
    const rest = messages.slice(system === undefined ? 0 : 1)
    // One user message: earlier turns as text, so a one-shot needs no durable message identities.
    const lines = rest.slice(0, -1).map(item => `${item.role === 'assistant' ? 'You' : 'They'}: ${item.content}`)
    const last = rest.at(-1).content
    const content = lines.length ? `The conversation so far:\n${lines.join('\n')}\n\n${last}` : last
    let out = ''
    for await (const chunk of ctx.llm.stream({ ...target, system, maxTokens, temperature: 0.7,
      reasoningEffort: config.effort ?? 'off', sessionId: String(agent.session?.id ?? ''),
      messages: [{ role: 'user', content: [{ type: 'text', text: content }] }] })) {
      if (chunk?.type === 'text-delta') out += chunk.text
    }
    return out
  }
  const complete = agent => (system, text) => ask(agent, [{ role: 'system', content: system },
    { role: 'user', content: text }], WRITES)

  // Her tools: everything said before with the person she is talking with, word for word, when her look does not have
  // it.
  let searching = false
  const boxes = new WeakMap() // agent → her tools; they remember what their searches showed this turn
  const talking = new WeakMap() // session → the person she is talking with there
  const boxOf = agent => boxes.get(agent) ?? boxes.set(agent, new Toolbox(mneme, subject, { prefix: PREFIX }))
    .get(agent)
  ctx.inject(['tools'], scope => {
    for (const spec of specs('mcp', { prefix: PREFIX })) {
      if (spec.name !== `${PREFIX}search` && spec.name !== `${PREFIX}read`) continue
      scope.tools.register({ name: spec.name, description: spec.description, parameters: spec.inputSchema,
        output: { schema: { type: 'string' }, render: (_, text) => [{ type: 'text', text }] },
        execute: (given, exec) => boxOf(exec.agent ?? ctx).acall(spec.name, given,
          { subject: talking.get(exec.agent?.session ?? ctx)?.subject ?? subject }) })
    }
    searching = true
    scope.effect(() => () => { searching = false }, 'mneme-llm: her tools')
  })

  ctx.inject(['commands'], scope => {
    settle('no /mneme-first', () => scope.commands.register({ name: 'mneme-first',
      description: 'Show or set the first prompt she keeps of you ($first)',
      input: { hint: '[text | on | off | clear]' }, handler: ({ rawInput }) => first(you, rawInput.trim()) }))
    settle('no /mneme-new', () => scope.commands.register({ name: 'mneme-new',
      description: 'Start fresh: a new session begins with nothing of before in front of it ($new)',
      input: { hint: '[deep | gut]' }, handler: ({ rawInput }) => fresh(you, rawInput.trim().toLowerCase()) }))
  })

  /** The language a person writes in, for the plugin's answers: that of the words they gave with a command, else what
   * her gut read of their last message, else that of the last thing they said to her. */
  function tongue (person, text = '') {
    if (/\p{L}/u.test(text) && !KEYWORDS.has(text.toLowerCase())) return languageOf(text)
    const read = gut?.awake ? gut.languages.get(person.subject) : undefined
    if (read) return read
    const [last] = mneme.episodes.latest(person.subject)
    const said = last ? mneme.episodes.get(last)?.lines[0]?.[1] : ''
    return said ? languageOf(said) : 'en'
  }

  /** `$first` shows the first prompt she keeps of a person, `$first <text>` sets it, `$first on` puts it in front of
   * every new session, `$first off` only keeps it, and `$first clear` takes it away. */
  function first (person, text) {
    const word = text.toLowerCase(), words = wordsIn(tongue(person, text))
    const told = (key, values) => say(words, key, values)
    if (!text) {
      const kept = mneme.surface.first(person.subject)
      return { kind: 'success', text: kept ? told('first.shown', { text: kept.text,
        how: told(kept.byCommand ? 'first.set' : 'first.said'), when: told(kept.send ? 'first.sent' : 'first.only') })
        : told('first.none') }
    }
    if (word === 'clear') {
      const dropped = mneme.surface.dropFirst(person.subject)
      return { kind: 'success', text: told(dropped ? 'first.cleared' : 'first.nothing') }
    }
    if (word === 'on' || word === 'off') {
      if (!mneme.surface.sendFirst(person.subject, word === 'on')) return { kind: 'error', text: told('first.none') }
      return { kind: 'success', text: told(word === 'on' ? 'first.on' : 'first.off') }
    }
    mneme.surface.setFirst(person.subject, text)
    return { kind: 'success', text: told('first.kept') }
  }

  /** `$new`: a new session begins with nothing of before in front of it, every word still in deep memory. Yours alone:
   * `$new deep`, what she remembers of everyone, gone for good; `$new gut`, what people taught her gut too, and she is
   * as she was born. */
  async function fresh (person, tier) {
    const words = wordsIn(tongue(person)) // (before what they said is gone)
    const told = (key, values) => say(words, key, values)
    if (!tier) {
      mneme.surface.clear(person.subject)
      return { kind: 'success', text: told('new.fresh') }
    }
    if (tier !== 'deep' && tier !== 'gut') return { kind: 'error', text: told('new.usage') }
    if (person !== you) return { kind: 'error', text: told('new.yours') }
    let count = 0
    for (const someone of mneme.everyone()) count += mneme.wipe(someone)
    if (tier === 'deep' || !gut) return { kind: 'success', text: told('new.deep', { count }) }
    if (!gut.awake) gut.wake()
    return { kind: 'success', text: told('new.gut', { count, lessons: await gut.wipe() }) }
  }

  /** A command typed as a message, done, and what to answer. */
  async function answer (held) {
    const [, name, rest = ''] = held.command
    try {
      return (await (name === 'first' ? first(held.person, rest.trim()) : fresh(held.person,
        rest.trim().toLowerCase()))).text
    } catch (error) {
      return say(wordsIn(tongue(held.person)), 'error.value', { detail: error?.message })
    }
  }

  // A command's step goes on as DSH has it (other plugins add to every step, so there is always one), and its model
  // call is answered here, with no model: the command stays in the session where it was typed, and its answer after
  // it.
  const commands = new Map() // a session → the command its step answers
  const looped = options => isAgentLoopRequest ? isAgentLoopRequest(options) : Object.hasOwn(options ?? {},
    'toolHistory')
  ctx.on('llm/stream', (options, next) => {
    const held = looped(options) ? commands.get(options.sessionId) : undefined
    if (!held) return next()
    commands.delete(options.sessionId)
    return replying(answer(held))
  })

  const ownMessage = (text, form, summary) => createUserMessage({ content: [{ type: 'text', text }],
    source: { kind: OWN, form, summary } })

  /** What she keeps of a person, in front of a new session's first message: their first prompt if they turned it on,
   * as they wrote it; then, in one message, what stands for what she let go and the newest of what they said to each
   * other (the surface), each exchange as her look shows one, with when it was said and who said what. They are
   * messages of the step, as DSH's session log keeps a step's messages, after DSH's system prompt. */
  function keptOf (person) {
    const surface = mneme.surface, subject = mneme.person(person.subject)
    const view = surface.read(subject, { userName: person.name })
    const first = surface.first(subject), sent = first?.send ? 1 : 0
    const row = surface._row(subject) // (where the surface starts, and what stands for what she let go)
    const exchanges = mneme.episodes.after(subject, row?.start_id ?? 0, view.top) // (those `read` took)
      .sort((one, other) => one.at - other.at || one.id - other.id)
      .map(episode => mneme.episodes.shown(episode, { whole: true }))
    const words = new Words(code(surface.words), SAYS)
    const text = [...view.messages.slice(sent, sent + (row?.summary ? 1 : 0)).map(item => item.content),
      ...exchanges.length ? [say(words, 'surface.said', { who: person.name }), ...exchanges] : []].join('\n\n')
    return [...sent ? [ownMessage(first.text, 'first', 'Their first prompt, which she reads first')] : [],
      ...text ? [ownMessage(text, 'surface', 'What she keeps of what was said lately')] : []]
  }

  /** Beside a message from someone else, who her owner is, in the line that says who this person is to her. */
  function owned (person, kept) {
    if (person === you || !config.user) return kept
    const language = code(mneme.relations.words), owner = say(new Words(language, SAYS), 'owner.line',
      { owner: you.name })
    const line = mneme.relations.line(person.subject, person.name)
    if (line && kept.startsWith(line)) {
      const shut = /[)）]$/.test(line) ? line.at(-1) : ''
      const open = line.slice(0, line.length - shut.length)
      return `${open}${/[。！？）]$/.test(open) ? '' : ' '}${owner}${shut}${kept.slice(line.length)}`
    }
    return [language === 'zh' ? `（${owner}）` : `(${owner})`, kept].filter(Boolean).join('\n\n')
  }

  /** Beside the message: what she keeps of the person that bears on it, and her gut's line, which reads it first. In a
   * group nothing comes by itself from a search, and her look is not theirs alone. */
  async function beside (agent, held) {
    let kept = ''
    try {
      kept = await mneme.aprompt(held.person.subject, held.said, { userName: held.person.name, mark: false,
        said: mneme.saidBudget, search: searching && !held.group, own: !held.group })
    } catch (error) { log(`no memory: ${error?.message}`) }
    kept = owned(held.person, kept)
    if (!held.turn) return kept
    let line = ''
    try {
      for (const [tag, what] of Object.entries(gut.tags)) {
        if (!what) gut.tags[tag] = await draft(tag, (messages, tokens) => ask(agent, messages, tokens))
      }
      line = await held.turn.feel(mneme.surface.slice(held.person.subject), kept, closeness(held.person),
        mneme.episodes.count(held.person.subject))
    } catch (error) { log(`no line: ${error?.message}`) }
    return [kept, line].filter(Boolean).join('\n\n')
  }

  /** After her reply: the exchange word for word, her mood and what is worth keeping (one judgement on her model, and
   * the note writer only when there is something to keep), the surface let go of what is old, and once a day her
   * impression of the person. A turn she started herself moves her mood only, and is kept as hers. */
  async function learn (agent, held, reply) {
    const { subject: who, name } = held.person, place = conversation(agent)
    mneme.mood.news(who, { mark: true }) // she has replied: what moved her was told
    if (held.alone) {
      mneme.episodes.keep(who, [['', `(You messaged them on your own then: ${fit(held.said, 300)})`],
        [mneme.companionName, reply]], { conversation: place })
      await mneme.observe(who, [[`(${mneme.companionName}'s own thought)`, held.said], [mneme.companionName, reply]],
        { source: 'speak-up', userName: name, complete: complete(agent), conversation: place })
      return
    }
    const seen = await mneme.observe(who, [[name, held.said], [mneme.companionName, reply]], { userName: name,
      complete: complete(agent), conversation: place })
    if (seen.error) log(`notes not written: ${seen.error}`)
    await mneme.surface.letGo(who, { userName: name, complete: complete(agent) })
    const updated = mneme.memory.profileUpdatedAt(who)
    if ((updated === null || Date.now() / 1000 - updated >= DAY) && mneme.memory.notes(who).length >= REFLECT) {
      await mneme.reflect(who, { userName: name, complete: complete(agent) })
    }
  }

  /** The turn ahead, from the message that opened it: a command, her turn with a person, a turn of her own, or null
   * for a message with no words. Her gut's turn comes once the step is sure to run (`withTurn`). */
  function heldFor (agent, message) {
    const sender = senderOf(message), said = sender ? unmentioned(sender) : textOf(message)
    if (!said.trim()) return null
    if (!sender) return { person: talking.get(agent.session) ?? you, said, alone: true, turn: null }
    const person = personOf(sender)
    talking.set(agent.session, person)
    const command = COMMAND.exec(said.trim())
    if (command) return { person, command }
    return { person, said, group: sender.group, turn: null }
  }

  /** Her gut's reading of the message, which starts at once. */
  function withTurn (agent, held) {
    if (held.alone || !gut || !modelOf(agent, config)) return held
    if (!gut.awake) gut.wake()
    return { ...held, turn: new Turn(gut, (messages, tokens) => ask(agent, messages, tokens), character, held.said,
      held.person.subject) }
  }

  const waiting = new WeakMap() // agent → her turn, from its first step to its end

  // Her memory's own messages in front of the one that opened the turn. DSH builds every request from its session log,
  // so they have to be in there; as context they would make DSH send its whole runtime context again each turn, since
  // they change each turn. As the step's messages, DSH writes them in the step, after its system prompt.
  ctx.on('agent/pre-step', async ({ agent, messages, step }, next) => {
    const decision = await next()
    const opened = messages?.filter(item => item.role === 'user' && item.source?.kind !== 'runtime-context').at(-1)
    if (decision.kind !== 'enter' || step !== 1 || !opened || agent.session?.header?.parentSession !== undefined) {
      return decision // (a later step, or a subagent's turn)
    }
    commands.delete(agent.session.id)
    waiting.delete(agent) // (a turn that failed never stopped: what it held is not this one's)
    const fresh = !ctx.sessionProjections.stateOf(agent.session, OWN)?.began
    let held = heldFor(agent, opened)
    if (!held) return decision
    if (held.command) {
      commands.set(agent.session.id, held)
      return decision
    }
    held = withTurn(agent, held)
    waiting.set(agent, held)
    boxOf(agent).newTurn()
    let front = []
    if (fresh && !held.group) {
      try {
        front = keptOf(held.person)
      } catch (error) { log(`nothing kept in front: ${error?.message}`) }
    }
    const block = await beside(agent, held)
    if (block) front.push(ownMessage(block, 'notice', 'What comes to her mind, and how she feels'))
    if (!front.length) return decision
    const at = decision.messages.findIndex(item => item.id === opened.id)
    return { ...decision, messages: decision.messages.toSpliced(at < 0 ? 0 : at, 0, ...front) }
  })

  ctx.on('agent/turn-stopping', ({ agent }) => {
    const held = waiting.get(agent)
    if (!held) return
    waiting.delete(agent)
    const reply = textOf(agent.session.deriveMessages().filter(message => message.role === 'assistant').at(-1))
    if (!reply) return
    // Beside the conversation: her turn waits for none of what she learns from it.
    learn(agent, held, reply).catch(error => log(`not learned: ${error?.message}`))
    held.turn?.learn(reply).then(note => log(note ? `lesson ${gut.report().lessons}` : 'no note'))
      .catch(error => log(`no lesson: ${error?.message}`))
  })

  return { mneme, gut }
}

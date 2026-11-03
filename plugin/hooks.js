// The plugin's hooks, apart from DeepSeek Harness itself so they can be tested without it: index.js hands in DSH's
// message constructors and its home folder.
//
// Each turn starts with a message. One you type in DSH is yours; one a chat channel brings carries who sent it, and
// each sender is a person to her (some of those accounts may be yours); a turn anything else starts is her speaking up
// on her own. A new session's first message (DSH's events say she has said nothing in it yet): what she keeps of that
// person goes in front of it as turns of their own (their first prompt if they turned it on, what stands for what she
// let go, and the newest of what they said to each other, in any session). DSH keeps and compacts the session from
// then on, as do any other plugins that work on it. Before her first step, one block goes beside the message: who they
// are to her, her notes, what was said before that bears on it (her look, with her tools to search the rest), her
// mood's news, and her gut's line, which stays in the session log until DSH compacts it. When the turn ends, the
// exchange is kept word for word, her model judges her mood and writes what is worth remembering, the surface lets go
// of what is old, and she writes a note that teaches her gut. All of it runs on the model you use in DSH.
//
// `$first` and `$new` are commands typed as messages, answered in the session with no model call; `/mneme-first` and
// `/mneme-new` are the same in DSH's own command list.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Gut, Turn, draft } from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { fit } from '../lib/text.js'
import { Toolbox, specs } from '../lib/tools.js'

const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const DAY = 86400
const REFLECT = 5 // notes before her first impression of a person is written; then once a day at most
const PREFIX = 'mneme_' // her tools: mneme_search and mneme_read
const WRITES = 1500 // tokens her model may write for her memory's calls
const OWN = 'mneme-llm' // the source of her memory's own messages, and her record of each session
const ANSWERS = { provider: 'mneme-llm', model: 'commands' } // a command's answer, which no model wrote
const COMMAND = /^\$(first|new)(?:\s+([\s\S]*))?$/
// A channel brings a person's words inside one element that says who sent them: the first attribute is their account
// (qq="10001" is qq:10001), `nickname` or `name` their name. Text before it is the channel's own (a group's).
const SENT = /^([\s\S]*?)<([A-Za-z_][\w-]*)((?:\s+[\w-]+="[^"]*")+)\s*>\n?([\s\S]*?)\n?<\/\2>\s*$/

const textOf = message => (message?.content || []).filter(block => block.type === 'text').map(block => block.text)
  .join('')

/** Whether a session has begun for her: she has answered in it, or what she keeps was put in front of it. */
const SESSION = {
  key: OWN,
  stateVersion: 1,
  stateSchema: { parse: value => ({ began: value?.began === true }) },
  init: () => ({ began: false }),
  apply: (state, event) => state.began || !(event.type === 'assistant/message' &&
    event.data.message.source?.provider !== ANSWERS.provider || event.type === 'user/message' &&
    event.data.source?.kind === OWN && event.data.source?.form === 'surface') ? state : { began: true }
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

/** Her memory file and her gut, opened from the plugin's settings (see README.md), in DSH's `home` folder. */
export function open (config = {}, home) {
  const name = config.name || 'default'
  const folder = config.folder || path.join(home, 'mneme-llm', name)
  const seed = { companion: { ...(config.companion ? { name: config.companion } : {}),
    ...(config.zone ? { zone: config.zone } : {}) } }
  const mneme = new Mneme(config.file || path.join(folder, 'memory.db'), config.space || name, { config: seed,
    embed: false, memoryLanguage: null, ...(config.companion ? { companionName: config.companion } : {}) })
  const gut = config.gut === false ? null : new Gut(path.join(folder, 'gut.db'), {
    starter: config.starter === false ? null : config.starter || STARTER, tags: config.tags || {},
    ...(config.names ? { names: config.names } : {})
  })
  return { mneme, gut }
}

export function hooks (ctx, config = {}, { createUserMessage, createAssistantMessage, home }) {
  const { mneme, gut } = open(config, home)
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
      description: 'Start fresh: a new session begins with nothing of before ($new)', input: { hint: '[deep | gut]' },
      handler: ({ rawInput }) => fresh(you, rawInput.trim().toLowerCase()) }))
  })

  /** `$first` shows the first prompt she keeps of a person, `$first <text>` sets it, `$first on` puts it in front of
   * every new session, `$first off` only keeps it, and `$first clear` takes it away. */
  function first (person, text) {
    const word = text.toLowerCase()
    if (!text) {
      const kept = mneme.surface.first(person.subject)
      return { kind: 'success', text: kept ? `${kept.text}\n(${kept.byCommand ? 'you set this'
        : 'the first thing you said'}; ${kept.send ? 'she reads it first in every new session' : 'only kept'})`
        : 'Nothing kept yet.' }
    }
    if (word === 'clear') {
      return { kind: 'success', text: mneme.surface.dropFirst(person.subject) ? 'Taken away.' : 'Nothing is kept.' }
    }
    if (word === 'on' || word === 'off') {
      if (!mneme.surface.sendFirst(person.subject, word === 'on')) {
        return { kind: 'error', text: 'There is no first prompt yet: set one with $first <text>.' }
      }
      return { kind: 'success', text: word === 'on' ? 'She reads it first in every new session.'
        : 'It is only kept now.' }
    }
    mneme.surface.setFirst(person.subject, text)
    return { kind: 'success', text: 'Kept. $first on has her read it first in every new session.' }
  }

  /** `$new`: a new session begins with nothing of before in front of it, every word still in deep memory. Yours alone:
   * `$new deep`, what she remembers of everyone, gone for good; `$new gut`, what people taught her gut too, and she is
   * as she was born. */
  async function fresh (person, tier) {
    if (!tier) {
      mneme.surface.clear(person.subject)
      return { kind: 'success', text: 'A fresh start: a new session begins with nothing of before in front of it. ' +
        'Every word stays in her deep memory.' }
    }
    if (tier !== 'deep' && tier !== 'gut') return { kind: 'error', text: 'Use $new, $new deep or $new gut.' }
    if (person !== you) return { kind: 'error', text: 'Only the person she belongs to can do that.' }
    let kept = 0
    for (const someone of mneme.everyone()) kept += mneme.wipe(someone)
    const told = `${kept} exchanges gone for good, with every note`
    if (tier === 'deep' || !gut) return { kind: 'success', text: `${told}.` }
    if (!gut.awake) gut.wake()
    return { kind: 'success', text: `${told}, and ${await gut.wipe()} lessons of her gut: she is as she was born.` }
  }

  /** A command typed as a message: it and its answer go into the session, where it was typed. */
  async function answer (agent, held, turn, step) {
    const [, name, rest = ''] = held.command
    let done
    try {
      done = await (name === 'first' ? first(held.person, rest.trim()) : fresh(held.person, rest.trim().toLowerCase()))
    } catch (error) { done = { text: `Error: ${error?.message}` } }
    agent.session.append('user/message', held.message, { surfaceOp: 'append' })
    agent.session.append('assistant/message', { turn, step, stream: [], message: createAssistantMessage({
      content: [{ type: 'text', text: done.text }], source: ANSWERS }) }, { surfaceOp: 'append' })
  }

  /** What she keeps of a person, in front of a new session's first message as turns of their own: it may not start
   * with hers. */
  function surfaced (agent, person, turn, step) {
    const model = modelOf(agent, config)
    const turns = mneme.surface.read(person.subject, { userName: person.name, here: conversation(agent) }).messages
    const start = turns.findIndex(item => item.role === 'user')
    if (!model || start < 0) return
    for (const item of turns.slice(start)) {
      const content = [{ type: 'text', text: item.content }]
      if (item.role === 'assistant') {
        agent.session.append('assistant/message', { turn, step, stream: [],
          message: createAssistantMessage({ content, source: model }) }, { surfaceOp: 'append' })
      } else {
        agent.session.append('user/message', createUserMessage({ content, source: { kind: OWN, form: 'surface' } }),
          { surfaceOp: 'append' })
      }
    }
  }

  /** Beside the message: what she keeps of the person that bears on it, and her gut's line, which reads it first. In a
   * group nothing comes by itself from a search, and her look is not theirs alone. */
  async function beside (agent, held) {
    let kept = ''
    try {
      kept = await mneme.aprompt(held.person.subject, held.said, { userName: held.person.name, mark: false,
        said: mneme.saidBudget, search: searching && !held.group, own: !held.group })
    } catch (error) { log(`no memory: ${error?.message}`) }
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
   * for a message with no words. */
  function heldFor (agent, message) {
    const sender = senderOf(message), said = sender ? sender.said : textOf(message)
    if (!said.trim()) return null
    if (!sender) return { person: talking.get(agent.session) ?? you, said, alone: true, turn: null }
    const person = personOf(sender)
    talking.set(agent.session, person)
    const command = COMMAND.exec(sender.said.trim())
    if (command) return { person, message, command }
    let turn = null
    if (gut && modelOf(agent, config)) {
      if (!gut.awake) gut.wake()
      turn = new Turn(gut, (messages, tokens) => ask(agent, messages, tokens), character, sender.said, person.subject)
    }
    return { person, said: sender.said, group: sender.group, turn }
  }

  const waiting = new WeakMap() // agent → her turn, from its first step to its end

  // One message of her memory's own beside the one that opened the turn. DSH builds every request from its session
  // log, so it has to be in there; as context it would make DSH send its whole runtime context again each turn, since
  // it changes each turn.
  ctx.on('agent/pre-step', async ({ agent, messages, turn, step }, next) => {
    const decision = await next()
    const opened = messages?.filter(item => item.role === 'user' && item.source?.kind !== 'runtime-context').at(-1)
    if (decision.kind !== 'enter' || step !== 1 || !opened || agent.session?.header?.parentSession !== undefined) {
      return decision // (a later step, or a subagent's turn)
    }
    const fresh = !ctx.sessionProjections.stateOf(agent.session, OWN)?.began
    const held = heldFor(agent, opened)
    if (!held) return decision
    if (held.command) {
      await answer(agent, held, turn, step)
      return { ...decision, messages: decision.messages.filter(item => item.id !== opened.id &&
        item.source?.kind !== 'runtime-context') }
    }
    waiting.set(agent, held)
    boxOf(agent).newTurn()
    if (fresh && !held.group) settle('nothing in front', () => surfaced(agent, held.person, turn, step))
    const block = await beside(agent, held)
    if (!block) return decision
    const notice = createUserMessage({ content: [{ type: 'text', text: block }], source: { kind: OWN,
      form: 'notice', summary: 'What comes to her mind, and how she feels' } })
    const at = decision.messages.findIndex(item => item.id === opened.id)
    return { ...decision, messages: decision.messages.toSpliced(at < 0 ? 0 : at, 0, notice) }
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

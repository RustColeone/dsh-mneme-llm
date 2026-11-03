// The plugin's hooks, apart from DeepSeek Harness itself so they can be tested without it: index.js hands in DSH's
// message constructors.
//
// A new session's first message (a session whose log holds no conversation yet): what she keeps of you goes in front
// of it as turns of their own (your first prompt if you turned it on, what stands for what she let go, and the newest
// of what you said to each other, in any session). DSH keeps and compacts the session from then on. Each message: her
// reading starts, and before her first step one block goes beside your message: who you are to her, her notes, what
// was said before that bears on it (her look, with her tools to search the rest), her mood's news, and her gut's line,
// which stays in the session log until DSH compacts it. When the turn ends, the exchange is kept word for word, her
// model judges her mood and writes what is worth remembering, the surface lets go of what is old, and she writes a note
// that teaches her gut. All of it runs on the model you use in DSH. /first and /new are DSH commands: no model reads
// them.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Gut, Turn, draft } from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { Toolbox, specs } from '../lib/tools.js'

const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))
const DAY = 86400
const REFLECT = 5 // notes before her first impression of you is written; then once a day at most
const PREFIX = 'memory_' // her tools: memory_search and memory_read
const WRITES = 1500 // tokens her model may write for her memory's calls

const textOf = message => (message?.content || []).filter(block => block.type === 'text').map(block => block.text)
  .join('')

function modelOf (agent, config) {
  const header = agent.session?.requestHeader?.()?.config
  if (header?.provider && header?.model) return { provider: header.provider, model: header.model }
  const options = agent.options
  if (options?.provider && options?.model) return { provider: options.provider, model: options.model }
  return config.provider && config.model ? { provider: config.provider, model: config.model } : null
}

/** Her memory file and her gut, opened from the plugin's settings (see README.md). */
export function open (config = {}) {
  const name = config.name || 'default'
  const folder = config.folder || path.join(os.homedir(), '.dsh', 'mneme-llm', name)
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

export function hooks (ctx, config = {}, { createUserMessage, createAssistantMessage }) {
  const { mneme, gut } = open(config)
  const subject = String(config.subject || 'owner')
  const user = String(config.user || 'user')
  const character = String(config.character || '')
  const log = text => ctx.logger?.info?.(`mneme-llm: ${text}`)
  const closeness = () => mneme.relations.get(subject)?.closeness ?? Number(config.closeness ?? 85)
  const conversation = agent => `dsh:${agent.session?.id ?? ''}`
  if (config.role) {
    try {
      mneme.relate(subject, config.role) // (the same role again changes nothing)
    } catch (error) { log(`no role: ${error?.message}`) }
  }
  ctx.effect(() => () => {
    mneme.close()
    gut?.close()
  }, 'mneme-llm: her files')

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

  // Her tools: everything said before with you, word for word, when her look does not have it.
  let searching = false
  const boxes = new WeakMap() // agent → her tools; they remember what their searches showed this turn
  const toolbox = () => new Toolbox(mneme, subject, { prefix: PREFIX })
  const boxOf = agent => boxes.get(agent) ?? boxes.set(agent, toolbox()).get(agent)
  ctx.inject(['tools'], scope => {
    for (const spec of specs('mcp', { prefix: PREFIX })) {
      if (spec.name !== `${PREFIX}search` && spec.name !== `${PREFIX}read`) continue
      scope.tools.register({ name: spec.name, description: spec.description, parameters: spec.inputSchema,
        output: { schema: { type: 'string' }, render: (_, text) => [{ type: 'text', text }] },
        execute: (given, exec) => (exec.agent ? boxOf(exec.agent) : toolbox()).acall(spec.name, given) })
    }
    searching = true
    scope.effect(() => () => { searching = false }, 'mneme-llm: her tools')
  })

  ctx.inject(['commands'], scope => {
    scope.commands.register({ name: 'first', description: 'Show or set the first prompt she keeps of you',
      input: { hint: '[text | on | off | clear]' }, handler: ({ rawInput }) => first(rawInput.trim()) })
    scope.commands.register({ name: 'new', description: 'Start fresh: a new session begins with nothing of before',
      input: { hint: '[deep | gut]' }, handler: ({ rawInput }) => fresh(rawInput.trim().toLowerCase()) })
  })

  /** `/first` shows the first prompt she keeps of you, `/first <text>` sets it, `/first on` puts it in front of every
   * new session, `/first off` only keeps it, and `/first clear` takes it away. */
  function first (text) {
    const word = text.toLowerCase()
    if (!text) {
      const kept = mneme.surface.first(subject)
      return { kind: 'success', text: kept ? `${kept.text}\n(${kept.byCommand ? 'you set this'
        : 'the first thing you said'}; ${kept.send ? 'she reads it first in every new session' : 'only kept'})`
        : 'Nothing kept yet.' }
    }
    if (word === 'clear') {
      return { kind: 'success', text: mneme.surface.dropFirst(subject) ? 'Taken away.' : 'Nothing is kept.' }
    }
    if (word === 'on' || word === 'off') {
      if (!mneme.surface.sendFirst(subject, word === 'on')) {
        return { kind: 'error', text: 'There is no first prompt yet: set one with /first <text>.' }
      }
      return { kind: 'success', text: word === 'on' ? 'She reads it first in every new session.'
        : 'It is only kept now.' }
    }
    mneme.surface.setFirst(subject, text)
    return { kind: 'success', text: 'Kept. /first on has her read it first in every new session.' }
  }

  /** `/new`: a new session begins with nothing of before in front of it, every word still in deep memory. `/new deep`:
   * what she remembers of everyone, gone for good; `/new gut`: what people taught her gut too, and she is as she was
   * born. */
  async function fresh (tier) {
    if (!tier) {
      mneme.surface.clear(subject)
      return { kind: 'success', text: 'A fresh start: a new session begins with nothing of before in front of it. ' +
        'Every word stays in her deep memory.' }
    }
    if (tier !== 'deep' && tier !== 'gut') return { kind: 'error', text: 'Use /new, /new deep or /new gut.' }
    let kept = 0
    for (const someone of mneme.everyone()) kept += mneme.wipe(someone)
    const told = `${kept} exchanges gone for good, with every note`
    if (tier === 'deep' || !gut) return { kind: 'success', text: `${told}.` }
    if (!gut.awake) gut.wake()
    return { kind: 'success', text: `${told}, and ${await gut.wipe()} lessons of her gut: she is as she was born.` }
  }

  /** What she keeps of you, in front of a new session's first message as turns of their own: it may not start with
   * hers. */
  function surfaced (agent, turn, step) {
    const model = modelOf(agent, config)
    const turns = mneme.surface.read(subject, { userName: user, here: conversation(agent) }).messages
    const start = turns.findIndex(item => item.role === 'user')
    if (!model || start < 0) return
    for (const item of turns.slice(start)) {
      const content = [{ type: 'text', text: item.content }]
      if (item.role === 'assistant') {
        agent.session.append('assistant/message', { turn, step, stream: [],
          message: createAssistantMessage({ content, source: model }) }, { surfaceOp: 'append' })
      } else {
        agent.session.append('user/message', createUserMessage({ content, source: { kind: 'mneme-llm',
          form: 'surface' } }), { surfaceOp: 'append' })
      }
    }
  }

  /** Beside your message: what she keeps of you that bears on it, and her gut's line, which reads it first. */
  async function beside (agent, held) {
    let kept = ''
    try {
      kept = await mneme.aprompt(subject, held.said, { userName: user, mark: false, said: mneme.saidBudget,
        search: searching, own: true })
    } catch (error) { log(`no memory: ${error?.message}`) }
    if (!held.turn) return kept
    let line = ''
    try {
      for (const [tag, what] of Object.entries(gut.tags)) {
        if (!what) gut.tags[tag] = await draft(tag, (messages, tokens) => ask(agent, messages, tokens))
      }
      line = await held.turn.feel(mneme.surface.slice(subject), kept, closeness(), mneme.episodes.count(subject))
    } catch (error) { log(`no line: ${error?.message}`) }
    return [kept, line].filter(Boolean).join('\n\n')
  }

  /** After her reply: the exchange word for word, her mood and what is worth keeping (one judgement on her model, and
   * the note writer only when there is something to keep), the surface let go of what is old, and once a day her
   * impression of you. */
  async function learn (agent, said, reply) {
    const complete = (system, text) => ask(agent, [{ role: 'system', content: system },
      { role: 'user', content: text }], WRITES)
    mneme.mood.news(subject, { mark: true }) // she has replied: what moved her was told
    const seen = await mneme.observe(subject, [[user, said], [mneme.companionName, reply]], { userName: user, complete,
      conversation: conversation(agent) })
    if (seen.error) log(`notes not written: ${seen.error}`)
    await mneme.surface.letGo(subject, { userName: user, complete })
    const updated = mneme.memory.profileUpdatedAt(subject)
    if ((updated === null || Date.now() / 1000 - updated >= DAY) && mneme.memory.notes(subject).length >= REFLECT) {
      await mneme.reflect(subject, { userName: user, complete })
    }
  }

  const waiting = new WeakMap() // agent → her turn, from your message to the end of the turn

  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (message?.source?.kind !== 'user' || agent.session?.header?.parentSession !== undefined) return // (a subagent)
    const said = textOf(message)
    if (!said) return
    boxes.get(agent)?.newTurn()
    const fresh = !agent.session.deriveMessages().some(item => item.role === 'user' || item.role === 'assistant')
    let turn = null
    if (gut && modelOf(agent, config)) {
      if (!gut.awake) gut.wake()
      turn = new Turn(gut, (messages, tokens) => ask(agent, messages, tokens), character, said, subject)
    }
    waiting.set(agent, { said, turn, fresh, felt: false })
  })


  // One message of its own beside yours. DSH builds every request from its session log, so it has to be in there; as
  // context it would make DSH send its whole runtime context again each turn, since it changes each turn.
  ctx.on('agent/pre-step', async ({ agent, turn, step }, next) => {
    const decision = await next()
    const held = waiting.get(agent)
    if (decision.kind !== 'enter' || !held || held.felt) return decision
    held.felt = true
    if (held.fresh) {
      try {
        surfaced(agent, turn, step)
      } catch (error) { log(`nothing in front: ${error?.message}`) }
    }
    const block = await beside(agent, held)
    if (!block) return decision
    const message = createUserMessage({ content: [{ type: 'text', text: block }], source: { kind: 'mneme-llm',
      form: 'notice', summary: 'What comes to her mind, and how she feels' } })
    return { ...decision, messages: [message, ...decision.messages] }
  })

  ctx.on('agent/turn-stopping', ({ agent }) => {
    const held = waiting.get(agent)
    if (!held) return
    waiting.delete(agent)
    const reply = textOf(agent.session.deriveMessages().filter(message => message.role === 'assistant').at(-1))
    if (!reply) return
    // Beside the conversation: her turn waits for none of what she learns from it.
    learn(agent, held.said, reply).catch(error => log(`not learned: ${error?.message}`))
    held.turn?.learn(reply).then(note => log(note ? `lesson ${gut.report().lessons}` : 'no note'))
      .catch(error => log(`no lesson: ${error?.message}`))
  })

  return { mneme, gut }
}

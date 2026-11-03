// The plugin's hooks, apart from DeepSeek Harness itself so they can be tested without it: index.js hands in DSH's
// `createUserMessage`. Carried over from dsh-mneme-gut, which ran in real DSH; what is new is the shared file.
//
// A message comes in: her reading starts. Before her first step, her vote and her gut give one line, which stays in the
// session log until DSH compacts it. When the turn ends, the exchange is kept word for word in the mneme-llm file (deep
// memory, from day one), and she writes a note beside the conversation that teaches her gut. All of it runs on the
// model you use in DSH.
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Gut, Turn, draft } from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'

export const HISTORY = 16 // messages of the session her vote and her note see
const STARTER = fileURLToPath(new URL('../starter.json.gz', import.meta.url))

const textOf = message => (message?.content || []).filter(block => block.type === 'text').map(block => block.text)
  .join('')

function modelOf (agent, config) {
  const header = agent.session?.requestHeader?.()?.config
  if (header?.provider && header?.model) return { provider: header.provider, model: header.model }
  const options = agent.options
  if (options?.provider && options?.model) return { provider: options.provider, model: options.model }
  return config.provider && config.model ? { provider: config.provider, model: config.model } : null
}

/** What was said so far, as plain turns, leaving out the message she is answering and anything the host added. */
export function before (agent, said) {
  const turns = []
  for (const message of agent.session.deriveMessages()) {
    if (message.role === 'assistant') {
      const text = textOf(message)
      if (text) turns.push({ role: 'assistant', content: text })
    } else if (message.role === 'user' && message.source?.kind === 'user') {
      const text = textOf(message)
      if (text) turns.push({ role: 'user', content: text })
    }
  }
  while (turns.length && !(turns.at(-1).role === 'user' && turns.at(-1).content === said)) turns.pop()
  turns.pop()
  return turns.slice(-HISTORY)
}

/** Her memory file and her gut, opened from the plugin's settings (see README.md). */
export function open (config = {}) {
  const name = config.name || 'default'
  const folder = config.folder || path.join(os.homedir(), '.dsh', 'mneme-llm', name)
  const seed = { companion: { ...(config.companion ? { name: config.companion } : {}),
    ...(config.zone ? { zone: config.zone } : {}) } }
  const mneme = new Mneme(config.file || path.join(folder, 'memory.db'), config.space || name, { config: seed,
    embed: false, ...(config.companion ? { companionName: config.companion } : {}) })
  const gut = config.gut === false ? null : new Gut(path.join(folder, 'gut.db'), {
    starter: config.starter === false ? null : config.starter || STARTER, tags: config.tags || {},
    ...(config.names ? { names: config.names } : {})
  })
  return { mneme, gut }
}

export function hooks (ctx, config = {}, { createUserMessage }) {
  const { mneme, gut } = open(config)
  const subject = String(config.subject || 'owner')
  const user = String(config.user || 'user')
  const character = String(config.character || '')
  const log = text => ctx.logger?.info?.(`mneme-llm: ${text}`)
  const closeness = () => mneme.relations.get(subject)?.closeness ?? Number(config.closeness ?? 85)
  if (config.role) {
    try {
      mneme.relate(subject, config.role) // (the same role again changes nothing)
    } catch (error) { log(`no role: ${error?.message}`) }
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

  const waiting = new Map() // agent → her turn, from the message to the end of the turn

  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    if (message?.source?.kind !== 'user') return
    const said = textOf(message)
    if (!said) return
    let turn = null
    if (gut && modelOf(agent, config)) {
      if (!gut.awake) gut.wake()
      turn = new Turn(gut, (messages, tokens) => ask(agent, messages, tokens), character, said, subject)
    }
    waiting.set(agent, { said, turn, felt: false })
  })

  // One small message of its own. DSH builds every request from its session log, so the line has to be in there; as
  // context it would make DSH send its whole runtime context again each turn, since the line changes each turn.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    const held = waiting.get(agent)
    if (decision.kind !== 'enter' || !held?.turn || held.felt) return decision
    held.felt = true
    let line = ''
    try {
      for (const [tag, what] of Object.entries(gut.tags)) {
        if (!what) gut.tags[tag] = await draft(tag, (messages, tokens) => ask(agent, messages, tokens))
      }
      const earlier = before(agent, held.said)
      line = await held.turn.feel(earlier, '', closeness(), Math.floor(earlier.length / 2))
    } catch (error) { log(`no line: ${error?.message}`) }
    if (!line) return decision
    const message = createUserMessage({ content: [{ type: 'text', text: line }], source: { kind: 'mneme-llm',
      form: 'notice', summary: 'How she feels right now' } })
    return { ...decision, messages: [message, ...decision.messages] }
  })

  ctx.on('agent/turn-stopping', ({ agent }) => {
    const held = waiting.get(agent)
    if (!held) return
    waiting.delete(agent)
    const reply = textOf(agent.session.deriveMessages().filter(message => message.role === 'assistant').at(-1))
    if (!reply) return
    // deep memory: the exchange word for word, in the file Python's mneme-llm reads too
    mneme.observe(subject, [[user, held.said], [mneme.companionName, reply]], {
      conversation: `dsh:${agent.session?.id ?? ''}` }).catch(error => log(`not kept: ${error?.message}`))
    if (!held.turn) return
    // Beside the conversation: her turn does not wait for her note.
    held.turn.learn(reply).then(note => log(note ? `lesson ${gut.report().lessons}` : 'no note'))
      .catch(error => log(`no lesson: ${error?.message}`))
  })

  return { mneme, gut }
}

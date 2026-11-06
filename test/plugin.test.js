// The DSH plugin's hooks, with a stand-in for DeepSeek Harness: her note in each call of a turn (what she keeps of the
// person, who she is talking with, and her gut's line) and in nothing DSH keeps, her Character Card in DSH's system
// prompt, the session log as DSH reads it back, the exchange kept word for word with her mood and notes after
// the turn, a lesson for her gut, her tools, the commands and their answers in the person's language, people a chat
// channel brings, her look in a group and her own mention there, and turns she starts herself.
//
// DSH's own reader of a session log checks the log the stand-in writes when DSH's packages are there: installed beside
// this one, or in the folder DSH_MODULES names (a DSH install's node_modules, say).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import * as G from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { hooks, open, senderOf, wake } from '../plugin/hooks.js'

/** One of DSH's packages: from DSH_MODULES when it is set (it must be there), else beside this one, else null. */
async function dsh (name) {
  if (!process.env.DSH_MODULES) return import(name).catch(() => null)
  const from = createRequire(path.join(path.resolve(process.env.DSH_MODULES), 'here.js'))
  return import(pathToFileURL(from.resolve(name)).href)
}
const format = await dsh('@deepseek-ai/dsh-session-format-v3-to-v4')
const known = (await dsh('@deepseek-ai/dsh-session'))?.KNOWN_SESSION_EVENT_TYPES

const JUDGED = '{"worth_remembering": {"probability": 0.9}, "mood_change": {"level": "1", "confidence": 0.9}, ' +
  '"feeling": {"choice": "tender", "confidence": 0.8}}'
const NOTES = '[{"text": "Leo 最近经常加班", "kind": "episode", "importance": 3}]'
const sent = (said, { qq = '10001', nickname = 'Leo', before = '' } = {}) =>
  `${before}<user_message qq="${qq}" nickname="${nickname}">\n${said}\n</user_message>`

let ids = 0
const message = (role, words, source) => ({ id: `m${++ids}`, role, ...(source ? { source } : {}),
  content: [{ type: 'text', text: words }] })

const PROMPT = 'You are an AI agent.\n\n你是小鲸。' // (DSH's system prompt, with a persona card in it)

/** A stand-in for DSH: listeners composed as cordis composes them (`prepend` goes first), its system prompt's
 * sections, the requests its loop makes (each through the listeners of `llm/stream`, as DSH's `llm.stream` runs
 * them), and, with `clock`, a plugin like DSH's time context, adding a message to every step. */
function harness (config, { model = true, clock = false } = {}) {
  const handlers = {}, logs = [], asked = [], commands = {}, tools = {}, routes = {}, sections = {}, sent = []
  const variables = {}, presets = {}, projections = {}
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
  const looped = new WeakSet() // (the requests DSH's loop makes)
  let answering = null // (her model, for this turn's calls from the loop)
  /** The plugin's own calls (her mood, her notes, her gut): what her model answers them. */
  async function * own (request) {
    asked.push(request)
    const said = request.messages[0].content[0].text
    let answer = '{"side": null}'
    const form = { people: [], topic: ['work'], sender_feels: 'tired', language: 'zh' }
    if (request.system === G.FORM) answer = JSON.stringify(form)
    else if (request.system?.startsWith('You judge')) answer = JUDGED
    else if (request.system?.startsWith('From the exchange below')) answer = NOTES
    else if (said.includes(G.ASK)) answer = '{"tender": 0.7, "calm": 0.3}'
    else if (said.includes(G.NOTE)) answer = '{"mood": -1, "feel": {"tender": 1}}'
    else if (said.includes('这个属性的人')) answer = '你嘴硬心软。'
    yield { type: 'text-delta', text: answer }
  }
  const ctx = {
    on: (name, handler, options) => { (handlers[name] ??= [])[options?.prepend ? 'unshift' : 'push'](handler) },
    inject: (names, apply) => apply(ctx),
    effect: () => {},
    commands: { register: command => { commands[command.name] = command } },
    connection: { fetch: { register: route => { routes[route.path] = route } } },
    tools: { register: tool => { tools[tool.name] = tool } },
    systemPrompt: { section: definition => { sections[definition.name] = definition },
      variable: (name, provider) => { variables[name] = provider } },
    agentPresets: { register: async definition => { presets[definition.id] = definition; return () => {} } },
    sessionProjections: { register: definition => { projections[definition.key] = definition },
      stateOf: (session, key) => key === 'agentPreset' ? session.preset ?? null : projections[key] &&
        session.events.reduce(projections[key].apply, projections[key].init()) },
    logger: { info: line => logs.push(line) },
    llm: {
      stream: request => waterfall({ handlers }, 'llm/stream', request, payload => {
        if (!looped.has(payload)) return own(payload)
        sent.push(payload)
        return answering(payload)
      })
    }
  }
  if (clock) {
    ctx.on('agent/pre-step', async (_, next) => {
      const decision = await next()
      return { ...decision, messages: [...decision.messages, message('user', 'Time.', { kind: 'time-context' })] }
    }, { prepend: true })
  }
  const appended = [] // (what the plugin writes to the session log itself)
  const session = { id: 's1', header: {}, events: [], turns: 0, compacted: false, // (compacted: only this turn's left)
    deriveMessages: () => messagesOf(session.compacted ? { events: session.events.slice(session.events
      .findLastIndex(event => event.type === 'turn/start')) } : session),
    write: (type, data, intent = {}) => { session.events.push({ type, seq: session.events.length, data, ...intent }) },
    append: (type, data, intent) => {
      appended.push([type, data])
      session.write(type, data, intent)
    },
    requestHeader: () => model ? { config: { provider: 'deepseek', model: 'deepseek-chat' } } : {} }
  const made = hooks(ctx, config, { isAgentLoopRequest: request => looped.has(request),
    markAgentLoopRequest: request => looped.add(request),
    createUserMessage: given => ({ id: `m${++ids}`, role: 'user', ...given }), home })
  const h = { handlers, logs, asked, commands, tools, routes, sections, variables, presets, sent, agent: { session },
    session, appended, home, looped, ctx, answer: model => { answering = model }, ...made }
  return h
}

/** Her Character Card as DSH's system prompt has it at this step: '' when she has none on. */
const cardIn = h => h.sections['mneme-llm:card'].text({ agent: h.agent, scope: h.agent })

/** The messages in a session log, in order. */
const messagesOf = session => session.events.filter(event => event.type.endsWith('/message'))
  .map(event => event.type === 'user/message' ? event.data : event.data.message)

/** A waterfall of `name`'s listeners around `inner`, as cordis runs one. */
function waterfall (h, name, payload, inner) {
  const listeners = [...(h.handlers[name] || [])]
  const next = () => (listeners.shift() ?? inner)(payload, next)
  return next()
}

/** One message as DSH's loop gives it to the hooks, written to the session log as the loop writes it: the turn opens,
 * the hooks are asked before its first step, and in the step come DSH's system prompt (unless it is there already),
 * the step's messages and her model's reply, `reply` (null: her model must not be called). It returns the step as DSH
 * has it (`step`), and as her model read it (`messages`: from her note, when there is one, to the end; DSH's step when
 * her model was not called). */
async function turn (h, said, reply, source = { kind: 'user' }) {
  const { session } = h, number = ++session.turns, at = { turn: number, step: 1 }
  const opened = message('user', said, source), context = message('user', 'Runtime.', { kind: 'runtime-context' })
  session.write('turn/start', { turn: number })
  const decision = await waterfall(h, 'agent/pre-step', { agent: h.agent, messages: [opened], ...at },
    async () => ({ kind: 'enter', messages: [opened, context] }))
  session.write('step/start', at)
  const prompts = session.events.filter(event => event.type === 'system/message')
  if (prompts.at(-1)?.data.message.content[0].text !== PROMPT) { // (DSH's own, unless the same words are there)
    session.write('system/message', { ...at, message: message('system', PROMPT, { kind: 'system-prompt' }) },
      { surfaceOp: 'append' })
  }
  for (const item of decision.messages) session.write('user/message', item, { surfaceOp: 'append' })
  const request = Object.freeze({ provider: 'deepseek', model: 'deepseek-chat',
    messages: Object.freeze(session.deriveMessages()), toolHistory: [], sessionId: session.id })
  h.looped.add(request)
  const calls = h.sent.length
  h.answer(async function * () {
    if (reply === null) throw new Error('her model was called')
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  let text = ''
  for await (const chunk of h.ctx.llm.stream(request)) {
    if (chunk.type === 'text-delta') text += chunk.text
  }
  session.write('assistant/message', { ...at, message: { ...message('assistant', text),
    source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' } } }, { surfaceOp: 'append' })
  session.write('step/end', at)
  for (const listener of h.handlers['agent/turn-stopping']) listener({ agent: h.agent })
  session.write('turn/end', { turn: number, reason: { kind: 'completed' } })
  const got = h.sent.length > calls ? h.sent.at(-1).messages : null
  if (!got) return { ...decision, step: decision.messages }
  const where = got.findIndex(item => item.id === opened.id)
  const from = got[where - 1]?.source?.kind === 'mneme-llm' ? where - 1 : where
  return { ...decision, step: decision.messages, messages: got.slice(from) }
}

/** The text of every message in the session, in order, and of what kind it is. */
const order = h => messagesOf(h.session).map(item => [item.role, item.source?.form ?? item.source?.kind,
  item.content[0].text])

/** A session log as DSH reads it back when the session reopens, or what it says is wrong with it. */
function reopened (session) {
  try {
    format.restoreReleasedV4Artifact({ header: { version: 4, id: session.id, createdAt: 1, isSeeded: false,
      delegationDepth: 0 }, events: session.events, inheritedEventCount: 0 }, known)
    return 'reopens'
  } catch (error) { return String(error) }
}

const until = async (done, seconds = 5) => {
  const deadline = performance.now() + seconds * 1000
  while (!done() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
}

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
const channel = { kind: 'plugin:chat' }

test('a turn: the block beside her message, the exchange kept word for word, her mood and notes, a lesson after',
  async () => {
  const h = harness({ name: 'xiaojing', companion: '小鲸', user: 'Leo', role: 'family', character: '你是小鲸。',
    tags: { 傲娇: '' } })
  const decision = await turn(h, '今天加班好累', '辛苦了，抱抱你。')
  assert.deepEqual(decision.messages.map(item => item.source.kind), ['mneme-llm', 'user', 'runtime-context'])
  const block = decision.messages[0].content[0].text
  assert.ok(block.startsWith('(Leo is family to you;'), block)
  assert.ok(block.includes('Nothing said before came to mind') && block.includes('search for it'), block) // her look
  assert.ok(block.includes('(Right now your 傲娇 side is showing: 你嘴硬心软。)'), block)
  assert.ok(block.endsWith('Reply in Mandarin Chinese.'), block)
  assert.equal(h.gut.tags.傲娇, '你嘴硬心软。') // (drafted by her model the first time)
  const [kept] = h.mneme.episodes.after('owner', 0)
  assert.deepEqual([kept.lines, kept.conversation], [[['Leo', '今天加班好累'], ['小鲸', '辛苦了，抱抱你。']], 'dsh:s1'])
  await until(() => h.mneme.memory.notes('owner').length === 1 && h.gut.net.lessons === 1)
  assert.deepEqual(h.mneme.memory.notes('owner').map(note => note.text), ['Leo 最近经常加班'])
  assert.ok(h.mneme.mood.state('owner').value > 70)
  assert.equal(h.gut.net.lessons, 1)
  assert.ok(h.asked.some(request => request.system?.startsWith('You judge') && request.maxTokens === 1500))
  h.mneme.close()
  const m = new Mneme(path.join(h.home, 'mneme-llm', 'xiaojing', 'memory.db'), 'xiaojing', { embed: false })
  assert.equal(m.surface.first('owner').text, '今天加班好累')
  assert.deepEqual([m.relations.get('owner').role, m.companionName], ['family', '小鲸'])
  m.close()
  h.gut.close()
})

const kinds = h => order(h).map(([role, kind]) => `${role} ${kind}`)
const SAID = /^What you and Leo said to each other lately, word for word, the oldest first, each with when it was said:/

test('her Character Card: in DSH\'s system prompt once it is on; nothing of before goes in front of a new session',
  async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  await until(() => h.mneme.surface.card('owner'))
  assert.equal(cardIn(h), '', 'the first thing said is kept, not used')
  assert.equal((await h.commands['mneme-card'].handler({ rawInput: '' })).text,
    '我养了一只猫，叫年糕\n（这是你说的第一句话；只是记着）')
  await h.commands['mneme-card'].handler({ rawInput: ' 你是小鲸，叫我哥哥。每句话结尾加个咕噜。' })
  assert.equal(cardIn(h), '', 'set, it is still off')
  assert.equal((await h.commands['mneme-card'].handler({ rawInput: 'on' })).text, '从现在起，它在她的系统提示里。')
  assert.equal(cardIn(h), '你是小鲸，叫我哥哥。每句话结尾加个咕噜。')
  const next = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  assert.equal(cardIn(next), '你是小鲸，叫我哥哥。每句话结尾加个咕噜。', 'kept in her file')
  const read = await turn(next, '我的猫叫什么？', '叫年糕呀。')
  assert.deepEqual(read.messages.map(item => item.source.form ?? item.source.kind), ['notice', 'user',
    'runtime-context'], 'nothing of before in front of a new session: her note, then the message')
  assert.ok(read.messages[0].content[0].text.includes('年糕'), 'her look finds what was said before')
  assert.deepEqual(kinds(next), ['system system-prompt', 'user user', 'user runtime-context', 'assistant model'],
    'nothing of hers in the session log')
  assert.deepEqual([h.appended, next.appended], [[], []], 'the plugin writes nothing to the session log itself')
  h.mneme.close()
  next.mneme.close()
})

test('the plugin\'s card: written to her file when it is new or changed, and turned on; $card changes it too, and ' +
  'whichever came last is her card', async () => {
  const where = folder(), setup = card => ({ folder: where, user: 'Leo', gut: false, card })
  const shown = async h => (await h.commands['mneme-card'].handler({ rawInput: '' })).text
  let h = harness(setup('你是小鲸。'))
  assert.equal(cardIn(h), '你是小鲸。')
  assert.equal(await shown(h), '你是小鲸。\n（来自插件设置；每次都在她的系统提示里）')
  await h.commands['mneme-card'].handler({ rawInput: '你是小鲸，说话简短。' })
  h.mneme.close()
  h = harness(setup('你是小鲸。')) // (the same settings: her card stays what $card made it)
  assert.equal(cardIn(h), '你是小鲸，说话简短。')
  assert.equal(await shown(h), '你是小鲸，说话简短。\n（这是你设的；每次都在她的系统提示里）')
  await h.commands['mneme-card'].handler({ rawInput: 'off' })
  h.mneme.close()
  h = harness(setup('你是小鲸。'))
  assert.equal(cardIn(h), '', 'off stays off')
  h.mneme.close()
  h = harness(setup('你是小鲸，很温柔。')) // (changed settings: the latest word)
  assert.equal(cardIn(h), '你是小鲸，很温柔。')
  h.mneme.close()
})

test('her chat preset among DSH\'s agent presets: her card is its persona, the whole system prompt, with none of ' +
  'DSH\'s work', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', gut: false, card: '你是小鲸。' })
  const preset = h.presets['mneme-chat']
  assert.equal(preset.name, 'Chat with 小鲸')
  assert.deepEqual(preset.plugins.map(row => row.id), ['persona', 'time-context', 'compaction'],
    'no shell, files, search, skills, plans or subagents')
  assert.deepEqual([preset.plugins[0].name, preset.plugins[0].config], ['@deepseek-ai/dsh-persona',
    { prefix: '{{mneme_card}}', complete: true, includeRuntimeContext: false }])
  assert.equal(h.variables.mneme_card(), '你是小鲸。')
  assert.equal(cardIn(h), '你是小鲸。', 'at work, her card is a section of DSH\'s system prompt')
  h.session.preset = 'mneme-chat'
  assert.equal(cardIn(h), '', 'in a chat, the persona is her card: not twice')
  await h.commands['mneme-card'].handler({ rawInput: 'off' })
  assert.equal(h.variables.mneme_card(), 'You are 小鲸.', 'with no card on, she is still someone')
  h.mneme.close()
  const loose = harness({ folder: folder(), companion: '小鲸', gut: false, complete: false, language: 'chinese' })
  assert.deepEqual([loose.presets['mneme-chat'].name, loose.presets['mneme-chat'].plugins[0].config.complete],
    ['和小鲸聊天', false], 'complete: false keeps DSH\'s and other plugins\' sections beside her card')
  assert.equal(loose.variables.mneme_card(), '你是小鲸。')
  loose.mneme.close()
  const none = harness({ folder: folder(), gut: false, chat: false, card: '你是小鲸。' })
  none.session.preset = 'mneme-chat'
  assert.deepEqual([none.presets, cardIn(none)], [{}, '你是小鲸。'], 'chat: false: no preset')
  none.mneme.close()
})

test('a chat with her: what she keeps of lately in front of a new session\'s first message, kept there and not ' +
  'looked up again; at work, nothing of before', async () => {
  const where = folder(), setup = { folder: where, companion: '小鲸', user: 'Leo', gut: false }
  const h = harness(setup)
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  await turn(h, '年糕三岁了，很爱吐毛球', '三岁正是调皮的时候。')
  h.mneme.close()
  const chat = harness(setup)
  chat.session.id = 's2'
  chat.session.preset = 'mneme-chat'
  const first = await turn(chat, '年糕吐毛球怎么办？', '多给它梳梳毛。')
  assert.deepEqual(first.step.map(item => item.source.form ?? item.source.kind), ['surface', 'user', 'runtime-context'])
  const surface = first.step[0].content[0].text
  assert.ok(SAID.test(surface) && surface.includes('Leo: 我养了一只猫，叫年糕') &&
    surface.includes('小鲸: 三岁正是调皮的时候。'), surface)
  const note = first.messages[0].content[0].text
  assert.equal(first.messages[0].source.form, 'notice')
  assert.ok(!note.includes('很爱吐毛球'), 'what the surface shows her is not looked up again')
  await turn(chat, '它爱吃什么？', '鱼干吧。')
  assert.deepEqual(kinds(chat), ['system system-prompt', 'user surface', 'user user', 'user runtime-context',
    'assistant model', 'user user', 'user runtime-context', 'assistant model'], 'once, at the start, and kept there')
  chat.mneme.close()
  const work = harness(setup)
  work.session.id = 's3'
  const read = await turn(work, '年糕吐毛球怎么办？', '多梳毛。')
  assert.deepEqual(read.step.map(item => item.source.form ?? item.source.kind), ['user', 'runtime-context'])
  assert.ok(read.messages[0].content[0].text.includes('很爱吐毛球'), 'at work, her look brings it')
  work.mneme.close()
})

test('the language she answers in, from the plugin\'s settings: in her line, her answers and her chat preset',
  async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', role: 'family', language: 'japanese',
    tags: { 傲娇: '你嘴硬心软。' } })
  const decision = await turn(h, '今天加班好累', '辛苦了。')
  const block = decision.messages[0].content[0].text
  assert.ok(block.endsWith('Reply in Japanese.'), block) // (her reading of the message said Mandarin)
  await until(() => h.mneme.surface.card('owner'))
  assert.equal((await h.commands['mneme-card'].handler({ rawInput: '' })).text,
    '今天加班好累\n（あなたが最初に言ったこと；保存しているだけです）')
  assert.equal(h.presets['mneme-chat'].name, '小鲸とおしゃべり')
  h.mneme.close()
  h.gut.close()
  const plain = harness({ folder: folder(), companion: '小鲸', user: 'Leo', gut: false, language: 'Cantonese' })
  const said = (await turn(plain, 'hello there', 'hi!')).messages[0].content[0].text
  assert.ok(said.endsWith('Reply in written Cantonese.'), said)
  assert.equal((await plain.commands['mneme-new'].handler({ rawInput: '' })).text,
    '重新开始：她记着的最近的对话从头开始。说过的每句话都还在她的深层记忆里。')
  plain.mneme.close()
  assert.throws(() => harness({ folder: folder(), gut: false, language: 'Klingon' }), /language is auto, english/)
})

test('her note goes into each call of its turn, in front of the message, and into no other turn\'s', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', gut: false })
  const kindsOf = messages => messages.map(item => item.source?.form ?? item.source?.kind ?? item.role)
  await turn(h, '我养了一只猫，叫年糕', '好可爱！')
  assert.deepEqual(kindsOf(h.sent.at(-1).messages), ['system-prompt', 'notice', 'user', 'runtime-context'])
  await turn(h, '年糕今天吐毛球了', '要多梳毛。')
  const got = kindsOf(h.sent.at(-1).messages)
  assert.deepEqual(got, ['system-prompt', 'user', 'runtime-context', 'model', 'notice', 'user', 'runtime-context'],
    'the last turn\'s note is gone; this turn\'s is in front of its message')
  // A turn of two steps (a tool call between): the second call carries the note too.
  const { session } = h, opened = message('user', '它几岁了？', { kind: 'user' })
  session.write('turn/start', { turn: 3 })
  const decision = await waterfall(h, 'agent/pre-step', { agent: h.agent, messages: [opened], turn: 3, step: 1 },
    async () => ({ kind: 'enter', messages: [opened] }))
  for (const item of decision.messages) session.write('user/message', item, { surfaceOp: 'append' })
  const call = async () => {
    const request = Object.freeze({ provider: 'deepseek', model: 'deepseek-chat',
      messages: Object.freeze(session.deriveMessages()), toolHistory: [], sessionId: session.id })
    h.looped.add(request)
    h.answer(async function * () { yield { type: 'text-delta', index: 0, text: '嗯' } })
    for await (const chunk of h.ctx.llm.stream(request)) assert.ok(chunk)
    return kindsOf(h.sent.at(-1).messages).slice(-3)
  }
  assert.deepEqual(await call(), ['model', 'notice', 'user'])
  session.write('assistant/message', { turn: 3, step: 1, message: message('assistant', '(a tool call)') },
    { surfaceOp: 'append' })
  await waterfall(h, 'agent/pre-step', { agent: h.agent, messages: [], turn: 3, step: 2 },
    async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(await call(), ['notice', 'user', 'assistant'], 'a later step of the turn has it too')
  for (const listener of h.handlers['agent/turn-stopping']) listener({ agent: h.agent })
  assert.ok(!(await call()).includes('notice'), 'and once the turn has stopped, nothing has it')
  assert.equal(h.appended.length, 0)
  h.mneme.close()
})

test('the session log reopens in DSH, and holds nothing of hers', { skip: format && known ? false :
  'DSH\'s session packages are not here (DSH_MODULES)' }, async () => {
  const setup = { folder: folder(), companion: '小鲸', user: 'Leo', accounts: ['qq:10001'] }
  const h = harness(setup)
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  await turn(h, '$card 每句话结尾加个“咕噜”', null)
  await turn(h, '$card on', null)
  await turn(h, sent('我的猫叫什么？'), '叫年糕呀，咕噜。', channel)
  await turn(h, sent('你好，我是小明', { qq: '20002', nickname: '小明' }), '你好小明！', channel)
  await turn(h, sent('猫呢？', { before: '[21:05 Leo(10001)]\n' }), '在睡觉。', channel)
  await turn(h, '现在是晚上十点。', '睡了吗？', { kind: 'speak-up' })
  await turn(h, '$new', null)
  assert.equal(reopened(h.session), 'reopens')
  assert.ok(!messagesOf(h.session).some(item => item.source?.kind === 'mneme-llm'), kinds(h).join(', '))
  h.mneme.close()
  h.gut.close()
})

test('the commands, typed as messages or from DSH\'s command list: no step, each deeper, the deep ones yours alone',
  async () => {
  // (a plugin like DSH's time context adds to every step: a command must still have none)
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', accounts: ['qq:10001'] }, { clock: true })
  const typed = async (said, source = { kind: 'user' }) => {
    const before = h.appended.length, asked = h.asked.length, decision = await turn(h, said, null, source)
    assert.deepEqual([decision.messages.map(item => item.source.kind), h.appended.length, h.asked.length],
      [[source.kind, 'runtime-context', 'time-context'], before, asked]) // (the step as DSH has it; no call)
    const [question, answer] = order(h).slice(-2)
    assert.deepEqual(question.slice(0, 2), ['user', 'time-context'])
    assert.equal(answer[0], 'assistant')
    return answer[2]
  }
  assert.equal(await typed('$card'), 'There is no Character Card yet: set one with $card <text>.')
  assert.equal(await typed('$card on'), 'There is no Character Card yet: set one with $card <text>.')
  await turn(h, '你好呀', '你好！')
  await until(() => h.mneme.surface.card('owner')) // (kept once her mood is judged)
  // They write Chinese now, as her gut has read: so are the answers, a bare command's too.
  assert.equal(await typed('$card'), '你好呀\n（这是你说的第一句话；只是记着）')
  assert.equal(await typed(sent('$card   当我的猫娘 '), channel), '记下了。用 $card on，把它放进她的系统提示。')
  assert.equal((await h.commands['mneme-card'].handler({ rawInput: 'ON' })).text, '从现在起，它在她的系统提示里。')
  assert.equal(cardIn(h), '当我的猫娘')
  assert.equal(await typed('$first'), '当我的猫娘\n（这是你设的；每次都在她的系统提示里）', '$first: its name before')
  assert.equal(await typed(sent('$card 当我的狗', { qq: '20002', nickname: '小明' }), channel),
    '只有她的主人能这样做。', 'her card is yours alone')
  assert.equal(await typed(sent('$card', { qq: '20002', nickname: '小明' }), channel),
    'Only the person she belongs to can do that.', 'even to read')
  assert.equal(cardIn(h), '当我的猫娘')
  assert.equal(await typed('$card off'), '现在只是记着，不放进系统提示。')
  assert.equal(cardIn(h), '')
  assert.equal(await typed('$card clear'), '拿掉了。')
  assert.equal(await typed('$card clear'), '本来就没有记着什么。')
  assert.equal(await typed('$card be my cat'), 'Kept. $card on puts it in her system prompt.')
  assert.equal(await typed('$card clear'), 'Taken away.', 'what they wrote last is English')
  assert.ok((await typed('$new')).startsWith('重新开始：'))
  assert.deepEqual(h.mneme.surface.read('owner').messages, [])
  assert.equal(h.mneme.episodes.count('owner'), 1, 'deep memory keeps every word')
  assert.equal(await typed('$new everything'), '用法：$new、$new deep 或 $new gut。')
  assert.equal(await typed(sent('$new deep', { qq: '20002', nickname: '小明' }), channel),
    'Only the person she belongs to can do that.') // (小明 has said nothing she could read a language in)
  await until(() => h.gut.net.lessons === 1)
  assert.equal(await typed(sent('$new deep'), channel), '1 段对话连同所有笔记，永久删除了。')
  assert.equal(h.mneme.episodes.count('owner'), 0)
  assert.equal(h.gut.net.lessons, 1, 'her gut is apart from her memory')
  assert.equal((await h.commands['mneme-new'].handler({ rawInput: ' gut' })).text,
    '0 段对话连同所有笔记永久删除了，她的直觉学到的 1 条也一起删了：她回到了刚出生的样子。')
  assert.equal(h.gut.net.lessons, 0)
  h.mneme.close()
  h.gut.close()
})

test('a turn that fails leaves nothing behind: the next turn\'s answer is not kept as her reply to it', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  const opened = message('user', '你好呀，今天下雨了', { kind: 'user' })
  await waterfall(h, 'agent/pre-step', { agent: h.agent, messages: [opened], turn: 1, step: 1 },
    async () => ({ kind: 'enter', messages: [opened] })) // (and its model call fails: DSH stops no turn)
  await turn(h, '$first 每句话结尾加个咕噜', null)
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.equal(h.mneme.episodes.count('owner'), 0)
  h.mneme.close()
})

test('with no gut, a command answers in the language of the last thing the person said', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  const last = async said => {
    await turn(h, said, null)
    return order(h).at(-1)[2]
  }
  assert.equal(await last('$new'), 'A fresh start: what she keeps of lately starts over. Every word stays in her ' +
    'deep memory.')
  await turn(h, '今天下雨了', '记得带伞。')
  await until(() => h.mneme.surface.first('owner'))
  assert.equal(await last('$card'), '今天下雨了\n（这是你说的第一句话；只是记着）')
  await turn(h, 'It is sunny now', 'Nice!')
  await until(() => h.mneme.episodes.count('owner') === 2)
  assert.equal(await last('$card off'), 'It is only kept now.')
  assert.equal(await last('$card 下雨要带伞'), '记下了。用 $card on，把它放进她的系统提示。')
  await turn(h, 'Sunny again', 'Lovely!')
  await until(() => h.mneme.episodes.count('owner') === 3)
  assert.equal(await last('$card on'), 'It is in her system prompt from now on.', 'what they said since wins')
  h.mneme.close()
})

test('a command\'s own words (on, off, clear, deep, gut) are in no language: it answers in that of what the ' +
  'person wrote last', async () => {
  const where = folder()
  const h = harness({ folder: where, user: 'Leo' }) // (her gut has read nothing of theirs yet)
  const last = async (h, said) => {
    await turn(h, said, null)
    return order(h).at(-1)[2]
  }
  assert.equal(await last(h, '$card 你是我的大肥鱼，说话要可爱一点，每句话结尾加个“咕噜”'),
    '记下了。用 $card on，把它放进她的系统提示。')
  assert.equal(await last(h, '$card on'), '从现在起，它在她的系统提示里。')
  assert.equal(await last(h, '$new'), '重新开始：她记着的最近的对话从头开始。说过的每句话都还在她的深层记忆里。')
  h.mneme.close()
  h.gut.close()
  const later = harness({ folder: where, user: 'Leo' }) // (and once DSH has restarted)
  assert.equal(await last(later, '$card OFF'), '现在只是记着，不放进系统提示。')
  assert.equal(await last(later, '$new deep'), '0 段对话连同所有笔记，永久删除了。')
  assert.equal(later.mneme.surface.card('owner').text, '你是我的大肥鱼，说话要可爱一点，每句话结尾加个“咕噜”',
    'her card is who she is, not something she remembers: it stays')
  assert.equal(await last(later, '$card be my cat'), 'Kept. $card on puts it in her system prompt.')
  assert.equal(await last(later, '$card on'), 'It is in her system prompt from now on.')
  later.mneme.close()
  later.gut.close()
})

test('a chat channel\'s people: their words unwrapped, each sender a person, your own accounts you, groups apart',
  async () => {
  assert.deepEqual(senderOf(message('user', sent('多行\n的话'), channel)),
    { account: 'qq:10001', name: 'Leo', said: '多行\n的话', group: false })
  assert.equal(senderOf(message('user', '没有边界', channel)), null)
  const where = folder(), setup = { folder: where, companion: '小鲸', user: 'Leo', role: 'family',
    accounts: ['qq:10001'], gut: false }
  const h = harness(setup)
  await turn(h, sent('我养了一只猫，叫年糕'), '好可爱！', channel)
  assert.deepEqual(h.mneme.episodes.after('owner', 0).map(item => item.lines), [[['Leo', '我养了一只猫，叫年糕'],
    ['小鲸', '好可爱！']]])
  assert.equal(h.mneme.person('qq:10001'), 'owner')
  const other = await turn(h, sent('你好，我是小明', { qq: '20002', nickname: '小明' }), '你好小明！', channel)
  const told = other.messages[0].content[0].text
  assert.ok(told.startsWith('(You\'re talking with 小明, someone you know; you are not close yet.)\n\n'), told)
  assert.ok(!told.includes('owner') && !told.includes('Leo'), told)
  const mine = await turn(h, sent('我回来了'), '欢迎回来！', channel)
  assert.ok(mine.messages[0].content[0].text.startsWith('(Leo is family to you; you are very close.)'),
    'to you she needs no telling')
  assert.deepEqual(h.mneme.episodes.after('qq:20002', 0).map(item => item.lines), [[['小明', '你好，我是小明'],
    ['小鲸', '你好小明！']]])
  assert.equal(h.mneme.relations.get('qq:20002').role, 'acquaintance')
  const group = await turn(h, sent('猫呢？', { before: '[21:05 Leo(10001)]\n' }), '在睡觉。', channel)
  assert.ok(!group.messages[0].content[0].text.includes('search'), 'in a group no search comes by itself')
  const again = harness(setup)
  const opened = await turn(again, sent('猫呢？', { before: '[21:05 Leo(10001)]\n' }), '在睡觉。', channel)
  assert.deepEqual(opened.messages.map(item => item.source.form ?? item.source.kind), ['notice', 'plugin:chat',
    'runtime-context'], 'a new session that opens in a group has nothing of before in front of it')
  h.mneme.close()
  again.mneme.close()
})

test('who she is talking with, in Chinese, and with someone who has no role', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  h.mneme.relations.displayLanguage = 'zh'
  const told = async (said, who) => (await turn(h, sent(said, who), '好', channel)).messages[0].content[0].text
  const line = await told('你好', { qq: '20002', nickname: '小明' })
  assert.ok(line.startsWith('（你在和小明说话：你认识的人，你们还不太熟。）') && !line.includes('主人'), line)
  h.mneme.close()
  const alone = harness({ folder: folder(), user: 'Leo', gut: false, others: '' })
  const block = (await turn(alone, sent('你好', { qq: '20003', nickname: '小红' }), '好', channel)).messages[0]
  assert.ok(block.content[0].text.startsWith('(You\'re talking with 小红.)'), block.content[0].text)
  alone.mneme.close()
})

test('in a group: who she is talking with, by name, and her look at what they said with her and what was said ' +
  'there, never at someone else\'s private chats', async () => {
  const where = folder(), setup = { folder: where, companion: '大肥鱼', user: 'Leo', role: 'family',
    accounts: ['qq:10001'], gut: false }
  const chat = id => {
    const h = harness(setup)
    h.session.id = id // (each chat a channel brings is a session of its own)
    return h
  }
  const yours = chat('onebot-private-10001'), hers = chat('onebot-private-10002'), group = chat('onebot-group-30001')
  for (const h of [yours, hers, group]) h.mneme.saidWords = 0 // (in a file of five exchanges every word is common)
  const inGroup = (said, qq, nickname) => sent(said, { qq, nickname, before: `[21:05 ${nickname}(${qq})] ` })
  await turn(yours, sent('我的猫年糕最近总吐毛球'), '主人，年糕要多梳毛咕噜。', channel)
  await turn(hers, sent('我的猫芝麻也吐毛球', { qq: '10002', nickname: '小美' }), '芝麻也要梳毛呀。', channel)
  await turn(group, inGroup('我家的猫也吐毛球', '10003', '阿强'), '那要勤梳毛。', channel)
  await turn(group, inGroup('大家的猫都吐毛球吗', '10001', 'Leo'), '主人，好像是的咕噜。', channel)
  const said = async () => (await turn(group, inGroup('猫吐毛球怎么办？', '10002', '小美'), '多梳毛。', channel))
    .messages[0].content[0].text
  const shown = await said()
  assert.ok(shown.startsWith('(You\'re talking with 小美, someone you know; you are not close yet.)\n\n') &&
    !shown.includes('owner'), shown)
  assert.ok(shown.includes('小美: 我的猫芝麻也吐毛球'), 'what she said with her, in any chat')
  assert.ok(!shown.includes('阿强') && !shown.includes('大家的猫'), 'what this session still shows her: not again')
  group.session.compacted = true // (DSH compacted what was said there: it is no longer in front of her)
  const block = await said()
  assert.ok(block.includes('Said before with 小美, and with others in this group:'), block)
  assert.ok(block.includes('小美: 我的猫芝麻也吐毛球'), 'what she said with her, in any chat')
  assert.ok(block.includes('阿强: 我家的猫也吐毛球') && block.includes('Leo: 大家的猫都吐毛球吗'), 'what was said there')
  assert.ok(!block.includes('年糕'), 'not what you said with her in private')
  hers.session.compacted = true // (so what she said there is no longer in front of her)
  const inPrivate = (await turn(hers, sent('猫吐毛球怎么办？', { qq: '10002', nickname: '小美' }), '多梳毛。', channel))
    .messages[0].content[0].text
  assert.ok(inPrivate.includes('小美: 我的猫芝麻也吐毛球') && !inPrivate.includes('阿强') && !inPrivate.includes('年糕'),
    'in a private chat her look is theirs alone, as before')
  const yourTurn = (await turn(group, inGroup('年糕还在吐毛球', '10001', 'Leo'), '主人，多梳毛咕噜。', channel))
    .messages[0].content[0].text
  assert.ok(yourTurn.startsWith('(Leo is family to you; you are very close.)') && yourTurn.includes('Leo: 我的猫年糕'),
    'with you in the group, what you said with her anywhere')
  for (const h of [yours, hers, group]) h.mneme.close()
})

test('in a group her own mention is not what they said: known once it has opened two messages, and kept', async () => {
  const where = folder()
  const group = (said, qq, nickname) => sent(said, { qq, nickname, before: `[21:05 ${nickname}(${qq})] ` })
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', accounts: ['qq:10001'], gut: false })
  const kept = async (said, qq = '10002', nickname = '小美') => {
    await turn(h, qq === null ? sent(said) : group(said, qq, nickname), '嗯', channel)
    const subject = qq === null || qq === '10001' ? 'owner' : `qq:${qq}`
    return h.mneme.episodes.after(subject, 0)[0].lines[0][1]
  }
  assert.equal(await kept('@30003 我下个月去成都'), '@30003 我下个月去成都', 'once is not enough')
  assert.equal(await kept('@30003 我在备考雅思', '10003', '阿强'), '我在备考雅思')
  assert.equal(await kept('@30003 @10002 周末一起吃饭', '10001', 'Leo'), '@10002 周末一起吃饭',
    'someone else she was not mentioned for')
  assert.equal(await kept('@10002 @30003 我也去', '10003', '阿强'), '@10002 我也去')
  assert.equal(await kept('@30003 在私聊里', null), '@30003 在私聊里', 'only a group')
  assert.equal(await kept('@40004 喂', '10003', '阿强'), '@40004 喂')
  assert.equal(await kept('@40004 喂喂', '10003', '阿强'), '@40004 喂喂', 'never more often than hers')
  await turn(h, group('@30003 $first', '10001', 'Leo'), null, channel)
  assert.match(order(h).at(-1)[2], /第一条提示|第一句话/, 'a command in a group is a command')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(where, 'self.json'), 'utf8')), ['qq:30003'])
  h.mneme.close()
  const again = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(again, group('@30003 我回来了', '10005', '小王'), '欢迎', channel)
  assert.equal(again.mneme.episodes.after('qq:10005', 0)[0].lines[0][1], '我回来了', 'she knows it from her folder')
  await turn(again, group('大家好', '30003', '机器人'), '好', channel) // (someone writes from it: it is not hers)
  await turn(again, group('@30003 再来', '10005', '小王'), '好', channel)
  assert.equal(again.mneme.episodes.after('qq:10005', 0)[0].lines[0][1], '@30003 再来')
  again.mneme.close()
})

test('her word habits are in her line with the people close to her, and with no one else', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', accounts: ['qq:10001'] })
  h.gut.wake()
  h.gut.marks.heads = { zh: { names: ['主人'], w: {}, b: [5.0] } } // (what she says to you, all the time)
  const line = async (said, who) => (await turn(h, sent(said, who), '嗯', channel)).messages[0].content[0].text
  assert.ok((await line('我回来了')).includes('you keep saying 主人'))
  const stranger = await line('你好', { qq: '20002', nickname: '小明' })
  assert.ok(stranger.includes('(Right now you feel') && !stranger.includes('keep saying'), stranger)
  h.mneme.close()
  h.gut.close()
})

test('a turn she starts herself: kept as hers, her mood judged, and no notes from it', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, sent('在吗', { qq: '20002', nickname: '小明' }), '在呀！', channel)
  await until(() => h.asked.some(request => request.system?.startsWith('From the exchange below')))
  const before = h.asked.length
  await turn(h, '现在是晚上十点，想想要不要主动找对方聊聊。', '小明，睡了吗？', { kind: 'speak-up' })
  await until(() => h.mneme.episodes.count('qq:20002') === 2 && h.asked.length > before)
  assert.deepEqual(h.mneme.episodes.after('qq:20002', 0)[0].lines, [['小鲸', '小明，睡了吗？']])
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(h.asked.slice(before).some(request => request.system?.startsWith('You judge')))
  assert.ok(!h.asked.slice(before).some(request => request.system?.startsWith('From the exchange below')))
  h.mneme.close()
})

test('a turn she starts herself keeps nothing of what started it: another plugin\'s words to her, not part of the ' +
  'conversation', async () => {
  const h = harness({ folder: folder(), companion: '大肥鱼', user: 'Leo', gut: false })
  await turn(h, '我周四要去看牙医，好怕疼', '主人别怕嘛咕噜。')
  await until(() => h.mneme.memory.notes('owner').length === 1)
  const before = h.asked.length
  const trigger = '（下面这句是**你自己心里冒出来的念头**，不是对方说的话；顺着它去做就行，别把它当成对方发来的消息、也不用' +
    '回应它。）\n（现在这会儿是 11 月 3 日 周二 凌晨 2:43，按这个点来想事、说话。）\n好久没人跟我说话了，我该主动去打个招呼'
  await turn(h, trigger, '主人还在吗咕噜？', { kind: 'speak-up' })
  const judge = () => h.asked.slice(before).find(request => request.system?.startsWith('You judge'))
  await until(() => judge())
  assert.deepEqual(h.mneme.episodes.after('owner', 0).toReversed().map(item => item.lines), [[['Leo', '我周四要去看牙医，好怕疼'],
    ['大肥鱼', '主人别怕嘛咕噜。']], [['大肥鱼', '主人还在吗咕噜？']]], 'her message alone, the first thing said')
  assert.equal(judge().messages[0].content[0].text.split('\n\nQUESTIONS:')[0], 'TEXT:\n[大肥鱼 reached out to Leo on ' +
    'their own, because they wanted to (not as a task). The assistant is 大肥鱼; the user is Leo.]\n大肥鱼: 主人还在吗咕噜？')
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.deepEqual(h.mneme.store.rows('select source from mood_events order by id').map(row => row.source),
    ['user', 'speak-up'], 'her mood follows')
  await turn(h, '在呢在呢，刚才在忙', '忙完啦咕噜？')
  const tables = h.mneme.store.rows('select name from sqlite_master where type = \'table\'').map(row => row.name)
  const file = JSON.stringify(tables.map(table => h.mneme.store.rows(`select * from ${table}`)))
  for (const words of ['念头', '对方发来的消息', '凌晨 2:43', '好久没人跟我说话了', '打个招呼']) {
    assert.ok(!file.includes(words), `${words} is kept`)
  }
  h.mneme.close()
})

test('her tools look through what was said with the person she is talking with', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  assert.deepEqual(Object.keys(h.tools), ['mneme_search', 'mneme_read'])
  assert.deepEqual(h.tools.mneme_search.parameters.required, ['query'])
  await turn(h, '我养了一只猫，叫年糕', '好可爱')
  const search = given => h.tools.mneme_search.execute(given, { agent: h.agent })
  assert.ok((await search({ query: '年糕' })).includes('#1 ['))
  assert.equal(await search({ query: '年糕' }), 'Nothing more found on that.')
  await turn(h, sent('年糕是谁？', { qq: '20002', nickname: '小明' }), '一只猫。', channel)
  assert.ok(!(await search({ query: '年糕' })).includes('我养了一只猫'), 'what Leo said is not 小明\'s')
  await turn(h, '再找找', '好')
  assert.ok((await search({ query: '年糕' })).includes('#1 ['), 'a new turn may show it again')
  assert.ok((await h.tools.mneme_read.execute({ id: 1 }, { agent: h.agent })).includes('Leo: 我养了一只猫，叫年糕'))
  h.mneme.close()
})

test('with no model yet there is no line, and the exchange is kept all the same; a subagent is left alone',
  async () => {
  const h = harness({ folder: folder(), starter: false }, { model: false })
  const decision = await turn(h, 'hello', 'hi there')
  assert.equal(decision.messages.length, 3) // (her memory's block; no line)
  assert.ok(!h.asked.some(request => request.system === G.FORM))
  assert.equal(h.mneme.episodes.count('owner'), 1)
  h.session.header.parentSession = 'parent'
  await turn(h, 'a task', 'done')
  assert.equal(h.mneme.episodes.count('owner'), 1)
  h.mneme.close()
})

test('an account of yours her gut knew apart is joined to you when it wakes', async () => {
  const where = folder()
  const before = new G.Gut(path.join(where, 'gut.db'), { starter: null })
  before.wake()
  const form = { people: [], topic: ['work'], sender_feels: 'tired' }
  for (let i = 0; i < 5; i++) before.teach('qq:10001', 'zh', form, { feel: { tender: 1 }, mood: 1 }, 85, [])
  before.close()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', role: 'family', accounts: ['qq:10001'] })
  await turn(h, '今天加班好累', '辛苦了。')
  assert.deepEqual([...h.gut.net.people.keys()], ['owner'])
  await until(() => h.gut.net.people.get('owner').n === 6) // (this turn's lesson, a moment after her reply)
  assert.equal(h.gut.net.people.get('owner').n, 6)
  h.mneme.close()
  h.gut.close()
})

test('her gut from the plugin\'s settings: her zone, how fast she grows up, and how hard things hit her', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-dsh-'))
  const { mneme, gut } = open({ name: 'xiaojing', zone: 'Asia/Shanghai', tau: 300, sensitivity: 0.5 }, home)
  wake(gut, { sensitivity: 0.5 })
  assert.deepEqual(gut.zone, mneme.memory.zone)
  assert.deepEqual([gut.settings.tau, gut.net.tau, gut.settings.sensitivity], [300, 300, 0.5])
  assert.ok(gut.awake)
  gut.close()
  mneme.close()
})

test('the plugin\'s tau and sensitivity start a gut with no settings of its own; changed, hers are the latest word',
  () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-dsh-'))
    const started = (config, then = () => {}) => {
      const { mneme, gut } = open({ name: 'xiaojing', ...config }, home)
      wake(gut, config)
      const settings = [gut.settings.tau, gut.net.tau, gut.settings.sensitivity]
      then(gut)
      gut.close()
      mneme.close()
      return settings
    }
    assert.deepEqual(started({ tau: 300, sensitivity: 0.5 }), [300, 300, 0.5])
    assert.deepEqual(started({ tau: 400, sensitivity: -0.5 }, gut => gut.configure({ sensitivity: 0.2 })),
      [400, 400, -0.5]) // (nothing of her own yet: the plugin's again; then changed, as the settings page does)
    assert.deepEqual(started({ tau: 300, sensitivity: 0.9 }), [400, 400, 0.2])
    assert.deepEqual(started({}), [400, 400, 0.2])
    const { mneme, gut } = open({ name: 'other' }, home)
    assert.throws(() => wake(gut, { sensitivity: 2 }), /sensitivity/)
    gut.close()
    mneme.close()
  })

test('her panel\'s routes on DSH\'s API: her gut woken with the plugin\'s settings, and a change kept', async () => {
  const h = harness({ name: 'xiaojing', companion: '小鲸', user: 'Leo', sensitivity: 0.3 })
  const ask = (route, body) => h.routes[route].fetch(new Request(`http://127.0.0.1${route}`, body === undefined ? {}
    : { method: 'POST', body: JSON.stringify(body) })).then(response => response.json())
  assert.ok(!h.gut.awake)
  const shown = await ask('/api/mneme-llm.gut')
  assert.ok(h.gut.awake)
  assert.deepEqual([shown.you, shown.companion, shown.report.sensitivity], ['owner', '小鲸', 0.3])
  assert.equal((await ask('/api/mneme-llm.change', { tau: 90 })).report.tau, 90)
  assert.deepEqual(h.gut.settings, { tau: 90, sensitivity: 0.3, nudge: {}, locked: false, people: {},
    side: null })
  assert.ok((await ask('/api/mneme-llm.starmap')).stars.length > 100) // (her starter's rows)
  h.gut.close()
  h.mneme.close()
})

/** The plugin's page: what GET /api/mneme-llm.settings shows, or what a POST of `body` answers. */
async function page (h, body) {
  const where = 'http://dsh/api/mneme-llm.settings'
  const request = body === undefined ? new Request(where)
    : new Request(where, { method: 'POST', body: JSON.stringify(body) })
  const response = await h.routes['/api/mneme-llm.settings'].fetch(request)
  return [response.status, await response.json()]
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

test('her settings page: four tabs, one save across them used at once and kept, and the latest word', async () => {
  const config = { folder: folder(), companion: '小鲸', user: 'Leo', role: 'creator', card: '你是小鲸。',
    language: 'chinese' }
  let h = harness(config)
  let [status, view] = await page(h)
  assert.equal(status, 200)
  assert.deepEqual([view.her.name, view.her.language, view.her.card], ['小鲸', 'chinese',
    { text: '你是小鲸。', on: true, how: 'settings' }])
  assert.deepEqual([view.me, view.others], [{ name: 'Leo', accounts: [] }, 'acquaintance'])
  assert.deepEqual(view.people.map(person => [person.subject, person.you, person.role]), [['owner', true, 'creator']])
  assert.deepEqual([view.memory.surface_days, view.memory.said_words], [30, 0.25])
  assert.deepEqual(view.rows.map(row => [row.tab, row.key, row.value]), [['her', 'chat', true], ['her', 'complete', true]])
  assert.deepEqual([view.starts, view.gut.bars.length], [['fresh', 'deep', 'gut'], 14])

  ;[status, view] = await page(h, { her: { name: '鲸酱', language: 'japanese', card: { text: '你是鲸酱。' } },
    me: { name: 'Leo Y', link: ['qq:10001'] }, others: 'friend', people: [{ subject: 'owner', closeness: 95, hold: true }],
    memory: { surface_days: 7, said_words: 0.4 }, rows: { complete: false }, gut: { sensitivity: 0.5 } })
  assert.equal(status, 200, JSON.stringify(view))
  assert.deepEqual([view.her.name, view.her.language, view.her.card], ['鲸酱', 'japanese',
    { text: '你是鲸酱。', on: true, how: 'set' }])
  assert.deepEqual([view.me, view.others], [{ name: 'Leo Y', accounts: ['qq:10001'] }, 'friend'])
  assert.deepEqual([view.people[0].closeness.value, view.people[0].closeness.locked], [95, true])
  assert.deepEqual([view.memory.surface_days, view.memory.said_words, view.gut.report.sensitivity], [7, 0.4, 0.5])
  await tick() // (her preset is registered again)
  assert.deepEqual([h.mneme.companionName, h.mneme.surface.span, h.mneme.saidWords, h.mneme.person('qq:10001')],
    ['鲸酱', 7, 0.4, 'owner'], 'used at once')
  assert.deepEqual([h.presets['mneme-chat'].name, h.presets['mneme-chat'].plugins[0].config.complete],
    ['鲸酱とおしゃべり', false])
  assert.equal(h.variables.mneme_card(), '你是鲸酱。')
  h.gut.close()
  h.mneme.close()

  h = harness(config) // (started again, its settings as they were: what the page set stands)
  ;[, view] = await page(h)
  assert.deepEqual([view.her.name, view.her.language, view.me.name, view.others, view.rows[1].value, view.her.card.text],
    ['鲸酱', 'japanese', 'Leo Y', 'friend', false, '你是鲸酱。'])
  h.gut.close()
  h.mneme.close()
  h = harness({ ...config, language: 'english' }) // (a setting changed there: the latest word)
  ;[, view] = await page(h)
  assert.deepEqual([view.her.language, view.her.name, view.others], ['english', '鲸酱', 'friend'])
  h.gut.close()
  h.mneme.close()
})

test('her settings page: a save lands whole or not at all, start goes alone, and with no gut there is none', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', role: 'creator', gut: false })
  let [status, view] = await page(h)
  assert.deepEqual([status, view.gut, view.starts], [200, null, ['fresh', 'deep']])
  ;[status, view] = await page(h, { her: { name: 'Other' }, others: 'friend', memory: { surface_days: 0 } })
  assert.deepEqual([status, /surface_days/.test(view.error)], [400, true])
  ;[, view] = await page(h)
  assert.deepEqual([view.her.name, view.others], ['小鲸', 'acquaintance'], 'nothing of it landed')
  for (const [body, error] of [[{ gut: { sensitivity: 0.5 } }, /no gut/], [{ start: 'gut' }, /start is fresh, deep/],
    [{ start: 'deep', her: { name: 'X' } }, /start is sent alone/], [{ me: { link: ['owner'] } }, /not an account/],
    [{ people: [{ subject: 'qq:2', role: 'creator' }] }, /owner is her creator already/],
    [{ people: [{ subject: 'qq:2', closeness: 50 }] }, /qq:2 has no role/], [{ rows: { chat: 'yes' } }, /true or false/],
    [{ her: { language: 'klingon' } }, /language is auto/], [{ memory: { said_cut: 0.1 } }, /not a memory setting/]]) {
    ;[status, view] = await page(h, body)
    assert.equal(status, 400, JSON.stringify(body))
    assert.match(view.error, error)
  }
  ;[status, view] = await page(h, { people: [{ subject: 'qq:2', role: 'friend', closeness: 60 }] })
  assert.deepEqual([status, view.people.map(person => [person.subject, person.role, person.closeness?.value])],
    [200, [['owner', 'creator', 100], ['qq:2', 'friend', 60]]])
  ;[status, view] = await page(h, { start: 'deep' })
  assert.equal(status, 200)
  h.mneme.close()
})

// The DSH plugin's hooks, with a stand-in for DeepSeek Harness: the block before her first step (what she keeps of the
// person, who her owner is, and her gut's line), what she keeps of them in front of a new session after DSH's system
// prompt, the session log as DSH reads it back, the exchange kept word for word with her mood and notes after the
// turn, a lesson for her gut, her tools, the commands and their answers in the person's language, people a chat
// channel brings and her own mention in a group, and turns she starts herself.
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
import { hooks, senderOf } from '../plugin/hooks.js'

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

/** A stand-in for DSH: listeners composed as cordis composes them (`prepend` goes first), the requests its loop makes,
 * and, with `clock`, a plugin like DSH's time context, adding a message to every step. */
function harness (config, { model = true, clock = false } = {}) {
  const handlers = {}, logs = [], asked = [], commands = {}, tools = {}
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
  let projection = null
  const ctx = {
    on: (name, handler, options) => { (handlers[name] ??= [])[options?.prepend ? 'unshift' : 'push'](handler) },
    inject: (names, apply) => apply(ctx),
    effect: () => {},
    commands: { register: command => { commands[command.name] = command } },
    tools: { register: tool => { tools[tool.name] = tool } },
    sessionProjections: { register: definition => { projection = definition },
      stateOf: (session, key) => key === projection.key ? session.events.reduce(projection.apply, projection.init())
        : undefined },
    logger: { info: line => logs.push(line) },
    llm: {
      async * stream (request) {
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
    }
  }
  if (clock) {
    ctx.on('agent/pre-step', async (_, next) => {
      const decision = await next()
      return { ...decision, messages: [...decision.messages, message('user', 'Time.', { kind: 'time-context' })] }
    }, { prepend: true })
  }
  const appended = [] // (what the plugin writes to the session log itself)
  const session = { id: 's1', header: {}, events: [], turns: 0, compacted: false,
    deriveMessages: () => session.compacted ? [] : messagesOf(session),
    write: (type, data, intent = {}) => { session.events.push({ type, seq: session.events.length, data, ...intent }) },
    append: (type, data, intent) => {
      appended.push([type, data])
      session.write(type, data, intent)
    },
    requestHeader: () => model ? { config: { provider: 'deepseek', model: 'deepseek-chat' } } : {} }
  const looped = new WeakSet() // (the requests DSH's loop makes)
  const made = hooks(ctx, config, { isAgentLoopRequest: request => looped.has(request),
    createUserMessage: given => ({ id: `m${++ids}`, role: 'user', ...given }), home })
  return { handlers, logs, asked, commands, tools, agent: { session }, session, appended, home, looped, ...made }
}

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
 * the step's messages and her model's reply, `reply` (null: her model must not be called). */
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
  const request = { provider: 'deepseek', model: 'deepseek-chat', messages: session.deriveMessages(),
    toolHistory: [], sessionId: session.id }
  h.looped.add(request)
  const model = async function * () {
    if (reply === null) throw new Error('her model was called')
    yield { type: 'text-delta', index: 0, text: reply }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  let text = ''
  for await (const chunk of waterfall(h, 'llm/stream', request, model)) {
    if (chunk.type === 'text-delta') text += chunk.text
  }
  session.write('assistant/message', { ...at, message: { ...message('assistant', text),
    source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' } } }, { surfaceOp: 'append' })
  session.write('step/end', at)
  for (const listener of h.handlers['agent/turn-stopping']) listener({ agent: h.agent })
  session.write('turn/end', { turn: number, reason: { kind: 'completed' } })
  return decision
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
  await until(() => h.mneme.memory.notes('owner').length === 1 && h.gut.net.lessons.length === 1)
  assert.deepEqual(h.mneme.memory.notes('owner').map(note => note.text), ['Leo 最近经常加班'])
  assert.ok(h.mneme.mood.state('owner').value > 70)
  assert.equal(h.gut.net.lessons.length, 1)
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

test('a new session: DSH\'s system prompt, her first prompt, what she keeps of you as text, her block, once',
  async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  assert.deepEqual(kinds(h), ['system system-prompt', 'user notice', 'user user', 'user runtime-context',
    'assistant model'], 'nothing kept yet: nothing in front')
  await h.commands['mneme-first'].handler({ rawInput: ' 你是小鲸，叫我哥哥。每句话结尾加个咕噜。' })
  assert.equal((await h.commands['mneme-first'].handler({ rawInput: 'on' })).text, '以后每个新会话，她都会先读它。')
  const next = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  const decision = await turn(next, '我的猫叫什么？', '叫年糕呀。')
  assert.deepEqual(decision.messages.map(item => item.source.form ?? item.source.kind), ['first', 'surface', 'notice',
    'user', 'runtime-context'])
  const [prompt, first, surface, notice, ...rest] = order(next)
  assert.deepEqual([prompt, first], [['system', 'system-prompt', PROMPT],
    ['user', 'first', '你是小鲸，叫我哥哥。每句话结尾加个咕噜。']])
  assert.match(surface[2], new RegExp(SAID.source + /\n\n#1 \[[^\]]+\]\nLeo: 我养了一只猫，叫年糕\n小鲸: 年糕这个名字真可爱！$/
    .source))
  assert.deepEqual([notice.slice(0, 2), notice[2].includes('年糕')], [['user', 'notice'], true]) // (her look, too)
  assert.deepEqual(rest, [['user', 'user', '我的猫叫什么？'], ['user', 'runtime-context', 'Runtime.'],
    ['assistant', 'model', '叫年糕呀。']])
  assert.deepEqual([h.appended, next.appended], [[], []], 'the plugin writes nothing to the session log itself')
  next.session.compacted = true // (a compression shadows what was said: the session has still begun)
  const later = await turn(next, '还记得吗？', '记得！')
  assert.deepEqual(later.messages.map(item => item.source.form ?? item.source.kind), ['notice', 'user',
    'runtime-context'], 'only a new session gets it')
  h.mneme.close()
  next.mneme.close()
})

test('what stands for what she let go comes before the newest of what was said, and a turn of her own is hers',
  async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '好可爱！')
  await turn(h, '现在是晚上十点。', '睡了吗？', { kind: 'speak-up' })
  await turn(h, '年糕今天吐毛球了', '要多梳毛哦。')
  await until(() => h.mneme.episodes.count('owner') === 3)
  const [, kept] = h.mneme.episodes.after('owner', 0).toReversed()
  h.mneme.surface._put('owner', kept.id - 1, kept.at, 'Leo 养了一只叫年糕的猫。') // (as `letGo` leaves it)
  const next = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  const decision = await turn(next, '在吗？', '在！')
  assert.deepEqual(decision.messages.map(item => item.source.form ?? item.source.kind), ['surface', 'notice', 'user',
    'runtime-context'], 'no first prompt: they did not turn it on')
  const [said, ...exchanges] = decision.messages[0].content[0].text.split('\n\n').slice(1)
  assert.deepEqual([decision.messages[0].content[0].text.split('\n\n')[0], exchanges.length],
    ['Earlier with Leo, in short:\nLeo 养了一只叫年糕的猫。', 2])
  assert.match(said, SAID)
  assert.match(exchanges[0], /^#2 \[[^\]]+\]\n {2}\(You messaged them on your own then: 现在是晚上十点。\)\n小鲸: 睡了吗？$/)
  assert.match(exchanges[1], /^#3 \[[^\]]+\]\nLeo: 年糕今天吐毛球了\n小鲸: 要多梳毛哦。$/)
  h.mneme.close()
  next.mneme.close()
})

test('the session log reopens in DSH: what she keeps in front of a new session is in its first step, as DSH ' +
  'reads one back', { skip: format && known ? false : 'DSH\'s session packages are not here (DSH_MODULES)' },
async () => {
  const where = folder(), setup = { folder: where, companion: '小鲸', user: 'Leo', accounts: ['qq:10001'] }
  const h = harness(setup)
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  await turn(h, '$first 每句话结尾加个“咕噜”', null)
  await turn(h, '$first on', null)
  assert.equal(reopened(h.session), 'reopens')
  h.mneme.close()
  h.gut.close()
  const next = harness(setup)
  await turn(next, sent('我的猫叫什么？'), '叫年糕呀，咕噜。', channel)
  await turn(next, sent('你好，我是小明', { qq: '20002', nickname: '小明' }), '你好小明！', channel)
  await turn(next, sent('猫呢？', { before: '[21:05 Leo(10001)]\n' }), '在睡觉。', channel)
  await turn(next, '现在是晚上十点。', '睡了吗？', { kind: 'speak-up' })
  await turn(next, '$new', null)
  assert.equal(reopened(next.session), 'reopens')
  assert.deepEqual(kinds(next).slice(0, 4), ['system system-prompt', 'user first', 'user surface', 'user notice'])
  // As it was before: what was in front written before the step opened. DSH cannot read that back.
  const events = next.session.events.slice(), opens = events.findIndex(event => event.type === 'step/start')
  events.splice(opens, 0, ...events.splice(opens + 1, 3)) // (DSH's system prompt, her first prompt and the surface)
  assert.match(reopened({ id: 's1', events: events.map((event, seq) => ({ ...event, seq })) }),
    /SessionFormatError: system\/message does not match an open turn and step/)
  next.mneme.close()
  next.gut.close()
})

test('a command\'s answer is not hers: the session has not begun, and the next message gets what she keeps',
  async () => {
  const where = folder()
  const h = harness({ folder: where, user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '好可爱！')
  await until(() => h.mneme.surface.first('owner'))
  const next = harness({ folder: where, user: 'Leo', gut: false })
  await turn(next, '$first on', null)
  await turn(next, '我的猫叫什么？', '叫年糕。')
  assert.deepEqual(kinds(next), ['system system-prompt', 'user user', 'user runtime-context', 'assistant model',
    'user first', 'user surface', 'user notice', 'user user', 'user runtime-context', 'assistant model'])
  assert.equal(order(next)[4][2], '我养了一只猫，叫年糕', 'the first thing they said, as they said it')
  h.mneme.close()
  next.mneme.close()
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
  assert.equal(await typed('$first'), 'There is no first prompt yet: set one with $first <text>.')
  assert.equal(await typed('$first on'), 'There is no first prompt yet: set one with $first <text>.')
  await turn(h, '你好呀', '你好！')
  await until(() => h.mneme.surface.first('owner')) // (kept once her mood is judged)
  // They write Chinese now, as her gut has read: so are the answers, a bare command's too.
  assert.equal(await typed('$first'), '你好呀\n（这是你说的第一句话；只是记着）')
  assert.equal(await typed(sent('$first   当我的猫娘 '), channel), '记下了。用 $first on，她在每个新会话都会先读它。')
  assert.equal((await h.commands['mneme-first'].handler({ rawInput: 'ON' })).text, '以后每个新会话，她都会先读它。')
  assert.equal(await typed('$first'), '当我的猫娘\n（这是你设的；每个新会话她都先读它）')
  assert.equal(await typed('$first off'), '现在只是记着，新会话不会先读它。')
  assert.equal(await typed('$first clear'), '拿掉了。')
  assert.equal(await typed('$first clear'), '本来就没有记着什么。')
  assert.equal(await typed('$first be my cat'), 'Kept. $first on has her read it first in every new session.')
  assert.equal(await typed('$first clear'), 'Taken away.', 'what they wrote last is English')
  assert.ok((await typed('$new')).startsWith('重新开始：'))
  assert.deepEqual(h.mneme.surface.read('owner').messages, [])
  assert.equal(h.mneme.episodes.count('owner'), 1, 'deep memory keeps every word')
  assert.equal(await typed('$new everything'), '用法：$new、$new deep 或 $new gut。')
  assert.equal(await typed(sent('$new deep', { qq: '20002', nickname: '小明' }), channel),
    'Only the person she belongs to can do that.') // (小明 has said nothing she could read a language in)
  await until(() => h.gut.net.lessons.length === 1)
  assert.equal(await typed(sent('$new deep'), channel), '1 段对话连同所有笔记，永久删除了。')
  assert.equal(h.mneme.episodes.count('owner'), 0)
  assert.equal(h.gut.net.lessons.length, 1, 'her gut is apart from her memory')
  assert.equal((await h.commands['mneme-new'].handler({ rawInput: ' gut' })).text,
    '0 段对话连同所有笔记永久删除了，她的直觉学到的 1 条也一起删了：她回到了刚出生的样子。')
  assert.equal(h.gut.net.lessons.length, 0)
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
  assert.equal(await last('$new'), 'A fresh start: a new session begins with nothing of before in front of it. ' +
    'Every word stays in her deep memory.')
  await turn(h, '今天下雨了', '记得带伞。')
  await until(() => h.mneme.surface.first('owner'))
  assert.equal(await last('$first'), '今天下雨了\n（这是你说的第一句话；只是记着）')
  await turn(h, 'It is sunny now', 'Nice!')
  await until(() => h.mneme.episodes.count('owner') === 2)
  assert.equal(await last('$first off'), 'It is only kept now.')
  assert.equal(await last('$first 下雨要带伞'), '记下了。用 $first on，她在每个新会话都会先读它。')
  await turn(h, 'Sunny again', 'Lovely!')
  await until(() => h.mneme.episodes.count('owner') === 3)
  assert.equal(await last('$first on'), 'She reads it first in every new session.', 'what they said since wins')
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
  assert.equal(await last(h, '$first 你是我的大肥鱼，说话要可爱一点，每句话结尾加个“咕噜”'),
    '记下了。用 $first on，她在每个新会话都会先读它。')
  assert.equal(await last(h, '$first on'), '以后每个新会话，她都会先读它。')
  assert.equal(await last(h, '$new'), '重新开始：新会话前面不再放以前的内容。说过的每句话都还在她的深层记忆里。')
  h.mneme.close()
  h.gut.close()
  const later = harness({ folder: where, user: 'Leo' }) // (and once DSH has restarted)
  assert.equal(await last(later, '$first OFF'), '现在只是记着，新会话不会先读它。')
  assert.equal(await last(later, '$new deep'), '0 段对话连同所有笔记，永久删除了。') // (her first prompt with them)
  assert.equal(await last(later, '$first be my cat'), 'Kept. $first on has her read it first in every new session.')
  assert.equal(await last(later, '$first on'), 'She reads it first in every new session.')
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
  assert.ok(told.startsWith('(小明 is someone you know; you are not close yet. Your owner is Leo.)\n\n'), told)
  const mine = await turn(h, sent('我回来了'), '欢迎回来！', channel)
  assert.ok(!mine.messages[0].content[0].text.includes('owner'), 'to you she needs no telling')
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

test('the owner named in Chinese, in the line or alone', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  h.mneme.relations.displayLanguage = 'zh'
  const told = async (said, who) => (await turn(h, sent(said, who), '好', channel)).messages[0].content[0].text
  assert.ok((await told('你好', { qq: '20002', nickname: '小明' })).startsWith('（小明是你认识的人，你们还不太熟。你的主人是Leo。）'))
  h.mneme.close()
  const alone = harness({ folder: folder(), user: 'Leo', gut: false, others: '' })
  const block = (await turn(alone, sent('你好', { qq: '20003', nickname: '小红' }), '好', channel)).messages[0]
  assert.ok(block.content[0].text.startsWith('(Your owner is Leo.)'), block.content[0].text)
  alone.mneme.close()
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
  assert.deepEqual(h.mneme.episodes.after('qq:20002', 0)[0].lines, [['', '(You messaged them on your own then: ' +
    '现在是晚上十点，想想要不要主动找对方聊聊。)'], ['小鲸', '小明，睡了吗？']])
  await new Promise(resolve => setTimeout(resolve, 100))
  assert.ok(h.asked.slice(before).some(request => request.system?.startsWith('You judge')))
  assert.ok(!h.asked.slice(before).some(request => request.system?.startsWith('From the exchange below')))
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

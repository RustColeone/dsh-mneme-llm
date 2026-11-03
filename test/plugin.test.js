// The DSH plugin's hooks, with a stand-in for DeepSeek Harness: the block before her first step (what she keeps of the
// person, and her gut's line), what she keeps of them in front of a new session, the exchange kept word for word with
// her mood and notes after the turn, a lesson for her gut, her tools, the commands, people a chat channel brings, and
// turns she starts herself.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { hooks, senderOf } from '../plugin/hooks.js'

const JUDGED = '{"worth_remembering": {"probability": 0.9}, "mood_change": {"level": "1", "confidence": 0.9}, ' +
  '"feeling": {"choice": "tender", "confidence": 0.8}}'
const NOTES = '[{"text": "Leo 最近经常加班", "kind": "episode", "importance": 3}]'
const sent = (said, { qq = '10001', nickname = 'Leo', before = '' } = {}) =>
  `${before}<user_message qq="${qq}" nickname="${nickname}">\n${said}\n</user_message>`

let ids = 0
const message = (role, words, source) => ({ id: `m${++ids}`, role, ...(source ? { source } : {}),
  content: [{ type: 'text', text: words }] })

function harness (config, { model = true } = {}) {
  const handlers = {}, logs = [], asked = [], commands = {}, tools = {}
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
  let projection = null
  const ctx = {
    on: (name, handler) => { handlers[name] = handler },
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
  const appended = []
  const session = { id: 's1', header: {}, events: [], compacted: false,
    deriveMessages: () => session.compacted ? [] : session.events.map(event => event.type === 'assistant/message'
      ? event.data.message : event.data),
    append: (type, data) => {
      appended.push([type, data])
      session.events.push({ type, data })
    },
    requestHeader: () => model ? { config: { provider: 'deepseek', model: 'deepseek-chat' } } : {} }
  const made = hooks(ctx, config, { createUserMessage: given => ({ id: `m${++ids}`, role: 'user', ...given }),
    createAssistantMessage: ({ content, source }) => ({ id: `m${++ids}`, role: 'assistant', content,
      source: { kind: 'model', ...source } }), home })
  return { handlers, logs, asked, commands, tools, agent: { session }, session, appended, home, ...made }
}

/** One message as DSH's loop gives it to the hooks: the step's messages appended, and her reply if there is a step. */
async function turn (h, said, reply, source = { kind: 'user' }) {
  const opened = message('user', said, source), context = message('user', 'Runtime.', { kind: 'runtime-context' })
  const decision = await h.handlers['agent/pre-step']({ agent: h.agent, messages: [opened], turn: 1, step: 1 },
    async () => ({ kind: 'enter', messages: [opened, context] }))
  if (!decision.messages.length) return decision
  for (const item of decision.messages) h.session.events.push({ type: 'user/message', data: item })
  h.session.events.push({ type: 'assistant/message', data: { message: { ...message('assistant', reply),
    source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' } } } })
  h.handlers['agent/turn-stopping']({ agent: h.agent })
  return decision
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

test('a new session: her first prompt and what she keeps of you go in front as turns, once, as its events say',
  async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  await h.commands['mneme-first'].handler({ rawInput: ' 你是小鲸，叫我哥哥。' })
  assert.equal((await h.commands['mneme-first'].handler({ rawInput: 'on' })).text,
    'She reads it first in every new session.')
  const next = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  const decision = await turn(next, '我的猫叫什么？', '叫年糕呀。')
  assert.deepEqual(next.appended.map(([type, data]) => type === 'assistant/message'
    ? [type, data.turn, data.step, data.message.source, data.stream] : [type, data.source.form]), [
    ['user/message', 'surface'], ['user/message', 'surface'],
    ['assistant/message', 1, 1, { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' }, []]])
  assert.deepEqual(next.appended.map(([type, data]) => (type === 'assistant/message' ? data.message : data).content[0]
    .text), ['你是小鲸，叫我哥哥。', '我养了一只猫，叫年糕', '年糕这个名字真可爱！'])
  assert.ok(decision.messages[0].content[0].text.includes('年糕'), 'her look brings the cat back too')
  next.session.compacted = true // (a compression shadows what was said: the session has still begun)
  await turn(next, '还记得吗？', '记得！')
  assert.equal(next.appended.length, 3, 'only a new session gets it')
  h.mneme.close()
  next.mneme.close()
})

test('the commands, typed as messages or from DSH\'s command list: each deeper, and the deep ones yours alone',
  async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', accounts: ['qq:10001'] })
  const typed = async (said, source) => {
    const before = h.appended.length, asked = h.asked.length, decision = await turn(h, said, '', source)
    const [[question, sentence], [answer, reply]] = h.appended.slice(before)
    assert.deepEqual([decision.messages, question, sentence.content[0].text, answer, reply.message.source,
      h.asked.length], [[], 'user/message', said, 'assistant/message', { kind: 'model', provider: 'mneme-llm',
      model: 'commands' }, asked])
    return reply.message.content[0].text
  }
  assert.equal(await typed('$first'), 'Nothing kept yet.')
  assert.equal(await typed('$first on'), 'There is no first prompt yet: set one with $first <text>.')
  await turn(h, '你好呀', '你好！')
  await until(() => h.mneme.surface.first('owner')) // (kept once her mood is judged)
  assert.equal(await typed('$first'), '你好呀\n(the first thing you said; only kept)')
  assert.equal(await typed(sent('$first   当我的猫娘 '), channel),
    'Kept. $first on has her read it first in every new session.')
  assert.equal((await h.commands['mneme-first'].handler({ rawInput: 'ON' })).text,
    'She reads it first in every new session.')
  assert.equal(await typed('$first'), '当我的猫娘\n(you set this; she reads it first in every new session)')
  assert.equal(await typed('$first off'), 'It is only kept now.')
  assert.equal(await typed('$first clear'), 'Taken away.')
  assert.equal(await typed('$first clear'), 'Nothing is kept.')
  assert.ok((await typed('$new')).startsWith('A fresh start'))
  assert.deepEqual(h.mneme.surface.read('owner').messages, [])
  assert.equal(h.mneme.episodes.count('owner'), 1, 'deep memory keeps every word')
  assert.equal(await typed('$new everything'), 'Use $new, $new deep or $new gut.')
  assert.equal(await typed(sent('$new deep', { qq: '20002', nickname: '小明' }), channel),
    'Only the person she belongs to can do that.')
  await until(() => h.gut.net.lessons.length === 1)
  assert.equal(await typed(sent('$new deep'), channel), '1 exchanges gone for good, with every note.')
  assert.equal(h.mneme.episodes.count('owner'), 0)
  assert.equal(h.gut.net.lessons.length, 1, 'her gut is apart from her memory')
  assert.equal((await h.commands['mneme-new'].handler({ rawInput: ' gut' })).text,
    '0 exchanges gone for good, with every note, and 1 lessons of her gut: she is as she was born.')
  assert.equal(h.gut.net.lessons.length, 0)
  h.mneme.close()
  h.gut.close()
})

test('a chat channel\'s people: their words unwrapped, each sender a person, your own accounts you, groups apart',
  async () => {
  assert.deepEqual(senderOf(message('user', sent('多行\n的话'), channel)),
    { account: 'qq:10001', name: 'Leo', said: '多行\n的话', group: false })
  assert.equal(senderOf(message('user', '没有边界', channel)), null)
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo', role: 'family', accounts: ['qq:10001'],
    gut: false })
  await turn(h, sent('我养了一只猫，叫年糕'), '好可爱！', channel)
  assert.deepEqual(h.mneme.episodes.after('owner', 0).map(item => item.lines), [[['Leo', '我养了一只猫，叫年糕'],
    ['小鲸', '好可爱！']]])
  assert.equal(h.mneme.person('qq:10001'), 'owner')
  const other = await turn(h, sent('你好，我是小明', { qq: '20002', nickname: '小明' }), '你好小明！', channel)
  const told = other.messages[0].content[0].text
  assert.ok(told.startsWith('(小明 is someone you know;'), told)
  assert.deepEqual(h.mneme.episodes.after('qq:20002', 0).map(item => item.lines), [[['小明', '你好，我是小明'],
    ['小鲸', '你好小明！']]])
  assert.equal(h.mneme.relations.get('qq:20002').role, 'acquaintance')
  const group = await turn(h, sent('猫呢？', { before: '[21:05 Leo(10001)]\n' }), '在睡觉。', channel)
  assert.ok(!group.messages[0].content[0].text.includes('search'), 'in a group no search comes by itself')
  assert.equal(h.appended.filter(([, data]) => data.source?.form === 'surface').length, 0)
  h.mneme.close()
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

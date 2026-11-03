// The DSH plugin's hooks, with a stand-in for DeepSeek Harness: the block before her first step (what she keeps of you,
// and her gut's line), what she keeps of you in front of a new session, the exchange kept word for word with her mood
// and notes after the turn, a lesson for her gut, her tools and the commands.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { hooks } from '../plugin/hooks.js'

const text = (role, words, kind) => ({ role, ...(kind ? { source: { kind } } : {}),
  content: [{ type: 'text', text: words }] })
const JUDGED = '{"worth_remembering": {"probability": 0.9}, "mood_change": {"level": "1", "confidence": 0.9}, ' +
  '"feeling": {"choice": "tender", "confidence": 0.8}}'
const NOTES = '[{"text": "Leo 最近经常加班", "kind": "episode", "importance": 3}]'

function harness (config, model = true) {
  const handlers = {}, logs = [], asked = [], commands = {}, tools = {}
  const ctx = {
    on: (name, handler) => { handlers[name] = handler },
    inject: (names, apply) => apply(ctx),
    effect: () => {},
    commands: { register: command => { commands[command.name] = command } },
    tools: { register: tool => { tools[tool.name] = tool } },
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
  const log = [], appended = []
  const session = { id: 's1', header: {}, deriveMessages: () => log,
    append: (type, data, how) => {
      appended.push([type, data, how])
      log.push(type === 'assistant/message' ? data.message : data)
    },
    requestHeader: () => model ? { config: { provider: 'deepseek', model: 'deepseek-chat' } } : {} }
  const made = hooks(ctx, config, { createUserMessage: message => ({ role: 'user', ...message }),
    createAssistantMessage: ({ content, source }) => ({ role: 'assistant', content, source: { kind: 'model',
      ...source } }) })
  return { handlers, logs, asked, commands, tools, agent: { session }, log, appended, ...made }
}

/** One message and her reply, as DSH's loop gives them to the hooks. */
async function turn (h, said, reply) {
  const message = { id: `m${h.log.length}`, ...text('user', said, 'user') }
  h.handlers['agent/inbox/claimed']({ agent: h.agent, message })
  const decision = await h.handlers['agent/pre-step']({ agent: h.agent, turn: 1, step: 1 },
    async () => ({ kind: 'enter', messages: [message, text('user', 'Current runtime context.', 'runtime-context')] }))
  h.log.push(...decision.messages, text('assistant', reply))
  h.handlers['agent/turn-stopping']({ agent: h.agent })
  return decision
}

const until = async (done, seconds = 5) => {
  const deadline = performance.now() + seconds * 1000
  while (!done() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
}

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))

test('a turn: the block beside her message, the exchange kept word for word, her mood and notes, a lesson after',
  async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', role: 'family', character: '你是小鲸。',
    tags: { 傲娇: '' } })
  const decision = await turn(h, '今天加班好累', '辛苦了，抱抱你。')
  assert.equal(decision.messages.length, 3)
  assert.equal(decision.messages[0].source.kind, 'mneme-llm')
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
  const m = new Mneme(path.join(where, 'memory.db'), 'default', { embed: false })
  assert.equal(m.surface.first('owner').text, '今天加班好累')
  assert.deepEqual(m.surface.read('owner').messages.map(item => item.role), ['user', 'assistant'])
  assert.equal(m.relations.get('owner').role, 'family')
  assert.equal(m.companionName, '小鲸')
  m.close()
  h.gut.close()
})

test('a new session: her first prompt and what she keeps of you go in front as turns, once', async () => {
  const where = folder()
  const h = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  await turn(h, '我养了一只猫，叫年糕', '年糕这个名字真可爱！')
  h.commands.first.handler({ rawInput: ' 你是小鲸，叫我哥哥。' })
  assert.equal(h.commands.first.handler({ rawInput: 'on' }).text, 'She reads it first in every new session.')
  const next = harness({ folder: where, companion: '小鲸', user: 'Leo', gut: false })
  const decision = await turn(next, '我的猫叫什么？', '叫年糕呀。')
  assert.deepEqual(next.appended.map(([type, data, how]) => [type, type === 'assistant/message'
    ? [data.turn, data.step, data.message.source, data.stream] : data.source.form, how.surfaceOp]), [
    ['user/message', 'surface', 'append'], ['user/message', 'surface', 'append'],
    ['assistant/message', [1, 1, { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' }, []], 'append']])
  assert.deepEqual(next.appended.map(([type, data]) => (type === 'assistant/message' ? data.message : data).content[0]
    .text), ['你是小鲸，叫我哥哥。', '我养了一只猫，叫年糕', '年糕这个名字真可爱！'])
  assert.ok(decision.messages[0].content[0].text.includes('年糕'), 'her look brings the cat back too')
  await turn(next, '还记得吗？', '记得！')
  assert.equal(next.appended.length, 3, 'only a new session gets it')
  h.mneme.close()
  next.mneme.close()
})

test('the commands: /first shows, sets, sends and takes away; /new, /new deep and /new gut, each deeper', async () => {
  const h = harness({ folder: folder(), companion: '小鲸', user: 'Leo' })
  const run = async (name, rawInput = '') => (await h.commands[name].handler({ rawInput })).text
  assert.equal(await run('first'), 'Nothing kept yet.')
  assert.equal(h.commands.first.handler({ rawInput: 'on' }).kind, 'error')
  await turn(h, '你好呀', '你好！')
  await until(() => h.mneme.surface.first('owner')) // (kept once her mood is judged)
  assert.equal(await run('first'), '你好呀\n(the first thing you said; only kept)')
  assert.equal(await run('first', '  当我的猫娘 '), 'Kept. /first on has her read it first in every new session.')
  assert.equal(await run('first', 'ON'), 'She reads it first in every new session.')
  assert.equal(await run('first'), '当我的猫娘\n(you set this; she reads it first in every new session)')
  assert.equal(await run('first', 'off'), 'It is only kept now.')
  assert.equal(await run('first', 'clear'), 'Taken away.')
  assert.equal(await run('first', 'clear'), 'Nothing is kept.')
  assert.ok((await run('new')).startsWith('A fresh start'))
  assert.deepEqual(h.mneme.surface.read('owner').messages, [])
  assert.equal(h.mneme.episodes.count('owner'), 1, 'deep memory keeps every word')
  assert.equal((await h.commands.new.handler({ rawInput: 'everything' })).kind, 'error')
  await until(() => h.gut.net.lessons.length === 1)
  assert.equal(await run('new', ' Deep'), '1 exchanges gone for good, with every note.')
  assert.equal(h.mneme.episodes.count('owner'), 0)
  assert.equal(h.gut.net.lessons.length, 1, 'her gut is apart from her memory')
  assert.equal(await run('new', 'gut'), '0 exchanges gone for good, with every note, and 1 lessons of her gut: ' +
    'she is as she was born.')
  assert.equal(h.gut.net.lessons.length, 0)
  h.mneme.close()
  h.gut.close()
})

test('her tools look through what was said before, and remember what this turn\'s searches showed', async () => {
  const h = harness({ folder: folder(), user: 'Leo', gut: false })
  assert.deepEqual(Object.keys(h.tools), ['memory_search', 'memory_read'])
  assert.deepEqual(h.tools.memory_search.parameters.required, ['query'])
  await turn(h, '我养了一只猫，叫年糕', '好可爱')
  const search = given => h.tools.memory_search.execute(given, { agent: h.agent })
  assert.ok((await search({ query: '年糕' })).includes('#1 ['))
  assert.equal(await search({ query: '年糕' }), 'Nothing more found on that.')
  h.handlers['agent/inbox/claimed']({ agent: h.agent, message: text('user', '再找找', 'user') })
  assert.ok((await search({ query: '年糕' })).includes('#1 ['), 'a new turn may show it again')
  assert.ok((await h.tools.memory_read.execute({ id: 1 }, { agent: h.agent })).includes('Leo: 我养了一只猫，叫年糕'))
  h.mneme.close()
})

test('with no model yet there is no line, and the exchange is kept all the same; a subagent is left alone',
  async () => {
  const h = harness({ folder: folder(), starter: false }, false)
  const decision = await turn(h, 'hello', 'hi there')
  assert.equal(decision.messages.length, 3) // (her memory's block; no line)
  assert.ok(!h.asked.some(request => request.system === G.FORM))
  assert.equal(h.mneme.episodes.count('owner'), 1)
  h.agent.session.header.parentSession = 'parent'
  await turn(h, 'a task', 'done')
  assert.equal(h.mneme.episodes.count('owner'), 1)
  h.mneme.close()
})

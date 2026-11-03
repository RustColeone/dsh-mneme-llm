// The DSH plugin's hooks, with a stand-in for DeepSeek Harness: the line before her first step, the exchange kept word
// for word in the shared file, and a lesson after the turn.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as G from '../lib/gut.js'
import { Mneme } from '../lib/mneme.js'
import { before, hooks } from '../plugin/hooks.js'

const text = (role, words, kind) => ({ role, ...(kind ? { source: { kind } } : {}),
  content: [{ type: 'text', text: words }] })

function harness (config, model = true) {
  const handlers = {}, logs = [], asked = []
  const ctx = {
    on: (name, handler) => { handlers[name] = handler },
    logger: { info: line => logs.push(line) },
    llm: {
      async * stream (request) {
        asked.push(request)
        const said = request.messages[0].content[0].text
        let answer = '{"side": null}'
        const form = { people: [], topic: ['work'], sender_feels: 'tired', language: 'zh' }
        if (request.system === G.FORM) answer = JSON.stringify(form)
        else if (said.includes(G.ASK)) answer = '{"tender": 0.7, "calm": 0.3}'
        else if (said.includes(G.NOTE)) answer = '{"mood": -1, "feel": {"tender": 1}}'
        else if (said.includes('这个属性的人')) answer = '你嘴硬心软。'
        yield { type: 'text-delta', text: answer }
      }
    }
  }
  const log = []
  const agent = { session: { id: 's1', deriveMessages: () => log,
    requestHeader: () => model ? { config: { provider: 'deepseek', model: 'deepseek-chat' } } : {} } }
  const made = hooks(ctx, config, { createUserMessage: message => ({ role: 'user', ...message }) })
  return { handlers, logs, asked, agent, log, ...made }
}

async function turn (h, said, reply) {
  const message = text('user', said, 'user')
  h.log.push(message)
  h.handlers['agent/inbox/claimed']({ agent: h.agent, message })
  const decision = await h.handlers['agent/pre-step']({ agent: h.agent }, async () => ({ kind: 'enter', messages: [] }))
  h.log.push(text('assistant', reply))
  h.handlers['agent/turn-stopping']({ agent: h.agent })
  return decision
}

const until = async (done, seconds = 5) => {
  const deadline = performance.now() + seconds * 1000
  while (!done() && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
}

test('a turn: her line before her first step, the exchange kept word for word, a lesson after', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
  const h = harness({ folder, companion: '小鲸', user: 'Leo', role: 'family', character: '你是小鲸。', tags: { 傲娇: '' } })
  const decision = await turn(h, '今天加班好累', '辛苦了，抱抱你。')
  assert.equal(decision.messages.length, 1)
  assert.equal(decision.messages[0].source.kind, 'mneme-llm')
  const line = decision.messages[0].content[0].text
  assert.ok(line.includes('(Right now your 傲娇 side is showing: 你嘴硬心软。)') && line.endsWith('Reply in Mandarin Chinese.'),
    line)
  assert.equal(h.gut.tags.傲娇, '你嘴硬心软。') // (drafted by her model the first time)
  await until(() => h.gut.net.lessons.length === 1)
  assert.equal(h.gut.net.lessons.length, 1)
  h.mneme.close()
  const m = new Mneme(path.join(folder, 'memory.db'), 'default', { embed: false })
  const [kept] = m.episodes.after('owner', 0)
  assert.deepEqual([kept.lines, kept.conversation], [[['Leo', '今天加班好累'], ['小鲸', '辛苦了，抱抱你。']], 'dsh:s1'])
  assert.equal(m.surface.first('owner').text, '今天加班好累')
  assert.deepEqual(m.surface.read('owner').messages.map(item => item.role), ['user', 'assistant'])
  assert.equal(m.relations.get('owner').role, 'family')
  assert.equal(m.companionName, '小鲸')
  m.close()
  h.gut.close()
})

test('with no model yet there is no line, and the exchange is kept all the same; the gut can be off', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-'))
  const h = harness({ folder, starter: false }, false)
  const decision = await turn(h, 'hello', 'hi there')
  assert.deepEqual(decision.messages, [])
  assert.equal(h.asked.length, 0)
  assert.equal(h.mneme.episodes.count('owner'), 1)
  h.mneme.close()
  const off = harness({ folder: fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-')), gut: false })
  assert.deepEqual((await turn(off, 'hello', 'hi')).messages, [])
  assert.equal(off.gut, null)
  assert.equal(off.mneme.episodes.count('owner'), 1)
  off.mneme.close()
})

test('what her vote sees: plain turns before the message, what the host added left out', () => {
  const log = [text('user', 'one', 'user'), text('assistant', 'two'), text('user', '(a note)', 'mneme-llm'),
    text('user', 'three', 'user'), text('assistant', 'four'), text('user', 'now', 'user')]
  assert.deepEqual(before({ session: { deriveMessages: () => log } }, 'now'), [{ role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' }, { role: 'user', content: 'three' }, { role: 'assistant', content: 'four' }])
})

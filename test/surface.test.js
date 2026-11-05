// The surface and Character Cards: what was said lately, as real turns: the cases of mneme-llm's tests/test_surface.py.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EXCHANGE } from '../lib/episodes.js'
import { Mneme } from '../lib/mneme.js'
import { Card, First, bounds } from '../lib/surface.js'
import { tokens } from '../lib/text.js'
import { DAY, companion, say, small } from './helpers.js'

const line = '这是一句不长不短的话'
const turns = (m, clock, count, step = DAY) => {
  for (let n = 0; n < count; n++) {
    say(m, clock, line, '好的')
    clock.now += step
  }
}

test('what it keeps and may reach', () => {
  assert.deepEqual(bounds(10700), [70000, 140000]) // the lower limit holds when little is said
  assert.deepEqual(bounds(150000), [150000, 300000]) // a busy month keeps itself and doubles
  assert.deepEqual(bounds(337000), [336000, 504000]) // the cap is the top whatever the month says
  assert.deepEqual(bounds(1300000), [336000, 504000])
  assert.deepEqual(bounds(10000, undefined, undefined, 128000), [68266, 102400]) // four fifths of a small window
})

test('it reads as real turns, in the order said, and says when its newest was said', () => {
  const [m, clock] = companion()
  assert.equal(m.surface.read('u').upto, 0)
  say(m, clock, '第一句', '好的')
  clock.now += 60
  say(m, clock, '第二句', '嗯')
  assert.deepEqual(m.surface.read('u').messages, [{ role: 'user', content: '第一句' },
    { role: 'assistant', content: '好的' }, { role: 'user', content: '第二句' }, { role: 'assistant', content: '嗯' }])
  assert.equal(m.surface.read('u').upto, clock.now)
})

test('who said what: a classmate is not her, a group keeps names, her own words and her role are hers', () => {
  const [m, clock] = companion()
  m.episodes.keep('a', [['Leo', 'hi'], ['Gemini', 'hello']], { at: clock.now })
  assert.deepEqual(m.surface.read('a').messages, [{ role: 'user', content: 'Leo: hi' },
    { role: 'user', content: 'Gemini: hello' }])
  m.episodes.keep('b', [['小鲸', '在吗']], { at: clock.now })
  assert.deepEqual(m.surface.read('b').messages, [{ role: 'assistant', content: '在吗' }])
  m.episodes.keep('c', [['Leo', 'hi'], ['Mei', 'hey'], ['小鲸', '你们好']], { at: clock.now })
  assert.deepEqual(m.surface.read('c').messages, [{ role: 'user', content: 'Leo: hi' },
    { role: 'user', content: 'Mei: hey' }, { role: 'assistant', content: '你们好' }])
  m.episodes.keep('d', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '你好' }], { at: clock.now })
  assert.deepEqual(m.surface.read('d').messages, [{ role: 'user', content: 'hi' },
    { role: 'assistant', content: '你好' }])
})

test('it is no second store, and follows the person into any chat, in the order said', () => {
  const [m, clock] = companion()
  const kept = say(m, clock, '第一句')
  m.episodes.forget('u', kept.id)
  assert.deepEqual(m.surface.read('u').messages, [])
  m.episodes.keep('u', [['Leo', '后说的']], { at: clock.now + 60, conversation: 'a' })
  m.episodes.keep('u', [['Leo', '先说的']], { at: clock.now, conversation: 'b' })
  const view = m.surface.read('u')
  assert.deepEqual(view.messages.map(message => message.content), ['先说的', '后说的'])
  assert.equal(view.upto, clock.now + 60)
})

test('the newest exchange is always there, even alone over the budget; days of zero means one', () => {
  const [m, clock] = companion({ config: small(10, 1000, 1) })
  say(m, clock, '第一句')
  const huge = say(m, clock, '很长'.repeat(2000))
  assert.ok(huge.tokens > 1000)
  assert.equal(m.surface.slice('u', 10)[0].content, '很长'.repeat(2000))
  assert.equal(m.surface.read('u').messages[0].content, '很长'.repeat(2000))
  assert.equal(m.surface.read('u').tokens, Math.trunc(huge.tokens))
  const other = new Mneme(':memory:', 't', { surfaceDays: 0, embed: false })
  assert.equal(other.surface.span, 1)
})

test('the slice is the newest few tokens, whole exchanges', () => {
  const [m, clock] = companion()
  for (let n = 0; n < 40; n++) {
    say(m, clock, `这是第${n}句话，说得长一点`, '好的')
    clock.now += 60
  }
  const found = m.surface.slice('u', 60)
  assert.ok(found.length < 40)
  assert.equal(found.at(-2).content, '这是第39句话，说得长一点')
  assert.equal(found.length % 2, 0)
})

test('what was left unanswered in a chat stays that chat\'s', () => {
  const [m, clock] = companion()
  m.episodes.keep('u', [['Leo', '这边'], ['小鲸', '好']], { at: clock.now, conversation: 'a' })
  clock.now += 60
  const here = clock.now
  m.episodes.keep('u', [['Leo', '那边'], ['小鲸', '好']], { at: clock.now, conversation: 'b' })
  clock.now += 60
  assert.equal(m.surface.read('u', { here: 'a' }).upto, here - 60)
  assert.equal(m.surface.read('u', { here: 'b' }).upto, here)
  assert.equal(m.surface.read('u', { here: 'new' }).upto, 0)
})

function writer () {
  const seen = []
  return [seen, async system => {
    seen.push(system)
    return '他养猫，住杭州。'
  }]
}

test('nothing leaves until twice what it keeps, then the older part is a summary', async () => {
  const [seen, complete] = writer()
  const [m, clock] = companion({ config: small(50, 100000, 1), complete })
  const each = tokens(`Leo: ${line}\n小鲸: 好的`) + EXCHANGE
  turns(m, clock, Math.trunc(100 / each) - 1)
  assert.equal(await m.surface.letGo('u'), false)
  turns(m, clock, 4)
  const before = m.episodes.count('u')
  assert.equal(await m.surface.letGo('u', { userName: 'Leo' }), true)
  const view = m.surface.read('u', { userName: 'Leo' })
  assert.deepEqual(view.messages[0], { role: 'user', content: 'Earlier with Leo, in short:\n他养猫，住杭州。' })
  assert.ok(view.tokens <= 50)
  assert.equal(m.episodes.count('u'), before) // (every word stays in deep memory)
  assert.ok(seen[0].includes(line))
})

test('six a day for two months keeps every day under the lower limit', async () => {
  const [, complete] = writer()
  const [m, clock] = companion({ complete })
  for (let day = 0; day < 60; day++) {
    for (let n = 0; n < 6; n++) {
      say(m, clock, '今天下班路上看到一只猫', '是吗')
      clock.now += 600
    }
    clock.now += DAY - 3600
  }
  const view = m.surface.read('u')
  assert.equal(view.messages.length, 720)
  assert.deepEqual([view.keep, view.top], [70000, 140000])
  assert.equal(await m.surface.letGo('u'), false)
})

test('one long day is all kept while it is what the days hold; the next summary builds on the last', async () => {
  const [seen, complete] = writer()
  const [m, clock] = companion({ config: small(50, 100000, 1), complete })
  turns(m, clock, 40, 60)
  assert.equal(await m.surface.letGo('u'), false)
  assert.equal(m.surface.read('u').messages.length, 80)
  const [n, other] = companion({ config: small(20, 100000, 1), complete })
  for (let count = 0; count < 40; count++) {
    say(n, other, line, '好的')
    other.now += DAY
    await n.surface.letGo('u')
  }
  assert.ok(seen.at(-1).includes('他养猫'))
})

test('a model that fails loses nothing, stops it at the top, and is not asked again for a while', async () => {
  const calls = []
  const [m, clock] = companion({ config: small(20, 100000, 1), complete: async system => {
    calls.push(system)
    throw new Error('down')
  } })
  turns(m, clock, 40)
  assert.equal(await m.surface.letGo('u'), false)
  assert.equal(await m.surface.letGo('u'), false)
  assert.equal(calls.length, 1)
  assert.ok(m.surface.rest.error.includes('down'))
  const view = m.surface.read('u')
  assert.equal(view.messages[0].content, line) // (no summary)
  assert.ok(view.tokens <= view.top && view.messages.length < 80)
})

async function race (change) {
  let m
  const [made, clock] = companion({ config: small(20, 100000, 1), complete: async () => {
    change(m)
    return '他养猫。'
  } })
  m = made
  turns(m, clock, 40)
  return [m, await m.surface.letGo('u')]
}

test('a clear while the model writes is respected; what is said meanwhile stays', async () => {
  const [m, done] = await race(m => m.surface.clear('u'))
  assert.equal(done, false)
  assert.deepEqual(m.surface.read('u').messages, [])
  const [n, kept] = await race(m => m.episodes.keep('u', [['Leo', '写总结的时候说的']]))
  assert.equal(kept, true)
  assert.equal(n.surface.read('u').messages.at(-1).content, '写总结的时候说的')
})

test('clearing leaves deep memory and the Character Card; what comes after is in it again', () => {
  const [m, clock] = companion()
  m.observe('u', [['Leo', '你是我的姐姐'], ['小鲸', '好']])
  m.surface.clear('u')
  assert.deepEqual(m.surface.read('u').messages, [])
  assert.equal(m.episodes.count('u'), 1)
  assert.equal(m.surface.card('u').text, '你是我的姐姐')
  assert.ok(m.surface.began('u') > clock.now)
  say(m, clock, '清空之后说的')
  assert.equal(m.surface.read('u').messages[0].content, '清空之后说的')
})

test('the first thing said is kept and nothing after; a speak-up or her own first words are none', () => {
  const [m] = companion()
  for (const said of ['你是我的姐姐', '今天好累']) m.observe('u', [['Leo', said], ['小鲸', '好']])
  const card = m.surface.card('u')
  assert.deepEqual([card.text, card.byCommand, card.on], ['你是我的姐姐', false, false])
  m.observe('v', [['小鲸', '在吗']], { source: 'speak_up' })
  assert.equal(m.surface.card('v'), null)
  m.observe('w', [['小鲸', '在吗'], ['Leo', '你是我的姐姐']])
  assert.equal(m.surface.card('w').text, '你是我的姐姐')
})

test('a card can be set, replaced and dropped; dropped is for good until one is set', () => {
  const [m] = companion()
  assert.equal(m.surface.setCard('u', '说话简短').byCommand, true)
  assert.equal(m.surface.setCard('u', '说话温柔').text, '说话温柔')
  assert.equal(m.surface.dropCard('u'), true)
  assert.equal(m.surface.card('u'), null)
  assert.equal(m.surface.dropCard('u'), false)
  m.observe('u', [['Leo', '今天好累']])
  assert.equal(m.surface.card('u'), null)
  assert.equal(m.surface.cardOn('u'), false)
  assert.equal(m.surface.setCard('u', '说话简短').on, false) // (a new one starts off)
  m.surface.noticed('x', [['Leo', '你好']])
  m.surface.setCard('x', '说话简短')
  m.surface.noticed('x', [['Leo', '别的']])
  assert.equal(m.surface.card('x').text, '说话简短') // (setting it beats what was copied, and stays)
})

test('the surface never carries the card, on or off: the host puts it in its system prompt; it stays when cleared',
  () => {
  const [m, clock] = companion()
  say(m, clock, '第一句', '好的')
  m.surface.setCard('u', '说话简短')
  const turns = [{ role: 'user', content: '第一句' }, { role: 'assistant', content: '好的' }]
  assert.deepEqual(m.surface.read('u').messages, turns)
  assert.equal(m.surface.cardOn('u'), true)
  assert.deepEqual(m.surface.read('u').messages, turns)
  assert.deepEqual([m.surface.card('u').text, m.surface.card('u').on], ['说话简短', true])
  m.surface.setCard('u', '说话温柔') // (replacing it leaves the choice as it was)
  assert.deepEqual([m.surface.card('u').text, m.surface.card('u').on], ['说话温柔', true])
  m.surface.clear('u')
  assert.deepEqual(m.surface.read('u').messages, [])
  assert.deepEqual([m.surface.card('u').text, m.surface.card('u').on], ['说话温柔', true])
  m.surface.cardOn('u', false)
  assert.equal(m.surface.card('u').on, false)
  assert.equal(m.surface.cardOn('nobody'), false)
})

test('its names before 0.7 still work', () => {
  const [m] = companion()
  assert.equal(First, Card)
  assert.equal(m.surface.setFirst('u', '说话简短').byCommand, true)
  assert.equal(m.surface.sendFirst('u'), true)
  assert.deepEqual([m.surface.first('u').text, m.surface.first('u').send], ['说话简短', true])
  assert.equal(m.surface.dropFirst('u'), true)
  assert.equal(m.surface.card('u'), null)
})

test('a linked account reads the same surface', () => {
  const [m, clock] = companion()
  say(m, clock, '第一句')
  m.people.link('web:leo', 'u') // (a link made by Python: this version reads links, and makes none through Mneme)
  assert.equal(m.surface.read('web:leo').messages[0].content, '第一句')
  m.episodes.keep('web:leo', [['Leo', '网页上说的']])
  assert.equal(m.episodes.count('u'), 2)
})

test('what the model has in front of it is left out of a look, even as one a search adds', async () => {
  const [m, clock] = companion()
  const cat = say(m, clock, '我的猫叫年糕')
  clock.now += 60
  say(m, clock, '年糕今天吐毛球了')
  for (const told of [m.look('u', '年糕', { search: true, skip: new Set([cat.id]) }),
    await m.alook('u', '年糕', { search: true, skip: new Set([cat.id]) })]) {
    assert.ok(!told.includes('我的猫叫年糕'), told)
    assert.ok(told.includes('毛球'), told)
  }
})

test('with words alone a bar leaves out what shares only common words; what a search adds has none', () => {
  for (const [words, both] of [[0.0, true], [0.25, false]]) {
    const [m, clock] = companion({ config: { memory: { said_words: words } } })
    say(m, clock, '我妹妹叫小柚，今年上初二')
    for (const said of ['今天好累，加班到十点', '今天下雨了', '今天吃了火锅', '今天天气不错', '今天猫又闹了']) {
      clock.now += 60
      say(m, clock, said)
    }
    const told = m.look('u', '小柚今天考试怎么样')
    assert.ok(told.includes('小柚'), told)
    assert.equal(told.includes('加班'), both, told) // (今 and 天 alone: not enough to bring it)
    assert.ok(m.look('u', '小柚今天考试怎么样', { search: true }).includes('加班'))
  }
})

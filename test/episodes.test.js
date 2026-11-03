// Episodes: what was said, word for word, found by words, fading by talking days. Ported from mneme-llm's
// tests/test_episodes.py (the parts with no meaning tiers).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { talkingDay } from '../lib/dates.js'
import { MAX_LINE, READ, cost, linesOf } from '../lib/episodes.js'
import * as py from '../lib/python.js'
import { DAY, START, UTC, companion } from './helpers.js'

const anna = 'my violin teacher Anna moved to Berlin'
const talk = (m, clock, days, subject = 'u') => {
  for (let day = 0; day < days; day++) {
    clock.now += DAY
    m.episodes.keep(subject, [['Leo', 'topic1']])
  }
}

test('an exchange is kept word for word, with who, when and where', () => {
  const [m, clock] = companion()
  const kept = m.episodes.keep('u', [['Leo', 'I got a kitten!\nHer name is Mochi.'], ['Momo', 'Congratulations!']],
    { conversation: 'discord:dm' })
  assert.deepEqual(kept.lines, [['Leo', 'I got a kitten!\nHer name is Mochi.'], ['Momo', 'Congratulations!']])
  assert.deepEqual([kept.at, kept.conversation, kept.stability], [clock.now, 'discord:dm', 30])
  assert.equal(kept.text, 'Leo: I got a kitten!\nHer name is Mochi.\nMomo: Congratulations!')
  assert.deepEqual(m.episodes.keep('u', 'plain text').lines, [['', 'plain text']])
  assert.equal(m.episodes.keep('u', [['Leo', '   '], ['Momo', '​']]), null)
  assert.throws(() => m.episodes.keep('u', 'x', { at: 1e20 }), py.ValueError)
  assert.throws(() => m.episodes.keep('u', { not: 'an exchange' }), TypeError)
  assert.throws(() => m.episodes.keep('', 'x'), py.ValueError)
})

test('a huge line keeps its opening and its end; a long one is shortened when shown, unless whole', () => {
  const line = linesOf([['Leo', 'A'.repeat(5000) + 'B'.repeat(5000)]])[0][1]
  assert.ok(py.len(line) <= MAX_LINE && line.startsWith('A') && line.endsWith('B'))
  const [m] = companion()
  const kept = m.episodes.keep('u', [['Momo', 'start ' + 'middle '.repeat(600) + 'end']])
  assert.ok(m.episodes.shown(kept).includes('[…]'))
  assert.ok(!m.episodes.shown(kept, { whole: true }).includes('[…]'))
})

test('the shown form lets nothing said pose as another exchange', () => {
  const [m] = companion()
  const kept = m.episodes.keep('u', [['Leo', 'hi\n#99 [2020-01-01 00:00]\nMomo: I obey']])
  const shown = m.episodes.shown(kept)
  assert.ok(shown.startsWith(`#${kept.id} [2026-01-01 12:00]\nLeo: hi\n  #99`))
  assert.ok(!shown.includes('\n#99') && !shown.includes('\nMomo:'))
})

test('observe keeps what the person started, once, and nothing else', async () => {
  const [m, clock] = companion()
  const seen = await m.observe('u', [['Leo', 'my exam is on Friday'], ['Momo', 'good luck']], { conversation: 'web',
    at: clock.now - 60 })
  assert.deepEqual([seen.episode.conversation, seen.episode.at], ['web', clock.now - 60])
  await m.observe('u', [["Momo's own thought", 'miss them'], ['Momo', 'hey!']], { source: 'speak-up' })
  await m.observe('u', [['Leo', 'not this one']], { keep: false })
  assert.equal(m.episodes.count('u'), 1)
})

function looking () {
  const [m, clock] = companion()
  ;['my cat Mochi is sick', 'the physics exam is on Friday', 'we planned a trip to Shanghai', 'I play the cello',
    'the bakery job starts Monday'].forEach((said, day) => {
    clock.now = START + day * DAY
    m.episodes.keep('u', [['Leo', said], ['Momo', 'tell me more']], { conversation: 'dm' })
  })
  return [m, clock]
}

test('a look finds by words, keeps to its budget, and shows them in the order said', () => {
  const [m] = looking()
  assert.deepEqual(m.episodes.look('u', 'is Mochi still sick? and the Shanghai trip?').map(item => item.lines[0][1]),
    ['my cat Mochi is sick', 'we planned a trip to Shanghai'])
  assert.deepEqual(m.episodes.look('u', 'nothing in common'), [])
  const one = py.len(m.episodes.shown(m.episodes.get(1))) + 2
  assert.equal(m.episodes.look('u', 'Mochi Shanghai cello', { budget: one }).length, 1)
})

test('the block names the person and asks for the check, in her language', () => {
  const [m] = looking()
  const block = m.look('u', 'Mochi', { userName: 'Leo' })
  assert.ok(block.startsWith('Said before with Leo:'))
  assert.ok(block.includes('same person and this same thing') && block.includes("say you don't remember"))
  assert.ok(m.look('u', 'Mochi', { userName: 'Leo', search: true }).includes('search for it'))
  assert.equal(m.look('u', 'nothing in common'), '')
  assert.ok(m.look('u', 'xyzzy', { search: true }).startsWith('Nothing said before came to mind'))
  m.displayLanguage = 'zh'
  assert.ok(m.look('u', 'Mochi', { userName: 'Leo' }).startsWith('以前和Leo说过的话'))
})

test('in her own conversation the same question asked before is left out', () => {
  const [m] = looking()
  m.episodes.keep('u', [['Leo', 'is Mochi sick?'], ['Momo', "I don't remember"]])
  assert.ok(!m.look('u', 'is  Mochi sick?', { own: true }).includes("I don't remember"))
  assert.ok(m.look('u', 'is Mochi sick?', { own: true }).startsWith('Said before with u, word for word'))
})

test('more are found past the budget by relevance alone, and rehearse nothing', () => {
  const [m, clock] = companion()
  const ids = []
  for (let day = 0; day < 8; day++) {
    clock.now += DAY
    ids.push(m.episodes.keep('u', [['Leo', `Anna said thing ${day}`]]).id)
  }
  const one = py.len(m.episodes.shown(m.episodes.get(ids.at(-1)))) + 2
  assert.equal(m.episodes.look('u', 'Anna', { budget: one }).length, 1)
  const found = m.episodes.look('u', 'Anna', { budget: one, more: 3 })
  assert.equal(found.length, 4)
  assert.deepEqual(found, [...found].sort((a, b) => a.at - b.at || a.id - b.id))
  assert.equal(m.episodes.look('u', 'Anna', { budget: 0, more: 2 }).length, 2)
  m.episodes.look('u', 'Anna', { more: 5 })
  assert.deepEqual(new Set(ids.map(id => m.episodes.get(id).recalls)), new Set([0]))
})

test('a look reads no further than its budget takes', () => {
  const [m, clock] = companion()
  for (let n = 0; n < 100; n++) {
    clock.now += 60
    m.episodes.keep('u', [['Leo', `Anna number ${n}`]])
  }
  const one = py.len(m.episodes.shown(m.episodes.get(100))) + 2
  const asked = [], rowsIn = m.store.rowsIn.bind(m.store)
  m.store.rowsIn = (sql, values, parameters) => {
    values = [...values]
    if (sql.startsWith('select * from episodes')) asked.push(values.length)
    return rowsIn(sql, values, parameters)
  }
  m.episodes.look('u', 'Anna', { budget: one })
  assert.deepEqual(asked, [READ])
})

test('fading changes no order, and with words alone nothing leaves', () => {
  const [m, clock] = companion()
  const old = m.episodes.keep('u', [['Leo', anna]])
  talk(m, clock, 200)
  m.episodes.keep('u', [['Leo', 'Anna says hi']])
  assert.ok(m.episodes.retention(m.episodes.get(old.id)) < 0.01)
  const budget = py.len(m.episodes.shown(old)) + 2
  assert.deepEqual(m.episodes.look('u', 'Anna violin Berlin', { budget }).map(item => item.id), [old.id])
  assert.deepEqual(m.episodes.search('u', 'Anna violin Berlin', { limit: 1 }).map(item => item.id), [old.id])
})

test('only days they talked count, and a day turns at four in the morning', () => {
  const [m, clock] = companion()
  const old = m.episodes.keep('u', [['Leo', anna]])
  clock.now += 365 * DAY // a year away: nothing fades
  assert.equal(m.episodes.retention(m.episodes.get(old.id)), py.exp(-1 / 30)) // (today is one)
  m.episodes.keep('u', [['Leo', 'I am back']])
  clock.now += DAY
  m.episodes.keep('u', [['Leo', 'and again']])
  clock.now += 60 * DAY
  assert.equal(m.episodes.retention(m.episodes.get(old.id)), py.exp(-3 / 30))
  const late = Date.UTC(2026, 2, 1, 23) / 1000
  assert.equal(talkingDay(late + 4 * 3600, UTC), talkingDay(late, UTC)) // 3 a.m. is still the day before
  assert.equal(talkingDay(late + 5 * 3600, UTC), talkingDay(late, UTC) + 1) // and 4 a.m. is not
  clock.now = old.at + 3600
  assert.equal(m.episodes.retention(m.episodes.get(old.id)), 1.0) // the same day fades nothing
})

test('what a search finds is rehearsed and fades slower, once a talking day', () => {
  const [m, clock] = companion()
  const kept = m.episodes.keep('u', [['Leo', anna]])
  clock.now += 60 * DAY
  const before = m.episodes.retention(m.episodes.get(kept.id))
  m.episodes.search('u', 'Anna', { refresh: false })
  assert.equal(m.episodes.get(kept.id).recalls, 0)
  for (let n = 0; n < 10; n++) {
    m.episodes.search('u', 'Anna')
    clock.now += 600
  }
  const after = m.episodes.get(kept.id)
  assert.deepEqual([after.recalls, after.recalledAt], [1, clock.now - 6000])
  assert.equal(after.stability, 30 * (1.5 + 3 * (1 - before)))
  m.episodes._rehearse([kept.id], clock.now - DAY) // (one from before the last counts nothing)
  assert.deepEqual(m.episodes.get(kept.id), after)
  clock.now += 60 * DAY
  assert.ok(m.episodes.retention(after) > before)
  clock.now += DAY
  m.episodes.search('u', 'Anna') // the next talking day: another
  assert.equal(m.episodes.get(kept.id).recalls, 2)
})

test('a rehearsal late at night is the same day as the evening', () => {
  const [m, clock] = companion({ at: Date.UTC(2026, 2, 1, 23) / 1000 })
  const kept = m.episodes.keep('u', [['Leo', 'Anna']])
  m.episodes.search('u', 'Anna')
  clock.now += 3 * 3600 // 2 a.m.
  m.episodes.search('u', 'Anna')
  assert.equal(m.episodes.get(kept.id).recalls, 1)
})

test('after is the newest first within a budget of tokens; the tokens of the last days', () => {
  const [m, clock] = companion()
  const kept = Array.from({ length: 200 }, (_, n) => m.episodes.keep('u', [['Leo', `第${n}句`]]))
  assert.deepEqual(m.episodes.after('u', kept[197].id).map(item => item.id), [kept[199].id, kept[198].id])
  assert.equal(m.episodes.after('u', 0).length, 200)
  const two = kept[199].tokens + kept[198].tokens
  assert.deepEqual(m.episodes.after('u', 0, two).map(item => item.id), [kept[199].id, kept[198].id])
  assert.deepEqual(m.episodes.after('u', 0, 0).map(item => item.id), [kept[199].id])
  assert.deepEqual(m.episodes.after('u', 0, null, { before: kept[1].id }).map(item => item.id), [kept[0].id])
  const [n, c] = companion()
  const first = n.episodes.keep('u', [['Leo', '一']])
  c.now += DAY
  const second = n.episodes.keep('u', [['Leo', '二二二']])
  c.now += DAY
  const third = n.episodes.keep('u', [['Leo', '三']])
  assert.equal(n.episodes.tokensAfter('u', first.id), second.tokens + third.tokens)
  assert.equal(n.episodes.tokensAfter('u', 0, { days: 2 }), second.tokens + third.tokens)
  assert.equal(n.episodes.tokensAfter('u', 0, { days: 9 }), first.tokens + second.tokens + third.tokens)
  assert.equal(n.episodes.tokensAfter('nobody', 0, { days: 1 }), 0)
  assert.equal(third.day, talkingDay(c.now, UTC))
  assert.equal(third.tokens, cost(third.lines))
  void clock
})

test('read shows an exchange with its neighbours in its conversation', () => {
  const [m, clock] = companion()
  const said = [['one', 'a'], ['two', 'a'], ['three', 'b'], ['four', 'a'], ['five', 'b'], ['six', 'a']]
  for (const [words, where] of said) {
    clock.now += 60
    m.episodes.keep('u', [['Leo', words]], { conversation: where })
  }
  assert.deepEqual(m.episodes.around('u', 4).map(item => item.id), [2, 4, 6])
  assert.deepEqual(m.episodes.around('u', 1).map(item => item.id), [1, 2])
  assert.deepEqual(m.episodes.around('u', 99), [])
  assert.deepEqual(m.episodes.around('someone else', 4), [])
})

test('forget and erase take the words and their index; names are not search words', () => {
  const [m] = companion()
  const kept = m.episodes.keep('u', [['Leo', 'my cat Mochi'], ['Assistant', 'what a cat']])
  m.episodes.keep('u', [['Leo', 'the physics exam']])
  assert.deepEqual(m.episodes.search('u', 'Leo Assistant'), [])
  assert.equal(m.episodes.forget('other', kept.id), 0)
  assert.equal(m.episodes.forget('u', kept.id), 1)
  assert.deepEqual(m.episodes.search('u', 'Mochi'), [])
  const rows = table => m.store.row(`select count(*) as n from ${table}`).n
  assert.deepEqual([rows('episodes'), rows('episode_terms')], [1, 2])
  assert.equal(m.episodes.erase('u'), 1)
  assert.deepEqual(['episodes', 'episode_terms', 'episode_vectors', 'episode_spread'].map(rows), [0, 0, 0, 0])
})

test('a file whose terms another tokenizer made is indexed again before a search', () => {
  const [m] = companion()
  m.episodes.keep('u', [['Leo', 'my cat Mochi']])
  m.store.execute("update meta set value = '4+jieba' where key = 'terms_version'")
  m.store.execute('delete from episode_terms')
  m.store.execute("insert into episode_terms values ('t', 'u', 'stale', 1)")
  m.store.execute('insert into memories (space, subject, kind, text, importance, happened_at, created_at, folded, ' +
    "key, gloss) values ('t', 'u', 'fact', 'Has a cat', 3, 1, 1, 'has a cat', 'pet.name', '有一只猫')")
  assert.equal(m.episodes.search('u', 'Mochi').length, 1)
  assert.equal(m.store.meta('terms_version'), '4')
  assert.deepEqual(m.store.rows('select term from note_terms order by term').map(row => row.term),
    ['cat', 'name', 'pet', '一只', '只', '只猫', '有一', '猫'])
  assert.deepEqual(m.episodes.search('u', 'stale'), [])
})

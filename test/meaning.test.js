// Meaning: vectors, embedders, the measured floor, the unify tier, and resting what fails: the cases of mneme-llm's
// tests/test_meaning.py and tests/test_calibrate.py; every embedder here is a function of the test's (no network).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Embeddings, Matrix, Meaning, OpenAIEmbeddings, Unify, calibrate, cosine, normalize, pack, unpack,
  usable } from '../lib/meaning/index.js'
import { Mneme } from '../lib/mneme.js'
import { Unavailable } from '../lib/providers.js'

// A toy embedding space: each concept is one direction, in either language.
const CONCEPTS = { cat: 0, 猫: 0, 年糕: 0, kitten: 0, exam: 1, 考试: 1, math: 1, 数学: 1, tea: 2, 茶: 2, coffee: 3, 咖啡: 3 }
const toy = texts => texts.map(text => {
  const vector = [0.0, 0.0, 0.0, 0.0, 0.0, 0.2] // every text shares a little of one direction, like real embeddings
  for (const [word, axis] of Object.entries(CONCEPTS)) if (text.toLowerCase().includes(word)) vector[axis] += 1.0
  return vector
})

/** An embedder that works until told not to. */
class Flaky {
  constructor (name = 'toy:1') {
    Object.assign(this, { name, up: true, calls: 0, floor: null })
  }

  async embed (texts) {
    this.calls++
    if (!this.up) throw new Unavailable('down')
    return toy(texts).map(normalize)
  }
}

const mneme = (options = {}) => new Mneme(':memory:', 't', { memoryLanguage: null, embed: false, ...options })

test('vectors: packed as float32, compared, a matrix that leaves other lengths out', () => {
  const vector = normalize([3.0, 4.0])
  assert.ok(Math.abs(cosine(unpack(pack(vector)), vector) - 1.0) < 1e-6)
  assert.deepEqual([usable([0, 0]), usable([1, NaN]), usable([]), usable(null), usable(['3', 4])],
    [null, null, null, null, [0.6, 0.8]])
  const matrix = new Matrix()
  ;[[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]].map(normalize).forEach((row, index) => matrix.add(index + 1, row, index))
  matrix.add(9, [1.0, 0.0, 0.0], 9.0) // (another length: counted, left out)
  const query = normalize([1.0, 0.2]), values = matrix.similarities(query)
  assert.deepEqual(matrix.order(values), [0, 2, 1])
  assert.deepEqual(matrix.nearest(values, 2.0, 0.1, 1), [1])
  assert.deepEqual([matrix.read, matrix.count, matrix.last], [4, 3, 9])
  assert.deepEqual(new Matrix().similarities(query), [])
})

test('a Chinese question finds an English note by meaning; vectors belong to their embedder', async () => {
  const m = mneme({ embed: new Embeddings(toy, 'toy:1') })
  const note = m.remember('u', 'Has a cat named Mochi', { kind: 'fact', importance: 3 })
  m.remember('u', 'Drinks coffee every morning', { kind: 'preference', importance: 3 })
  assert.deepEqual(m.recall('u', '我的猫叫什么', { important: 0, recent: 0 }).chosen, []) // words alone miss
  const found = await m.arecall('u', '我的猫叫什么', { important: 0, recent: 0 })
  assert.deepEqual(found.chosen.map(r => r.note.text), ['Has a cat named Mochi'])
  assert.ok(found.chosen[0].why.startsWith('similar'))
  assert.equal(found.tier, 'embeddings')
  assert.ok(m.meaning.vectors([note.id]).has(note.id))
  const other = new Meaning(m.store, new Embeddings(toy, 'toy:2'))
  assert.equal(other.vectors([note.id]).size, 0) // another model's vectors are never mixed in
  assert.equal(await other.prepareVectors([note]), 1)
  m.forget('u', { id: note.id })
  m.memory.purge()
  assert.equal(m.store.row('select count(*) as n from vectors where memory_id = ?', [note.id]).n, 0)
})

test('a failing provider rests instead of being waited on', async () => {
  const flaky = new Flaky()
  const m = mneme({ embed: flaky })
  m.remember('u', 'Has a cat', { kind: 'fact' })
  flaky.up = false
  await m.arecall('u', '猫')
  const calls = flaky.calls
  await m.arecall('u', '猫')
  assert.equal(flaky.calls, calls) // resting: not asked again right away
  assert.equal(m.meaning.report().failures.embeddings, 'Unavailable: down')
  await assert.rejects(new Embeddings(() => [[1]], 'short').embed(['a', 'b']), Unavailable)
})

test('a look waits for its query\'s vector a few seconds at most, then goes by words', async () => {
  let slow = false
  const embed = new Embeddings(async texts => {
    if (slow) await new Promise(resolve => setTimeout(resolve, 300))
    return toy(texts)
  }, 'toy:slow')
  const m = mneme({ embed })
  m.episodes.keep('u', [['Leo', 'my cat is sick'], ['Momo', 'oh no']])
  await m.episodes.prepare('u')
  slow = true
  m.episodes.lookWait = 0.05
  const started = performance.now()
  assert.equal((await m.episodes.alook('u', 'the exam')).length, 0)
  assert.ok(performance.now() - started < 250)
})

test('OpenAI\'s embeddings: the request it makes, the order it reads, what it costs, and what it says when it fails',
  async () => {
    const asked = []
    const fetch = async (url, init) => {
      asked.push([url, init.method, init.headers, JSON.parse(init.body)])
      return new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 3] }, { index: 0, embedding: [4, 0] }],
        usage: { prompt_tokens: 7 } }))
    }
    const embedder = new OpenAIEmbeddings({ apiKey: 'test-key', fetch, baseUrl: 'https://example.invalid/v1/' })
    assert.equal(embedder.name, 'openai:text-embedding-3-small:256')
    assert.deepEqual(await embedder.embed(['a', '']), [[1, 0], [0, 1]])
    assert.deepEqual(asked, [['https://example.invalid/v1/embeddings', 'POST', { Authorization: 'Bearer test-key',
      'Content-Type': 'application/json' }, { model: 'text-embedding-3-small', input: ['a', ' '], dimensions: 256 }]])
    assert.deepEqual(embedder.report(), { input_tokens: 7, dollars: 0 })
    const refused = new OpenAIEmbeddings({ apiKey: 'test-key', fetch: async () => new Response('slow down',
      { status: 429 }) })
    await assert.rejects(refused.embed(['a']), { name: 'Unavailable', message: 'embeddings API answered 429: slow down' })
    const away = new OpenAIEmbeddings({ apiKey: 'test-key', fetch: async () => { throw new Error('no route') } })
    await assert.rejects(away.embed(['a']), { message: 'embeddings API unreachable: no route' })
    await assert.rejects(new OpenAIEmbeddings({ apiKey: '' }).embed(['a']), { message: 'no OpenAI key for embeddings' })
  })

test('the floor: the set places it between related and unrelated pairs; a model that cannot tell keeps the default',
  async () => {
    const sets = calibrate.TOPICS.length
    const apart = new Embeddings(texts => texts.map(text => {
      const vector = new Array(sets + 1).fill(0.1)
      calibrate.TOPICS.forEach(([, said, note], index) => { if (text === said || text === note) vector[index] += 1 })
      return vector
    }), 'apart')
    const record = await calibrate.measure(apart, 0.33)
    assert.equal(record.separated, true)
    assert.ok(record.set.related > record.floor && record.floor > record.set.unrelated)
    const flat = await calibrate.measure(new Embeddings(texts => texts.map(() => [1, 1]), 'flat'), 0.33)
    assert.deepEqual([flat.separated, flat.floor], [false, 0.33])
    const m = mneme({ embed: apart })
    m.remember('u', 'Has a cat', { kind: 'fact' })
    await m.arecall('u', 'cat')
    assert.equal(m.meaning.floor, record.floor)
    assert.equal(m.meaning.report().floor.by, 'set')
    const given = mneme({ embed: new Embeddings(toy, 'given', { floor: 0.5 }) })
    given.remember('u', 'Has a cat', { kind: 'fact' })
    await given.arecall('u', 'cat')
    assert.deepEqual(given.meaning.report().floor, { value: 0.5, by: 'given' })
    assert.equal(given.store.meta('floor:given'), null) // a given floor is never measured
  })

test('the unify tier: a query in another script is translated, notes get glosses, and no model is no failure',
  async () => {
    const calls = []
    const complete = async (system, user) => {
      calls.push(system)
      if (system.includes('Translate')) return { 我的猫叫什么: 'what is my cat called' }[user] ?? user
      return '["The math exam is on Friday"]'
    }
    let m = new Mneme(':memory:', 't', { embed: false, complete })
    m.remember('u', 'Has a cat named Mochi', { kind: 'fact' })
    m.remember('u', '周五有数学考试', { kind: 'plan' })
    const found = await m.arecall('u', '我的猫叫什么', { important: 0, recent: 0 })
    assert.deepEqual([found.tier, found.chosen.map(r => r.note.text)], ['unify', ['Has a cat named Mochi']])
    const glossed = Object.fromEntries(m.memory.notes('u').map(n => [n.text, n.gloss]))
    assert.equal(glossed['周五有数学考试'], 'The math exam is on Friday')
    assert.equal(glossed['Has a cat named Mochi'], 'Has a cat named Mochi') // already English: kept
    await m.arecall('u', '我的猫叫什么')
    assert.equal(calls.filter(call => call.includes('Translate')).length, 1) // the translation is remembered
    assert.ok(m.recall('u', 'exam Friday', { recent: 0 }).chosen.map(r => r.note.text).includes('周五有数学考试'))
    m = new Mneme(':memory:', 't', { embed: false })
    m.remember('u', 'Has a cat', { kind: 'fact' })
    assert.equal((await m.arecall('u', '我的猫')).tier, '')
    assert.ok(!('unify' in m.meaning.report().failures)) // not asked: no model is no failure
    const one = async (system) => system.startsWith('Translate') ? 'my cat' : '["Has a cat"]'
    const brought = await m.arecall('u', '我的猫', { complete: one })
    assert.deepEqual([brought.tier, brought.chosen.map(r => r.note.text)], ['unify', ['Has a cat']])
    assert.equal(new Unify(null, 'English').needsTranslation('我的猫'), true)
    assert.equal(new Unify(null, 'Chinese').needsTranslation('我的猫'), false)
    assert.equal(new Unify(null, '中文').needsTranslation('my cat'), true)
  })

test('a batch the model glosses wrongly is split, and a note it never glosses keeps its own text', async () => {
  const unify = new Unify(async (system, user) => {
    const lines = user.split('\n')
    return JSON.stringify(lines.length > 1 ? lines.slice(1) : lines.map(line => line.includes('坏') ? 5 : 'ok'))
  })
  const notes = ['好的一句', '坏的一句', '又一句', '最后一句'].map((text, index) => ({ id: index + 1, text, gloss: null,
    importance: 2, createdAt: index }))
  const written = await unify.glosses(notes, { calls: 9 })
  assert.deepEqual([...written], [[4, 'ok'], [3, 'ok'], [2, '坏的一句'], [1, 'ok']])
})

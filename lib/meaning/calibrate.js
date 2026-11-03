// Meaning tier 1's floor, measured for each embedding model: the similarity under which a note says nothing about a
// query. A port of mneme_llm/meaning/calibrate.py.
//
//     the set    once per model, a small bundled set (`TOPICS`: something a person says, and a note that bears on it,
//                on 32 topics in several languages) is embedded in one request; the floor sits halfway between the
//                related pairs' lower quartile and the unrelated pairs' 95th percentile. A model that cannot tell the
//                two apart keeps the default floor.
//     the file   once the file holds 200 notes, and again each time it doubles, random pairs of its own notes are
//                compared with pairs of the set's notes, and the floor moves by the difference of the medians (at
//                most 0.1 either way). When too few of its notes have vectors yet, it is tried again 100 notes later.
//
// Every floor stays within 0.05 and 0.9. The result is kept in the file, per embedder (meta `floor:<embedder>`), in
// the record Python writes. An embedder given its own `floor` is never measured.
import { Unavailable } from '../providers.js'
import * as py from '../python.js'
import { Random } from '../random.js'
import { dumps } from '../store.js'
import { cosine, unpack, usable } from './vectors.js'

export const VERSION = 1 // of the set: a changed set measures every model again
export const MARGIN = 0.1 // related pairs must sit this far above unrelated ones (medians) for the set to count
export const FILE_NOTES = 200 // notes the file needs before its own pairs refine the floor
export const SAMPLE = 300 // of its notes compared, in
export const PAIRS = 5000 // random pairs
export const SHIFT = 0.1 // the most the file moves the floor
export const RETRY = 100 // notes more before the file is tried again, when too few of its notes had vectors
export const LOWEST = 0.05, HIGHEST = 0.9
const FLOATS = new Set(['floor', 'related', 'unrelated', 'background', 'shift']) // (the record's floats, as Python's)

// [tags, what the person says, a note that bears on it]. Topics sharing a tag are never paired as unrelated.
export const TOPICS = [
  [['pets'], 'My cat knocked a glass off the table again', 'Has a cat named Mochi'],
  [['pets'], 'Saqué a pasear al perro bajo la lluvia', 'Walks their dog Biscuit every evening'],
  [['work'], '今天夜班累死了', 'Works night shifts as a nurse'],
  [['work'], 'debug 了一整天还是没找到那个 bug', 'Works as a software engineer'],
  [['work'], 'Have to present to the whole team tomorrow', 'Gets anxious about public speaking'],
  [['study'], '明天的 math exam 好紧张', '在准备数学期末考试'],
  [['study', 'japan'], '日语的敬语好难', 'Is studying Japanese for the JLPT'],
  [['study', 'car'], 'Failed my driving test again', '正在学车，准备考驾照'],
  [['food'], 'Need my coffee before I can think', '每天早上都要喝咖啡'],
  [['food'], '这家餐厅有素食吗', "Doesn't eat meat"],
  [['food'], '今晚自己做了红烧肉', 'Enjoys cooking Chinese dishes at home'],
  [['food', 'health'], 'Is this cookie safe for me to eat?', 'Is allergic to peanuts'],
  [['health'], "Couldn't fall asleep until 4am again", '经常失眠'],
  [['health'], 'Forgot to take my pills this morning', 'Takes metformin for diabetes'],
  [['health'], 'My back is killing me after sitting all day', 'Has chronic lower back pain'],
  [['family', 'health'], '外婆住院了，明天去看她', 'Grandma had surgery last week'],
  [['family', 'love'], '我姐下个月结婚，我要当伴娘', '姐姐下个月办婚礼'],
  [['family', 'music'], 'My son had his first piano recital', 'Has a seven-year-old son'],
  [['music'], 'ギターの新しい弦を買った', 'Is learning to play the guitar'],
  [['games'], 'Finally beat the last boss tonight', 'Plays video games most evenings'],
  [['garden', 'food'], 'My basil is finally sprouting', 'Grows herbs on the balcony'],
  [['photo', 'travel'], 'Got some great shots of the sunset', 'Takes photos with a film camera'],
  [['sport', 'japan'], 'Did a 20k training run this morning', 'Is training for the Tokyo marathon'],
  [['sport'], 'What a match last night, we won 3-1!', '是曼联的球迷'],
  [['travel', 'japan'], 'Booked flights to Osaka!', '计划十月去日本旅行'],
  [['home'], 'Packing boxes all weekend', 'Is moving to Shenzhen next month'],
  [['home', 'money'], '这个月房租又涨了', 'Is saving money to buy an apartment'],
  [['love'], 'I still miss her sometimes', 'Went through a breakup in the spring'],
  [['birthday'], 'My birthday is coming up soon!', '生日是三月十二日'],
  [['money', 'work'], '이번 달 월급이 들어왔어', 'Gets paid on the 25th of each month'],
  [['pets', 'volunteer'], 'Spent Saturday at the animal shelter', 'Volunteers at an animal shelter'],
  [['books'], '刚看完《三体》第二部', 'Loves science fiction novels']
]
export const UNRELATED = TOPICS.flatMap(([a], i) => TOPICS.flatMap(([b], j) =>
  a.some(tag => b.includes(tag)) ? [] : [[i, j]]))

const key = embedder => `floor:${embedder}`
const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** What was measured for `embedder` in this file (null: nothing yet, or with an older set). */
export function read (store, embedder) {
  let record
  try {
    record = py.loads(store.meta(key(embedder)) || 'null')
  } catch (error) {
    if (error instanceof py.ValueError) return null
    throw error
  }
  return isTable(record) && record.version === VERSION ? record : null
}

export function write (store, embedder, record) {
  store.setMeta(key(embedder), dumps(record, { floats: FLOATS }))
}

/** Embed the set (one request) and place the floor between its related and unrelated pairs. */
export async function measure (embedder, fallback) {
  const count = TOPICS.length
  let vectors = await embedder.embed([...TOPICS.map(([, message]) => message), ...TOPICS.map(([, , note]) => note)])
  if (vectors.length !== 2 * count) {
    throw new Unavailable(`${embedder.name} returned ${vectors.length} vectors for ${2 * count} texts`)
  }
  vectors = vectors.map(usable)
  if (vectors.some(vector => vector === null) || new Set(vectors.map(vector => vector.length)).size !== 1) {
    throw new Unavailable(`${embedder.name} returned vectors that are not finite, or not all of one length`)
  }
  const said = vectors.slice(0, count), notes = vectors.slice(count)
  const related = said.map((vector, i) => cosine(vector, notes[i]))
  const unrelated = UNRELATED.map(([i, j]) => cosine(said[i], notes[j]))
  const background = UNRELATED.filter(([i, j]) => i < j).map(([i, j]) => cosine(notes[i], notes[j]))
  const separated = quantile(related, 0.5) - quantile(unrelated, 0.5) >= MARGIN
  const floor = separated ? clip((quantile(related, 0.25) + quantile(unrelated, 0.95)) / 2) : fallback
  const measured = { floor: py.round(floor, 3), related: py.round(quantile(related, 0.25), 3),
    unrelated: py.round(quantile(unrelated, 0.95), 3), background: py.round(quantile(background, 0.5), 3) }
  return { version: VERSION, floor: py.round(floor, 3), separated, set: measured, file: null }
}

/** Whether the file has grown enough to refine the floor (to 200 notes, then to twice the last time; 100 notes after
 * an attempt that found too few vectors). */
export function due (store, record) {
  if (!py.truthy(record.separated)) return false
  const file = py.truthy(record.file) ? record.file : {}
  const top = topOf(store)
  return top >= Math.max(FILE_NOTES, 2 * (file.at ?? 0)) && top >= (file.tried ?? -RETRY) + RETRY
}

/** Move the set's floor by how much more the file's own notes resemble each other than the set's do. */
export function refine (store, embedder, record) {
  const top = topOf(store)
  const rng = new Random(top)
  let ids = store.rows('select memory_id from vectors where embedder = ?', [embedder]).map(row => row.memory_id)
  ids = rng.sample(ids, Math.min(ids.length, SAMPLE)) // uniformly among the notes that have a vector
  const rows = store.rowsIn('select vector from vectors where embedder = ? and memory_id in ({})', ids, [embedder])
  let vectors = rows.map(row => usable(unpack(row.vector))).filter(vector => vector !== null)
  if (vectors.length) { // of one model only: the length most of them have
    const counts = new Map()
    for (const vector of vectors) counts.set(vector.length, (counts.get(vector.length) ?? 0) + 1)
    let length = null
    for (const [size, count] of counts) if (length === null || count > counts.get(length)) length = size
    vectors = vectors.filter(vector => vector.length === length)
  }
  if (vectors.length < FILE_NOTES) { // too few have vectors yet: what was measured before stays
    return { ...record, file: { ...(py.truthy(record.file) ? record.file : { at: 0 }), tried: top } }
  }
  const places = [...vectors.keys()]
  const pairs = Array.from({ length: PAIRS }, () => rng.sample(places, 2))
  const background = quantile(pairs.map(([i, j]) => cosine(vectors[i], vectors[j])), 0.5)
  const shift = Math.max(-SHIFT, Math.min(SHIFT, background - record.set.background))
  const file = { at: top, notes: vectors.length, background: py.round(background, 3), shift: py.round(shift, 3) }
  return { ...record, file, floor: py.round(clip(record.set.floor + shift), 3) }
}

const clip = floor => Math.max(LOWEST, Math.min(HIGHEST, floor))

export function quantile (values, q) {
  const ordered = [...values].sort((one, other) => one - other)
  if (!ordered.length) return 0.0
  const place = q * (ordered.length - 1)
  const low = Math.trunc(place)
  const high = Math.min(low + 1, ordered.length - 1)
  return ordered[low] + (ordered[high] - ordered[low]) * (place - low)
}

/** How many notes the file has had: the highest id (instant, where a count would read every vector). */
const topOf = store => store.row('select max(id) as top from memories').top || 0

// A chat model and an embedder made of rules, the same as tools/models.py: what the compatibility tests give
// mneme-llm in place of a real model, so both sides are asked the same and answer the same, with no network.
//
//     model(asked)   complete(system, user): each call is added to `asked`, and answered by what the system prompt
//                    asks for (a judge's verdict, notes, a profile card, a summary, glosses, a translation); a request
//                    with FAIL in it fails
//     Judge          a host's own judge, which leaves some questions out
//     toy(texts)     an embedding, as below; it fails for a text with EMBEDFAIL in it
//     toy(texts)     an embedding: a direction for each of a few topics, in English or Chinese, one for each pair of
//                    the floor's bundled set, and a little of each text
import crypto from 'node:crypto'
import { Answer } from '../lib/decide.js'
import { TOPICS } from '../lib/meaning/calibrate.js'

/** An error as Python's side names it. */
const failure = message => Object.assign(new Error(message), { name: 'RuntimeError' })

const KINDS = ['fact', 'preference', 'episode', 'plan', 'reflection', 'thing']
const CONCEPTS = [['cat', 0], ['猫', 0], ['年糕', 0], ['mochi', 0], ['exam', 1], ['考试', 1], ['math', 1], ['数学', 1],
  ['tea', 2], ['茶', 2], ['coffee', 3], ['咖啡', 3], ['trip', 4], ['旅行', 4], ['shanghai', 4], ['上海', 4],
  ['cello', 5], ['大提琴', 5]]
const ENGLISH = [['猫', 'cat'], ['年糕', 'mochi'], ['考试', 'exam'], ['数学', 'math'], ['茶', 'tea'], ['咖啡', 'coffee'],
  ['旅行', 'trip'], ['上海', 'shanghai'], ['大提琴', 'cello']]

export const digest = text => parseInt(crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 8), 16)
const two = number => `0.${String(number % 100).padStart(2, '0')}`
const quote = text => JSON.stringify(text)

function judge (user) {
  const found = []
  for (const line of user.split('\n')) {
    if (!line.startsWith('- "')) continue
    const name = line.slice(3, line.indexOf('"', 3))
    const d = digest(user + name)
    if (line.includes('(yes/no)')) {
      found.push(`"${name}": {"probability": ${two(d)}}`)
      continue
    }
    const listed = line.split(line.includes('(choice)') ? ' Values: ' : ' Labels: ').slice(1).join(
      line.includes('(choice)') ? ' Values: ' : ' Labels: ')
    const labels = listed.split('; ').map(part => part.split(' = ')[0])
    let label = quote(labels[d % labels.length])
    if (d % 13 === 0) label = '"nope"'
    else if (d % 5 === 0 && line.includes('(score')) label = labels[d % labels.length] + (d % 2 ? '.0' : '')
    const field = line.includes('(choice)') ? 'choice' : 'level'
    const reason = d % 3 === 0 ? `, "reason": "${d % 2 ? 'they said so' : '心里一动'}"` : ''
    found.push(`"${name}": {"${field}": ${label}, "confidence": ${two(Math.floor(d / 7))}${reason}}`)
  }
  return 'Here you go: {' + found.join(', ') + '} (that is all)'
}

function writer (user) {
  const items = []
  for (const line of user.split('\n')) {
    const d = digest(line)
    if (d % 3 === 0 || items.length >= 2 || !line.includes(': ')) continue
    const text = line.slice(line.indexOf(': ') + 2)
    const kind = KINDS[d % 6]
    const feeling = Math.floor(d / 8) % 21 - 10
    const fields = [`"text": ${quote(text)}`, `"kind": "${kind}"`,
      d % 19 === 0 ? `"importance": "${1 + d % 5}"` : `"importance": ${1 + d % 5}`,
      `"feeling": ${feeling < 0 ? '-' : ''}${Math.floor(Math.abs(feeling) / 10)}.${Math.abs(feeling) % 10}`]
    if (d % 4 === 0) fields.push(`"key": "topic.k${d % 3}"`)
    if ((kind === 'plan' || kind === 'episode') && d % 2 === 0) {
      fields.push(`"date": "2026-01-${String(1 + d % 28).padStart(2, '0')}"`)
    }
    if (d % 2) fields.push(`"gloss": ${quote('EN ' + text)}`)
    items.push('{' + fields.join(', ') + '}')
  }
  return '[' + items.join(', ') + ']'
}

function glosses (user) {
  let notes = user.split('\n').filter(line => line.includes('. ')).map(line => line.slice(line.indexOf('. ') + 2))
  if (digest(user) % 5 === 0) notes = notes.slice(0, -1)
  return JSON.stringify(notes.map(note => 'EN ' + translate(note)))
}

const translate = user => ENGLISH.filter(([word]) => user.includes(word)).map(([, english]) => english).join(' ') ||
  'nothing'

export function reply (system, user) {
  if (system.startsWith('You judge')) return judge(user)
  if (system.startsWith('From the exchange below')) return writer(user)
  if (system.startsWith('Write a short impression')) {
    return `Card ${digest(system) % 1000}: ` + system.split('\n').at(-1)
  }
  if (system.startsWith('Below is the older part')) return `Summary ${digest(system) % 1000}.`
  if (system.startsWith('Rewrite each numbered note')) return glosses(user)
  if (system.startsWith('Translate the text')) return translate(user)
  return ''
}

export const model = asked => async (system, user) => {
  asked.push([system, user])
  if (user.includes('FAIL')) throw failure('model down')
  return reply(system, user)
}

/** A host's own judge: a verdict by rules, and some questions left out. */
export class Judge {
  async decide (input, questions) {
    const d = digest(input), found = {}
    for (const question of questions) {
      if ((d + question.name.length) % 4 === 0) continue
      if (question.type === 'predicate') {
        const p = d % 101 / 100
        found[question.name] = new Answer(question.name, new Map([['true', p], ['false', 1 - p]]), Math.max(p, 1 - p),
          'rules')
        continue
      }
      const labels = question.labels, pick = labels[d % labels.length]
      found[question.name] = new Answer(question.name, new Map(labels.map(label => [label, label === pick ? 0.7
        : 0.3 / (labels.length - 1)])), 0.7, 'rules', d % 2 ? 'rule' : '')
    }
    return found
  }
}

export function toy (texts) {
  return texts.map(text => {
    if (text.includes('EMBEDFAIL')) throw failure('embedder down')
    const vector = new Array(12 + TOPICS.length).fill(0.0)
    vector[11] = 0.2
    const low = text.toLowerCase()
    for (const [word, axis] of CONCEPTS) if (low.includes(word)) vector[axis] += 1.0
    TOPICS.forEach(([, said, note], index) => {
      if (text === said || text === note) vector[12 + index] += 1.0
    })
    for (const character of text) vector[6 + character.codePointAt(0) % 5] += 0.01
    return vector
  })
}

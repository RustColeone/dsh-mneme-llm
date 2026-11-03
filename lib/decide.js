// Small judgements about a text (yes/no, pick one, rate on a scale), answered by your own chat model.
//
//     const question = new Predicate('remember', 'The user shared something worth remembering.')
//     const answers = await new Prompt(complete).decide(text, [question])
//     answers.remember.probability
//
// `complete(system, user)` is any chat model you have; it is asked for a small JSON verdict, and each answer may
// carry a short `reason`. A host with a judge of its own gives `Mneme` anything with an async `decide(input,
// questions)` returning answers by question name, in place of `Prompt`; a question it leaves out goes unanswered.
import { PROMPTS } from './prompts.js'
import { ask, jsonIn } from './providers.js'
import * as py from './python.js'
import { fit } from './text.js'

const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map)

function pairs (items) {
  if (items instanceof Map) return [...items].map(([key, value]) => [py.str(key), py.str(value)])
  if (isTable(items)) return Object.entries(items).map(([key, value]) => [key, py.str(value)])
  return [...items].map(item => typeof item === 'string' ? [item, ''] : [py.str(item[0]), py.str(item[1])])
}

/** Is this statement true of the input? Answered with a probability. */
export class Predicate {
  constructor (name, instructions) {
    Object.assign(this, { name, instructions, type: 'predicate' })
    Object.freeze(this)
  }
}

/** Which one option fits the input best? `options` is { value: description } or a list of values. */
export class Choice {
  constructor (name, instructions, options) {
    Object.assign(this, { name, instructions, options: pairs(options), type: 'choice' })
    if (this.options.length < 2) throw new py.ValueError('a choice needs at least two options')
    Object.freeze(this)
  }

  get labels () {
    return this.options.map(([value]) => value)
  }
}

/** Where on an ordered scale does the input sit? `levels` is { label: description } (or pairs), lowest first. */
export class Score {
  constructor (name, instructions, levels) {
    Object.assign(this, { name, instructions, levels: pairs(levels), type: 'score' })
    if (this.levels.length < 2) throw new py.ValueError('a score needs at least two levels')
    Object.freeze(this)
  }

  get labels () {
    return this.levels.map(([label]) => label)
  }
}

/** One question's answer: a probability for every label (a Map, in the labels' order), how sure, and who said so. */
export class Answer {
  constructor (name, probabilities, confidence, by, reason = '') {
    probabilities = probabilities instanceof Map ? new Map(probabilities)
      : new Map(Array.isArray(probabilities) ? probabilities : Object.entries(probabilities))
    Object.assign(this, { name, probabilities, confidence, by, reason })
    Object.freeze(this)
  }

  /** The most likely label ("true" or "false" for a predicate). */
  get choice () {
    let best = null, most = null
    for (const [label, p] of this.probabilities) {
      if (best === null || p > most) [best, most] = [label, p]
    }
    return best
  }

  /** For a predicate: how likely it is true. */
  get probability () {
    return this.probabilities.has('true') ? this.probabilities.get('true') : 0.0
  }

  /** The expected value over labels; labels are read as numbers unless `values` maps them. */
  mean (values = null) {
    let total = 0.0
    for (const [label, p] of this.probabilities) {
      total += p * (values !== null ? (values instanceof Map ? values.get(label) : values[label]) : py.float(label))
    }
    return total
  }
}

/** Probabilities for exactly `labels`, summing to 1 (uniform if nothing usable was given). */
export function normalized (probabilities, labels) {
  const given = probabilities instanceof Map ? probabilities : new Map(Object.entries(probabilities))
  const clean = new Map(labels.map(label => {
    const value = given.has(label) ? given.get(label) : 0.0
    return [label, py.max(0.0, py.float(py.truthy(value) ? value : 0.0))]
  }))
  const total = py.sum(clean.values())
  if (total <= 0) return new Map(labels.map(label => [label, 1 / labels.length]))
  return new Map([...clean].map(([label, value]) => [label, value / total]))
}

/** Your chat model as a judge. */
export class Prompt {
  constructor (complete, { system = PROMPTS.judge, maxInput = 12000 } = {}) {
    this.name = 'prompt'
    this.complete = complete
    this.system = system
    this.maxInput = maxInput
  }

  message (input, questions) {
    const lines = ['TEXT:', fit(input, this.maxInput), '', 'QUESTIONS:']
    for (const question of questions) {
      if (question.type === 'predicate') {
        lines.push(`- "${question.name}" (yes/no): ${question.instructions}`)
      } else if (question.type === 'choice') {
        const options = question.options.map(([value, text]) => text ? `${value} = ${text}` : value).join('; ')
        lines.push(`- "${question.name}" (choice): ${question.instructions} Values: ${options}`)
      } else {
        const levels = question.levels.map(([label, text]) => text ? `${label} = ${text}` : label).join('; ')
        lines.push(`- "${question.name}" (score, lowest first): ${question.instructions} Labels: ${levels}`)
      }
    }
    return lines.join('\n')
  }

  /** The answers in a reply, by question name. */
  parse (reply, questions) {
    const data = jsonIn(reply, '{', { floats: true })
    if (!isTable(data)) return {}
    const answers = {}
    for (const question of questions) {
      const item = Object.hasOwn(data, question.name) ? data[question.name] : undefined
      if (!isTable(item)) continue
      const reason = py.slice(py.str(Object.hasOwn(item, 'reason') ? item.reason : ''), 0, 300)
      let picked, confidence
      try {
        if (question.type === 'predicate') {
          if (!Object.hasOwn(item, 'probability')) continue
          const p = py.min(1.0, py.max(0.0, py.float(item.probability)))
          answers[question.name] = new Answer(question.name, new Map([['true', p], ['false', 1 - p]]), py.max(p, 1 - p),
            this.name, reason)
          continue
        }
        const field = question.type === 'choice' ? 'choice' : 'level'
        if (!Object.hasOwn(item, field)) continue
        picked = py.str(item[field])
        confidence = py.min(1.0, py.max(0.0, py.float(Object.hasOwn(item, 'confidence') ? item.confidence : 0.7)))
      } catch (error) {
        if (error instanceof TypeError || error instanceof py.ValueError) continue
        throw error
      }
      const labels = question.labels
      if (!labels.includes(picked)) continue
      // The picked label stays the most likely even when the model is unsure (a share of at least 2 / (n + 1) puts
      // it above every other); the stated confidence is kept as it was.
      const share = py.max(confidence, 2 / (labels.length + 1))
      const rest = (1 - share) / (labels.length - 1)
      const probabilities = normalized(new Map(labels.map(label => [label, label === picked ? share : rest])), labels)
      answers[question.name] = new Answer(question.name, probabilities, confidence, this.name, reason)
    }
    return answers
  }

  async decide (input, questions) {
    return this.parse(await ask(this.complete, this.system, this.message(input, questions)), questions)
  }
}

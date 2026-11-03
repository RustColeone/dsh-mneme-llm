// The `dsh-mneme-llm` command: look inside a memory file, fix it by hand, move it, or serve it over MCP. A port of
// mneme_llm/cli.py, under a name of its own so that Python's `mneme-llm` can be installed beside it.
//
//     dsh-mneme-llm --db companion.db --space whale_chan notes discord:42
//     dsh-mneme-llm recall discord:42 "考试" --explain        dsh-mneme-llm relate discord:42 creator
//     dsh-mneme-llm alias discord:42 鲸酱        dsh-mneme-llm relations
//     dsh-mneme-llm export > backup.json        dsh-mneme-llm import backup.json --into other_space
//     dsh-mneme-llm config template > companion.toml        dsh-mneme-llm --config companion.toml config show
import fs from 'node:fs'
import { DEFAULTS, toToml, written } from './config.js'
import { noon, stamp } from './dates.js'
import { serve } from './mcp.js'
import { KINDS } from './memory.js'
import { Mneme, VERSION } from './mneme.js'
import * as py from './python.js'
import * as toml from './toml.js'
import { specs } from './tools.js'

const PROG = 'dsh-mneme-llm'
const flag = help => ({ flag: true, help })

// Each command: its help, its arguments (`name?` may be left out, `name*` takes any number), its options, and, for
// `forget`, the options of which exactly one is given.
const COMMANDS = {
  remember: { help: 'keep a note', args: ['subject', 'text'], options: { kind: { default: 'fact', choices: KINDS },
    key: {}, importance: { type: 'int', default: 3 }, date: { help: 'when it happened, YYYY-MM-DD' } } },
  recall: { help: 'what would be recalled for a query', args: ['subject', 'query'], options: {
    explain: flag('also show what was skipped and why'),
    meaning: flag('use the meaning tiers too (OpenAI embeddings with OPENAI_API_KEY)') } },
  context: { help: 'the block a system prompt would get', args: ['subject', 'query?'],
    options: { 'user-name': { help: 'how the header names the person' } } },
  notes: { help: 'every live note of a subject', args: ['subject'], options: { kind: { choices: KINDS } } },
  history: { help: 'every version a key has had', args: ['subject', 'key'] },
  forget: { help: 'remove a note', args: ['subject'], options: { id: { type: 'int' }, key: {} }, one: ['id', 'key'] },
  erase: { help: 'delete everything about a subject, for good', args: ['subject'],
    options: { yes: flag('really do it') } },
  subjects: { help: 'who this space remembers' },
  recalls: { help: 'what was recalled for a subject lately, and why', args: ['subject'],
    options: { limit: { type: 'int', default: 10 } } },
  profile: { help: "show or set a subject's profile card", args: ['subject', 'text?'] },
  relate: { help: 'show or set who a subject is to the companion', args: ['subject', 'role?'], options: {
    closeness: { type: 'float', help: "0-100, within the role's band (its start otherwise)" },
    remove: flag('take the role away') } },
  relations: { help: 'everyone with a role, closest first' },
  alias: { help: 'show or set what a subject calls the companion', args: ['subject', 'alias?'],
    options: { remove: flag('take the alias away') } },
  link: { help: 'one person under another account: what each kept becomes one', args: ['subject', 'person'] },
  unlink: { help: 'an account is its own person again (what was joined stays)', args: ['subject'] },
  people: { help: 'every account linked to a person' },
  mood: { help: "a subject's mood and its timeline", args: ['subject'], options: { reset: flag() } },
  export: { help: 'the whole space as JSON', options: { out: { help: 'a file (stdout otherwise)' } } },
  import: { help: 'add an export to this file', args: ['file'], options: {
    into: { help: "a space other than the export's own" },
    'with-config': flag("apply the export's config too (its prompts are instructions to your models)") } },
  config: { help: "the companion's config in this file: settings, roles, prompts", actions: {
    show: { help: 'the config as TOML', args: ['prefix?'],
      options: { origins: flag('where each stored value came from, instead') } },
    template: { help: "this version's defaults, as a config file to start from" },
    set: { help: 'set one key', args: ['key', 'value?'],
      options: { file: { help: "the value is this file's text (for a prompt)" } } },
    apply: { help: 'apply a config file to this companion (every key it gives)', args: ['file'] },
    defaults: { help: "load this version's defaults (every key, or the keys given)", args: ['keys*'] },
    check: { help: 'keys with a newer default, unknown keys, values that do not pass' } } },
  tools: { help: 'print the tool definitions for a model API',
    options: { style: { default: 'openai', choices: ['openai', 'responses', 'anthropic', 'gemini', 'mcp'] } } },
  mcp: { help: 'serve the tools over MCP (stdio)', options: { subject: { help: 'bind every call to this person' } } }
}

const TOP = { help: 'Memory and mood for AI companions, for any LLM.', options: {
  db: { env: 'MNEME_LLM_DB', default: 'mneme.db', help: 'the memory file' },
  space: { env: 'MNEME_LLM_SPACE', default: 'default', help: 'whose memory (an app)' },
  config: { env: 'MNEME_LLM_CONFIG', help: 'a config file (TOML) for a companion this file does not know yet' },
  'display-language': { env: 'MNEME_LLM_DISPLAY_LANGUAGE',
    help: 'the language of what is shown (headers, dates, moods); the companion\'s own otherwise' },
  version: { ...flag("show the program's version number and exit"), exits: true } }, commands: COMMANDS }

/** A command line that does not parse: the usage of the part it is in, and what is wrong. */
class Usage extends Error {
  constructor (message, prog, spec) {
    super(message)
    this.prog = prog
    this.spec = spec
  }
}

const camel = name => name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase())
const metavar = name => name.replaceAll('-', '_').toUpperCase()
const shownOption = (name, option) => option.flag ? `--${name}`
  : `--${name} ${option.choices ? `{${option.choices.join(',')}}` : metavar(name)}`
const bare = arg => arg.replace(/[?*]$/, '')

function usage (prog, spec) {
  const options = Object.entries(spec.options || {}), one = spec.one || []
  const parts = ['[-h]', ...options.filter(([name]) => !one.includes(name)).map(([name, option]) =>
    `[${shownOption(name, option)}]`)]
  if (one.length) parts.push(`(${one.map(name => shownOption(name, spec.options[name])).join(' | ')})`)
  for (const arg of spec.args || []) {
    parts.push(arg.endsWith('?') ? `[${bare(arg)}]` : arg.endsWith('*') ? `[${bare(arg)} ...]` : arg)
  }
  const choices = spec.commands || spec.actions
  if (choices) parts.push(`{${Object.keys(choices).join(',')}} ...`)
  return `usage: ${prog} ${parts.join(' ')}`
}

function helpOf (prog, spec) {
  const lines = [usage(prog, spec), '', spec.help]
  const row = (name, help = '') => !help ? `  ${name}`
    : `  ${name.padEnd(22)}${name.length > 21 ? `\n${' '.repeat(24)}` : ''}${help}`
  const choices = spec.commands || spec.actions
  if (spec.args || choices) {
    lines.push('', 'positional arguments:')
    if (choices) lines.push(...Object.entries(choices).map(([name, inner]) => row(name, inner.help)))
    for (const arg of spec.args || []) lines.push(row(bare(arg)))
  }
  lines.push('', 'options:', row('-h, --help', 'show this help message and exit'))
  for (const [name, option] of Object.entries(spec.options || {})) {
    lines.push(row(shownOption(name, option), option.help))
  }
  return lines.join('\n') + '\n'
}

const isOption = token => token.startsWith('-') && token !== '-' && !/^-\.?\d/.test(token)

/** The values of one part of the command line, into `found`; what it does not know goes back to the part above. */
function parsePart (tokens, prog, spec, found, env = {}) {
  const options = spec.options || {}, given = [], positional = [], left = []
  for (const [name, option] of Object.entries(options)) {
    found[camel(name)] = option.flag ? false : (option.env ? env[option.env] : undefined) ?? option.default ?? null
  }
  let index = 0, ended = false
  for (; index < tokens.length; index++) {
    const token = tokens[index]
    if (ended || !isOption(token)) {
      if ((spec.commands || spec.actions) && !ended && positional.length === (spec.args || []).length) break
      positional.push(token)
      continue
    }
    if (token === '--') {
      ended = true
      continue
    }
    if (token === '-h' || token === '--help') return { help: helpOf(prog, spec) }
    const [written, attached] = token.startsWith('--') && token.includes('=') ? [token.slice(0, token.indexOf('=')),
      token.slice(token.indexOf('=') + 1)] : [token, null]
    const names = Object.keys(options).filter(name => `--${name}` === written)
    const matched = names.length ? names : written.startsWith('--') && written.length > 2 ? Object.keys(options)
      .filter(name => `--${name}`.startsWith(written)) : []
    if (matched.length !== 1) {
      if (matched.length > 1) {
        throw new Usage(`ambiguous option: ${written} could match ${matched.map(name => `--${name}`).join(', ')}`, prog,
          spec)
      }
      left.push(token)
      continue
    }
    const name = matched[0], option = options[name]
    for (const other of spec.one || []) {
      if (other !== name && given.includes(other) && (spec.one || []).includes(name)) {
        throw new Usage(`argument --${name}: not allowed with argument --${other}`, prog, spec)
      }
    }
    given.push(name)
    if (option.exits) return { [camel(name)]: true }
    if (option.flag) {
      if (attached !== null) throw new Usage(`argument --${name}: ignored explicit argument '${attached}'`, prog, spec)
      found[camel(name)] = true
      continue
    }
    let value = attached
    if (value === null) {
      if (index + 1 >= tokens.length || isOption(tokens[index + 1])) {
        throw new Usage(`argument --${name}: expected one argument`, prog, spec)
      }
      value = tokens[++index]
    }
    found[camel(name)] = typed(value, name, option, prog, spec)
  }
  const args = spec.args || []
  for (const [place, arg] of args.entries()) {
    const name = camel(bare(arg))
    if (arg.endsWith('*')) found[name] = positional.splice(place)
    else found[name] = place < positional.length ? positional[place] : arg.endsWith('?') ? null : undefined
  }
  const missing = args.filter(arg => found[camel(bare(arg))] === undefined).map(bare)
  if (spec.commands || spec.actions) {
    const choices = spec.commands || spec.actions, key = spec.commands ? 'command' : 'action'
    const name = tokens[index]
    if (name === undefined) missing.push(key)
    else if (!Object.hasOwn(choices, name)) {
      throw new Usage(`argument ${key}: invalid choice: ${py.reprString(name)} (choose from ` +
        `${Object.keys(choices).join(', ')})`, prog, spec)
    } else {
      found[key] = name
      const inner = parsePart(tokens.slice(index + 1), `${prog} ${name}`, choices[name], found)
      if (inner.help) return inner
      left.push(...inner.left)
    }
  } else left.push(...positional.slice(args.filter(arg => !arg.endsWith('*')).length))
  if (missing.length) throw new Usage(`the following arguments are required: ${missing.join(', ')}`, prog, spec)
  if (spec.one && !spec.one.some(name => given.includes(name))) {
    throw new Usage(`one of the arguments ${spec.one.map(name => `--${name}`).join(' ')} is required`, prog, spec)
  }
  return { left }
}

function typed (value, name, option, prog, spec) {
  if (option.type) {
    try {
      return option.type === 'int' ? py.int(value) : py.float(value)
    } catch (error) {
      if (!(error instanceof py.ValueError)) throw error
      throw new Usage(`argument --${name}: invalid ${option.type} value: ${py.reprString(value)}`, prog, spec)
    }
  }
  if (option.choices && !option.choices.includes(value)) {
    throw new Usage(`argument --${name}: invalid choice: ${py.reprString(value)} (choose from ` +
      `${option.choices.join(', ')})`, prog, spec)
  }
  return value
}

/** What the command line asks for: its values, or `help`, the text to show. */
export function parse (argv, env = process.env) {
  const found = {}
  const done = parsePart(argv, PROG, TOP, found, env)
  if (done.help || done.version) return done
  if (done.left.length) throw new Usage(`unrecognized arguments: ${done.left.join(' ')}`, PROG, TOP)
  return found
}

/** What Python's command reports in one line rather than a traceback: a wrong value, a file it could not use. */
const told = error => error instanceof py.ValueError || typeof error?.code === 'string' || error?.constructor === Error
const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Run the command line `argv`; the exit status. */
export async function main (argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr,
  stdin = process.stdin, env = process.env } = {}) {
  const print = (text = '', end = '\n') => stdout.write(text + end)
  let args
  try {
    args = parse(argv, env)
  } catch (error) {
    if (!(error instanceof Usage)) throw error
    stderr.write(`${usage(error.prog, error.spec)}\n${error.prog}: error: ${error.message}\n`)
    return 2
  }
  if (args.help) {
    print(args.help, '')
    return 0
  }
  if (args.version) {
    print(`${PROG} ${VERSION}`)
    return 0
  }
  if (args.command === 'tools') {
    print(py.dumps(specs(args.style), { ascii: false, indent: 2 }))
    return 0
  }
  if (args.command === 'config' && args.action === 'template') {
    print(toToml(DEFAULTS), '')
    return 0
  }
  let space = args.space
  if (args.command === 'import') { // into --into, or back into the space it came from
    try {
      args.data = py.loads(fs.readFileSync(args.file, 'utf8'))
    } catch (error) {
      if (!told(error)) throw error
      stderr.write(`${error.message}\n`)
      return 2
    }
    space = args.into || py.str(isTable(args.data) && py.truthy(args.data.space) ? args.data.space : args.space)
  }
  let m
  try {
    m = new Mneme(args.db, space, { config: args.config, displayLanguage: args.displayLanguage || undefined,
      embed: args.command === 'mcp' || args.meaning === true, memoryLanguage: null })
  } catch (error) { // a config file with a wrong key, a file of another schema
    if (!told(error)) throw error
    stderr.write(`${error.message}\n`)
    return 2
  }
  if ((m.store.meta('terms_version') || '').endsWith('+jieba')) {
    stderr.write("note: this file's search terms were made with jieba, which this port does not have; they will be " +
      'rebuilt without it\n')
  }
  try {
    return await run(m, args, { print, stderr, stdin, stdout })
  } finally {
    m.close()
  }
}

async function run (m, args, { print, stderr, stdin, stdout }) {
  const memory = m.memory, zone = memory.zone
  const fail = text => {
    stderr.write(`${text}\n`)
    return 2
  }
  const command = args.command
  if (command === 'remember') {
    const happened = args.date ? noon(args.date, zone) : null
    if (args.date && happened === null) return fail('--date is a day from 1970 to 2999, written YYYY-MM-DD')
    const [outcome, note] = memory.keep(args.subject, args.text, { kind: args.kind, key: args.key,
      importance: args.importance, happenedAt: happened, source: 'cli' })
    print(note ? `${outcome} #${note.id}` : outcome)
  } else if (command === 'recall') {
    const found = args.meaning ? await memory.arecall(args.subject, args.query, { log: false })
      : memory.recall(args.subject, args.query, { log: false })
    print(args.explain ? found.explain() : found.chosen.map(item => `#${item.note.id} ${item.note.text}`).join('\n'))
  } else if (command === 'context') {
    print(m.prompt(args.subject, args.query ?? '', { userName: args.userName, mark: false }) || '(nothing to say)')
  } else if (command === 'notes') {
    for (const note of memory.notes(args.subject, { kinds: args.kind ? [args.kind] : null })) {
      print(`#${note.id} ${stamp(note.happenedAt, zone)} ${note.kind}${note.key ? ` ${note.key}` : ''} ` +
        `(${note.importance}) ${note.text}`)
    }
  } else if (command === 'history') {
    for (const note of memory.history(args.subject, args.key)) {
      const state = note.deletedAt ? 'removed' : note.supersededBy ? 'replaced' : 'live'
      print(`#${note.id} ${stamp(note.createdAt, zone)} ${state}: ${note.text}`)
    }
  } else if (command === 'forget') {
    print(`forgot ${memory.forget(args.subject, { id: args.id, key: args.key })}`)
  } else if (command === 'erase') {
    if (!args.yes) {
      return fail('this deletes every note, every exchange, the surface, the first prompt, the profile, the mood, ' +
        'the role, the alias and the links of the subject; add --yes')
    }
    print(`erased ${m.erase(args.subject)} notes`)
  } else if (command === 'subjects') {
    print(m.everyone().join('\n'))
  } else if (command === 'recalls') {
    for (const entry of memory.recalls(args.subject, args.limit)) {
      const chosen = entry.chosen.map(([id, why]) => `#${id} (${why})`).join(', ')
      print(`${stamp(entry.at, zone)} ${py.reprString(entry.query)}: ${chosen || '(nothing)'}`)
    }
  } else if (command === 'profile') {
    if (args.text !== null) memory.setProfile(args.subject, args.text)
    print(memory.profile(args.subject) || '(no profile)')
  } else if (command === 'relate') {
    if (args.remove) {
      print(m.relations.remove(args.subject) ? 'removed' : '(no role)')
      return 0
    }
    let role = args.role
    if (role === null && args.closeness !== null) { // a new closeness within the present role
      const present = m.relations.get(args.subject)
      if (!present) return fail('give a role with --closeness: this subject has none')
      role = present.role
    }
    if (role) {
      try {
        m.relate(args.subject, role, { closeness: args.closeness })
      } catch (error) {
        if (!(error instanceof py.ValueError)) throw error
        return fail(error.message)
      }
    }
    const found = m.relations.get(args.subject)
    print(found ? relationship(found, zone) : '(no role)')
  } else if (command === 'relations') {
    print(m.relations.all().map(found => relationship(found, zone)).join('\n') || '(nobody has a role)')
  } else if (command === 'alias') {
    if (args.remove) {
      print(m.aliases.remove(args.subject) ? 'removed' : '(no alias)')
      return 0
    }
    if (args.alias !== null) {
      try {
        m.alias(args.subject, args.alias)
      } catch (error) {
        if (!(error instanceof py.ValueError)) throw error
        return fail(error.message)
      }
    }
    print(m.aliases.get(args.subject) || '(no alias)')
  } else if (command === 'link') {
    try {
      print(`${args.subject} is ${m.link(args.subject, args.person)}`)
    } catch (error) {
      if (!(error instanceof py.ValueError)) throw error
      return fail(error.message)
    }
  } else if (command === 'unlink') {
    print(m.unlink(args.subject) ? 'unlinked' : '(not linked)')
  } else if (command === 'people') {
    print(Object.entries(m.people.all()).map(([subject, person]) => `${subject} -> ${person}`).join('\n') ||
      '(no links)')
  } else if (command === 'mood') {
    if (args.reset) m.mood.reset(args.subject)
    print(m.mood.describe(args.subject))
    for (const event of m.mood.timeline(args.subject, 15)) {
      const delta = py.fixed(event.delta, 1)
      print(`  ${stamp(event.at, zone)} ${py.fixed(event.value, 1).padStart(5)} (${delta.startsWith('-') ? '' : '+'}` +
        `${delta}) [${event.source}/${event.judge}] ${event.reason}`)
    }
  } else if (command === 'export') {
    const text = py.dumps(exported(m), { ascii: false, indent: 1 })
    if (args.out) fs.writeFileSync(args.out, text)
    else print(text)
  } else if (command === 'import') {
    try {
      print(`imported ${m.importData(args.data, { config: args.withConfig })} notes into ${m.space}`)
    } catch (error) {
      if (!(error instanceof TypeError || told(error))) throw error
      return fail(error.message)
    }
  } else if (command === 'config') {
    try {
      return configure(m.config, args, print, fail)
    } catch (error) {
      if (!told(error)) throw error
      return fail(error.message)
    }
  } else if (command === 'mcp') {
    await serve(m, args.subject, { stdin, stdout })
  }
  return 0
}

function configure (config, args, print, fail) {
  if (args.action === 'show') {
    const prefix = args.prefix ?? ''
    if (args.origins) {
      print(config.rows().filter(row => row.key.startsWith(prefix)).map(row => `${row.key}: ${row.origin}`).join('\n'))
    } else print(config.toToml(prefix), '')
  } else if (args.action === 'set') {
    let value
    if (args.file) value = fs.readFileSync(args.file, 'utf8').replace(/\r\n?/g, '\n').replace(/\n$/, '')
    else if (args.value === null) return fail('give a value, or --file')
    else value = tomlValue(args.value, typeof (Object.hasOwn(DEFAULTS, args.key) ? DEFAULTS[args.key] : '') ===
      'string')
    config.set(args.key, value)
    print(`set ${args.key}`)
  } else if (args.action === 'apply') {
    print(`applied ${config.apply(args.file)} keys`)
  } else if (args.action === 'defaults') {
    print(`loaded ${config.loadDefaults(args.keys.length ? args.keys : null)} defaults`)
  } else if (args.action === 'check') {
    const newer = config.newerDefaults()
    print(newer.length ? `newer defaults: ${newer.join(', ')} (\`${PROG} config defaults KEY…\` loads them)`
      : "every stored default is this version's")
    for (const error of Object.values(config.invalid)) print(`not valid, so the default is used: ${error}`)
    if (config.unknown.length) print(`unknown to this version (kept, not used): ${config.unknown.join(', ')}`)
  }
  return 0
}

/** A value as TOML reads it (0.5, true, "text", {user = 1.0}), or else the text itself. For a key that holds text, a
 * value is text unless it is quoted ("42" and 42 are both the text 42). */
function tomlValue (text, textKey) {
  let value
  try {
    value = toml.loads(`value = ${text}`).value
  } catch (error) {
    if (error instanceof toml.TOMLDecodeError) return text
    throw error
  }
  return textKey && typeof value !== 'string' ? text : value
}

const relationship = (found, zone) =>
  `${found.subject}: ${found.role}, closeness ${py.fixed(found.closeness, 0)} (since ${stamp(found.since, zone)})`

/** The space as Python's json writes its export: what Python holds as floats (the file's real columns, and config
 * values its rules make floats) written as floats. */
function exported (m) {
  const data = m.exportData(), store = m.store
  const float = value => Number.isInteger(value) ? new py.PyFloat(value) : value
  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows) || table === 'config') continue
    const reals = store.rows("select name from pragma_table_info(?) where lower(type) = 'real'", [table])
    for (const row of rows) for (const { name } of reals) if (Object.hasOwn(row, name)) row[name] = float(row[name])
  }
  for (const row of data.config) row.value = py.loads(written(row.key, row.value), { floats: true })
  data.exported_at = float(data.exported_at)
  return data
}

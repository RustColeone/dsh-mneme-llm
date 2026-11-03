// Config files: TOML as Python's tomllib reads it, a companion seeded from one, and the config written back as one.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Config, DEFAULTS, load, toToml } from '../lib/config.js'
import { Mneme } from '../lib/mneme.js'
import * as py from '../lib/python.js'
import { Store } from '../lib/store.js'
import * as toml from '../lib/toml.js'

const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-toml-'))

test('tables, arrays of tables, strings of every kind, numbers, inline tables and comments', () => {
  const found = toml.loads(`# top
title = "x" # trailing
[a.b]
c = 'literal \\n'
d = """
two
lines"""
"e.f" = { g = 1, h = [1, 2.5, -inf] }
[[rows]]
n = 0x10
[[rows]]
n = 1_000
`)
  assert.deepEqual(found, { title: 'x', a: { b: { c: 'literal \\n', d: 'two\nlines', 'e.f': { g: 1, h: [1, 2.5,
    -Infinity] } } }, rows: [{ n: 16 }, { n: 1000 }] })
  assert.throws(() => toml.loads('a = 1\na = 2\n'), { name: 'TOMLDecodeError',
    message: 'Cannot overwrite a value (at line 2, column 6)' })
  assert.ok(toml.loads('d = 1979-05-27').d instanceof toml.TomlDate)
})

test('a companion takes its config file once; a file that is not TOML says so; one with a wrong value is refused whole',
  () => {
    const where = folder(), file = path.join(where, 'whale.toml')
    fs.writeFileSync(file, '[companion]\nname = "大肥鱼"\ndisplay_language = "zh"\n[mood]\nweights = { user = 2 }\n' +
      '[messages.zh]\nnotes.header = "关于{who}的笔记"\n')
    const m = new Mneme(path.join(where, 'm.db'), 'whale', { config: file, embed: false })
    assert.deepEqual([m.companionName, m.displayLanguage], ['大肥鱼', 'zh'])
    assert.equal(m.store.row("select value from config where key = 'mood.weights'").value, '{"user":2.0}')
    assert.equal(m.config.get('messages.zh.notes.header'), '关于{who}的笔记')
    fs.writeFileSync(file, '[mood]\nstep = = 3\n')
    assert.throws(() => m.config.apply(file), new py.ValueError(`${file}: not valid TOML (Invalid value (at line 2, ` +
      'column 8))'))
    fs.writeFileSync(file, '[mood]\nstep = 3\nbaseline = 500\n')
    assert.throws(() => m.config.apply(file), /mood.baseline: a number from 0 to 100/)
    assert.equal(m.config.get('mood.step'), 6)
    m.close()
    assert.throws(() => load(path.join(where, 'none.toml')), { code: 'ENOENT' })
  })

test('the config written as a file reads back as the same config', () => {
  const store = new Store(':memory:'), config = new Config(store, 's', () => 1.0)
  config.seed({ companion: { name: 'Momo' }, roles: [{ key: 'teacher', floor: 40, start: 60 }],
    prompts: { reflect: 'About {user}:\n"""quoted"""\n{notes}' } })
  const text = config.toToml()
  const other = new Config(new Store(':memory:'), 's', () => 1.0)
  other.seed(toml.loads(text))
  assert.deepEqual(other.values(), config.values())
  assert.equal(other.toToml(), text)
  assert.match(toToml(DEFAULTS), /^# mneme-llm config\./)
  assert.match(config.toToml('mood.'), /\[mood\]\nbaseline = 70\.0\n/)
  store.close()
})

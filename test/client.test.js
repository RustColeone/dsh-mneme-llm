// The client half, loaded as DSH's module loader loads a plugin bundle, with stand-ins for React and the page: what it
// registers where, the colour of each end, and that her star map and its labels stay inside their square.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { BARS, ENDS } from '../lib/gut.js'

const SOURCE = fs.readFileSync(new URL('../plugin/client.js', import.meta.url), 'utf8')

/** The bundle's exports, with React as elements to look at and a page with only a head. */
function load () {
  let loaded = null
  const element = (type, props, ...children) => ({ type, props: props || {}, children })
  const react = { createElement: element, useState: value => [value, () => {}], useRef: () => ({ current: null }),
    useEffect: () => {}, useMemo: work => work() }
  const page = { createElement: () => ({ dataset: {}, remove: () => {} }), head: { appendChild: () => {} } }
  vm.runInNewContext(SOURCE, { window: { __ModuleLoader__: { load: entry => { loaded = entry } } }, document: page })
  assert.equal(loaded.id, 'dsh-mneme-llm') // (the bare package name: DSH ties it to the plugin's row)
  return loaded.factory(name => {
    assert.equal(name, 'react') // (all it needs from the page)
    return react
  })
}

test('the bundle registers her settings, her sidebar tab and a button to open it', () => {
  const client = load()
  assert.deepEqual([...client.inject], ['slots', 'locale']) // (made in the bundle's own realm)
  const slots = [], tabs = [], opened = [], words = []
  const scope = {
    effect: work => work(),
    locale: { register: (name, dictionaries) => { words.push([name, Object.keys(dictionaries)]) }, bind: () => k => k },
    slots: { inject: (name, work) => work(), register: (options, body) => { slots.push([options, body]) } },
    sidebarRightTabs: { register: definition => { tabs.push(definition) } },
    sidebarRight: { openTab: kind => { opened.push(kind) } },
    inject: (names, work) => work(scope)
  }
  client.apply(scope)
  assert.deepEqual(words, [['mneme-llm', ['en', 'zh']]])
  assert.deepEqual(slots.map(([options]) => [options.name, options.key ?? options.id]), [
    ['plugins.bundle.config', 'dsh-mneme-llm'], ['sidebar.right.pane.tab', 'dsh-mneme-llm'],
    ['conversation.session.header.actions', 'mneme-llm-gut']])
  const [tab] = tabs
  assert.deepEqual([tab.id, tab.kind, tab.title(), tab.guide[0].title()], ['dsh-mneme-llm', client.KIND, 'tab.title',
    'tab.title'])
  const [[, settings], , [, open]] = slots
  assert.equal(settings({ view: 'summary', t: key => key }), 'settings.summary')
  open({ t: key => key }).props.onClick()
  assert.deepEqual(opened, [client.KIND])
  assert.deepEqual(Object.keys(client.ZH).sort(), Object.keys(client.EN).sort())
  assert.equal(client.format('{a} of {b}, {c}', { a: 3, b: 'x' }), '3 of x, {c}')
  assert.deepEqual(Object.values(client.ROUTES), ['api/mneme-llm.gut', 'api/mneme-llm.starmap', 'api/mneme-llm.change'])
})

test('each page shows one language: English words on an English page, Chinese names on a Chinese one', () => {
  const client = load()
  const han = /[\u3400-\u9fff]/
  assert.deepEqual(Object.entries(client.EN).filter(([, words]) => han.test(words)), [])
  assert.deepEqual(Object.keys(client.ZH).filter(key => client.ZH[key] === client.EN[key]), ['san'])
  const view = { ends: [{ end: 'sad', zh: '难过' }] }, bar = { bar: 'mood', zh: '心情' }
  const en = key => client.format(client.EN[key] ?? key), zh = key => client.format(client.ZH[key] ?? key)
  assert.deepEqual([client.endName(en, view, 'sad'), client.barName(en, bar)], ['sad', 'mood'])
  assert.deepEqual([client.endName(zh, view, 'sad'), client.barName(zh, bar)], ['难过', '心情'])
  assert.equal(client.endName(zh, view, 'happy'), 'happy') // (a name the page was not sent stays as it is)
})

test('the settings page renders, in each language, with a real view: lists, one editor each, and her sides as tags',
  async () => {
    const { Gut } = await import('../lib/gut.js')
    const { view } = await import('../plugin/panel.js')
    const { Mneme } = await import('../lib/mneme.js')
    const where = fs.mkdtempSync(path.join(os.tmpdir(), 'client-'))
    const gut = new Gut(path.join(where, 'g.db'))
    gut.wake()
    const form = { people: [], gender: [], topic: ['rain'], event: ['rained'], sender_feels: 'tired', toward_you: 'none' }
    for (let i = 0; i < 6; i++) gut.teach(i % 2 ? 'owner' : 'qq:2', 'zh', form, { feel: { sad: 0.4 }, mood: 1 }, 85, [])
    gut.writeSide('御姐', '你从容。', 3)
    gut.lockSide('御姐', { often: 0.5 })
    const memory = new Mneme(path.join(where, 'm.db'), 's', { embed: false, memoryLanguage: null })
    memory.relate('owner', 'creator')
    const shown = view(gut, { you: 'owner', memory })
    gut.close()
    memory.close()
    for (const [words, expected] of [['EN', ['People she knows', 'Lock her in this side', 'creator', '御姐']],
      ['ZH', ['她认识的人', '把她锁在这一面', '创造者', '御姐']]]) {
      const states = [shown]
      const element = (type, props, ...children) => typeof type === 'function'
        ? type({ ...(props || {}), children }) : { type, props: props || {}, children }
      const react = { createElement: element, useRef: () => ({ current: null }), useEffect: () => {}, useMemo: w => w(),
        useState: init => [states.length ? states.shift() : typeof init === 'function' ? init() : init, () => {}] }
      let loaded = null
      vm.runInNewContext(SOURCE, { window: { __ModuleLoader__: { load: entry => { loaded = entry } } },
        document: { createElement: () => ({ dataset: {}, remove: () => {} }), head: { appendChild: () => {} } },
        getComputedStyle: () => ({ color: 'rgb(20, 20, 20)' }) })
      const client = loaded.factory(() => react)
      let Settings = null
      client.apply({ effect: () => {}, locale: { register: () => {}, bind: () => key => key }, inject: () => {},
        slots: { register: (options, component) => component,
          inject: (name, make) => { const made = make(); if (name === 'plugins.bundle.config') Settings = made } } })
      const t = (key, values) => client.format(client[words][key] ?? key, values)
      const texts = [], kinds = []
      const walk = node => {
        if (node === null || node === undefined || node === false) return
        if (Array.isArray(node)) return node.forEach(walk)
        if (typeof node !== 'object') return texts.push(String(node))
        kinds.push(node.props.className || '')
        walk(node.children)
      }
      walk(Settings({ view: 'page', t }))
      const all = texts.join('|')
      for (const text of expected) assert.ok(all.includes(text), `${words}: ${text}`)
      assert.equal(kinds.filter(kind => kind === 'mnl-edit').length, 3) // one editor each: a feeling, a person, a side
      assert.equal(kinds.filter(kind => kind === 'mnl-list').length, 2) // lists: her feelings, the people she knows
      assert.ok(kinds.some(kind => kind.split(' ').includes('mnl-tag'))) // her sides, as tags
    }
  })

test('each end has its bar\'s colour, the first end deeper; her map and its names fit their square', () => {
  const client = load()
  const bars = BARS.map(([bar, zh, left, right]) => ({ bar, zh, ends: [left ? left[0] : null, right[0]] }))
  for (const dark of [false, true]) {
    const shades = client.COLOURS[dark ? 'dark' : 'light']
    assert.equal(new Set([...shades.deep, ...shades.light]).size, 28)
    assert.equal(client.endColour(bars, 'sad', dark), shades.deep[0])
    assert.equal(client.endColour(bars, 'happy', dark), shades.light[0])
    assert.equal(client.endColour(bars, 'aching', dark), shades.light[12])
    assert.equal(client.endColour(bars, 'suspicious', dark), shades.deep[13])
  }
  const half = 160, widths = ENDS.map((end, k) => k === 4 ? 50 : 20)
  for (const arms of [ENDS.map(() => 1), ENDS.map(() => 2.4), ENDS.map((end, k) => k % 2 ? 0.5 : 2.4)]) {
    const R = client.baseRadius(half, arms, widths)
    arms.forEach((arm, k) => {
      const out = Math.min(2.2, Math.min(2.0, arm) + 0.12) * R
      assert.ok(out <= 2.2 * R + 1e-9 && out + widths[k] <= half, `${k}: ${out + widths[k]} against ${half}`)
    })
  }
})

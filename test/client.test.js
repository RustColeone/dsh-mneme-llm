// The client half, loaded as DSH's module loader loads a plugin bundle, with stand-ins for React and the page: what it
// registers where, the colour of each end, and that her star map and its labels stay inside their square.
import assert from 'node:assert/strict'
import fs from 'node:fs'
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

test('each end has its bar\'s colour, the first end deeper; her map and its names fit their square', () => {
  const client = load()
  const bars = BARS.map(([bar, zh, left, right]) => ({ bar, zh, ends: [left ? left[0] : null, right[0]] }))
  for (const dark of [false, true]) {
    const shades = client.COLOURS[dark ? 'dark' : 'light']
    assert.equal(new Set([...shades.deep, ...shades.light]).size, 26)
    assert.equal(client.endColour(bars, 'sad', dark), shades.deep[0])
    assert.equal(client.endColour(bars, 'happy', dark), shades.light[0])
    assert.equal(client.endColour(bars, 'aching', dark), shades.light[12])
  }
  const half = 160, widths = ENDS.map((end, k) => k === 4 ? 50 : 20)
  for (const arms of [ENDS.map(() => 1), ENDS.map(() => 2.4), ENDS.map((end, k) => k % 2 ? 0.5 : 2.4)]) {
    const R = client.baseRadius(half, arms, widths)
    arms.forEach((arm, k) => {
      const out = Math.min(2.2, Math.min(2.0, arm) + 0.12) * R
      assert.ok(out <= 2.2 * R + 1e-9 && out + widths[k] <= half, `${k}: ${out + widths[k]} against ${half}`)
    })
  }
  const drawn = { people: [{ px: 50, py: 50, size: 6, person: { subject: 'owner' } }],
    points: [{ px: 10, py: 10, key: 'a' }, { px: 100, py: 100, key: 'b' }] }
  assert.equal(client.nearest(drawn, 58, 50).person.subject, 'owner')
  assert.equal(client.nearest(drawn, 104, 103).key, 'b')
  assert.equal(client.nearest(drawn, 200, 200), null)
})

// The plugin's client half, for DSH's web page, which loads it as a plugin bundle (React is all it needs): her gut's
// settings on the plugin's page under Plugins, and a tab in the right sidebar, Her gut (她的直觉), with her star map,
// her bars lately against usual, SAN and self-esteem, how grown up she is and the people she knows. A button in the
// conversation's header opens the tab. Everything is read and changed through the plugin's routes on DSH's own API
// (plugin/panel.js), which DSH signs people in to.
window.__ModuleLoader__.load({
  id: 'dsh-mneme-llm',
  factory: require => {
    const module = { exports: {} }
    const imported = require('react')
    const React = typeof imported.createElement === 'function' ? imported : imported.default
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    const PACKAGE = 'dsh-mneme-llm'
    const NS = 'mneme-llm' // the plugin's words, in DSH's locale
    const KIND = 'mneme-llm-gut' // her sidebar tab
    const ROUTES = { gut: 'api/mneme-llm.gut', starmap: 'api/mneme-llm.starmap', change: 'api/mneme-llm.change' }
    const EVERY = 5000 // how often the tab looks again, while it is in view (a lesson lands a few seconds after a turn)
    const ARM = 2.0 // an arm is drawn at most this many base radii long
    const LABELS = 2.2 // and the names of the ends no further out than this
    const MOST = 0.7 // the most of how she is with someone that is theirs alone (`MOST` in lib/gut.js)

    // One colour for each of her 13 bars, in BARS order, spread round the colour wheel so that bars side by side
    // differ; the first end of a bar is a deeper shade and the second a lighter one, stepped for each theme.
    const COLOURS = {
      dark: {
        deep: ['#ca5551', '#12976b', '#9167ca', '#a57710', '#128eaa', '#c35481', '#54932d', '#6676d8', '#c36109',
          '#13938f', '#b05bab', '#888510', '#1485d4'],
        light: ['#ffaba3', '#72ddae', '#d0b4fd', '#ecbb64', '#58d6f9', '#fea6c5', '#a1d687', '#b2c0ff', '#fdb080',
          '#4fddd7', '#f0a7ea', '#cbca69', '#91caff']
      },
      light: {
        deep: ['#972e2d', '#0c6849', '#674098', '#735100', '#0b6276', '#912d59', '#316802', '#424da5', '#884204',
          '#0f6562', '#81357d', '#5d5b0a', '#0a5c94'],
        light: ['#ce766f', '#44a87f', '#9f81cb', '#b68a37', '#22a2c0', '#c97493', '#73a25b', '#7d8cd7', '#c87e4d',
          '#0ca8a3', '#b878b3', '#99973d', '#5498d3']
      }
    }

    const EN = {
      'tab.title': 'Her gut',
      'tab.description': 'Her star map, how she feels lately, how grown up she is, and the people she knows',
      'header.open': 'Her gut',
      loading: 'Reading her gut…',
      unreachable: 'Her gut cannot be reached ({error}): the plugin is off, has not started, or keeps no gut.',
      updated: 'as of {time}',
      lessons: '{lessons} lessons',
      'map.title': 'Star map: her heart and the people she knows',
      'map.caption': 'Each dot is one thing she notices, placed toward the feeling it pulls her to; the brighter, ' +
        'the more it leans. The lines are her arms: how much more or less of each feeling she has now than when ' +
        'she was born (the ring). The big stars are people.',
      'map.counts': '{stars} brightest of {rows} · arms from her last {probed} lessons',
      'map.born': '{stars} brightest of {rows} · arms as born until 20 lessons ({probed} so far)',
      'map.star': '{key}: leans to {end} ({bright})',
      'map.person': '{who}: {lessons} lessons, {weight}% of how she is with them is theirs',
      'map.pick': 'Tap or point at a star to see what it is.',
      you: 'you',
      'bars.title': 'Lately against usual',
      'bars.hint': 'The bar is lately, the tick is usual; a two-sided bar leans from the middle toward one end.',
      san: 'SAN',
      'self-esteem': 'Self-esteem',
      usual: 'usual {value}',
      'grown.title': 'Growing up',
      'grown.age': 'Age: {age} lessons taught her heart',
      'grown.grown': '{grown}% grown up (fully at {full} lessons, five times tau {tau})',
      'grown.learning': 'Learns at {learning}% of her young pace',
      'grown.side': 'In her {side} side for {days} more days',
      'people.title': 'People she knows',
      'people.none': 'Nobody yet.',
      'people.row': '{lessons} lessons · {weight}% theirs',
      'settings.summary': 'Her gut: how fast she grows up, how hard things hit her, and each feeling by hand',
      'settings.title': 'Her gut',
      'settings.intro': 'Her gut\'s settings. A save goes to the running plugin at once and is kept in her gut ' +
        'file (gut.db); from then on these win over tau and sensitivity in the plugin\'s configuration, which only ' +
        'start a gut that has no settings of its own.',
      'settings.grown': 'Growing up',
      'settings.tau': 'tau (lessons)',
      'settings.tauHint': 'How fast her heart grows up: young, a lesson moves her heart a lot; grown up (at five ' +
        'times tau), a little. A number above 0.',
      'settings.age': 'Age: {age} lessons, {grown}% grown up, learning at {learning}% of her young pace',
      'settings.young': 'Young again',
      'settings.youngConfirm': 'Make her young again? Her age goes back to 0 and her heart learns fast again. She ' +
        'forgets nothing.',
      'settings.sensitivity': 'Sensitivity',
      'settings.sensitivityHint': 'How hard every moment hits her: -1 钝感 (lightly) to 1 敏感 (hard); 0 is as she is.',
      'settings.dull': '钝感',
      'settings.keen': '敏感',
      'settings.tunes': 'Each feeling, by hand',
      'settings.tunesHint': 'Nature (-3 to 3) nudges who she is: learning never takes it away, and 0 removes it. Now ' +
        '(-1 to 1) is how much more or less of it she feels lately than usual: it fades as she lives.',
      'settings.nature': 'nature',
      'settings.now': 'now',
      'settings.save': 'Save',
      'settings.discard': 'Discard',
      'settings.unsaved': '{count} unsaved',
      'settings.none': 'No changes',
      'settings.saved': 'Saved: her gut has it now.',
      'settings.failed': 'Not saved: {error}',
      'settings.badTau': 'tau is a number above 0'
    }
    const ZH = {
      ...EN,
      'tab.title': '她的直觉',
      'tab.description': '她的星图、她最近的感觉、她长大了多少，以及她认识的人',
      'header.open': '她的直觉',
      loading: '正在读取她的直觉……',
      unreachable: '无法读取她的直觉（{error}）：插件已关闭、尚未启动，或者设置成了不使用直觉（gut: false）。',
      updated: '截至 {time}',
      lessons: '{lessons} 节课',
      'map.title': '星图：她的心和她认识的人',
      'map.caption': '每个点都是她注意到的一件事，朝着它把她引向的那种感觉摆放；点越亮，偏向得越多。这些线是她的臂：她现在每种感觉比出生时（那个环）多了或少了多少。大星星是人。',
      'map.counts': '{rows} 个中最亮的 {stars} 个 · 臂来自她最近的 {probed} 节课',
      'map.born': '{rows} 个中最亮的 {stars} 个 · 臂仍是出生时的样子，直到上满 20 节课（目前 {probed} 节）',
      'map.star': '{key}：偏向 {end}（{bright}）',
      'map.person': '{who}：{lessons} 节课，她对这个人的样子里有 {weight}% 是专属于这个人的',
      'map.pick': '点一下或用手指指向一颗星星，看看它是什么。',
      you: '你',
      'bars.title': '最近对比平常',
      'bars.hint': '实心条是最近，刻度线是平常；两端都能延伸的条会从中间偏向其中一端。',
      san: 'SAN',
      'self-esteem': '自尊',
      usual: '平常 {value}',
      'grown.title': '长大',
      'grown.age': '年龄：{age} 节课教给了她的心',
      'grown.grown': '长大了 {grown}%（上满 {full} 节课就完全长大，也就是五倍的 tau {tau}）',
      'grown.learning': '学习速度是她小时候的 {learning}%',
      'grown.side': '还会在她的{side}一面待 {days} 天',
      'people.title': '她认识的人',
      'people.none': '还没有人。',
      'people.row': '{lessons} 节课 · {weight}% 专属于这个人',
      'settings.summary': '她的直觉：她的心长得多快、事情对她的冲击有多大，以及可以逐个调整的每种感觉',
      'settings.title': '她的直觉',
      'settings.intro': '她的直觉设置。保存后会立刻生效到正在运行的插件，并存进她的直觉文件（gut.db）；此后这些设置会优先于插件配置里的 tau 和敏感度，tau 和敏感度只用来初始化一个还没有自己设置的' +
        '直觉。',
      'settings.grown': '长大',
      'settings.tau': 'tau（节课）',
      'settings.tauHint': '她的心长得多快：小时候，一节课就能让她的心变化很大；长大后（到五倍 tau 时），变化就很小。填大于 0 的数。',
      'settings.age': '年龄：{age} 节课，长大了 {grown}%，学习速度是她小时候的 {learning}%',
      'settings.young': '回到小时候',
      'settings.youngConfirm': '让她回到小时候？她的年龄会归零，她的心又会学得很快。她不会忘记任何事。',
      'settings.sensitivity': '敏感度',
      'settings.sensitivityHint': '每个瞬间对她的冲击有多大：-1 钝感（轻轻带过）到 1 敏感（冲击很重）；0 就是她本来的样子。',
      'settings.dull': '钝感',
      'settings.keen': '敏感',
      'settings.tunes': '每种感觉，逐个调',
      'settings.tunesHint': '天性（-3 到 3）会微微推一推她本来的样子：学习永远不会把它拿走，填 0 就是去掉它。现在（-1 到 1）是她最近比平常多或少感受到这种感觉的程度：它会随着她的生活慢慢变淡。',
      'settings.nature': '天性',
      'settings.now': '现在',
      'settings.save': '保存',
      'settings.discard': '放弃',
      'settings.unsaved': '{count} 项未保存',
      'settings.none': '没有改动',
      'settings.saved': '已保存：她的直觉已经记住了。',
      'settings.failed': '未保存：{error}',
      'settings.badTau': 'tau 要大于 0'
    }

    /** `{name}` in a sentence filled in. */
    const format = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (all, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : all)
    const english = (key, values) => format(EN[key] ?? key, values)
    const fixed = (value, digits = 2) => (Number(value) || 0).toFixed(digits)
    const signed = (value, digits = 2) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value).toFixed(digits)
    const percent = value => Math.round((Number(value) || 0) * 100)

    async function get (route) {
      const response = await fetch(route, { cache: 'no-store', credentials: 'same-origin' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
      return body
    }
    async function post (route, body) {
      const response = await fetch(route, { method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const answer = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(answer.error || `HTTP ${response.status}`)
      return answer
    }

    /** Whether the page is dark: the text it inherits is light. */
    function isDark (element) {
      const found = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(getComputedStyle(element).color)
      if (!found) return document.body?.hasAttribute('data-ds-dark-theme') ?? false
      const [r, g, b] = found.slice(1, 4).map(Number)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128
    }

    /** Whether the page around `box` is dark, followed as DSH's theme changes (it marks its theme on the page). */
    function useDark (box, ready) {
      const [dark, setDark] = useState(false)
      useEffect(() => {
        if (!box.current) return
        const look = () => setDark(isDark(box.current))
        look()
        const themed = new MutationObserver(look)
        themed.observe(document.documentElement, { attributes: true })
        if (document.body) themed.observe(document.body, { attributes: true })
        return () => themed.disconnect()
      }, [ready])
      return dark
    }

    /** An end's colour: its bar's, the first end of a bar deeper and the second lighter. */
    function endColour (bars, end, dark) {
      const index = bars.findIndex(bar => bar.ends.includes(end))
      const shades = COLOURS[dark ? 'dark' : 'light']
      if (index < 0) return dark ? '#cccccc' : '#555555'
      return (bars[index].ends[0] === end ? shades.deep : shades.light)[index]
    }

    const zhOf = (ends, end) => ends?.find(item => item.end === end)?.zh ?? end

    /** The base radius of the star map: as big as fits, with each end's name at its arm's tip, read outward. */
    function baseRadius (half, arms, widths, gap = 0.12) {
      return Math.min(...arms.map((arm, k) => (half - 4 - widths[k] - 6) / Math.min(LABELS, Math.min(ARM, arm) + gap)))
    }

    /** Her star map on a canvas; what was drawn where, for picking a star. */
    function draw (canvas, map, view, dark, picked) {
      const width = Math.max(120, Math.round(canvas.getBoundingClientRect().width))
      const ratio = window.devicePixelRatio || 1
      if (canvas.width !== width * ratio) {
        canvas.width = width * ratio
        canvas.height = width * ratio
      }
      const g = canvas.getContext('2d')
      g.setTransform(ratio, 0, 0, ratio, 0, 0)
      g.clearRect(0, 0, width, width)
      const half = width / 2, font = Math.max(9, Math.min(12, width / 36))
      const scale = Math.max(0.55, Math.min(1, width / 520)) // (stars smaller on a small map)
      const ink = getComputedStyle(canvas).color
      g.fillStyle = dark ? '#0a0d16' : 'rgba(127, 127, 127, 0.07)'
      g.beginPath()
      g.roundRect(0, 0, width, width, 12)
      g.fill()
      g.font = `${font}px system-ui, -apple-system, sans-serif`
      const names = map.ends.map(end => zhOf(view.ends, end))
      const arms = map.reach.map(reach => Math.min(ARM, reach))
      const R = Math.max(10, baseRadius(half, arms, names.map(name => g.measureText(name).width)))
      const angle = k => -Math.PI / 2 + 2 * Math.PI * k / map.ends.length
      const colour = map.ends.map(end => endColour(view.bars, end, dark))
      // the ring: as she was born; then her arms, and the names of her ends at their tips
      g.strokeStyle = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.14)'
      g.setLineDash([3, 4])
      g.beginPath()
      g.arc(half, half, R, 0, 2 * Math.PI)
      g.stroke()
      g.setLineDash([])
      map.ends.forEach((end, k) => {
        const a = angle(k), x = half + arms[k] * R * Math.cos(a), y = half + arms[k] * R * Math.sin(a)
        g.strokeStyle = colour[k]
        g.globalAlpha = 0.45
        g.beginPath()
        g.moveTo(half, half)
        g.lineTo(x, y)
        g.stroke()
        g.globalAlpha = 1
        g.fillStyle = colour[k]
        g.beginPath()
        g.arc(x, y, 2.2, 0, 2 * Math.PI)
        g.fill()
        const out = Math.min(LABELS, arms[k] + 0.12) * R
        g.save()
        g.translate(half, half)
        g.rotate(Math.cos(a) < -1e-6 ? a + Math.PI : a)
        g.fillStyle = ink
        g.globalAlpha = 0.8
        g.textBaseline = 'middle'
        g.textAlign = Math.cos(a) < -1e-6 ? 'right' : 'left'
        g.fillText(names[k], Math.cos(a) < -1e-6 ? -out : out, 0)
        g.restore()
      })
      // the stars, dimmest first; brightness against the brighter stars of this map
      const brights = map.stars.map(star => star[2]).sort((one, other) => one - other)
      const top = Math.max(0.05, brights[Math.floor(brights.length * 0.97)] ?? 1)
      const points = []
      const place = (x, y) => {
        const far = Math.hypot(x, y), cut = far > ARM ? ARM / far : 1 // (inside the map, whatever her arms)
        return [half + x * cut * R, half + y * cut * R]
      }
      for (let i = map.stars.length - 1; i >= 0; i--) {
        const [x, y, bright, end, key] = map.stars[i], [px, py] = place(x, y)
        const lean = Math.min(1, bright / top), size = (0.7 + 2.3 * lean) * scale
        g.fillStyle = colour[end]
        if (dark && lean > 0.5) { // (a glow on the dark sky, for the stars that lean most)
          g.globalCompositeOperation = 'lighter'
          g.globalAlpha = 0.12 * lean
          g.beginPath()
          g.arc(px, py, size * 3.2, 0, 2 * Math.PI)
          g.fill()
          g.globalCompositeOperation = 'source-over'
        }
        g.globalAlpha = 0.25 + 0.75 * lean
        g.beginPath()
        g.arc(px, py, size, 0, 2 * Math.PI)
        g.fill()
        points.push({ px, py, star: map.stars[i], key })
      }
      g.globalAlpha = 1
      // the people she knows: one big star each, as big as how much of how she is with them is theirs
      const people = map.people.map(person => {
        const [px, py] = place(person.x, person.y), size = (4 + 8 * Math.min(1, person.weight / MOST)) * scale
        if (dark) {
          g.fillStyle = 'rgba(255, 255, 255, 0.14)'
          g.beginPath()
          g.arc(px, py, size * 2.4, 0, 2 * Math.PI)
          g.fill()
        }
        g.fillStyle = dark ? '#ffffff' : '#1d1d1f'
        g.strokeStyle = colour[person.end] ?? ink
        g.lineWidth = 2
        g.beginPath()
        g.arc(px, py, size, 0, 2 * Math.PI)
        g.fill()
        g.stroke()
        g.lineWidth = 1
        return { px, py, size, person }
      })
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      g.font = `600 ${font + 1}px system-ui, -apple-system, sans-serif`
      for (const { px, py, size, person } of people) {
        const label = person.subject === view.you ? view.youName : person.subject
        const left = px + size + 4 + g.measureText(label).width > width - 4
        g.textAlign = left ? 'right' : 'left'
        g.lineWidth = 3
        g.strokeStyle = dark ? '#0a0d16' : 'rgba(255, 255, 255, 0.9)'
        g.strokeText(label, left ? px - size - 4 : px + size + 4, py)
        g.fillStyle = ink
        g.fillText(label, left ? px - size - 4 : px + size + 4, py)
      }
      g.lineWidth = 1
      if (picked) {
        g.strokeStyle = ink
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(picked.px, picked.py, (picked.size ?? 3) + 5, 0, 2 * Math.PI)
        g.stroke()
        g.lineWidth = 1
      }
      return { points, people }
    }

    /** The star or person nearest a point on the map, within a finger's width. */
    function nearest (drawn, x, y) {
      let best = null, far = 14
      for (const item of drawn.people) {
        const d = Math.hypot(item.px - x, item.py - y) - item.size
        if (d < far) [best, far] = [item, d]
      }
      if (best) return best
      far = 10
      for (const item of drawn.points) {
        const d = Math.hypot(item.px - x, item.py - y)
        if (d < far) [best, far] = [item, d]
      }
      return best
    }

    function StarMap ({ map, view, t }) {
      const canvas = useRef(null), drawn = useRef(null)
      const [picked, setPicked] = useState(null)
      useEffect(() => setPicked(null), [map]) // (a new map: what was picked may be elsewhere now)
      useEffect(() => {
        const element = canvas.current
        if (!element || !map) return
        const paint = () => { drawn.current = draw(element, map, view, isDark(element), picked) }
        paint()
        const resized = new ResizeObserver(paint)
        resized.observe(element)
        const themed = new MutationObserver(paint) // (DSH marks its theme on the page)
        themed.observe(document.documentElement, { attributes: true })
        if (document.body) themed.observe(document.body, { attributes: true })
        return () => {
          resized.disconnect()
          themed.disconnect()
        }
      }, [map, view, picked])
      const point = event => {
        if (!drawn.current) return
        const box = canvas.current.getBoundingClientRect()
        const found = nearest(drawn.current, event.clientX - box.left, event.clientY - box.top)
        if ((found?.key ?? found?.person?.subject) !== (picked?.key ?? picked?.person?.subject)) setPicked(found)
      }
      let caption = t('map.pick')
      if (picked?.person) {
        const person = picked.person
        caption = t('map.person', { who: person.subject === view.you ? view.youName : person.subject,
          lessons: person.lessons, weight: percent(person.weight) })
      } else if (picked) {
        const [, , bright, end] = picked.star
        caption = t('map.star', { key: picked.key, end: `${zhOf(view.ends, map.ends[end])} ${map.ends[end]}`,
          bright: fixed(bright) })
      }
      return h('div', { className: 'mnl-map' },
        h('canvas', { ref: canvas, className: 'mnl-canvas', role: 'img', 'aria-label': t('map.caption'),
          onPointerMove: point, onPointerDown: point }),
        h('div', { className: 'mnl-pick' }, caption),
        h('div', { className: 'mnl-dim' }, t(map.probed >= 20 ? 'map.counts' : 'map.born',
          { stars: map.stars.length, rows: map.rows, probed: map.probed })),
        h('div', { className: 'mnl-dim' }, t('map.caption')))
    }

    /** A bar lately against usual: two-sided from the middle, one-sided from the left. */
    function Bar ({ bar, view, dark }) {
      const [left, right] = bar.ends, two = Boolean(left)
      const at = value => two ? 50 + Math.max(-1, Math.min(1, value)) * 50 : Math.max(0, Math.min(1, value)) * 100
      const from = two ? Math.min(50, at(bar.lately)) : 0, to = two ? Math.max(50, at(bar.lately)) : at(bar.lately)
      const toward = two && bar.lately < 0 ? left : right
      return h('div', { className: 'mnl-bar' },
        h('span', { className: 'mnl-end mnl-left' }, left ? zhOf(view.ends, left) : ''),
        h('div', { className: 'mnl-track',
          title: `${bar.zh} ${bar.bar}: ${signed(bar.lately)} / ${signed(bar.usual)}` },
          two ? h('span', { className: 'mnl-middle' }) : null,
          h('span', { className: 'mnl-fill', style: { left: `${from}%`, width: `${Math.max(0.5, to - from)}%`,
            background: endColour(view.bars, toward, dark) } }),
          h('span', { className: 'mnl-tick', style: { left: `${at(bar.usual)}%` } })),
        h('span', { className: 'mnl-end' }, zhOf(view.ends, right)),
        h('span', { className: 'mnl-value' }, signed(bar.lately)))
    }

    function Level ({ name, bar, t }) {
      return h('div', { className: 'mnl-level' },
        h('div', { className: 'mnl-dim' }, name),
        h('div', { className: 'mnl-big' }, signed(bar.lately)),
        h('div', { className: 'mnl-dim' }, t('usual', { value: signed(bar.usual) })))
    }

    /** Her sidebar tab: it looks again every few seconds while it is in view, and draws her star map again when her
     * heart has changed. */
    function GutTab ({ useTabInfo, t = english }) {
      const info = typeof useTabInfo === 'function' ? useTabInfo() : null
      const visible = info?.tab?.visible !== false
      const [state, setState] = useState({ view: null, map: null, error: null, at: null })
      const stamp = useRef(null), box = useRef(null)
      const dark = useDark(box, Boolean(state.view))
      useEffect(() => {
        if (!visible) return
        let gone = false
        const pull = async () => {
          if (document.visibilityState === 'hidden') return
          try {
            const view = await get(ROUTES.gut)
            let map = null
            if (view.stamp !== stamp.current) {
              map = await get(ROUTES.starmap)
              stamp.current = map.stamp
            }
            if (!gone) setState(old => ({ view, map: map ?? old.map, error: null, at: new Date() }))
          } catch (error) {
            if (!gone) setState(old => ({ ...old, error: String(error?.message ?? error) }))
          }
        }
        pull()
        const timer = setInterval(pull, EVERY)
        return () => {
          gone = true
          clearInterval(timer)
        }
      }, [visible])
      const { error, at } = state
      const view = React.useMemo(() => state.view && { ...state.view, youName: t('you') }, [state.view, t])
      if (!view) {
        return h('div', { className: 'mnl-tab', ref: box },
          h('div', { className: 'mnl-dim' }, error ? t('unreachable', { error }) : t('loading')))
      }
      const report = view.report, bar = name => view.bars.find(item => item.bar === name)
      const people = Object.entries(report.people || {}).sort((one, other) => other[1].weight - one[1].weight)
      return h('div', { className: 'mnl-tab', ref: box },
        h('div', { className: 'mnl-head' },
          h('div', { className: 'mnl-title' },
            view.companion ? `${view.companion} · ${t('tab.title')}` : t('tab.title')),
          h('div', { className: 'mnl-dim' }, [t('lessons', { lessons: report.lessons }),
            at ? t('updated', { time: at.toLocaleTimeString() }) : ''].filter(Boolean).join(' · '))),
        error ? h('div', { className: 'mnl-error' }, t('unreachable', { error })) : null,
        state.map ? h(StarMap, { map: state.map, view, t }) : h('div', { className: 'mnl-dim' }, t('loading')),
        h('div', { className: 'mnl-levels' },
          h(Level, { name: t('san'), bar: bar('composure'), t }),
          h(Level, { name: t('self-esteem'), bar: bar('pride'), t })),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('bars.title')),
          h('div', { className: 'mnl-dim' }, t('bars.hint')),
          h('div', { className: 'mnl-bars' }, view.bars.map(item => h(Bar, { key: item.bar, bar: item, view, dark })))),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('grown.title')),
          h('div', null, t('grown.age', { age: report.age })),
          h('div', { className: 'mnl-meter' }, h('span', { style: { width: `${percent(report.grown)}%` } })),
          h('div', { className: 'mnl-dim' }, t('grown.grown', { grown: percent(report.grown), full: 5 * report.tau,
            tau: report.tau })),
          h('div', { className: 'mnl-dim' }, t('grown.learning', { learning: percent(report.learning) })),
          report.held?.length ? h('div', { className: 'mnl-dim' }, t('grown.side', { side: report.held.join('、'),
            days: report.days })) : null),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('people.title')),
          people.length ? people.map(([subject, person]) => h('div', { key: subject, className: 'mnl-person' },
            h('span', { className: 'mnl-who' }, subject === view.you ? `${view.youName} (${subject})` : subject),
            h('div', { className: 'mnl-meter mnl-small' },
              h('span', { style: { width: `${Math.min(100, person.weight / MOST * 100)}%` } })),
            h('span', { className: 'mnl-dim' }, t('people.row', { lessons: person.lessons,
              weight: percent(person.weight) }))))
            : h('div', { className: 'mnl-dim' }, t('people.none'))))
    }

    /** A slider with its number. */
    function Slider ({ value, low, high, step, onChange, label, changed }) {
      return h('label', { className: changed ? 'mnl-slider mnl-changed' : 'mnl-slider' },
        h('span', { className: 'mnl-dim' }, label),
        h('input', { type: 'range', min: low, max: high, step, value,
          onChange: event => onChange(Number(event.target.value)) }),
        h('span', { className: 'mnl-number' }, signed(value, step < 0.1 ? 2 : 1)))
    }

    /** Her settings on the plugin's page under Plugins: staged here, and sent together on save. */
    function SettingsPage ({ t }) {
      const [view, setView] = useState(null)
      const [draft, setDraft] = useState({ tune: {} })
      const [status, setStatus] = useState({ busy: false, text: '', error: null })
      const box = useRef(null), dark = useDark(box, Boolean(view))
      useEffect(() => {
        get(ROUTES.gut).then(setView, error => setStatus({ busy: false, text: '', error: String(error.message) }))
      }, [])
      if (!view) {
        return h('div', { className: 'mnl-settings', ref: box }, h('div', { className: 'mnl-dim' },
          status.error ? t('unreachable', { error: status.error }) : t('loading')))
      }
      const report = view.report
      const tau = draft.tau ?? String(report.tau), sensitivity = draft.sensitivity ?? report.sensitivity
      const badTau = !(Number(tau) > 0 && Number.isFinite(Number(tau)))
      const tunes = Object.entries(draft.tune).flatMap(([end, item]) => Object.keys(item).map(what => [end, what]))
      const count = (draft.tau !== undefined && Number(draft.tau) !== report.tau ? 1 : 0) +
        (draft.sensitivity !== undefined && draft.sensitivity !== report.sensitivity ? 1 : 0) + tunes.length
      const tuneOf = end => ({ ...view.ends.find(item => item.end === end), ...draft.tune[end] })
      const retune = (end, what, value) => setDraft(old => ({ ...old, tune: { ...old.tune,
        [end]: { ...old.tune[end], [what]: value } } }))
      const send = async (body, done) => {
        setStatus({ busy: true, text: '', error: null })
        try {
          setView(await post(ROUTES.change, body))
          done()
          setStatus({ busy: false, text: t('settings.saved'), error: null })
        } catch (error) {
          setStatus({ busy: false, text: '', error: t('settings.failed', { error: String(error.message) }) })
        }
      }
      const save = () => {
        const body = {}
        if (draft.tau !== undefined) body.tau = Number(draft.tau)
        if (draft.sensitivity !== undefined) body.sensitivity = draft.sensitivity
        const tune = Object.entries(draft.tune).map(([end, item]) => ({ end, ...item }))
        if (tune.length) body.tune = tune
        send(body, () => setDraft({ tune: {} }))
      }
      const young = () => {
        if (window.confirm(t('settings.youngConfirm'))) send({ age: 0 }, () => {})
      }
      return h('div', { className: 'mnl-settings', ref: box },
        h('p', { className: 'mnl-dim' }, t('settings.intro')),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('settings.grown')),
          h('div', { className: 'mnl-row' },
            h('span', null, t('settings.age', { age: report.age, grown: percent(report.grown),
              learning: percent(report.learning) })),
            h('button', { type: 'button', className: 'mnl-button', disabled: status.busy || report.age === 0,
              onClick: young }, t('settings.young'))),
          h('label', { className: draft.tau !== undefined ? 'mnl-field mnl-changed' : 'mnl-field' },
            h('span', null, t('settings.tau')),
            h('input', { type: 'number', min: 1, step: 1, value: tau, 'aria-invalid': badTau,
              onChange: event => setDraft(old => ({ ...old, tau: event.target.value })) }),
            badTau ? h('span', { className: 'mnl-error' }, t('settings.badTau')) : null),
          h('div', { className: 'mnl-dim' }, t('settings.tauHint'))),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('settings.sensitivity')),
          h('div', { className: 'mnl-row mnl-sensitivity' },
            h('span', null, t('settings.dull')),
            h('input', { type: 'range', min: -1, max: 1, step: 0.05, value: sensitivity,
              'aria-label': t('settings.sensitivity'),
              onChange: event => setDraft(old => ({ ...old, sensitivity: Number(event.target.value) })) }),
            h('span', null, t('settings.keen')),
            h('span', { className: draft.sensitivity !== undefined ? 'mnl-number mnl-changed' : 'mnl-number' },
              signed(sensitivity))),
          h('div', { className: 'mnl-dim' }, t('settings.sensitivityHint'))),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('settings.tunes')),
          h('div', { className: 'mnl-dim' }, t('settings.tunesHint')),
          h('div', { className: 'mnl-tunes' }, view.bars.map(bar => h('div', { key: bar.bar, className: 'mnl-group' },
            h('div', { className: 'mnl-group-title' }, `${bar.zh} · ${bar.bar}`),
            bar.ends.filter(Boolean).map(end => {
              const tune = tuneOf(end), changed = draft.tune[end] || {}
              return h('div', { key: end, className: 'mnl-tune' },
                h('div', { className: 'mnl-tune-name' },
                  h('span', { className: 'mnl-swatch', style: { background: endColour(view.bars, end, dark) } }),
                  `${tune.zh} ${end}`),
                h(Slider, { label: t('settings.nature'), value: tune.nature, low: -3, high: 3, step: 0.1,
                  changed: changed.nature !== undefined, onChange: value => retune(end, 'nature', value) }),
                h(Slider, { label: t('settings.now'), value: tune.now, low: -1, high: 1, step: 0.05,
                  changed: changed.now !== undefined, onChange: value => retune(end, 'now', value) }))
            }))))),
        h('div', { className: 'mnl-savebar' },
          h('span', { className: count ? 'mnl-changed' : 'mnl-dim' },
            count ? t('settings.unsaved', { count }) : t('settings.none')),
          status.text ? h('span', { className: 'mnl-ok' }, status.text) : null,
          status.error ? h('span', { className: 'mnl-error' }, status.error) : null,
          h('span', { className: 'mnl-spacer' }),
          h('button', { type: 'button', className: 'mnl-button', disabled: status.busy || !count,
            onClick: () => setDraft({ tune: {} }) }, t('settings.discard')),
          h('button', { type: 'button', className: 'mnl-button mnl-primary', disabled: status.busy || !count || badTau,
            onClick: save }, t('settings.save'))))
    }

    function Settings ({ view, t = english }) {
      return view === 'summary' ? t('settings.summary') : h(SettingsPage, { t })
    }

    /** Her mark: a heart with a star in it. */
    function Icon ({ size = 16, className } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', className, 'aria-hidden': true },
        h('path', { d: 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z',
          stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'm12 10.4.8 1.7 1.8.2-1.4 1.2.4 1.8-1.6-.9-1.6.9.4-1.8-1.4-1.2 1.8-.2.8-1.7Z',
          fill: 'currentColor' }))
    }

    const CSS = `
.mnl-tab, .mnl-settings { color: var(--dsw-alias-label-primary, inherit); font-size: 13px; line-height: 1.55;
  display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; min-width: 0 }
.mnl-tab { padding: 14px 14px 28px; height: 100%; overflow-y: auto }
.mnl-settings { max-width: 960px }
.mnl-settings p { margin: 0 }
.mnl-head { display: flex; flex-direction: column; gap: 2px }
.mnl-title { font-size: 15px; font-weight: 600 }
.mnl-subtitle { font-size: 13.5px; font-weight: 600; margin-bottom: 4px }
.mnl-dim { color: var(--dsw-alias-label-tertiary, #888); font-size: 12px; line-height: 1.5 }
.mnl-error { color: var(--dsw-alias-state-error-primary, #d93036); font-size: 12px }
.mnl-ok { color: var(--dsw-alias-state-success-primary, #2f9e63); font-size: 12px }
.mnl-card { border: .5px solid var(--dsw-alias-border-l3, rgba(128,128,128,.3)); border-radius: 12px;
  padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0;
  background: var(--dsw-alias-bg-layer-1, transparent) }
.mnl-map { display: flex; flex-direction: column; gap: 6px }
.mnl-canvas { width: 100%; max-width: 560px; aspect-ratio: 1; align-self: center; touch-action: manipulation;
  color: var(--dsw-alias-label-secondary, #666); display: block }
.mnl-pick { font-size: 12px; min-height: 18px; color: var(--dsw-alias-label-secondary, #666); overflow-wrap: anywhere }
.mnl-levels { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.mnl-level { border: .5px solid var(--dsw-alias-border-l3, rgba(128,128,128,.3)); border-radius: 12px;
  padding: 8px 12px; background: var(--dsw-alias-bg-layer-1, transparent) }
.mnl-big { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums }
.mnl-bars { display: flex; flex-direction: column; gap: 5px; margin-top: 4px }
.mnl-bar { display: grid; grid-template-columns: 5.2em minmax(40px, 1fr) 2.4em 3.2em; gap: 6px; align-items: center;
  font-size: 12px }
.mnl-left { text-align: right; overflow: hidden; text-overflow: ellipsis }
.mnl-end { white-space: nowrap; color: var(--dsw-alias-label-secondary, #666) }
.mnl-value { text-align: right; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary, #666) }
.mnl-track { position: relative; height: 10px; border-radius: 5px; min-width: 60px;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.14)) }
.mnl-middle { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px;
  background: var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-fill { position: absolute; top: 1px; bottom: 1px; border-radius: 4px }
.mnl-tick { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; border-radius: 1px;
  background: var(--dsw-alias-label-primary, #222) }
.mnl-meter { height: 8px; border-radius: 4px; overflow: hidden;
  background: var(--dsw-alias-bg-layer-3, rgba(128,128,128,.14)) }
.mnl-meter > span { display: block; height: 100%; border-radius: 4px;
  background: var(--dsw-alias-state-business-primary, #4d6bfe) }
.mnl-small { height: 6px }
.mnl-person { display: grid; grid-template-columns: minmax(0, 1fr) 72px auto; gap: 8px; align-items: center }
.mnl-who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.mnl-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center }
.mnl-field { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.mnl-field input[type=number] { width: 110px; height: 30px; padding: 0 8px; box-sizing: border-box; font: inherit;
  color: inherit; background: var(--dsw-alias-bg-layer-3, transparent); border-radius: 8px;
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-field input[aria-invalid=true] { border-color: var(--dsw-alias-state-error-primary, #d93036) }
.mnl-sensitivity input[type=range] { flex: 1 1 160px; min-width: 120px }
.mnl-number { font-variant-numeric: tabular-nums; min-width: 3.2em; text-align: right }
.mnl-changed { color: var(--dsw-alias-state-business-primary, #4d6bfe); font-weight: 600 }
.mnl-tunes { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; margin-top: 6px }
.mnl-group { border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22)); border-radius: 10px;
  padding: 8px 10px; display: flex; flex-direction: column; gap: 6px }
.mnl-group-title { font-weight: 600; font-size: 12.5px }
.mnl-tune { display: flex; flex-direction: column; gap: 2px }
.mnl-tune-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px }
.mnl-swatch { width: 9px; height: 9px; border-radius: 50%; flex: none }
.mnl-slider { display: grid; grid-template-columns: 3.6em 1fr 3.2em; gap: 6px; align-items: center; font-weight: 400 }
.mnl-slider input { width: 100%; min-width: 0 }
.mnl-slider.mnl-changed .mnl-number { color: var(--dsw-alias-state-business-primary, #4d6bfe); font-weight: 600 }
.mnl-savebar { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center;
  padding: 10px 12px; border-radius: 12px; z-index: 2;
  border: .5px solid var(--dsw-alias-border-l3, rgba(128,128,128,.3));
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base, #fff)) }
.mnl-savebar::after { content: ''; position: absolute; left: -1px; right: -1px; top: 100%; height: 64px;
  background: var(--dsw-alias-bg-base, #fff) } /* (the page's own padding below it, kept clear) */
.mnl-spacer { flex: 1 }
.mnl-button { height: 30px; padding: 0 14px; border-radius: 8px; font: inherit; cursor: pointer; color: inherit;
  background: transparent; border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)) }
.mnl-button:disabled { opacity: .5; cursor: default }
.mnl-primary { color: var(--dsw-alias-label-primary-foreground, #fff); border-color: transparent;
  background: var(--dsw-alias-state-business-primary, #4d6bfe) }
.mnl-primary:hover:not(:disabled) { filter: brightness(1.08) }
.mnl-header { width: 28px; height: 28px; border-radius: 6px; border: 0; padding: 0; cursor: pointer;
  background: transparent; display: inline-flex; align-items: center; justify-content: center;
  color: var(--dsw-alias-label-secondary, #666) }
.mnl-header:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1));
  color: var(--dsw-alias-label-primary, inherit) }
@media (max-width: 480px) {
  .mnl-tunes { grid-template-columns: 1fr }
  .mnl-bar { grid-template-columns: 5em minmax(40px, 1fr) 2.4em 3em; gap: 4px }
}`

    const inject = ['slots', 'locale']

    function apply (ctx) {
      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = PACKAGE
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => tag.remove()
      }, 'mneme-llm: style')
      ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'mneme-llm: words')
      const t = ctx.locale.bind(NS)
      // her settings, on the plugin's page under Plugins
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE,
        locale: NS }, Settings))
      // her tab in the right sidebar, offered on its guide page, and a button in the conversation's header to open it
      ctx.inject(['sidebarRightTabs'], scope => {
        scope.effect(() => scope.sidebarRightTabs.register({ id: PACKAGE, kind: KIND, title: () => t('tab.title'),
          guide: [{ id: 'open', order: 70, title: () => t('tab.title'), description: () => t('tab.description'),
            icon: Icon }] }), 'mneme-llm: her tab')
        scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab',
          key: PACKAGE, locale: NS }, GutTab))
      })
      ctx.inject(['sidebarRight'], scope => {
        const Open = ({ t: words = english }) => h('button', { type: 'button', className: 'mnl-header',
          title: words('header.open'), 'aria-label': words('header.open'),
          onClick: () => scope.sidebarRight.openTab(KIND) }, h(Icon, { size: 16 }))
        scope.slots.inject('conversation.session.header.actions', () => scope.slots.register({
          name: 'conversation.session.header.actions', id: 'mneme-llm-gut', order: 70, locale: NS }, Open))
      })
    }

    module.exports = { inject, apply, format, endColour, baseRadius, nearest, COLOURS, EN, ZH, ROUTES, KIND }
    return module.exports
  }
})

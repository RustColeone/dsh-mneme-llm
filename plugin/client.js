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
    const EYE = 6.0 // in 3D, the eye is this many base radii from the middle: what is near looks a little bigger
    const TURNING = 0.12 // in 3D, radians a second it turns by itself while nobody is turning it
    const RESTS = 3000 // and milliseconds after a drag before it turns by itself again
    const SAVED = 'dsh-mneme-llm.map3d' // (the browser keeps which view was chosen)

    // One colour for each of her 14 bars, in BARS order: the first 13 spread round the colour wheel so that bars side by
    // side differ, and the 14th (trust) in the gap between two bars that sit far from it on both maps; the first end of
    // a bar is a deeper shade and the second a lighter one, stepped for each theme.
    const COLOURS = {
      dark: {
        deep: ['#ca5551', '#12976b', '#9167ca', '#a57710', '#128eaa', '#c35481', '#54932d', '#6676d8', '#c36109',
          '#13938f', '#b05bab', '#888510', '#1485d4', '#0f919c'],
        light: ['#ffaba3', '#72ddae', '#d0b4fd', '#ecbb64', '#58d6f9', '#fea6c5', '#a1d687', '#b2c0ff', '#fdb080',
          '#4fddd7', '#f0a7ea', '#cbca69', '#91caff', '#4ddae9']
      },
      light: {
        deep: ['#972e2d', '#0c6849', '#674098', '#735100', '#0b6276', '#912d59', '#316802', '#424da5', '#884204',
          '#0f6562', '#81357d', '#5d5b0a', '#0a5c94', '#0d646c'],
        light: ['#ce766f', '#44a87f', '#9f81cb', '#b68a37', '#22a2c0', '#c97493', '#73a25b', '#7d8cd7', '#c87e4d',
          '#0ca8a3', '#b878b3', '#99973d', '#5498d3', '#05a5b3']
      }
    }

    const EN = {
      lang: 'en',
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
      'map.view': 'View',
      'map.turn': 'Drag to turn it; a few seconds later it turns slowly by itself. The two ends of each bar sit side ' +
        'by side.',
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
      'settings.sensitivityHint': 'How hard every moment hits her: -1 thick-skinned (lightly) to 1 sensitive (hard); ' +
        '0 is as she is.',
      'settings.dull': 'thick-skinned',
      'settings.keen': 'sensitive',
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
      'settings.badTau': 'tau is a number above 0',
      'settings.heartLock': 'Lock her heart',
      'settings.heartLockHint': 'Her heart learns nothing and does not grow up until it is unlocked; how she is with ' +
        'each person still learns, unless locked too.',
      'people.hint': 'How she is with each person, by hand. Closeness lives in her memory file; the rest in her gut.',
      'people.summary': '{lessons} lessons · {weight}% theirs',
      'people.closeness': 'Closeness ({role}, {floor} to {ceiling})',
      'people.noRole': 'No role in her memory: closeness needs one.',
      'people.holdCloseness': 'Lock closeness: no exchange or time moves it',
      'people.byHand': 'Set how much what is different with them counts, by hand',
      'people.weight': 'theirs',
      'people.lock': 'Lock how she is with them: what they say teaches nothing, and they do not fade',
      'people.tunes': 'Each feeling, with them alone',
      'people.tunesHint': 'A nudge to each feeling with this person only, on top of her nature (-3 to 3; 0 ' +
        'removes it).',
      'people.forget': 'Forget them',
      'people.forgetConfirm': 'Forget {who}? How she is with them goes, and so do the sides only they wanted. What ' +
        'they did to her heart stays.',
      'people.forgotten': 'Forgotten when you save',
      'people.undo': 'Keep',
      'sides.title': 'Her sides',
      'sides.hint': 'A side is a name and one sentence of what she does. A locked side holds for everyone, whatever ' +
        'is drawn and however long; how often is how strongly it shows.',
      'sides.none': 'No sides yet.',
      'sides.given': 'given in the configuration',
      'sides.weight': 'weight when drawn',
      'sides.drop': 'Remove',
      'sides.dropped': 'Removed when you save',
      'sides.often': 'how often',
      'sides.oftenHint': 'The share of her turns the sentence goes beside the message: 1 is every turn.',
      'sides.pick': 'Choose a name',
      'sides.what': 'What she does, said to her ("You…")',
      'sides.write': 'Add',
      'sides.locked': 'locked',
      'role.creator': 'creator',
      'role.family': 'family',
      'role.friend': 'friend',
      'role.acquaintance': 'acquaintance',
      'sides.lockThis': 'Lock her in this side',
      'sides.needsWhat': 'Write what she does before saving.'
    }
    const ZH = {
      ...EN,
      lang: 'zh-CN',
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
      'map.view': '视图',
      'map.turn': '拖动可以旋转它；几秒后它会自己慢慢转。每一条的两端并排挨在一起。',
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
      'settings.badTau': 'tau 要大于 0',
      'settings.heartLock': '锁住她的心',
      'settings.heartLockHint': '解锁之前，她的心不再学习，也不再长大；她和每个人相处的样子仍会学，除非也锁住。',
      'people.hint': '她和每个人相处的样子，由你亲手设定。亲近度存在她的记忆文件里，其余的存在她的直觉里。',
      'people.summary': '{lessons} 节课 · {weight}% 专属于这个人',
      'people.closeness': '亲近度（{role}，{floor} 到 {ceiling}）',
      'people.noRole': '她的记忆里没有角色：亲近度需要一个角色。',
      'people.holdCloseness': '锁住亲近度：不再因交流或时间而变动',
      'people.byHand': '亲手设定：她和这个人在一起时不一样的那份算多少',
      'people.weight': '专属于这个人',
      'people.lock': '锁住她和这个人相处的样子：这个人说的话什么也不教，也不会淡去',
      'people.tunes': '每一种感受，只对这个人',
      'people.tunesHint': '只针对这个人，给每种感受加一点偏移，叠加在她的天性之上（-3 到 3；0 表示移除）。',
      'people.forget': '忘记这个人',
      'people.forgetConfirm': '忘记{who}？她和这个人相处的样子会消失，只有这个人想要的属性也会消失；这个人在她心里留下的影响还在。',
      'people.forgotten': '保存后就会忘记',
      'people.undo': '保留',
      'sides.title': '她的属性',
      'sides.hint': '属性由一个名字和一句她的做法组成。锁住的属性对所有人都生效，无论抽到什么、持续多久；而它出现的频率，决定它表现得有多强。',
      'sides.none': '还没有属性。',
      'sides.given': '由配置指定',
      'sides.weight': '抽到时的权重',
      'sides.drop': '去掉',
      'sides.dropped': '保存后去掉',
      'sides.often': '出现频率',
      'sides.oftenHint': '她的回合中，这句做法附在消息旁的比例：1 表示每个回合。',
      'sides.pick': '选择一个名字',
      'sides.what': '她的做法，用对她说的话来写（你……）',
      'sides.write': '添加',
      'sides.locked': '已锁住',
      'role.creator': '创造者',
      'role.family': '家人',
      'role.friend': '朋友',
      'role.acquaintance': '认识的人',
      'sides.lockThis': '把她锁在这一面',
      'sides.needsWhat': '保存前写下她的做法。'
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

    /** A feeling's or a bar's name in the page's language: Chinese on a Chinese page, its own English elsewhere. */
    const chinese = t => String(t('lang')).startsWith('zh')
    const endName = (t, view, end) => chinese(t) ? view.ends?.find(item => item.end === end)?.zh ?? end : end
    const barName = (t, bar) => chinese(t) ? bar.zh : bar.bar
    /** A role's name in the page's language; a host's own role by its key. */
    const roleName = (t, role) => {
      const name = t(`role.${role}`)
      return name === `role.${role}` ? role : name
    }

    /** The base radius of the star map: as big as fits, with each end's name at its arm's tip, read outward. */
    function baseRadius (half, arms, widths, gap = 0.12) {
      return Math.min(...arms.map((arm, k) => (half - 4 - widths[k] - 6) / Math.min(LABELS, Math.min(ARM, arm) + gap)))
    }

    /** Her star map on a canvas. */
    function draw (canvas, map, view, dark, t) {
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
      const names = map.ends.map(end => endName(t, view, end))
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
      const place = (x, y) => {
        const far = Math.hypot(x, y), cut = far > ARM ? ARM / far : 1 // (inside the map, whatever her arms)
        return [half + x * cut * R, half + y * cut * R]
      }
      for (let i = map.stars.length - 1; i >= 0; i--) {
        const [x, y, bright, end] = map.stars[i], [px, py] = place(x, y)
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
    }

    /** A point of her 3D map seen from where the map is turned: across, down the screen, toward the eye, and how
     * much nearer things look bigger. */
    function project ([x, y, z], { yaw, pitch }) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
      const x1 = x * cy + z * sy, z1 = z * cy - x * sy
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp
      const near = EYE / (EYE - z2)
      return [x1 * near, -y2 * near, z2, near]
    }

    /** Where each end's name goes in 3D, the front ones first: a line up or down off a nearer name it would cover, or
     * left out while it cannot be (it is further back; as the map turns, it comes back). k → {x, y, align}. */
    function placeNames (g, tips, names, half, font) {
      const taken = [], places = new Map(), tall = font + 2
      for (const tip of [...tips].sort((one, other) => other.z - one.z)) {
        const [x, at] = tip.label, wide = g.measureText(names[tip.k]).width
        const align = x < half - 2 ? 'right' : x > half + 2 ? 'left' : 'center'
        const left = align === 'right' ? x - wide : align === 'center' ? x - wide / 2 : x
        const free = y => !taken.some(([x0, y0, x1, y1]) => left < x1 && left + wide > x0 && y - tall / 2 < y1 &&
          y + tall / 2 > y0)
        const y = [at, at - tall, at + tall].find(free)
        if (y === undefined) continue
        taken.push([left - 2, y - tall / 2, left + wide + 2, y + tall / 2])
        places.set(tip.k, { x, y, align })
      }
      return places
    }

    /** Her star map in 3D: her 26 ends on a sphere, each bar's two ends side by side; the nearer, the brighter. */
    function draw3d (canvas, map, view, dark, t, turn) {
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
      const scale = Math.max(0.55, Math.min(1, width / 520))
      const ink = getComputedStyle(canvas).color
      g.fillStyle = dark ? '#0a0d16' : 'rgba(127, 127, 127, 0.07)'
      g.beginPath()
      g.roundRect(0, 0, width, width, 12)
      g.fill()
      g.font = `${font}px system-ui, -apple-system, sans-serif`
      const longest = Math.max(1, ...map.reach.map(reach => Math.min(ARM, reach)))
      // (as big as fits, names too, however it is turned: a point this far out is drawn at most far / √(1 − (far/EYE)²)
      // from the middle, when it leans toward the eye by far/EYE)
      const out = Math.min(LABELS, longest + 0.15), seen = out / Math.sqrt(1 - (out / EYE) ** 2)
      const R = Math.max(10, (half - 6 - 5 * font) / seen)
      const colour = map.ends.map(end => endColour(view.bars, end, dark))
      const depth = z => Math.max(0, Math.min(1, (z + ARM) / (2 * ARM))) // 0 at the back, 1 at the front
      const screen = at => {
        const far = Math.hypot(...at), cut = far > ARM ? ARM / far : 1
        const [x, y, z, near] = project(at.map(value => value * cut), turn)
        return [half + x * R, half + y * R, z, near]
      }
      // the sphere she was born with, seen from outside; then her arms, the far ones fainter
      g.strokeStyle = dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.14)'
      g.setLineDash([3, 4])
      g.beginPath()
      g.arc(half, half, R * EYE / Math.sqrt(EYE * EYE - 1), 0, 2 * Math.PI)
      g.stroke()
      g.setLineDash([])
      const tips = map.directions.map((direction, k) => {
        const arm = Math.min(ARM, map.reach[k])
        const [x, y, z] = screen(direction.map(value => value * arm))
        g.strokeStyle = colour[k]
        g.globalAlpha = 0.15 + 0.4 * depth(z)
        g.beginPath()
        g.moveTo(half, half)
        g.lineTo(x, y)
        g.stroke()
        g.globalAlpha = 1
        return { k, x, y, z, label: screen(direction.map(value => value * Math.min(LABELS, arm + 0.15))) }
      })
      // the stars, from the back to the front
      const brights = map.stars.map(star => star[2]).sort((one, other) => one - other)
      const top = Math.max(0.05, brights[Math.floor(brights.length * 0.97)] ?? 1)
      const placed = map.stars.map(star => [star, screen(star.slice(5, 8))]).sort((one, other) => one[1][2] - other[1][2])
      for (const [star, [px, py, z, near]] of placed) {
        const lean = Math.min(1, star[2] / top), size = (0.7 + 2.3 * lean) * scale * near, front = depth(z)
        g.fillStyle = colour[star[3]]
        if (dark && lean > 0.5) {
          g.globalCompositeOperation = 'lighter'
          g.globalAlpha = 0.12 * lean * (0.4 + 0.6 * front)
          g.beginPath()
          g.arc(px, py, size * 3.2, 0, 2 * Math.PI)
          g.fill()
          g.globalCompositeOperation = 'source-over'
        }
        g.globalAlpha = (0.25 + 0.75 * lean) * (0.35 + 0.65 * front)
        g.beginPath()
        g.arc(px, py, size, 0, 2 * Math.PI)
        g.fill()
      }
      g.globalAlpha = 1
      // the tips of her arms and the names of her ends, the front ones over the back
      g.textBaseline = 'middle'
      const names = map.ends.map(end => endName(t, view, end))
      const places = placeNames(g, tips, names, half, font)
      for (const tip of [...tips].sort((one, other) => one.z - other.z)) {
        const front = depth(tip.z), place = places.get(tip.k)
        g.fillStyle = colour[tip.k]
        g.globalAlpha = 0.4 + 0.6 * front
        g.beginPath()
        g.arc(tip.x, tip.y, 2.2, 0, 2 * Math.PI)
        g.fill()
        if (!place) continue
        g.fillStyle = ink
        g.globalAlpha = 0.3 + 0.6 * front
        g.textAlign = place.align
        g.fillText(names[tip.k], place.x, place.y)
      }
      g.globalAlpha = 1
      // the people she knows, from the back to the front
      const people = map.people.map(person => {
        const [px, py, z, near] = screen(person.at)
        return { px, py, z, size: (4 + 8 * Math.min(1, person.weight / MOST)) * scale * near, person }
      }).sort((one, other) => one.z - other.z)
      g.font = `600 ${font + 1}px system-ui, -apple-system, sans-serif`
      for (const { px, py, z, size, person } of people) {
        g.globalAlpha = 0.55 + 0.45 * depth(z)
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
        const label = person.subject === view.you ? view.youName : person.subject
        const left = px + size + 4 + g.measureText(label).width > width - 4
        g.textAlign = left ? 'right' : 'left'
        g.lineWidth = 3
        g.strokeStyle = dark ? '#0a0d16' : 'rgba(255, 255, 255, 0.9)'
        g.strokeText(label, left ? px - size - 4 : px + size + 4, py)
        g.fillStyle = ink
        g.fillText(label, left ? px - size - 4 : px + size + 4, py)
      }
      g.globalAlpha = 1
      g.lineWidth = 1
    }

    /** Which view of her map the browser keeps: 3D or not. */
    function remembered () {
      try {
        return window.localStorage?.getItem(SAVED) === '3d'
      } catch {
        return false
      }
    }

    function StarMap ({ map, view, t }) {
      const canvas = useRef(null), turn = useRef({ yaw: 0.6, pitch: -0.32 })
      const drag = useRef(null), rested = useRef(0), paintRef = useRef(null)
      const [three, setThree] = useState(remembered)
      const round = three && Array.isArray(map?.directions) // (a map from before 3D has no directions)
      useEffect(() => {
        const element = canvas.current
        if (!element || !map) return
        const paint = () => round ? draw3d(element, map, view, isDark(element), t, turn.current)
          : draw(element, map, view, isDark(element), t)
        paintRef.current = paint
        paint()
        const resized = new ResizeObserver(paint)
        resized.observe(element)
        const themed = new MutationObserver(paint) // (DSH marks its theme on the page)
        themed.observe(document.documentElement, { attributes: true })
        if (document.body) themed.observe(document.body, { attributes: true })
        // in 3D, it turns slowly by itself while it is in view and nobody is turning it (not for reduced motion)
        let frame = null, last = null, painted = 0, seen = true
        const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        const watched = typeof IntersectionObserver === 'function'
          ? new IntersectionObserver(entries => { seen = entries.some(entry => entry.isIntersecting) }) : null
        watched?.observe(element)
        const tick = at => {
          if (last !== null && seen && !document.hidden && !drag.current && Date.now() - rested.current > RESTS) {
            turn.current.yaw += TURNING * Math.min(0.1, (at - last) / 1000)
            if (at - painted >= 33) { // (about 30 a second: it turns slowly, and the page has other work)
              paint()
              painted = at
            }
          }
          last = at
          frame = window.requestAnimationFrame(tick)
        }
        if (round && !still && window.requestAnimationFrame) frame = window.requestAnimationFrame(tick)
        return () => {
          resized.disconnect()
          themed.disconnect()
          watched?.disconnect()
          if (frame !== null) window.cancelAnimationFrame(frame)
        }
      }, [map, view, t, round])
      const choose = value => {
        setThree(value)
        try {
          window.localStorage?.setItem(SAVED, value ? '3d' : '2d')
        } catch {}
      }
      const down = event => {
        if (!round) return
        drag.current = { x: event.clientX, y: event.clientY }
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {} // (a pointer the page no longer holds: the drag goes on without it)
      }
      const move = event => {
        const held = drag.current
        if (!round || !held) return
        const dx = event.clientX - held.x, dy = event.clientY - held.y
        held.x = event.clientX
        held.y = event.clientY
        turn.current.yaw += dx * 0.01
        turn.current.pitch = Math.max(-1.4, Math.min(1.4, turn.current.pitch + dy * 0.01))
        paintRef.current?.()
      }
      const up = () => {
        drag.current = null
        rested.current = Date.now()
      }
      return h('div', { className: 'mnl-map' },
        h('div', { className: 'mnl-switch', role: 'group', 'aria-label': t('map.view') },
          [false, true].map(value => h('button', { key: String(value), type: 'button', 'aria-pressed': three === value,
            className: three === value ? 'mnl-chosen' : '', onClick: () => choose(value) }, value ? '3D' : '2D'))),
        h('canvas', { ref: canvas, className: round ? 'mnl-canvas mnl-turning' : 'mnl-canvas', role: 'img',
          'aria-label': t('map.caption'), onPointerMove: move, onPointerDown: down, onPointerUp: up,
          onPointerCancel: up }),
        round ? h('div', { className: 'mnl-dim' }, t('map.turn')) : null,
        h('div', { className: 'mnl-dim' }, t(map.probed >= 20 ? 'map.counts' : 'map.born',
          { stars: map.stars.length, rows: map.rows, probed: map.probed })),
        h('div', { className: 'mnl-dim' }, t('map.caption')))
    }

    /** A bar lately against usual: two-sided from the middle, one-sided from the left. */
    function Bar ({ bar, view, dark, t }) {
      const [left, right] = bar.ends, two = Boolean(left)
      const at = value => two ? 50 + Math.max(-1, Math.min(1, value)) * 50 : Math.max(0, Math.min(1, value)) * 100
      const from = two ? Math.min(50, at(bar.lately)) : 0, to = two ? Math.max(50, at(bar.lately)) : at(bar.lately)
      const toward = two && bar.lately < 0 ? left : right
      return h('div', { className: 'mnl-bar' },
        h('span', { className: 'mnl-end mnl-left' }, left ? endName(t, view, left) : ''),
        h('div', { className: 'mnl-track',
          title: `${barName(t, bar)}: ${signed(bar.lately)} / ${signed(bar.usual)}` },
          two ? h('span', { className: 'mnl-middle' }) : null,
          h('span', { className: 'mnl-fill', style: { left: `${from}%`, width: `${Math.max(0.5, to - from)}%`,
            background: endColour(view.bars, toward, dark) } }),
          h('span', { className: 'mnl-tick', style: { left: `${at(bar.usual)}%` } })),
        h('span', { className: 'mnl-end' }, endName(t, view, right)),
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
            at ? t('updated', { time: at.toLocaleTimeString(t('lang')) }) : ''].filter(Boolean).join(' · '))),
        error ? h('div', { className: 'mnl-error' }, t('unreachable', { error })) : null,
        state.map ? h(StarMap, { map: state.map, view, t }) : h('div', { className: 'mnl-dim' }, t('loading')),
        h('div', { className: 'mnl-levels' },
          h(Level, { name: t('san'), bar: bar('composure'), t }),
          h(Level, { name: t('self-esteem'), bar: bar('pride'), t })),
        h('section', { className: 'mnl-card' },
          h('div', { className: 'mnl-subtitle' }, t('bars.title')),
          h('div', { className: 'mnl-dim' }, t('bars.hint')),
          h('div', { className: 'mnl-bars' },
            view.bars.map(item => h(Bar, { key: item.bar, bar: item, view, dark, t })))),
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
    function Slider ({ value, low, high, step, onChange, label, changed, wide = false, plain = false }) {
      return h('label', { className: ['mnl-slider', wide ? 'mnl-wide' : '', changed ? 'mnl-changed' : '']
        .filter(Boolean).join(' ') },
        h('span', { className: 'mnl-dim' }, label),
        h('input', { type: 'range', min: low, max: high, step, value,
          onChange: event => onChange(Number(event.target.value)) }),
        h('span', { className: 'mnl-number' }, step >= 1 ? fixed(value, 0)
          : plain ? fixed(value, 2) : signed(value, step < 0.1 ? 2 : 1)))
    }

    const EMPTY = () => ({ tune: {}, people: {}, sides: {} })
    const GROWS = 6.0 // a new side's weight when drawn, as lib/gut.js gives it (the bundle cannot import it)

    /** What a draft changes: one for each value staged. */
    function counted (draft, view) {
      const report = view.report
      let count = (draft.tau !== undefined && Number(draft.tau) !== report.tau ? 1 : 0) +
        (draft.sensitivity !== undefined && draft.sensitivity !== report.sensitivity ? 1 : 0) +
        (draft.locked !== undefined && draft.locked !== view.locked ? 1 : 0) + (draft.side !== undefined ? 1 : 0)
      for (const item of Object.values(draft.tune)) count += Object.keys(item).length
      for (const item of Object.values(draft.people)) {
        count += Object.keys(item).filter(key => key !== 'tune').length + Object.keys(item.tune || {}).length
      }
      return count + Object.keys(draft.sides).length
    }

    /** A draft as the change it asks for (`panel.js`'s `change`). */
    function body (draft) {
      const asked = {}
      if (draft.tau !== undefined) asked.tau = Number(draft.tau)
      if (draft.sensitivity !== undefined) asked.sensitivity = draft.sensitivity
      if (draft.locked !== undefined) asked.locked = draft.locked
      const tune = Object.entries(draft.tune).map(([end, item]) => ({ end, ...item }))
      if (tune.length) asked.tune = tune
      const people = Object.entries(draft.people).map(([subject, item]) => ({ subject, ...item,
        tune: Object.entries(item.tune || {}).map(([end, nature]) => ({ end, nature })) }))
      if (people.length) asked.people = people
      const sides = Object.entries(draft.sides).map(([name, { fresh, ...item }]) => ({ name, ...item }))
      if (sides.length) asked.sides = sides
      if (draft.side !== undefined) asked.side = draft.side
      return asked
    }

    /** A list to choose one from: rows, and the names of groups between them. */
    function Choices ({ items, chosen, onChoose, label }) {
      return h('div', { className: 'mnl-list', role: 'listbox', 'aria-label': label },
        items.map(item => item.group !== undefined
          ? h('div', { key: item.key, className: 'mnl-list-group', role: 'presentation' }, item.group)
          : h('button', { key: item.key, type: 'button', role: 'option', 'aria-selected': item.key === chosen,
            className: ['mnl-option', item.key === chosen ? 'mnl-chosen' : '', item.changed ? 'mnl-changed' : '',
              item.gone ? 'mnl-gone' : ''].filter(Boolean).join(' '), onClick: () => onChoose(item.key) },
          item.swatch ? h('span', { className: 'mnl-swatch', style: { background: item.swatch } }) : null,
          h('span', { className: 'mnl-option-name' }, item.name),
          item.note ? h('span', { className: 'mnl-dim mnl-option-note' }, item.note) : null)))
    }

    /** One end chosen from her 26, grouped by bar, as a drop-down. */
    function EndSelect ({ view, value, onChange, t, label }) {
      return h('select', { className: 'mnl-select', value, 'aria-label': label,
        onChange: event => onChange(event.target.value) },
      view.bars.map(bar => h('optgroup', { key: bar.bar, label: barName(t, bar) },
        bar.ends.filter(Boolean).map(end => h('option', { key: end, value: end }, endName(t, view, end))))))
    }

    /** Her 26 feelings: a list grouped by bar, and the chosen one's nature and now. */
    function Feelings ({ view, draft, stage, dark, t }) {
      const [chosen, choose] = useState(view.ends[0]?.end)
      const tuneOf = end => ({ ...view.ends.find(item => item.end === end), ...draft.tune[end] })
      const retune = (what, value) => stage(old => ({ ...old, tune: { ...old.tune,
        [chosen]: { ...old.tune[chosen], [what]: value } } }))
      const items = view.bars.flatMap(bar => [{ key: `bar:${bar.bar}`, group: barName(t, bar) },
        ...bar.ends.filter(Boolean).map(end => {
          const tune = tuneOf(end)
          return { key: end, name: endName(t, view, end), swatch: endColour(view.bars, end, dark),
            changed: Boolean(draft.tune[end]), note: [tune.nature ? signed(tune.nature, 1) : '',
              tune.now ? signed(tune.now) : ''].filter(Boolean).join(' · ') }
        })])
      const tune = tuneOf(chosen), changed = draft.tune[chosen] || {}
      const bar = view.bars.find(item => item.ends.includes(chosen))
      return h('section', { className: 'mnl-card' },
        h('div', { className: 'mnl-subtitle' }, t('settings.tunes')),
        h('div', { className: 'mnl-dim' }, t('settings.tunesHint')),
        h('div', { className: 'mnl-split' },
          h(Choices, { items, chosen, onChoose: choose, label: t('settings.tunes') }),
          h('div', { className: 'mnl-edit' },
            h('div', { className: 'mnl-edit-title' },
              h('span', { className: 'mnl-swatch', style: { background: endColour(view.bars, chosen, dark) } }),
              endName(t, view, chosen), bar ? h('span', { className: 'mnl-dim' }, barName(t, bar)) : null),
            h(Slider, { label: t('settings.nature'), value: tune.nature, low: -3, high: 3, step: 0.1,
              changed: changed.nature !== undefined, onChange: value => retune('nature', value) }),
            h(Slider, { label: t('settings.now'), value: tune.now, low: -1, high: 1, step: 0.05,
              changed: changed.now !== undefined, onChange: value => retune('now', value) }))))
    }

    /** The people she knows: a list, and the chosen one's closeness and its lock, how much theirs counts, a lock, a
     * nudge to each feeling with them alone, and forgetting them. */
    function People ({ view, draft, stage, dark, t }) {
      const [chosen, choose] = useState(view.people[0]?.subject ?? null)
      const [end, setEnd] = useState(view.ends[0]?.end)
      if (!view.people.length) {
        return h('section', { className: 'mnl-card' }, h('div', { className: 'mnl-subtitle' }, t('people.title')),
          h('div', { className: 'mnl-dim' }, t('people.none')))
      }
      const person = view.people.find(item => item.subject === chosen) || view.people[0]
      const whoOf = item => item.subject === view.you ? t('you') : item.subject
      const items = view.people.map(item => {
        const staged = draft.people[item.subject] || {}
        return { key: item.subject, name: whoOf(item), changed: Boolean(draft.people[item.subject]),
          gone: staged.forget,
          note: item.closeness ? fixed(staged.closeness ?? item.closeness.value, 0) : '' }
      })
      const staged = draft.people[person.subject] || {}
      const close = person.closeness, value = (key, fallback) => staged[key] !== undefined ? staged[key] : fallback
      const set = (key, item) => stage(old => ({ ...old, people: { ...old.people,
        [person.subject]: { ...(old.people[person.subject] || {}), [key]: item } } }))
      const weight = value('weight', person.set ?? 'learned'), byHand = weight !== 'learned'
      const nudge = name => staged.tune?.[name] ?? person.nudge[name] ?? 0
      const nudged = view.ends.map(item => item.end).filter(name => nudge(name))
      const forgetting = staged.forget === true
      return h('section', { className: 'mnl-card' },
        h('div', { className: 'mnl-subtitle' }, t('people.title')),
        h('div', { className: 'mnl-dim' }, t('people.hint')),
        h('div', { className: 'mnl-split' },
          h(Choices, { items, chosen: person.subject, onChoose: choose, label: t('people.title') }),
          h('div', { className: 'mnl-edit', key: person.subject },
            h('div', { className: 'mnl-edit-title' }, whoOf(person),
              h('span', { className: 'mnl-dim' }, t('people.summary', { lessons: person.lessons,
                weight: percent(person.weight) }))),
            forgetting ? h('div', { className: 'mnl-row' },
              h('span', { className: 'mnl-changed' }, t('people.forgotten')),
              h('button', { type: 'button', className: 'mnl-button', onClick: () => set('forget', undefined) },
                t('people.undo'))) : null,
            close ? h('div', { className: 'mnl-stack' },
              h(Slider, { label: t('people.closeness', { role: roleName(t, close.role), floor: close.floor,
                ceiling: close.ceiling }),
                value: value('closeness', close.value), low: close.floor, high: close.ceiling, step: 1,
                changed: staged.closeness !== undefined, onChange: item => set('closeness', item), wide: true }),
              h('label', { className: staged.hold !== undefined ? 'mnl-check mnl-changed' : 'mnl-check' },
                h('input', { type: 'checkbox', checked: value('hold', close.locked),
                  onChange: event => set('hold', event.target.checked) }), t('people.holdCloseness')))
              : h('div', { className: 'mnl-dim' }, t('people.noRole')),
            h('label', { className: staged.weight !== undefined ? 'mnl-check mnl-changed' : 'mnl-check' },
              h('input', { type: 'checkbox', checked: byHand,
                onChange: event => set('weight', event.target.checked ? Number(fixed(person.weight)) : 'learned') }),
              t('people.byHand')),
            byHand ? h(Slider, { label: t('people.weight'), value: weight, low: 0, high: 1, step: 0.05, plain: true,
              wide: true,
              changed: staged.weight !== undefined, onChange: item => set('weight', item) }) : null,
            h('label', { className: staged.locked !== undefined ? 'mnl-check mnl-changed' : 'mnl-check' },
              h('input', { type: 'checkbox', checked: value('locked', person.locked),
                onChange: event => set('locked', event.target.checked) }), t('people.lock')),
            h('div', { className: 'mnl-inner' },
              h('div', { className: 'mnl-group-title' }, t('people.tunes')),
              h('div', { className: 'mnl-dim' }, t('people.tunesHint')),
              h('div', { className: 'mnl-row' },
                h('span', { className: 'mnl-swatch', style: { background: endColour(view.bars, end, dark) } }),
                h(EndSelect, { view, value: end, onChange: setEnd, t, label: t('people.tunes') })),
              h(Slider, { label: t('settings.nature'), value: nudge(end), low: -3, high: 3, step: 0.1,
                changed: staged.tune?.[end] !== undefined,
                onChange: item => set('tune', { ...(staged.tune || {}), [end]: item }) }),
              nudged.length ? h('div', { className: 'mnl-tags' }, nudged.map(name => h('button', { key: name,
                type: 'button', className: name === end ? 'mnl-tag mnl-small-tag mnl-chosen' : 'mnl-tag mnl-small-tag',
                onClick: () => setEnd(name) }, `${endName(t, view, name)} ${signed(nudge(name), 1)}`))) : null),
            forgetting ? null : h('div', { className: 'mnl-row' }, h('button', { type: 'button',
              className: 'mnl-button', onClick: () => {
                if (window.confirm(t('people.forgetConfirm', { who: whoOf(person) }))) set('forget', true)
              } }, t('people.forget'))))))
    }

    /** Her sides (属性) as tags: add one by name, remove the chosen one, and below, the chosen one's sentence, weight,
     * and whether she is locked in it and how often it shows. */
    function Sides ({ view, draft, stage, t }) {
      const locked = draft.side !== undefined ? draft.side : view.side
      const [chosen, choose] = useState(locked?.name ?? view.sides[0]?.name ?? null)
      const [adding, setAdding] = useState('')
      const staged = name => draft.sides[name] || {}
      const set = (name, key, item) => stage(old => ({ ...old, sides: { ...old.sides,
        [name]: { ...(old.sides[name] || {}), [key]: item } } }))
      const unstage = name => stage(old => {
        const sides = { ...old.sides }
        delete sides[name]
        return { ...old, sides }
      })
      const lock = next => stage(old => {
        const same = JSON.stringify(next) === JSON.stringify(view.side)
        const { side, ...rest } = old
        return same ? rest : { ...rest, side: next }
      })
      const added = Object.entries(draft.sides).filter(([name, item]) => item.fresh && !view.sides.some(side =>
        side.name === name)).map(([name]) => ({ name, what: '', given: false, own: GROWS, fresh: true }))
      const sides = [...view.sides, ...added]
      const side = sides.find(item => item.name === chosen) || null
      const free = view.names.filter(name => !sides.some(item => item.name === name))
      const add = () => {
        set(adding, 'fresh', true)
        choose(adding)
        setAdding('')
      }
      const remove = () => {
        if (!side || side.given) return
        if (side.fresh) {
          unstage(side.name)
          if (locked?.name === side.name) lock(view.side)
        } else if (staged(side.name).drop) unstage(side.name)
        else set(side.name, 'drop', true)
      }
      const mine = side ? staged(side.name) : {}, dropping = mine.drop === true
      const isLocked = Boolean(side && locked?.name === side.name)
      return h('section', { className: 'mnl-card' },
        h('div', { className: 'mnl-subtitle' }, t('sides.title')),
        h('div', { className: 'mnl-dim' }, t('sides.hint')),
        h('div', { className: 'mnl-tags' }, sides.length ? sides.map(item => h('button', { key: item.name,
          type: 'button', 'aria-pressed': item.name === chosen, onClick: () => choose(item.name),
          className: ['mnl-tag', item.name === chosen ? 'mnl-chosen' : '', staged(item.name).drop ? 'mnl-gone' : '',
            draft.sides[item.name] ? 'mnl-changed' : ''].filter(Boolean).join(' ') }, item.name,
          locked?.name === item.name ? h('span', { className: 'mnl-dim' }, `· ${t('sides.locked')}`) : null))
          : h('span', { className: 'mnl-dim' }, t('sides.none'))),
        h('div', { className: 'mnl-row' },
          h('select', { className: 'mnl-select', value: adding, 'aria-label': t('sides.pick'),
            onChange: event => setAdding(event.target.value) },
          h('option', { value: '' }, t('sides.pick')),
          free.map(name => h('option', { key: name, value: name }, name))),
          h('button', { type: 'button', className: 'mnl-button', disabled: !adding, onClick: add }, t('sides.write')),
          h('button', { type: 'button', className: 'mnl-button', disabled: !side || side.given, onClick: remove },
            dropping ? t('people.undo') : t('sides.drop'))),
        side ? h('div', { className: 'mnl-edit', key: side.name },
          h('div', { className: 'mnl-edit-title' }, side.name,
            side.given ? h('span', { className: 'mnl-dim' }, t('sides.given')) : null,
            dropping ? h('span', { className: 'mnl-changed' }, t('sides.dropped')) : null),
          side.given ? h('div', null, side.what) : h('textarea', { className: mine.what !== undefined
            ? 'mnl-text mnl-changed' : 'mnl-text', rows: 2, maxLength: 200, disabled: dropping,
          placeholder: t('sides.what'), value: mine.what ?? side.what,
          onChange: event => set(side.name, 'what', event.target.value) }),
          side.fresh && !(mine.what || '').trim() ? h('div', { className: 'mnl-error' }, t('sides.needsWhat')) : null,
          side.given ? null : h('label', { className: 'mnl-field' },
            h('span', { className: 'mnl-dim' }, t('sides.weight')),
            h('input', { type: 'number', min: 0, step: 0.5, value: mine.weight ?? side.own, disabled: dropping,
              className: mine.weight !== undefined ? 'mnl-changed' : '',
              onChange: event => set(side.name, 'weight', Number(event.target.value)) })),
          h('label', { className: draft.side !== undefined ? 'mnl-check mnl-changed' : 'mnl-check' },
            h('input', { type: 'checkbox', checked: isLocked, disabled: dropping,
              onChange: event => lock(event.target.checked ? { name: side.name, often: locked?.often ?? 1 } : null) }),
            t('sides.lockThis')),
          isLocked ? h(Slider, { label: t('sides.often'), value: locked.often, low: 0, high: 1, step: 0.05, plain: true,
            wide: true,
            changed: draft.side !== undefined, onChange: often => lock({ name: side.name, often }) }) : null,
          h('div', { className: 'mnl-dim' }, t('sides.oftenHint'))) : null)
    }

    /** Her settings on the plugin's page under Plugins: staged here, and sent together on save. */
    function SettingsPage ({ t }) {
      const [view, setView] = useState(null)
      const [draft, setDraft] = useState(EMPTY)
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
      const count = counted(draft, view), heartLocked = draft.locked ?? view.locked
      const unwritten = Object.values(draft.sides).some(item => item.fresh && !(item.what || '').trim())
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
      const save = () => send(body(draft), () => setDraft(EMPTY()))
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
          h('div', { className: 'mnl-dim' }, t('settings.tauHint')),
          h('label', { className: draft.locked !== undefined ? 'mnl-check mnl-changed' : 'mnl-check' },
            h('input', { type: 'checkbox', checked: heartLocked,
              onChange: event => setDraft(old => ({ ...old, locked: event.target.checked })) }),
            t('settings.heartLock')),
          h('div', { className: 'mnl-dim' }, t('settings.heartLockHint'))),
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
        h(Feelings, { view, draft, stage: setDraft, dark, t }),
        h(People, { view, draft, stage: setDraft, dark, t }),
        h(Sides, { view, draft, stage: setDraft, t }),
        h('div', { className: 'mnl-savebar' },
          h('span', { className: count ? 'mnl-changed' : 'mnl-dim' },
            count ? t('settings.unsaved', { count }) : t('settings.none')),
          status.text ? h('span', { className: 'mnl-ok' }, status.text) : null,
          status.error ? h('span', { className: 'mnl-error' }, status.error) : null,
          h('span', { className: 'mnl-spacer' }),
          h('button', { type: 'button', className: 'mnl-button', disabled: status.busy || !count,
            onClick: () => setDraft(EMPTY()) }, t('settings.discard')),
          h('button', { type: 'button', className: 'mnl-button mnl-primary',
            disabled: status.busy || !count || badTau || unwritten,
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
.mnl-switch { display: inline-flex; align-self: flex-end; border-radius: 8px; overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-switch button { height: 26px; padding: 0 12px; border: 0; font: inherit; font-size: 12px; color: inherit;
  background: transparent; cursor: pointer }
.mnl-turning { cursor: grab; touch-action: pan-y } /* (a finger up or down still scrolls the page) */
.mnl-turning:active { cursor: grabbing }
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
.mnl-wide { grid-template-columns: minmax(8em, auto) 1fr 3.2em }
.mnl-split { display: grid; grid-template-columns: minmax(150px, 220px) minmax(0, 1fr); gap: 10px; align-items: start }
.mnl-list { display: flex; flex-direction: column; gap: 1px; max-height: 280px; overflow-y: auto; padding: 4px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22)); border-radius: 10px }
.mnl-list-group { font-size: 11.5px; font-weight: 600; padding: 6px 8px 2px;
  color: var(--dsw-alias-label-tertiary, #888) }
.mnl-option { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 8px; border: 0;
  border-radius: 7px; background: transparent; color: inherit; font: inherit; font-weight: 400; text-align: left;
  cursor: pointer }
.mnl-option:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.1)) }
.mnl-chosen, .mnl-chosen:hover { background: var(--dsw-alias-state-business-secondary, rgba(77,107,254,.14)) }
.mnl-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.mnl-option-note { font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums }
.mnl-option.mnl-changed .mnl-option-name::after { content: ' •' }
.mnl-gone .mnl-option-name, .mnl-tag.mnl-gone { text-decoration: line-through; opacity: .6 }
.mnl-edit { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px; border-radius: 10px;
  border: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22)) }
.mnl-edit-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 600 }
.mnl-edit-title .mnl-dim { font-weight: 400 }
.mnl-tags { display: flex; flex-wrap: wrap; gap: 6px }
.mnl-tag { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 12px; border-radius: 14px;
  font: inherit; color: inherit; background: transparent; cursor: pointer;
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-tag.mnl-chosen { border-color: var(--dsw-alias-state-business-primary, #4d6bfe) }
.mnl-small-tag { height: 24px; padding: 0 9px; font-size: 12px }
.mnl-stack { display: flex; flex-direction: column; gap: 4px }
.mnl-check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; cursor: pointer }
.mnl-check input { margin-top: 3px; flex: none }
.mnl-inner { border-top: .5px solid var(--dsw-alias-border-l2, rgba(128,128,128,.22)); padding-top: 6px }
.mnl-text, .mnl-select { font: inherit; color: inherit; box-sizing: border-box; border-radius: 8px; padding: 6px 8px;
  background: var(--dsw-alias-bg-layer-3, transparent);
  border: .5px solid var(--dsw-alias-border-l4, rgba(128,128,128,.5)) }
.mnl-text { width: 100%; resize: vertical }
.mnl-select { height: 30px; padding: 0 8px; max-width: 100% }
.mnl-field input[type=number].mnl-changed { color: var(--dsw-alias-state-business-primary, #4d6bfe) }
@media (max-width: 480px) {
  .mnl-tunes { grid-template-columns: 1fr }
  .mnl-wide { grid-template-columns: 1fr 3.2em }
  .mnl-split { grid-template-columns: 1fr }
  .mnl-list { max-height: 200px }
  .mnl-wide > .mnl-dim { grid-column: 1 / -1 }
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

    module.exports = { inject, apply, format, endColour, baseRadius, endName, barName, COLOURS, EN, ZH, ROUTES,
      KIND }
    return module.exports
  }
})

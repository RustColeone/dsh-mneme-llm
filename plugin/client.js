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
    const dom = require('react-dom') // (her star map, into the box her settings page gives it)
    const createPortal = dom?.createPortal ?? dom?.default?.createPortal ?? null

    // ---- page/settings.js, word for word (node tools/copies.mjs writes it) ----
    const MnemeSettings = (() => {
      const module = undefined, self = {} // (so that it is this bundle's own)
// Her settings as one page in four tabs, Her · People · Memory · Gut, the same wherever she is kept: the DSH plugin's
// page under Plugins (plugin/client.js has this file word for word), a host's own web page, and mneme-llm's tuner. A
// host gives it her settings and takes a change, in one shape (plugin/panel.js: `settings` is what `load` gives, and
// `settle` takes what `save` is handed); a part the host does not have is null in what it gives, and the page leaves
// it out. Nothing is changed until Save, which sends every tab's changes at once; starting over, and making her young
// again, go at once, each after a question. No framework: it draws itself into the element it is given.
//
//     const page = MnemeSettings.mount(element, { load, save, language: 'en' | 'zh', starmap, dark, words, confirm })
//     page.reload()   page.destroy()
//
// `starmap(box, view)`, if given, draws her star map into a box on the Gut tab (and may return a function that stops
// it); `dark()` says whether the page is dark (for the colours of her feelings); `words` are a host's own over these.
;(function (root, make) {
  if (typeof module === 'object' && module && module.exports) module.exports = make()
  else root.MnemeSettings = make()
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict'

  const TABS = ['her', 'people', 'memory', 'gut']
  const KEPT = 'mneme-settings.tab' // (the browser keeps which tab was open)
  const NATURE = 6 // a nature goes from -6 to 6 (`NATURE` in mneme-llm's gut)
  const GROWS = 6.0 // a new side's weight when drawn (`GROWS` there)
  const LANGUAGES = ['auto', 'english', 'chinese', 'cantonese', 'japanese']

  // One colour for each of her 14 bars, in their order; the first end of a bar a deeper shade and the second a lighter
  // one, for each theme (as her star map draws them).
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
    'page.intro': 'Her settings, in four tabs. A save is used at once and kept.',
    'page.loading': 'Reading her settings…',
    'page.unreachable': 'Her settings cannot be reached ({error}).',
    'tab.her': 'Her',
    'tab.people': 'People',
    'tab.memory': 'Memory',
    'tab.gut': 'Gut',
    you: 'you',
    // Her
    'her.title': 'Who she is',
    'her.name': 'Her name',
    'her.language': 'The language she answers in',
    'her.languageHint': 'Whatever people write in. Each person\'s own: she answers each in theirs.',
    'language.auto': 'Each person\'s own',
    'language.english': 'English',
    'language.chinese': 'Chinese',
    'language.cantonese': 'Cantonese',
    'language.japanese': 'Japanese',
    'her.zone': 'Her time zone',
    'her.zoneHint': 'Such as UTC+8 or Asia/Shanghai; empty, the machine\'s. Her days of talking are counted in it.',
    'card.title': 'Character Card',
    'card.hint': 'Who she is, in your words. On, it is in her system prompt, which every call carries.',
    'card.placeholder': 'You are…',
    'card.on': 'In her system prompt',
    'card.drop': 'Take it away',
    'card.dropped': 'Taken away when you save',
    'card.none': 'No card yet.',
    'card.how.set': 'Set by you.',
    'card.how.settings': 'From her settings file.',
    'card.how.said': 'The first thing you said to her.',
    'card.needsText': 'Write the card before putting it in her system prompt.',
    // People
    'people.title': 'People she knows',
    'people.hint': 'Who each person is to her and how close; with her gut, how she is with them too.',
    'people.none': 'Nobody yet.',
    'people.role': 'Who they are to her',
    'people.roleYou': 'Who you are to her',
    'people.noRole': 'no role',
    'people.closeness': 'Closeness ({role}, {floor} to {ceiling})',
    'people.needsRole': 'Closeness needs a role.',
    'people.holdCloseness': 'Lock closeness: no exchange or time moves it',
    'people.summary': '{lessons} lessons · {weight}% theirs',
    'people.byHand': 'Set how much what is different with them counts, by hand',
    'people.weight': 'theirs',
    'people.lock': 'Lock how she is with them: what they say teaches nothing, and they do not fade',
    'people.tunes': 'Each feeling, with them alone',
    'people.tunesHint': 'A nudge to each feeling with this person only, on top of all she is and has learned with ' +
      'them; it stays (-6 to 6; 0 removes it).',
    'people.forget': 'Forget them in her gut',
    'people.forgetConfirm': 'Forget {who} in her gut? How she is with them goes, and so do the sides only they ' +
      'wanted. What they did to her heart stays.',
    'people.forgotten': 'Forgotten when you save',
    'people.undo': 'Keep',
    'me.name': 'What she calls you',
    'me.accounts': 'Your accounts on chat channels',
    'me.accountsHint': 'Messages from them are yours: one person to her memory and to her gut.',
    'me.placeholder': 'qq:10001',
    'me.add': 'Add',
    'me.remove': 'Remove',
    'me.removed': 'removed when you save',
    'me.added': 'added when you save',
    'me.noAccounts': 'None yet.',
    'me.badAccount': 'A channel and an id, such as qq:10001.',
    'others.title': 'People she meets',
    'others.role': 'Who they are to her at first',
    'others.hint': 'Until you give them a role of their own.',
    'role.creator': 'creator',
    'role.family': 'family',
    'role.friend': 'friend',
    'role.acquaintance': 'acquaintance',
    // Memory
    'surface.title': 'What she keeps of lately',
    'surface.hint': 'With one person she reads the newest of what was said, word for word: as many days of talking ' +
      'as fit between the least and the most.',
    'surface.days': 'Days of talking',
    'surface.floor': 'At least (tokens)',
    'surface.cap': 'At most (tokens)',
    'surface.window': 'Her model\'s window (tokens)',
    'look.title': 'What was said before, with each message',
    'look.hint': 'What bears on the message, found by its words and its meaning, up to so many characters.',
    'look.budget': 'Characters',
    'look.bar': 'Bar for words alone',
    'look.barHint': 'With no meaning to go by, what was said comes only when the words it shares carry this share ' +
      'of the message; 0 brings every match.',
    'memory.bad': 'A number is missing, or too small.',
    'start.title': 'Start over',
    'start.fresh': 'Lately, from the start',
    'start.freshHint': 'What she keeps of lately with you starts over; every word stays in her deep memory.',
    'start.freshConfirm': 'Start what she keeps of lately over?',
    'start.deep': 'Forget everyone',
    'start.deepHint': 'What she remembers of everyone, gone for good: every exchange and every note. Who they are ' +
      'to her stays, and so does her card.',
    'start.deepConfirm': 'Forget what she remembers of everyone, for good? This cannot be undone.',
    'start.gut': 'As she was born',
    'start.gutHint': 'That, and what people taught her gut: she is as she was born.',
    'start.gutConfirm': 'Forget everyone and everything people taught her gut, for good? This cannot be undone.',
    'start.done': 'Done.',
    'start.unsaved': 'What you have not saved stays as it is.',
    // Gut
    'gut.none': 'She has no gut here.',
    'gut.map': 'Her star map',
    'settings.grown': 'Growing up',
    'settings.tau': 'tau (lessons)',
    'settings.tauHint': 'How fast her heart grows up: young, a lesson moves her heart a lot; grown up (at five times ' +
      'tau), a little. A number above 0.',
    'settings.badTau': 'tau is a number above 0',
    'settings.age': 'Age: {age} lessons, {grown}% grown up, learning at {learning}% of her young pace',
    'settings.young': 'Young again',
    'settings.youngConfirm': 'Make her young again? Her age goes back to 0 and her heart learns fast again. She ' +
      'forgets nothing.',
    'settings.heartLock': 'Lock her heart',
    'settings.heartLockHint': 'Her heart learns nothing and does not grow up until it is unlocked; how she is with ' +
      'each person still learns, unless locked too.',
    'settings.sensitivity': 'Sensitivity',
    'settings.sensitivityHint': 'How hard every moment hits her: -1 thick-skinned (lightly) to 1 sensitive (hard); 0 ' +
      'is as she is.',
    'settings.dull': 'thick-skinned',
    'settings.keen': 'sensitive',
    'settings.tunes': 'Each feeling, by hand',
    'settings.tunesHint': 'Nature (-6 to 6) is where she stands on a feeling, as if she had been born so: 3 is about ' +
      'even, 6 is fully. What she lives moves her on from there (slowly once she is grown; a locked heart keeps it), ' +
      'and 0 removes it. Now (-1 to 1) is how much more or less of it she feels lately than usual: it fades as she ' +
      'lives.',
    'settings.nature': 'nature',
    'settings.now': 'now',
    'sides.title': 'Her sides',
    'sides.hint': 'A side is a name and one sentence of what she does. A locked side holds for everyone, whatever is ' +
      'drawn and however long; how often is how strongly it shows.',
    'sides.none': 'No sides yet.',
    'sides.given': 'given in her settings',
    'sides.weight': 'weight when drawn',
    'sides.drop': 'Remove',
    'sides.dropped': 'Removed when you save',
    'sides.often': 'how often',
    'sides.oftenHint': 'The share of her turns the sentence goes beside the message: 1 is every turn.',
    'sides.pick': 'Choose a name',
    'sides.what': 'What she does, said to her ("You…")',
    'sides.write': 'Add',
    'sides.locked': 'locked',
    'sides.lockThis': 'Lock her in this side',
    'sides.needsWhat': 'Write what she does before saving.',
    // The save bar
    'save.save': 'Save',
    'save.discard': 'Discard',
    'save.unsaved': '{count} unsaved',
    'save.none': 'No changes',
    'save.saved': 'Saved.',
    'save.failed': 'Not saved: {error}'
  }

  const ZH = {
    'page.intro': '她的设置，分成四页。保存后立刻生效，并且会一直保留。',
    'page.loading': '正在读取她的设置……',
    'page.unreachable': '读取不到她的设置（{error}）。',
    'tab.her': '她自己',
    'tab.people': '认识的人',
    'tab.memory': '记忆',
    'tab.gut': '直觉',
    you: '你',
    'her.title': '她是谁',
    'her.name': '她的名字',
    'her.language': '她回答用的语言',
    'her.languageHint': '不管对方用什么语言写。选“跟着对方”，她就用每个人自己的语言回答。',
    'language.auto': '跟着对方',
    'language.english': '英语',
    'language.chinese': '中文',
    'language.cantonese': '粤语',
    'language.japanese': '日语',
    'her.zone': '她的时区',
    'her.zoneHint': '比如 UTC+8 或 Asia/Shanghai；空着就用这台机器的时区。她按这个时区来算聊天的日子。',
    'card.title': '角色卡',
    'card.hint': '用你自己的话写她是谁。打开后，它会放进她的系统提示，每次调用都会带上。',
    'card.placeholder': '你是……',
    'card.on': '放进她的系统提示',
    'card.drop': '拿掉',
    'card.dropped': '保存后拿掉',
    'card.none': '还没有角色卡。',
    'card.how.set': '这是你设的。',
    'card.how.settings': '来自她的设置文件。',
    'card.how.said': '这是你对她说的第一句话。',
    'card.needsText': '先写好角色卡，再放进她的系统提示。',
    'people.title': '她认识的人',
    'people.hint': '每个人对她来说是谁、有多亲近；有直觉的话，还有她和这个人相处的样子。',
    'people.none': '还没有人。',
    'people.role': '对她来说是',
    'people.roleYou': '你对她来说是',
    'people.noRole': '没有角色',
    'people.closeness': '亲近度（{role}，{floor} 到 {ceiling}）',
    'people.needsRole': '要先有角色，才有亲近度。',
    'people.holdCloseness': '锁住亲近度：不再因交流或时间而变动',
    'people.summary': '{lessons} 节课 · {weight}% 专属于这个人',
    'people.byHand': '亲手设定：她和这个人在一起时不一样的那份算多少',
    'people.weight': '专属于这个人',
    'people.lock': '锁住她和这个人相处的样子：这个人说的话什么也不教，也不会淡去',
    'people.tunes': '每一种感受，只对这个人',
    'people.tunesHint': '只针对这个人，给每种感受加一点偏移，叠加在她本来的样子和她与这个人相处中学到的一切之上，并且一直保留（-6 到 6；0 表示移除）。',
    'people.forget': '在她的直觉里忘记这个人',
    'people.forgetConfirm': '在她的直觉里忘记{who}？她和这个人相处的样子会消失，只有这个人想要的属性也会消失；这个人在她心里留下的影响还在。',
    'people.forgotten': '保存后就会忘记',
    'people.undo': '保留',
    'me.name': '她怎么称呼你',
    'me.accounts': '你在聊天平台上的账号',
    'me.accountsHint': '从这些账号发来的消息都算你的：在她的记忆和直觉里是同一个人。',
    'me.placeholder': 'qq:10001',
    'me.add': '添加',
    'me.remove': '去掉',
    'me.removed': '保存后去掉',
    'me.added': '保存后添加',
    'me.noAccounts': '还没有。',
    'me.badAccount': '写平台名和账号，比如 qq:10001。',
    'others.title': '她新认识的人',
    'others.role': '刚认识时对她来说是',
    'others.hint': '直到你给这个人设了自己的角色为止。',
    'role.creator': '创造者',
    'role.family': '家人',
    'role.friend': '朋友',
    'role.acquaintance': '认识的人',
    'surface.title': '她记得的最近的对话',
    'surface.hint': '和一个人聊天时，她会逐字读你们最近说过的话：在下限和上限之间，能放下几天的聊天就放几天。',
    'surface.days': '聊天的天数',
    'surface.floor': '至少（token）',
    'surface.cap': '至多（token）',
    'surface.window': '她的模型的上下文窗口（token）',
    'look.title': '每条消息带上的以前的对话',
    'look.hint': '和这条消息有关的以前的对话，按字词和意思找出来，总长不超过这么多字。',
    'look.budget': '字数',
    'look.bar': '只按字词匹配时的门槛',
    'look.barHint': '没有意思可以参考时，共有的字词要占到这条消息的这么多比重，那段对话才会带上；0 表示每个匹配都带上。',
    'memory.bad': '有个数字没填，或者太小。',
    'start.title': '重新开始',
    'start.fresh': '最近的对话从头开始',
    'start.freshHint': '她记得的你们最近的对话从头开始；说过的每句话都还在她的深层记忆里。',
    'start.freshConfirm': '让她记得的最近的对话从头开始？',
    'start.deep': '忘掉所有人',
    'start.deepHint': '她记得的关于所有人的一切永久删除：每段对话和每条笔记。每个人对她来说是谁还保留着，她的角色卡也还在。',
    'start.deepConfirm': '永久忘掉她记得的关于所有人的一切？这无法撤销。',
    'start.gut': '回到刚出生的样子',
    'start.gutHint': '再加上大家教给她直觉的一切：她回到刚出生的样子。',
    'start.gutConfirm': '永久忘掉所有人，以及大家教给她直觉的一切？这无法撤销。',
    'start.done': '完成了。',
    'start.unsaved': '还没保存的改动会原样留着。',
    'gut.none': '她在这里没有直觉。',
    'gut.map': '她的星图',
    'settings.grown': '长大',
    'settings.tau': 'tau（节课）',
    'settings.tauHint': '她的心长得多快：小时候，一节课就能让她的心变化很大；长大后（到五倍 tau 时），变化就很小。填大于 0 的数。',
    'settings.badTau': 'tau 要大于 0',
    'settings.age': '年龄：{age} 节课，长大了 {grown}%，学习速度是她小时候的 {learning}%',
    'settings.young': '回到小时候',
    'settings.youngConfirm': '让她回到小时候？她的年龄会归零，她的心又会学得很快。她不会忘记任何事。',
    'settings.heartLock': '锁住她的心',
    'settings.heartLockHint': '解锁之前，她的心不再学习，也不再长大；她和每个人相处的样子仍会学，除非也锁住。',
    'settings.sensitivity': '敏感度',
    'settings.sensitivityHint': '每个瞬间对她的冲击有多大：-1 钝感（轻轻带过）到 1 敏感（冲击很重）；0 就是她本来的样子。',
    'settings.dull': '钝感',
    'settings.keen': '敏感',
    'settings.tunes': '每种感觉，逐个调',
    'settings.tunesHint': '天性（-6 到 6）是她在这种感受上站的位置，就像她生来如此：3 大约持平，6 是完全如此。她经历的事会让她从那里慢慢移开（长大后更慢；锁住她的心，它就留在那里），填 0 就是去掉它。现在（-1 到 1）是她最近比平常多或少感受到这种感觉的程度：它会随着她的生活慢慢变淡。',
    'settings.nature': '天性',
    'settings.now': '现在',
    'sides.title': '她的属性',
    'sides.hint': '属性由一个名字和一句她的做法组成。锁住的属性对所有人都生效，无论抽到什么、持续多久；而它出现的频率，决定它表现得有多强。',
    'sides.none': '还没有属性。',
    'sides.given': '由她的设置指定',
    'sides.weight': '抽到时的权重',
    'sides.drop': '去掉',
    'sides.dropped': '保存后去掉',
    'sides.often': '出现频率',
    'sides.oftenHint': '她的回合中，这句做法附在消息旁的比例：1 表示每个回合。',
    'sides.pick': '选择一个名字',
    'sides.what': '她的做法，用对她说的话来写（你……）',
    'sides.write': '添加',
    'sides.locked': '已锁住',
    'sides.lockThis': '把她锁在这一面',
    'sides.needsWhat': '保存前写下她的做法。',
    'save.save': '保存',
    'save.discard': '放弃',
    'save.unsaved': '{count} 项未保存',
    'save.none': '没有改动',
    'save.saved': '已保存。',
    'save.failed': '未保存：{error}'
  }
  const WORDS = { en: EN, zh: ZH }

  // ---- what a draft is, counts and asks for: plain functions, with no page in sight ---------------------------------

  /** A draft with nothing in it: what Save would send, as it is staged. */
  const empty = () => ({ her: {}, me: { link: [], unlink: [] }, people: {}, memory: {}, rows: {},
    gut: { tune: {}, sides: {} } })

  const keys = table => Object.keys(table || {}).length

  /** How many values a draft changes. */
  function counted (draft) {
    let count = keys(draft.her) - ('card' in draft.her ? 1 : 0)
    if ('card' in draft.her) count += draft.her.card === null ? 1 : keys(draft.her.card)
    count += ('name' in draft.me ? 1 : 0) + draft.me.link.length + draft.me.unlink.length
    count += draft.others !== undefined ? 1 : 0
    for (const item of Object.values(draft.people)) count += keys(item) - ('tune' in item ? 1 : 0) + keys(item.tune)
    count += keys(draft.memory) + keys(draft.rows)
    const gut = draft.gut
    for (const key of ['tau', 'sensitivity', 'locked', 'side']) if (gut[key] !== undefined) count += 1
    for (const item of Object.values(gut.tune)) count += keys(item)
    return count + keys(gut.sides)
  }

  /** A draft as the change it asks for (`settle`'s shape). */
  function body (draft) {
    const asked = {}
    if (keys(draft.her)) asked.her = { ...draft.her }
    const me = {}
    if ('name' in draft.me) me.name = draft.me.name
    if (draft.me.link.length) me.link = [...draft.me.link]
    if (draft.me.unlink.length) me.unlink = [...draft.me.unlink]
    if (keys(me)) asked.me = me
    if (draft.others !== undefined) asked.others = draft.others
    const people = Object.entries(draft.people).map(([subject, { tune, ...item }]) => ({ subject, ...item,
      ...(tune ? { tune: Object.entries(tune).map(([end, nature]) => ({ end, nature })) } : {}) }))
    if (people.length) asked.people = people
    if (keys(draft.memory)) asked.memory = { ...draft.memory }
    if (keys(draft.rows)) asked.rows = { ...draft.rows }
    const gut = {}, staged = draft.gut
    if (staged.tau !== undefined) gut.tau = Number(staged.tau)
    if (staged.sensitivity !== undefined) gut.sensitivity = staged.sensitivity
    if (staged.locked !== undefined) gut.locked = staged.locked
    const tune = Object.entries(staged.tune).map(([end, item]) => ({ end, ...item }))
    if (tune.length) gut.tune = tune
    const sides = Object.entries(staged.sides).map(([name, { fresh, ...item }]) => ({ name, ...item }))
    if (sides.length) gut.sides = sides
    if (staged.side !== undefined) gut.side = staged.side
    if (keys(gut)) asked.gut = gut
    return asked
  }

  /** What stops a draft from being saved, as the words that say so; null when nothing does. */
  function blocked (draft, view) {
    const tau = draft.gut.tau
    if (tau !== undefined && !(Number(tau) > 0 && Number.isFinite(Number(tau)))) return 'settings.badTau'
    if (Object.values(draft.gut.sides).some(item => item.fresh && !String(item.what || '').trim())) {
      return 'sides.needsWhat'
    }
    if (Object.values(draft.memory).some(value => value === null)) return 'memory.bad'
    const card = draft.her.card
    if (card && card.on === true && !String(card.text ?? view?.her?.card?.text ?? '').trim()) return 'card.needsText'
    return null
  }

  /** An end's colour: its bar's, the first end of a bar deeper and the second lighter. */
  function endColour (bars, end, dark) {
    const index = bars.findIndex(bar => bar.ends.includes(end))
    const shades = COLOURS[dark ? 'dark' : 'light']
    if (index < 0) return dark ? '#cccccc' : '#555555'
    return (bars[index].ends[0] === end ? shades.deep : shades.light)[index]
  }

  const format = (text, values = {}) => String(text).replace(/\{(\w+)\}/g, (all, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : all)
  const fixed = (value, digits = 2) => (Number(value) || 0).toFixed(digits)
  const signed = (value, digits = 2) => (value > 0 ? '+' : value < 0 ? '−' : '±') + Math.abs(value).toFixed(digits)
  const percent = value => fixed((Number(value) || 0) * 100, 0)
  const ACCOUNT = /^[A-Za-z][\w.-]{0,31}:\S{1,200}$/

  const CSS = `
.ms-page { --ms-accent-: var(--ms-accent, #4d6bfe); --ms-line-: var(--ms-line, rgba(128,128,128,.3));
  --ms-soft-: var(--ms-soft, rgba(128,128,128,.22)); --ms-strong-: var(--ms-strong, rgba(128,128,128,.5));
  --ms-dim-: var(--ms-dim, #888); --ms-field-: var(--ms-field, transparent); --ms-card-: var(--ms-card, transparent);
  --ms-bar-: var(--ms-bar, var(--ms-bg, #fff)); --ms-hover-: var(--ms-hover, rgba(128,128,128,.1));
  --ms-chosen-: var(--ms-chosen, rgba(77,107,254,.14)); --ms-error-: var(--ms-error, #d93036);
  --ms-ok-: var(--ms-ok, #2f9e63); --ms-on-accent-: var(--ms-on-accent, #fff);
  color: var(--ms-fg, inherit); font-size: 13px; line-height: 1.55; display: flex; flex-direction: column; gap: 12px;
  box-sizing: border-box; min-width: 0; max-width: 960px }
.ms-page *, .ms-page *::before, .ms-page *::after { box-sizing: border-box }
.ms-page p { margin: 0 }
.ms-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: .5px solid var(--ms-line-); padding-bottom: 6px }
.ms-tab { height: 32px; padding: 0 14px; border-radius: 8px; border: 0; font: inherit; color: inherit; cursor: pointer;
  background: transparent; display: inline-flex; align-items: center; gap: 6px }
.ms-tab:hover { background: var(--ms-hover-) }
.ms-tab[aria-selected=true] { background: var(--ms-chosen-); font-weight: 600 }
.ms-tab-count { font-size: 11px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; line-height: 18px;
  text-align: center; color: var(--ms-on-accent-); background: var(--ms-accent-); font-weight: 600 }
.ms-panel { display: flex; flex-direction: column; gap: 12px }
.ms-subtitle { font-size: 13.5px; font-weight: 600; margin-bottom: 2px }
.ms-dim { color: var(--ms-dim-); font-size: 12px; line-height: 1.5 }
.ms-error { color: var(--ms-error-); font-size: 12px }
.ms-ok { color: var(--ms-ok-); font-size: 12px }
.ms-card { border: .5px solid var(--ms-line-); border-radius: 12px; padding: 10px 12px; display: flex;
  flex-direction: column; gap: 8px; min-width: 0; background: var(--ms-card-) }
.ms-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center }
.ms-field { display: grid; grid-template-columns: minmax(9em, 14em) minmax(0, 1fr); gap: 4px 10px; align-items: center }
.ms-field > .ms-dim { grid-column: 2 }
.ms-field-label { font-weight: 400 }
.ms-input, .ms-select, .ms-text { font: inherit; color: inherit; border-radius: 8px; background: var(--ms-field-);
  border: .5px solid var(--ms-strong-); min-width: 0 }
.ms-input, .ms-select { height: 30px; padding: 0 8px; max-width: 100% }
.ms-input[type=number] { width: 140px }
.ms-input.ms-wide { width: 100% }
.ms-text { width: 100%; padding: 6px 8px; resize: vertical }
.ms-input[aria-invalid=true] { border-color: var(--ms-error-) }
.ms-changed { color: var(--ms-accent-); font-weight: 600 }
.ms-input.ms-changed, .ms-select.ms-changed, .ms-text.ms-changed { border-color: var(--ms-accent-); font-weight: 400 }
.ms-check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; cursor: pointer }
.ms-check input { margin-top: 3px; flex: none }
.ms-check.ms-changed > span { color: var(--ms-accent-); font-weight: 600 }
.ms-slider { display: grid; grid-template-columns: minmax(3.6em, auto) 1fr 3.4em; gap: 6px; align-items: center }
.ms-slider input { width: 100%; min-width: 0 }
.ms-number { font-variant-numeric: tabular-nums; text-align: right }
.ms-slider.ms-changed .ms-number { color: var(--ms-accent-); font-weight: 600 }
.ms-slider.ms-changed > .ms-dim:first-child { color: var(--ms-accent-) }
.ms-range { display: flex; gap: 8px; align-items: center }
.ms-range input { flex: 1 1 160px; min-width: 120px }
.ms-button { height: 30px; padding: 0 14px; border-radius: 8px; font: inherit; cursor: pointer; color: inherit;
  background: transparent; border: .5px solid var(--ms-strong-) }
.ms-button:hover:not(:disabled) { background: var(--ms-hover-) }
.ms-button:disabled { opacity: .5; cursor: default }
.ms-primary { color: var(--ms-on-accent-); border-color: transparent; background: var(--ms-accent-) }
.ms-primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--ms-accent-) }
.ms-danger { color: var(--ms-error-); border-color: var(--ms-error-) }
.ms-split { display: grid; grid-template-columns: minmax(150px, 220px) minmax(0, 1fr); gap: 10px; align-items: start }
.ms-list { display: flex; flex-direction: column; gap: 1px; max-height: 300px; overflow-y: auto; padding: 4px;
  border: .5px solid var(--ms-soft-); border-radius: 10px }
.ms-list-group { font-size: 11.5px; font-weight: 600; padding: 6px 8px 2px; color: var(--ms-dim-) }
.ms-option { display: flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 8px; border: 0;
  border-radius: 7px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer }
.ms-option:hover { background: var(--ms-hover-) }
.ms-option[aria-selected=true] { background: var(--ms-chosen-) }
.ms-option-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ms-option-note { font-size: 11px; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--ms-dim-) }
.ms-option.ms-changed .ms-option-name::after { content: ' •' }
.ms-gone .ms-option-name, .ms-tag.ms-gone, .ms-account.ms-gone > span { text-decoration: line-through; opacity: .6 }
.ms-edit { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px; border-radius: 10px;
  border: .5px solid var(--ms-soft-) }
.ms-edit-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 600 }
.ms-edit-title .ms-dim { font-weight: 400 }
.ms-inner { border-top: .5px solid var(--ms-soft-); padding-top: 8px; display: flex; flex-direction: column; gap: 6px }
.ms-tags { display: flex; flex-wrap: wrap; gap: 6px }
.ms-tag { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 12px; border-radius: 14px;
  font: inherit; color: inherit; background: transparent; cursor: pointer; border: .5px solid var(--ms-strong-) }
.ms-tag[aria-pressed=true] { border-color: var(--ms-accent-); background: var(--ms-chosen-) }
.ms-tag.ms-changed { color: var(--ms-accent-) }
.ms-small-tag { height: 24px; padding: 0 9px; font-size: 12px }
.ms-swatch { width: 9px; height: 9px; border-radius: 50%; flex: none; display: inline-block }
.ms-stack { display: flex; flex-direction: column; gap: 4px }
.ms-accounts { display: flex; flex-direction: column; gap: 4px }
.ms-account { display: flex; align-items: center; gap: 8px; min-height: 30px }
.ms-account > span { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px }
.ms-start { display: grid; grid-template-columns: minmax(10em, auto) 1fr; gap: 8px 12px; align-items: center }
.ms-map { min-height: 40px }
.ms-savebar { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center;
  padding: 10px 12px; border-radius: 12px; z-index: 2; border: .5px solid var(--ms-line-); background: var(--ms-bar-) }
.ms-spacer { flex: 1 }
@media (max-width: 560px) {
  .ms-field { grid-template-columns: 1fr }
  .ms-field > .ms-dim { grid-column: 1 }
  .ms-split { grid-template-columns: 1fr }
  .ms-list { max-height: 200px }
  .ms-start { grid-template-columns: 1fr }
  .ms-tab { padding: 0 10px }
}`

  // ---- the page ----------------------------------------------------------------------------------------------------

  /** An element: `props` are its class, text, attributes (`attrs`), listeners (`on`), style and dataset (`data`). */
  function el (tag, props = {}, ...children) {
    const node = document.createElement(tag)
    if (props.className) node.className = props.className
    if (props.text !== undefined && props.text !== null) node.textContent = String(props.text)
    for (const [name, value] of Object.entries(props.attrs || {})) {
      if (value === false || value === null || value === undefined) continue
      if (name in node && typeof value !== 'string') node[name] = value
      else node.setAttribute(name, value === true ? '' : String(value))
    }
    for (const [name, listener] of Object.entries(props.on || {})) node.addEventListener(name, listener)
    if (props.style) Object.assign(node.style, props.style)
    for (const [name, value] of Object.entries(props.data || {})) node.dataset[name] = value
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child)
    return node
  }
  const classes = (...names) => names.filter(Boolean).join(' ')

  function style () {
    if (document.getElementById('mneme-settings-style')) return
    document.head.appendChild(el('style', { attrs: { id: 'mneme-settings-style' }, text: CSS }))
  }

  const kept = {
    get () {
      try { return localStorage.getItem(KEPT) } catch { return null }
    },
    set (value) {
      try { localStorage.setItem(KEPT, value) } catch { /* a private window */ }
    }
  }

  /** Her settings drawn into `element`; see the top of this file. */
  function mount (element, options = {}) {
    style()
    const languageOf = () => (typeof options.language === 'function' ? options.language() : options.language) ===
      'zh' ? 'zh' : 'en'
    const t = (key, values) => {
      const lang = languageOf()
      const own = options.words?.[lang]?.[key] ?? options.words?.en?.[key]
      return format(own ?? WORDS[lang][key] ?? EN[key] ?? key, values)
    }
    const chinese = () => languageOf() === 'zh'
    const dark = () => Boolean(options.dark?.())
    const ask = text => (options.confirm ? options.confirm(text) : window.confirm(text))
    let view = null, draft = empty(), status = { busy: false, text: '', error: null }, gone = false
    let tab = TABS.includes(kept.get()) ? kept.get() : 'her'
    const chosen = { person: null, end: null, nudge: null, side: null, adding: '', account: '' }
    const map = el('div', { className: 'ms-map' }) // (kept from one drawing of the page to the next)
    let stopMap = null, mapFor = null
    const root = el('div', { className: 'ms-page' })
    element.replaceChildren(root)

    // ---- staging: what each control changes, and the save bar ----
    const stage = (change, quiet = false) => {
      change(draft)
      status = { ...status, text: '', error: null }
      if (quiet) bar()
      else render()
    }
    let barNode = null
    function bar () {
      const count = counted(draft), stop = blocked(draft, view)
      const next = el('div', { className: 'ms-savebar' },
        el('span', { className: count ? 'ms-changed' : 'ms-dim', text: count ? t('save.unsaved', { count })
          : t('save.none') }),
        status.text ? el('span', { className: 'ms-ok', text: status.text }) : null,
        status.error ? el('span', { className: 'ms-error', text: status.error }) : null,
        stop && count ? el('span', { className: 'ms-error', text: t(stop) }) : null,
        el('span', { className: 'ms-spacer' }),
        el('button', { className: 'ms-button', text: t('save.discard'), attrs: { type: 'button',
          disabled: status.busy || !count }, on: { click: () => {
          draft = empty()
          render()
        } } }),
        el('button', { className: 'ms-button ms-primary', text: t('save.save'), attrs: { type: 'button',
          disabled: status.busy || !count || Boolean(stop) }, on: { click: save } }))
      if (barNode) barNode.replaceWith(next)
      barNode = next
      for (const name of TABS) {
        const badge = root.querySelector(`[data-tab="${name}"] .ms-tab-count`), many = countIn(name)
        if (badge) {
          badge.textContent = String(many)
          badge.hidden = !many
        }
      }
      return next
    }
    /** How many staged values a tab holds. */
    function countIn (name) {
      const part = empty()
      if (name === 'her') {
        part.her = draft.her
        part.rows = Object.fromEntries(Object.entries(draft.rows).filter(([key]) => rowOf(key)?.tab === 'her'))
        part.gut.sides = draft.gut.sides
        if (draft.gut.side !== undefined) part.gut.side = draft.gut.side
      } else if (name === 'people') {
        part.me = draft.me
        part.people = draft.people
        part.others = draft.others
        part.rows = Object.fromEntries(Object.entries(draft.rows).filter(([key]) => rowOf(key)?.tab === 'people'))
      } else if (name === 'memory') {
        part.memory = draft.memory
        part.rows = Object.fromEntries(Object.entries(draft.rows).filter(([key]) => rowOf(key)?.tab === 'memory'))
      } else {
        part.gut = { ...draft.gut, sides: {}, side: undefined }
        part.rows = Object.fromEntries(Object.entries(draft.rows).filter(([key]) => rowOf(key)?.tab === 'gut'))
      }
      return counted(part)
    }
    const rowOf = key => view?.rows?.find(row => row.key === key)

    async function send (asked, done, said = t('save.saved')) {
      status = { busy: true, text: '', error: null }
      bar()
      try {
        const next = await options.save(asked)
        if (gone) return
        view = next
        done()
        status = { busy: false, text: said, error: null }
      } catch (error) {
        if (gone) return
        status = { busy: false, text: '', error: t('save.failed', { error: String(error?.message ?? error) }) }
      }
      render()
    }
    const save = () => send(body(draft), () => { draft = empty() })

    // ---- controls ----
    const label = row => row.label?.[languageOf()] ?? row.label?.en ?? row.key
    const hintOf = row => row.hint?.[languageOf()] ?? row.hint?.en ?? ''
    const roleName = key => {
      if (!key) return t('people.noRole')
      const role = view.roles.find(item => item.key === key)
      const own = role?.names?.[chinese() ? 'zh' : 'en'] ?? role?.names?.en
      const name = t(`role.${key}`)
      return own || (name === `role.${key}` ? key : name)
    }
    const endName = end => chinese() ? view.gut?.ends?.find(item => item.end === end)?.zh ?? end : end
    const barName = item => chinese() ? item.zh : item.bar

    /** A labelled field: its label, its control and a hint under it. */
    const field = (text, control, hint, changed = false) => el('label', { className: 'ms-field' },
      el('span', { className: classes('ms-field-label', changed && 'ms-changed'), text }), control,
      hint ? el('span', { className: 'ms-dim', text: hint }) : null)

    /** A text box staging `put(value)`; `typed` marks it changed when the value differs from what is saved. */
    function textBox ({ value, saved, put, placeholder = '', wide = true, max = 80, key }) {
      const box = el('input', { className: classes('ms-input', wide && 'ms-wide', value !== saved && 'ms-changed'),
        attrs: { type: 'text', value: value ?? '', placeholder, maxLength: max }, data: { key } })
      box.addEventListener('input', () => {
        box.classList.toggle('ms-changed', box.value !== (saved ?? ''))
        stage(() => put(box.value), true)
      })
      return box
    }
    function numberBox ({ value, saved, put, min, step = 1, key }) {
      const box = el('input', { className: classes('ms-input', value !== saved && 'ms-changed'),
        attrs: { type: 'number', value: String(value), min, step }, data: { key } })
      box.addEventListener('input', () => {
        const number = Number(box.value), good = box.value !== '' && Number.isFinite(number) &&
          (min === undefined || number >= min)
        box.setAttribute('aria-invalid', String(!good))
        box.classList.toggle('ms-changed', good && number !== saved)
        stage(() => put(good ? number : undefined), true)
      })
      return box
    }
    function slider ({ value, low, high, step, put, text, changed, plain = false, key }) {
      const number = el('span', { className: 'ms-number' })
      const show = item => {
        number.textContent = step >= 1 ? fixed(item, 0) : plain ? fixed(item, 2) : signed(item, step < 0.1 ? 2 : 1)
      }
      show(value)
      const range = el('input', { attrs: { type: 'range', min: low, max: high, step, value: String(value),
        'aria-label': text }, data: { key } })
      const box = el('label', { className: classes('ms-slider', changed && 'ms-changed') },
        el('span', { className: 'ms-dim', text }), range, number)
      range.addEventListener('input', () => {
        const item = Number(range.value)
        show(item)
        box.classList.add('ms-changed')
        stage(() => put(item), true)
      })
      return box
    }
    function check ({ checked, put, text, changed, key, disabled = false }) {
      return el('label', { className: classes('ms-check', changed && 'ms-changed') },
        el('input', { attrs: { type: 'checkbox', checked, disabled }, data: { key },
          on: { change: event => stage(() => put(event.target.checked)) } }),
        el('span', { text }))
    }
    function select ({ value, items, put, text, changed, key }) {
      const box = el('select', { className: classes('ms-select', changed && 'ms-changed'),
        attrs: { 'aria-label': text }, data: { key }, on: { change: event => stage(() => put(event.target.value)) } },
      items.map(item => item.group
        ? el('optgroup', { attrs: { label: item.group } }, item.items.map(one =>
          el('option', { text: one.name, attrs: { value: one.value, selected: one.value === value } })))
        : el('option', { text: item.name, attrs: { value: item.value, selected: item.value === value } })))
      return box
    }
    /** A list to choose one from: rows, and the names of groups between them. */
    function choices ({ items, current, choose, text }) {
      return el('div', { className: 'ms-list', attrs: { role: 'listbox', 'aria-label': text } },
        items.map(item => item.group !== undefined
          ? el('div', { className: 'ms-list-group', text: item.group, attrs: { role: 'presentation' } })
          : el('button', { className: classes('ms-option', item.changed && 'ms-changed', item.gone && 'ms-gone'),
            attrs: { type: 'button', role: 'option', 'aria-selected': String(item.key === current) },
            data: { key: `choose:${item.key}` }, on: { click: () => choose(item.key) } },
          item.swatch ? el('span', { className: 'ms-swatch', style: { background: item.swatch } }) : null,
          el('span', { className: 'ms-option-name', text: item.name }),
          item.note ? el('span', { className: 'ms-option-note', text: item.note }) : null)))
    }
    const card = (title, hint, ...children) => el('section', { className: 'ms-card' },
      title ? el('div', { className: 'ms-subtitle', text: title }) : null,
      hint ? el('div', { className: 'ms-dim', text: hint }) : null, ...children)

    /** The host's own settings on a tab, grouped as it groups them. */
    function hostRows (name) {
      const rows = (view.rows || []).filter(row => row.tab === name)
      if (!rows.length) return null
      const groups = new Map()
      for (const row of rows) {
        const title = row.group?.[languageOf()] ?? row.group?.en ?? ''
        if (!groups.has(title)) groups.set(title, [])
        groups.get(title).push(row)
      }
      return [...groups].map(([title, items]) => card(title, '', ...items.map(row => {
        const staged = Object.hasOwn(draft.rows, row.key), value = staged ? draft.rows[row.key] : row.value
        const put = item => {
          if (item === row.value) delete draft.rows[row.key]
          else draft.rows[row.key] = item
        }
        if (row.kind === 'bool') {
          return el('div', { className: 'ms-stack' }, check({ checked: Boolean(value), text: label(row), changed: staged,
            key: `row:${row.key}`, put }), hintOf(row) ? el('div', { className: 'ms-dim', text: hintOf(row) }) : null)
        }
        if (row.kind === 'choice') {
          return field(label(row), select({ value, changed: staged, key: `row:${row.key}`, text: label(row), put,
            items: row.options.map(option => ({ value: option.value, name: option.label?.[languageOf()] ??
              option.label?.en ?? String(option.value) })) }), hintOf(row), staged)
        }
        if (row.kind === 'text') {
          return field(label(row), textBox({ value: value ?? '', saved: row.value ?? '', key: `row:${row.key}`,
            put: item => put(item) }), hintOf(row), staged)
        }
        return field(label(row), el('span', { text: Array.isArray(value) ? value.join(' · ') : String(value ?? '') }),
          hintOf(row))
      })))
    }

    // ---- Her ----
    function herTab () {
      const her = view.her, staged = draft.her
      const name = staged.name ?? her.name
      const who = card(t('her.title'), '',
        field(t('her.name'), textBox({ value: name, saved: her.name, key: 'her:name', put: item => {
          if (item === her.name) delete draft.her.name
          else draft.her.name = item
        } }), '', 'name' in staged),
        her.language === null || her.language === undefined ? null
          : field(t('her.language'), select({ value: staged.language ?? her.language, changed: 'language' in staged,
            key: 'her:language', text: t('her.language'),
            items: LANGUAGES.map(item => ({ value: item, name: t(`language.${item}`) })),
            put: item => {
              if (item === her.language) delete draft.her.language
              else draft.her.language = item
            } }), t('her.languageHint'), 'language' in staged),
        her.zone === null || her.zone === undefined ? null
          : field(t('her.zone'), textBox({ value: staged.zone ?? her.zone, saved: her.zone, key: 'her:zone',
            placeholder: 'UTC+8', wide: false, max: 64, put: item => {
              if (item === her.zone) delete draft.her.zone
              else draft.her.zone = item
            } }), t('her.zoneHint'), 'zone' in staged))
      const cardNode = her.card === undefined ? null : characterCard()
      const sides = view.gut ? sidesCard() : null
      return [who, cardNode, ...(hostRows('her') || []), sides]
    }

    function characterCard () {
      const saved = view.her.card, staged = draft.her.card
      const dropping = staged === null
      const text = staged && staged.text !== undefined ? staged.text : saved?.text ?? ''
      const on = staged && staged.on !== undefined ? staged.on : Boolean(saved?.on)
      const put = (key, value) => {
        const next = { ...(draft.her.card || {}) }
        const before = key === 'text' ? saved?.text ?? '' : Boolean(saved?.on)
        if (value === before) delete next[key]
        else next[key] = value
        if (Object.keys(next).length) draft.her.card = next
        else delete draft.her.card
      }
      const area = el('textarea', { className: classes('ms-text', staged?.text !== undefined && 'ms-changed'),
        attrs: { rows: 5, placeholder: t('card.placeholder'), disabled: dropping }, data: { key: 'her:card' } })
      area.value = text
      area.addEventListener('input', () => {
        area.classList.toggle('ms-changed', area.value !== (saved?.text ?? ''))
        stage(() => put('text', area.value), true)
      })
      return card(t('card.title'), t('card.hint'),
        saved ? el('div', { className: 'ms-dim', text: t(`card.how.${saved.how || 'set'}`) })
          : el('div', { className: 'ms-dim', text: t('card.none') }),
        area,
        el('div', { className: 'ms-row' },
          check({ checked: on, changed: staged?.on !== undefined, key: 'her:card:on', text: t('card.on'),
            disabled: dropping, put: value => put('on', value) }),
          el('span', { className: 'ms-spacer' }),
          dropping ? el('span', { className: 'ms-changed', text: t('card.dropped') }) : null,
          saved || dropping ? el('button', { className: 'ms-button', text: dropping ? t('people.undo') : t('card.drop'),
            attrs: { type: 'button' }, on: { click: () => stage(() => {
              if (dropping) delete draft.her.card
              else draft.her.card = null
            }) } }) : null))
    }

    function sidesCard () {
      const gut = view.gut, sides = draft.gut.sides
      const locked = draft.gut.side !== undefined ? draft.gut.side : gut.side
      const staged = name => sides[name] || {}
      const set = (name, key, item) => { sides[name] = { ...(sides[name] || {}), [key]: item } }
      const lock = next => {
        if (JSON.stringify(next) === JSON.stringify(gut.side)) delete draft.gut.side
        else draft.gut.side = next
      }
      const added = Object.entries(sides).filter(([name, item]) => item.fresh && !gut.sides.some(side =>
        side.name === name)).map(([name]) => ({ name, what: '', given: false, own: GROWS, fresh: true }))
      const all = [...gut.sides, ...added]
      if (!all.some(item => item.name === chosen.side)) chosen.side = locked?.name ?? all[0]?.name ?? null
      const side = all.find(item => item.name === chosen.side) || null
      const free = gut.names.filter(name => !all.some(item => item.name === name))
      const mine = side ? staged(side.name) : {}, dropping = mine.drop === true
      const isLocked = Boolean(side && locked?.name === side.name)
      const remove = () => stage(() => {
        if (!side || side.given) return
        if (side.fresh) {
          delete sides[side.name]
          if (locked?.name === side.name) lock(gut.side)
        } else if (staged(side.name).drop) delete sides[side.name]
        else set(side.name, 'drop', true)
      })
      const what = side && !side.given ? el('textarea', { className: classes('ms-text', mine.what !== undefined &&
        'ms-changed'), attrs: { rows: 2, maxLength: 200, disabled: dropping, placeholder: t('sides.what') },
      data: { key: `side:${side.name}` } }) : null
      if (what) {
        what.value = mine.what ?? side.what
        what.addEventListener('input', () => {
          what.classList.add('ms-changed')
          stage(() => set(side.name, 'what', what.value), true)
        })
      }
      return card(t('sides.title'), t('sides.hint'),
        el('div', { className: 'ms-tags' }, all.length ? all.map(item => el('button', {
          className: classes('ms-tag', staged(item.name).drop && 'ms-gone', sides[item.name] && 'ms-changed'),
          attrs: { type: 'button', 'aria-pressed': String(item.name === chosen.side) }, data: { key: `tag:${item.name}` },
          on: { click: () => {
            chosen.side = item.name
            render()
          } } }, item.name, locked?.name === item.name ? el('span', { className: 'ms-dim',
          text: `· ${t('sides.locked')}` }) : null)) : el('span', { className: 'ms-dim', text: t('sides.none') })),
        el('div', { className: 'ms-row' },
          select({ value: chosen.adding, text: t('sides.pick'), key: 'side:pick', changed: false,
            items: [{ value: '', name: t('sides.pick') }, ...free.map(name => ({ value: name, name }))],
            put: item => { chosen.adding = item } }),
          el('button', { className: 'ms-button', text: t('sides.write'), attrs: { type: 'button',
            disabled: !chosen.adding }, on: { click: () => stage(() => {
            set(chosen.adding, 'fresh', true)
            chosen.side = chosen.adding
            chosen.adding = ''
          }) } }),
          el('button', { className: 'ms-button', text: dropping ? t('people.undo') : t('sides.drop'),
            attrs: { type: 'button', disabled: !side || side.given }, on: { click: remove } })),
        side ? el('div', { className: 'ms-edit' },
          el('div', { className: 'ms-edit-title' }, side.name,
            side.given ? el('span', { className: 'ms-dim', text: t('sides.given') }) : null,
            dropping ? el('span', { className: 'ms-changed', text: t('sides.dropped') }) : null),
          side.given ? el('div', { text: side.what }) : what,
          side.given ? null : field(t('sides.weight'), numberBox({ value: mine.weight ?? side.own, saved: side.own,
            min: 0, step: 0.5, key: `side:${side.name}:weight`, put: item => {
              if (item === undefined || item === side.own) {
                const { weight, ...rest } = sides[side.name] || {}
                if (Object.keys(rest).length) sides[side.name] = rest
                else delete sides[side.name]
              } else set(side.name, 'weight', item)
            } }), '', mine.weight !== undefined),
          check({ checked: isLocked, disabled: dropping, changed: draft.gut.side !== undefined,
            key: `side:${side.name}:lock`, text: t('sides.lockThis'),
            put: value => lock(value ? { name: side.name, often: locked?.often ?? 1 } : null) }),
          isLocked ? slider({ text: t('sides.often'), value: locked.often, low: 0, high: 1, step: 0.05, plain: true,
            changed: draft.gut.side !== undefined, key: `side:${side.name}:often`,
            put: often => lock({ name: side.name, often }) }) : null,
          el('div', { className: 'ms-dim', text: t('sides.oftenHint') })) : null)
    }

    // ---- People ----
    function peopleTab () {
      const nodes = [peopleCard()]
      if (view.others !== null && view.others !== undefined) {
        const value = draft.others !== undefined ? draft.others : view.others
        nodes.push(card(t('others.title'), '', field(t('others.role'), select({ value, changed: draft.others !==
          undefined, key: 'others', text: t('others.role'),
        items: [{ value: '', name: t('people.noRole') }, ...view.roles.filter(role => !role.unique)
          .map(role => ({ value: role.key, name: roleName(role.key) }))],
        put: item => {
          if (item === view.others) delete draft.others
          else draft.others = item
        } }), t('others.hint'), draft.others !== undefined)))
      }
      return [...nodes, ...(hostRows('people') || [])]
    }

    function peopleCard () {
      const people = view.people || []
      if (!people.length) return card(t('people.title'), '', el('div', { className: 'ms-dim', text: t('people.none') }))
      if (!people.some(item => item.subject === chosen.person)) chosen.person = people[0].subject
      const person = people.find(item => item.subject === chosen.person)
      const whoOf = item => item.you ? t('you') : item.subject
      const items = people.map(item => {
        const staged = draft.people[item.subject] || {}
        const value = staged.closeness ?? item.closeness?.value
        return { key: item.subject, name: whoOf(item), changed: Boolean(draft.people[item.subject]) ||
          (item.you && (('name' in draft.me) || draft.me.link.length || draft.me.unlink.length)),
        gone: staged.forget, note: value !== undefined && value !== null ? fixed(value, 0) : '' }
      })
      return card(t('people.title'), t('people.hint'),
        el('div', { className: 'ms-split' },
          choices({ items, current: person.subject, text: t('people.title'), choose: key => {
            chosen.person = key
            render()
          } }),
          personEditor(person, whoOf(person))))
    }

    function personEditor (person, who) {
      const staged = draft.people[person.subject] || {}
      const set = (key, item) => {
        draft.people[person.subject] = { ...(draft.people[person.subject] || {}), [key]: item }
      }
      const unset = key => {
        const { [key]: dropped, ...rest } = draft.people[person.subject] || {}
        if (Object.keys(rest).length) draft.people[person.subject] = rest
        else delete draft.people[person.subject]
      }
      const role = staged.role !== undefined ? staged.role : person.role
      const kind = view.roles.find(item => item.key === role)
      const close = person.closeness
      const roles = view.roles.filter(item => !item.unique || item.key === person.role ||
        !view.people.some(other => other.subject !== person.subject && other.role === item.key))
      const parts = [el('div', { className: 'ms-edit-title' }, who,
        person.gut ? el('span', { className: 'ms-dim', text: t('people.summary', { lessons: person.gut.lessons,
          weight: percent(person.gut.weight) }) }) : null)]
      if (staged.forget) {
        parts.push(el('div', { className: 'ms-row' }, el('span', { className: 'ms-changed', text: t('people.forgotten') }),
          el('button', { className: 'ms-button', text: t('people.undo'), attrs: { type: 'button' },
            on: { click: () => stage(() => unset('forget')) } })))
      }
      if (person.you && view.me && view.me.name !== null && view.me.name !== undefined) {
        parts.push(field(t('me.name'), textBox({ value: draft.me.name ?? view.me.name, saved: view.me.name,
          key: 'me:name', put: item => {
            if (item === view.me.name) delete draft.me.name
            else draft.me.name = item
          } }), '', 'name' in draft.me))
      }
      const roleWords = person.you ? t('people.roleYou') : t('people.role')
      parts.push(field(roleWords, select({ value: role, changed: staged.role !== undefined, key: 'person:role',
        text: roleWords, items: [{ value: '', name: t('people.noRole') }, ...roles.map(item => ({
          value: item.key, name: roleName(item.key) }))],
        put: item => {
          if (item === person.role) {
            unset('role')
            unset('closeness')
          } else {
            set('role', item)
            unset('closeness')
          }
        } }), '', staged.role !== undefined))
      if (kind) {
        const start = staged.closeness ?? (role === person.role && close ? close.value : kind.start ??
          Math.round((kind.floor + kind.ceiling) / 2))
        parts.push(slider({ text: t('people.closeness', { role: roleName(role), floor: kind.floor,
          ceiling: kind.ceiling }), value: Math.min(kind.ceiling, Math.max(kind.floor, start)), low: kind.floor,
        high: kind.ceiling, step: 1, changed: staged.closeness !== undefined, key: 'person:closeness',
        put: item => set('closeness', item) }),
        check({ checked: staged.hold ?? Boolean(close?.locked), changed: staged.hold !== undefined, key: 'person:hold',
          text: t('people.holdCloseness'), put: value => {
            if (value === Boolean(close?.locked)) unset('hold')
            else set('hold', value)
          } }))
      } else parts.push(el('div', { className: 'ms-dim', text: t('people.needsRole') }))
      if (person.you && view.me?.accounts) parts.push(accounts())
      if (person.gut && view.gut) parts.push(...gutOfPerson(person, staged, set, unset, who))
      return el('div', { className: 'ms-edit' }, ...parts)
    }

    function accounts () {
      const mine = view.me.accounts, link = draft.me.link, unlink = draft.me.unlink
      const box = el('input', { className: 'ms-input', attrs: { type: 'text', placeholder: t('me.placeholder'),
        value: chosen.account, maxLength: 240 }, data: { key: 'me:account' } })
      const good = () => ACCOUNT.test(box.value.trim()) && !mine.includes(box.value.trim()) &&
        !link.includes(box.value.trim())
      const add = el('button', { className: 'ms-button', text: t('me.add'), attrs: { type: 'button',
        disabled: !good() }, on: { click: () => stage(() => {
        link.push(box.value.trim())
        chosen.account = ''
      }) } })
      box.addEventListener('input', () => {
        chosen.account = box.value
        add.disabled = !good()
        box.setAttribute('aria-invalid', String(Boolean(box.value.trim()) && !ACCOUNT.test(box.value.trim())))
      })
      box.addEventListener('keydown', event => {
        if (event.key === 'Enter' && good()) {
          event.preventDefault()
          add.click()
        }
      })
      const rows = [...mine.map(account => {
        const leaving = unlink.includes(account)
        return el('div', { className: classes('ms-account', leaving && 'ms-gone') }, el('span', { text: account }),
          leaving ? el('span', { className: 'ms-changed', text: t('me.removed') }) : null,
          el('button', { className: 'ms-button', text: leaving ? t('people.undo') : t('me.remove'),
            attrs: { type: 'button' }, on: { click: () => stage(() => {
              if (leaving) unlink.splice(unlink.indexOf(account), 1)
              else unlink.push(account)
            }) } }))
      }), ...link.map(account => el('div', { className: 'ms-account' }, el('span', { text: account }),
        el('span', { className: 'ms-changed', text: t('me.added') }),
        el('button', { className: 'ms-button', text: t('me.remove'), attrs: { type: 'button' },
          on: { click: () => stage(() => link.splice(link.indexOf(account), 1)) } })))]
      return el('div', { className: 'ms-inner' },
        el('div', { className: classes('ms-subtitle', (link.length || unlink.length) && 'ms-changed'),
          text: t('me.accounts') }),
        el('div', { className: 'ms-dim', text: t('me.accountsHint') }),
        el('div', { className: 'ms-accounts' }, rows.length ? rows : el('span', { className: 'ms-dim',
          text: t('me.noAccounts') })),
        el('div', { className: 'ms-row' }, box, add))
    }

    function gutOfPerson (person, staged, set, unset, who) {
      const gut = view.gut, mine = person.gut
      if (!gut.ends.some(item => item.end === chosen.nudge)) chosen.nudge = gut.ends[0]?.end
      const end = chosen.nudge
      const weight = staged.weight !== undefined ? staged.weight : mine.set ?? 'learned'
      const byHand = weight !== 'learned'
      const nudge = name => staged.tune?.[name] ?? mine.nudge[name] ?? 0
      const nudged = gut.ends.map(item => item.end).filter(name => nudge(name))
      return [
        el('div', { className: 'ms-inner' },
          check({ checked: byHand, changed: staged.weight !== undefined, key: 'person:byHand', text: t('people.byHand'),
            put: value => {
              const next = value ? Number(fixed(mine.weight)) : 'learned'
              if (next === (mine.set ?? 'learned')) unset('weight')
              else set('weight', next)
            } }),
          byHand ? slider({ text: t('people.weight'), value: weight, low: 0, high: 1, step: 0.05, plain: true,
            changed: staged.weight !== undefined, key: 'person:weight', put: item => set('weight', item) }) : null,
          check({ checked: staged.locked ?? mine.locked, changed: staged.locked !== undefined, key: 'person:lock',
            text: t('people.lock'), put: value => {
              if (value === mine.locked) unset('locked')
              else set('locked', value)
            } })),
        el('div', { className: 'ms-inner' },
          el('div', { className: 'ms-subtitle', text: t('people.tunes') }),
          el('div', { className: 'ms-dim', text: t('people.tunesHint') }),
          el('div', { className: 'ms-row' },
            el('span', { className: 'ms-swatch', style: { background: endColour(gut.bars, end, dark()) } }),
            select({ value: end, changed: false, key: 'person:end', text: t('people.tunes'),
              items: gut.bars.map(item => ({ group: barName(item), items: item.ends.filter(Boolean).map(name =>
                ({ value: name, name: endName(name) })) })),
              put: item => { chosen.nudge = item } })),
          slider({ text: t('settings.nature'), value: nudge(end), low: -NATURE, high: NATURE, step: 0.1,
            changed: staged.tune?.[end] !== undefined, key: `person:nudge:${end}`,
            put: item => set('tune', { ...(draft.people[person.subject]?.tune || {}), [end]: item }) }),
          nudged.length ? el('div', { className: 'ms-tags' }, nudged.map(name => el('button', {
            className: 'ms-tag ms-small-tag', attrs: { type: 'button', 'aria-pressed': String(name === end) },
            on: { click: () => {
              chosen.nudge = name
              render()
            } } }, `${endName(name)} ${signed(nudge(name), 1)}`))) : null),
        staged.forget ? null : el('div', { className: 'ms-row' }, el('button', { className: 'ms-button',
          text: t('people.forget'), attrs: { type: 'button' }, on: { click: () => {
            if (ask(t('people.forgetConfirm', { who }))) stage(() => set('forget', true))
          } } }))]
    }

    // ---- Memory ----
    function memoryTab () {
      const nodes = []
      const memory = view.memory
      if (memory) {
        const number = (key, min, step = 1) => {
          const staged = Object.hasOwn(draft.memory, key)
          return field(t(KEYS[key]), numberBox({ value: staged ? draft.memory[key] ?? '' : memory[key],
            saved: memory[key], min, step, key: `memory:${key}`, put: item => {
              if (item === memory[key]) delete draft.memory[key]
              else draft.memory[key] = item ?? null // (null: not a number yet, and nothing is saved until it is)
            } }), '', staged)
        }
        nodes.push(card(t('surface.title'), t('surface.hint'), number('surface_days', 1), number('surface_floor', 0, 1000),
          number('surface_cap', 1000, 1000), number('surface_window', 1000, 1000)))
        const staged = Object.hasOwn(draft.memory, 'said_words')
        nodes.push(card(t('look.title'), t('look.hint'), number('said_budget', 0, 100),
          slider({ text: t('look.bar'), value: staged ? draft.memory.said_words : memory.said_words, low: 0, high: 1,
            step: 0.05, plain: true, changed: staged, key: 'memory:said_words', put: item => {
              if (item === memory.said_words) delete draft.memory.said_words
              else draft.memory.said_words = item
            } }), el('div', { className: 'ms-dim', text: t('look.barHint') })))
      }
      nodes.push(...(hostRows('memory') || []))
      const starts = view.starts || []
      if (starts.length) {
        nodes.push(card(t('start.title'), counted(draft) ? t('start.unsaved') : '',
          el('div', { className: 'ms-start' }, starts.flatMap(tier => [
            el('button', { className: classes('ms-button', tier !== 'fresh' && 'ms-danger'), text: t(`start.${tier}`),
              attrs: { type: 'button', disabled: status.busy }, data: { key: `start:${tier}` }, on: { click: () => {
                if (ask(t(`start.${tier}Confirm`))) send({ start: tier }, () => {}, t('start.done'))
              } } }),
            el('span', { className: 'ms-dim', text: t(`start.${tier}Hint`) })]))))
      }
      return nodes
    }
    const KEYS = { surface_days: 'surface.days', surface_floor: 'surface.floor', surface_cap: 'surface.cap',
      surface_window: 'surface.window', said_budget: 'look.budget' }

    // ---- Gut ----
    function gutTab () {
      const gut = view.gut
      if (!gut) return [card('', '', el('div', { className: 'ms-dim', text: t('gut.none') }))]
      const report = gut.report, staged = draft.gut
      const nodes = []
      if (options.starmap) nodes.push(card(t('gut.map'), '', map))
      const tau = staged.tau ?? String(report.tau)
      const tauBox = el('input', { className: classes('ms-input', staged.tau !== undefined && 'ms-changed'),
        attrs: { type: 'number', min: 1, step: 1, value: tau }, data: { key: 'gut:tau' } })
      tauBox.addEventListener('input', () => {
        const good = Number(tauBox.value) > 0 && Number.isFinite(Number(tauBox.value))
        tauBox.setAttribute('aria-invalid', String(!good))
        tauBox.classList.toggle('ms-changed', Number(tauBox.value) !== report.tau)
        stage(() => {
          if (Number(tauBox.value) === report.tau) delete draft.gut.tau
          else draft.gut.tau = tauBox.value
        }, true)
      })
      nodes.push(card(t('settings.grown'), '',
        el('div', { className: 'ms-row' },
          el('span', { text: t('settings.age', { age: report.age, grown: percent(report.grown),
            learning: percent(report.learning) }) }),
          el('button', { className: 'ms-button', text: t('settings.young'), attrs: { type: 'button',
            disabled: status.busy || report.age === 0 }, on: { click: () => {
            if (ask(t('settings.youngConfirm'))) send({ gut: { age: 0 } }, () => {})
          } } })),
        field(t('settings.tau'), tauBox, t('settings.tauHint'), staged.tau !== undefined),
        check({ checked: staged.locked ?? gut.locked, changed: staged.locked !== undefined, key: 'gut:locked',
          text: t('settings.heartLock'), put: value => {
            if (value === gut.locked) delete draft.gut.locked
            else draft.gut.locked = value
          } }),
        el('div', { className: 'ms-dim', text: t('settings.heartLockHint') })))
      const sensitivity = staged.sensitivity ?? report.sensitivity
      const number = el('span', { className: classes('ms-number', staged.sensitivity !== undefined && 'ms-changed'),
        text: signed(sensitivity) })
      const range = el('input', { attrs: { type: 'range', min: -1, max: 1, step: 0.05, value: String(sensitivity),
        'aria-label': t('settings.sensitivity') }, data: { key: 'gut:sensitivity' } })
      range.addEventListener('input', () => {
        const value = Number(range.value)
        number.textContent = signed(value)
        number.classList.add('ms-changed')
        stage(() => {
          if (value === report.sensitivity) delete draft.gut.sensitivity
          else draft.gut.sensitivity = value
        }, true)
      })
      nodes.push(card(t('settings.sensitivity'), '',
        el('div', { className: 'ms-range' }, el('span', { text: t('settings.dull') }), range,
          el('span', { text: t('settings.keen') }), number),
        el('div', { className: 'ms-dim', text: t('settings.sensitivityHint') })))
      nodes.push(feelings())
      return [...nodes, ...(hostRows('gut') || [])]
    }

    function feelings () {
      const gut = view.gut
      if (!gut.ends.some(item => item.end === chosen.end)) chosen.end = gut.ends[0]?.end
      const tuneOf = end => ({ ...gut.ends.find(item => item.end === end), ...draft.gut.tune[end] })
      const retune = (what, value) => {
        const saved = gut.ends.find(item => item.end === chosen.end)
        const next = { ...(draft.gut.tune[chosen.end] || {}), [what]: value }
        if (value === saved[what]) delete next[what]
        if (Object.keys(next).length) draft.gut.tune[chosen.end] = next
        else delete draft.gut.tune[chosen.end]
      }
      const items = gut.bars.flatMap(item => [{ key: `bar:${item.bar}`, group: barName(item) },
        ...item.ends.filter(Boolean).map(end => {
          const tune = tuneOf(end)
          return { key: end, name: endName(end), swatch: endColour(gut.bars, end, dark()),
            changed: Boolean(draft.gut.tune[end]), note: [tune.nature ? signed(tune.nature, 1) : '',
              tune.now ? signed(tune.now) : ''].filter(Boolean).join(' · ') }
        })])
      const tune = tuneOf(chosen.end), changed = draft.gut.tune[chosen.end] || {}
      const owner = gut.bars.find(item => item.ends.includes(chosen.end))
      return card(t('settings.tunes'), t('settings.tunesHint'),
        el('div', { className: 'ms-split' },
          choices({ items, current: chosen.end, text: t('settings.tunes'), choose: key => {
            chosen.end = key
            render()
          } }),
          el('div', { className: 'ms-edit' },
            el('div', { className: 'ms-edit-title' },
              el('span', { className: 'ms-swatch', style: { background: endColour(gut.bars, chosen.end, dark()) } }),
              endName(chosen.end), owner ? el('span', { className: 'ms-dim', text: barName(owner) }) : null),
            slider({ text: t('settings.nature'), value: tune.nature, low: -NATURE, high: NATURE, step: 0.1,
              changed: changed.nature !== undefined, key: `end:${chosen.end}:nature`,
              put: value => retune('nature', value) }),
            slider({ text: t('settings.now'), value: tune.now, low: -1, high: 1, step: 0.05,
              changed: changed.now !== undefined, key: `end:${chosen.end}:now`, put: value => retune('now', value) }))))
    }

    // ---- drawing ----
    function render () {
      if (gone) return
      const focused = root.contains(document.activeElement) ? document.activeElement?.dataset?.key : null
      if (!view) {
        root.replaceChildren(el('div', { className: 'ms-dim', text: status.error
          ? t('page.unreachable', { error: status.error }) : t('page.loading') }))
        return
      }
      const tabs = el('div', { className: 'ms-tabs', attrs: { role: 'tablist' } }, TABS.map(name => el('button', {
        className: 'ms-tab', attrs: { type: 'button', role: 'tab', 'aria-selected': String(name === tab) },
        data: { tab: name, key: `tab:${name}` }, on: { click: () => {
          tab = name
          kept.set(name)
          render()
        } } }, el('span', { text: t(`tab.${name}`) }), el('span', { className: 'ms-tab-count', attrs: { hidden: true } }))))
      const panel = el('div', { className: 'ms-panel', attrs: { role: 'tabpanel' } },
        ...(tab === 'her' ? herTab() : tab === 'people' ? peopleTab() : tab === 'memory' ? memoryTab() : gutTab()))
      barNode = null
      root.replaceChildren(el('p', { className: 'ms-dim', text: t('page.intro') }), tabs, panel)
      root.append(bar())
      if (tab === 'gut' && options.starmap && view.gut && mapFor !== view.gut.stamp) {
        stopMap?.()
        mapFor = view.gut.stamp
        stopMap = options.starmap(map, view) || null
      }
      if (focused) root.querySelector(`[data-key="${CSS_ESCAPE(focused)}"]`)?.focus()
    }
    const CSS_ESCAPE = text => (window.CSS?.escape ? window.CSS.escape(text) : String(text).replace(/["\\]/g, '\\$&'))

    async function reload () {
      try {
        const next = await options.load()
        if (gone) return
        view = next
        status = { ...status, error: null }
      } catch (error) {
        if (gone) return
        if (!view) status = { busy: false, text: '', error: String(error?.message ?? error) }
      }
      render()
    }
    render()
    reload()
    return {
      reload,
      render,
      destroy () {
        gone = true
        stopMap?.()
        root.remove()
      },
      get view () { return view },
      get draft () { return draft }
    }
  }

  return { mount, WORDS, TABS, empty, counted, body, blocked, endColour }
})
      return self.MnemeSettings
    })()
    // ---- end of page/settings.js ----

    const PACKAGE = 'dsh-mneme-llm'
    const NS = 'mneme-llm' // the plugin's words, in DSH's locale
    const KIND = 'mneme-llm-gut' // her sidebar tab
    const ROUTES = { gut: 'api/mneme-llm.gut', starmap: 'api/mneme-llm.starmap', change: 'api/mneme-llm.change',
      settings: 'api/mneme-llm.settings' }
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
      'settings.summary': 'Her settings: who she is, the people she knows, her memory and her gut',
      'settings.title': 'Her settings',
      'settings.intro': 'Her settings, in four tabs. A save is used at once. What lives in her files (her name, card, ' +
        'people, memory and gut) is written there; the plugin\'s own settings you change here are kept in her folder ' +
        '(settings.json) over its configuration, until that setting is changed there.',
      'role.creator': 'creator',
      'role.family': 'family',
      'role.friend': 'friend',
      'role.acquaintance': 'acquaintance',
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
      'settings.summary': '她的设置：她是谁、她认识的人、她的记忆和直觉',
      'settings.title': '她的设置',
      'settings.intro': '她的设置，分成四页。保存后立刻生效。存在她文件里的（名字、角色卡、认识的人、记忆和直觉）直接写进文件；在这里改的插件设置会存进她的文件夹（settings.json），优先于插件配置，直到你在配置里改了同一项为止。',
      'role.creator': '创造者',
      'role.family': '家人',
      'role.friend': '朋友',
      'role.acquaintance': '认识的人',
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
    /** Her settings on the plugin's page under Plugins: page/settings.js, its four tabs drawn into this box, reading and
     * changing everything through the plugin's settings route; her star map on its Gut tab is the sidebar's. */
    function SettingsPage ({ t }) {
      const box = useRef(null), page = useRef(null), words = useRef(t)
      const [map, setMap] = useState(null) // { where, map, gut }: her star map, in the box the Gut tab gives
      words.current = t
      useEffect(() => {
        const element = box.current
        if (!element) return
        const mounted = MnemeSettings.mount(element, {
          load: () => get(ROUTES.settings),
          save: change => post(ROUTES.settings, change),
          language: () => chinese(words.current) ? 'zh' : 'en',
          dark: () => isDark(element),
          words: { en: { 'page.intro': EN['settings.intro'], 'card.how.settings': 'From the plugin\'s settings.' },
            zh: { 'page.intro': ZH['settings.intro'], 'card.how.settings': '来自插件的设置。' } },
          starmap: (where, view) => {
            let stopped = false
            get(ROUTES.starmap).then(found => { if (!stopped) setMap({ where, map: found, gut: view.gut }) },
              () => {})
            return () => {
              stopped = true
              setMap(null)
            }
          }
        })
        page.current = mounted
        return () => mounted.destroy()
      }, [])
      useEffect(() => { page.current?.render() }, [t]) // (DSH's language changed)
      return h(React.Fragment, null, h('div', { ref: box, className: 'mnl-settings mnl-page' }),
        map && createPortal ? createPortal(h(StarMap, { map: map.map, view: { ...map.gut, youName: t('you') }, t }),
          map.where) : null)
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
.mnl-page { --ms-fg: var(--dsw-alias-label-primary); --ms-dim: var(--dsw-alias-label-tertiary);
  --ms-line: var(--dsw-alias-border-l3); --ms-soft: var(--dsw-alias-border-l2); --ms-strong: var(--dsw-alias-border-l4);
  --ms-accent: var(--dsw-alias-state-business-primary); --ms-chosen: var(--dsw-alias-state-business-secondary);
  --ms-card: var(--dsw-alias-bg-layer-1); --ms-field: var(--dsw-alias-bg-layer-3);
  --ms-bar: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-base)); --ms-hover: var(--dsw-alias-interactive-bg-hover);
  --ms-error: var(--dsw-alias-state-error-primary); --ms-ok: var(--dsw-alias-state-success-primary);
  --ms-on-accent: var(--dsw-alias-label-primary-foreground) }
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

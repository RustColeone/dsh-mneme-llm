# Changelog

## Unreleased

- **Two accounts of one person are one person to her gut**, as in mneme-llm 0.8: `Gut.link(old, person)`. The lessons
  and sightings `old` gave become `person`'s, how she is with them is one table (the two weighed by their lessons),
  and her heart is not touched. The plugin joins the accounts in `accounts` to you when her gut wakes, with what they
  taught her before they were linked.
- **Her Character Card (角色卡) is a section of DSH's system prompt** once it is on: every call carries it and no
  compaction reaches it, as a persona card plugin's would. It is yours alone: the plugin's new `card` setting writes it
  to her file when it is new or changed (and turns it on), and `$card` shows, sets, turns on or off and clears it,
  whichever came last being her card; anyone else's `$card` is refused. `$first`, its name before, still works;
  `/mneme-first` is `/mneme-card` now. Her gut reads her card as who she is when `character` is not set, and
  `$new deep` keeps it. In the library the first prompt is the Character Card: `Surface.card`, `setCard`, `cardOn`,
  `dropCard` and `Card` (the old names still work), and `Surface.read` no longer puts it in front of the turns.
- **Her note goes into each model call of its turn, and into nothing DSH keeps**: it no longer stays in the session
  log, so the notes of earlier turns no longer pile up there. DSH hands a turn's call over frozen, so the plugin makes
  it again with a copy that has the note, marked as the loop's (`markAgentLoopRequest`).
- **A chat mode, as one of DSH's agent presets**: the plugin adds "Chat with <her name>" to DSH's modes (Standard,
  Minimal, …), picked for each new session or set as the default in DSH's settings (`chat: false` leaves it out). A
  session in it is a chat with her, not a coding agent at work: DSH's own persona row with her card as its text, the
  whole system prompt (`complete`, true by default; false keeps DSH's and other plugins' sections beside it), DSH's
  clock and compaction, and none of its shell, files, search, skills, plans or subagents. What she keeps of lately
  (the surface) is put in front of the session's first private message, once, and stays there as what was said so
  far; her look leaves those exchanges out. Any other session is DSH at work: her card in its system prompt and nothing
  of before in front of it.
- **A language for her to answer in** (`language`: `auto`, `english`, `chinese`, `cantonese` or `japanese`): she
  answers in it whatever people write in (her gut's line says it; without a gut, her note), the plugin answers its
  commands in it (in Japanese too now), and her memory's own lines are in Chinese for Chinese and Cantonese. `auto`, as
  before: each person's own. In the library, `Turn` takes the language as its last argument, as in mneme-llm.
- **Her look leaves out what the session in front of her still shows** (`skip` on `look` and `alook`): an exchange
  DSH compacted away may come back.
- **A bar for a look with words alone**, as in mneme-llm: `memory.said_words`, the share of the message's weight
  (each word by its idf) an exchange must share to come; what a search adds has none. It ships at 0.25,
  which keeps a look on an everyday message to about 900 to 1,700 characters instead of about 6,700; 0 keeps every match.

- **A 14th bar, trust: 猜疑 suspicious or 信任 trusting** (`trust` in `BARS`), as in mneme-llm: what she believes
  people mean toward her, in her heart and in each person's table, so she can be born suspicious and still trust one
  person. It goes last, so a 0.3 gut file is widened as it is read (its 24 ends as they were, the new two as nothing
  yet) and its lessons teach only the 24 they knew. Her note scores all 26; trusting alone puts nothing in the line. The
  star map places the 14 bars anew on its sphere, and the bar has a colour of its own.
- **Her nature dial is where she stands, and she lives on from it** (now -6 to 6, `NATURE`), as in mneme-llm: her heart
  and each person's table learn against it, so a dial and lessons saying the same thing no longer count it twice; a
  locked heart keeps it; a person's own nudge stays on top, for them alone. The panel's dials reach -6 to 6.
- **Her star map in 3D**, a switch on her tab (2D or 3D, kept by the browser): her 13 bars spread over a sphere, the
  two ends of each bar side by side (24 degrees apart, every other bar's ends more than 40 away), so a row pulled to
  both ends of a bar goes out between them. Drag to turn it (on a touch screen, sideways: a finger up or down still
  scrolls the page); it turns slowly by itself while nobody does (not with reduced motion, and not while out of view).
  It is as big as fits however it is turned, and an end's name keeps clear of a nearer one's (a line up or down, or
  left out until it turns back). `starmap` gives each star and person a place in 3D, and `DIRECTIONS`.
- **Her arms are a difference now**, not a ratio: 1 as she was born, longer by `GAIN` (3) for each 1 of strength she
  has gained on an end, from 0.3 to 2.4. A feeling she was born with little of no longer flies out for a small gain.
- Her map no longer says what a star is (pointing at one or tapping it did): it is a picture of her, not a list.

## 0.3.0 (2026-11-04)

Her gut as mneme-llm 0.5.0 has it, so a file still moves between the two, whichever writes it.

- **Her feelings are 24 ends on 13 bars** (`BARS`, `ENDS`, `CHINESE`, `FEELINGS`): 难过 or 开心, 担心 or 踏实, 慌乱·崩溃 or
  平静, 嫌弃 or 甜蜜, 严厉 or 温柔, 易怒 or 平和, 委屈 or 不服, 羞愧 or 得意, 害羞 or 调皮, 胆小 or 大胆, 内向 or 外向, and 吃醋 and
  心疼. Each end is a strength of its own, so both ends of a bar can be strong at once. Her note scores all 24 (0 to 1),
  so a quiet feeling teaches as what it is rather than as nothing (`NOTE`, `NOTED_TOKENS`). `MOODS` and `NORMAL` are
  gone.
- **Her heart and the people she knows.** Her heart learns from people at closeness 40 or more by closeness tier; each
  person has a table holding only what is different with them, learned from anyone, read on top of her heart and
  counting more as she knows them. A talking day without someone fades them back toward her heart. `Gut.feel` takes
  the subject, and `Turn` passes it.
- **She grows up:** a lesson moves her heart about twenty times as far on her first day as once grown (`tau`, 150
  lessons). Sleep settles the lessons since her last sleep and replays nothing older, so it no longer takes back what
  she learned; it is no longer a long job, and `Net.sleep` is synchronous.
- **Slow levels against her own usual** (`Tone`: `lately`, `usual`), with SAN and self-esteem in her line when lately is
  far from usual.
- **Settings:** `new Gut(file, { tau, zone })`, `configure({ tau, sensitivity })`, `tune(end, { now, nature })`,
  `setAge(lessons)`. They outlast `wipe`. The plugin takes `tau` and `sensitivity`, and gives her gut her time zone.
- **Closeness moves with how she takes a person,** as in mneme-llm 0.5.0: each exchange they start moves it by the mood
  judge's level for it, `relations.liking` (0.25) points a level times the room left in the band that way; a talk
  that leaves her as she was moves nothing. `new Relations(store, space, { liking })` replaces `growth`, and
  `relations.growth` is read from older files but no longer used.
- **Locks and dials by hand,** as in mneme-llm 0.5.0: `configure({ locked })` stops her heart learning and growing up;
  `tunePerson(subject, { end, nature, weight, locked })` sets how she is with one person (a nudge with them alone, how
  much what is different with them counts, a lock: what they say teaches nothing and they do not fade);
  `lockSide(name, { often, what })` keeps her in one side for good, shown in that share of her turns, and `unlockSide()`
  draws again; `Relations.lock(subject, closeness)` and `unlock` keep a person's closeness where it is put
  (`relations.locked` in the config). `dsh-mneme-llm gut` (`show`, `set`, `tune`, `person`, `side`) and
  `dsh-mneme-llm relate --lock/--unlock` do the same from the command line, and the panel's settings do it on DSH's
  page, with each person (closeness, its lock, how much theirs counts, a lock, a nudge to each feeling, forget) and her
  sides (each sentence and weight, a new one, dropping one, the side locked and how often it shows).
- **A word she says mostly to one person is theirs** (`OWN`, 80% of its uses): their name or their in-joke shows in her
  line only with them, never to someone new.
- **A panel in DeepSeek Harness** (`plugin/client.js`, the plugin's client half). On the plugin's page under Plugins:
  her gut's settings, changed in the running plugin and kept in her gut file (`tau`, sensitivity, her age with a "young
  again", and nature and now for each of her 24 ends, by bar), saved together. In the right sidebar, a tab (Her gut,
  她的直觉) with the star map of her heart and the people she knows, her bars lately against usual, SAN and self-esteem, and
  how grown up she is, looking again every few seconds while it is in view; a button in the conversation's header opens
  it. Light and dark themes, phone widths too. Both read and change her gut through three routes on DSH's own API,
  behind its sign-in and for its owner only (`plugin/panel.js`).
- **Her star map** (`lib/starmap.js`): every row of her heart is a star placed toward the ends it pulls her to (a
  softmax of its weights along her arms), as bright as it leans, in the colour of the bar of its strongest end; her
  arms are how much more or less she feels each end than as she was born, over her own latest lessons; each person is
  one star more, placed by what is different with them.
- **The plugin's `tau` and `sensitivity` start a gut that has no settings of its own.** Once her settings are changed
  (on the panel, say), her gut keeps them and they are the latest word; before, the plugin's `sensitivity` was applied
  again at every start.
- **Forgetting a person** removes how she is with them, their name from the gut's lessons and the sides only they
  wanted; what they did to her heart stays.
- **Fixed:** an objection while she was in a side she was given counted against a side that had grown; a starter that
  cannot be read is an error, not a blank gut.
- A gut file from 0.2 is lived again under these rules the first time it wakes; its lessons and starter teach only the
  seven feelings they knew.
- **A new `starter.json.gz`:** a smaller birth with the 24 ends, 1,096 lessons from notes that score every feeling,
  including the moments everyday chat lacks (fear, blame, mockery, a rival, praise, shame, wanting quiet or a long talk,
  an apology, being let down). It is a lean: her character's prompt gives the rest.  ## 0.2.0  What she remembers about
  each person and how she feels, a command line and an MCP server, and a plugin that brings all of it into DeepSeek
  Harness. A file used by this version and by the Python package mneme-llm 0.4.0 stays one file, whichever writes it.
- **Notes.** `remember` with kinds, keys and their history, importance, feeling and dates; a daily quota for notes
  written by her model; `forget`, `purge` and pruning; recall by words (`recall`) and by meaning (`arecall`), with the
  reasons for what was chosen and what was skipped (`explain()`); the block for her prompt, the profile card, the
  recall log.
- **After each exchange,** `observe` keeps it word for word, asks her model one short question for her mood and
  whether anything is worth keeping, and calls the note writer only when it is. `capture` keeps notes without the mood,
  and `reflect` writes the profile card. A judge of your own can answer instead (`judge: { async decide(input,
  questions) }`).
- **Mood**: each exchange judged on a scale by her model (the expected level of its answer), held by guardrails,
  fading back to calm, and told to her once (`news`), in English and Chinese. **Aliases**: what a person calls her.
- **Meaning**, optional: OpenAI's embeddings through `fetch` (the key from `apiKey` or `OPENAI_API_KEY`) or any
  function of yours (`new Embeddings(fn, name)`); each model's floor measured in the file and refined as it grows; the
  look's bar rising as an exchange fades (`alook`, `asearch`, `aprompt`); notes unified into one language by your model
  (`regloss`). A provider that fails rests for a minute.
- **Tools** for a model in every style (`specs('openai' | 'responses' | 'anthropic' | 'gemini' | 'mcp')`) and one
  `Toolbox` to run them: remember, recall, forget, mood, search, read.
- **People.** `link` makes two accounts one person and joins what each kept; `unlink`, `erase`, `wipe`, `everyone`,
  `exportData` and `importData`.
- **Config files**: `config` may be a TOML file; `config.toToml()` writes the config as a file to start from.
- **Migration** of a file of schema 1 (`migrate(file)`).
- **The gut:** `wordsFrom` keeps her word habits in her line for the people at least that close; by default they are
  there for everyone.
- **The command line**, `dsh-mneme-llm`: notes, recall with its reasons, the prompt's block, history, forget, erase,
  roles, aliases, links, mood, export and import, the whole config (show, set, apply, defaults, check, template), the
  tools' definitions. The same options and output as the Python package's `mneme-llm`.
- **The MCP server**, `dsh-mneme-llm mcp`: her tools over stdio for any MCP client, bound to one person
  (`--subject`) or naming one in each call.
- **The plugin:**
  - A new session (DSH's events show she has said nothing in it yet) starts with DSH's system prompt, then what she
    keeps of the person: their first prompt if they turned it on, as they wrote it, then the summary of what she let
    go and their newest exchanges from any session, as text that says when and who said what. Her persona and the
    first prompt are what she reads first. All of it is in the session's first step, so DSH keeps it with the session,
    and the session reopens as it was, after DSH restarts too.
  - Before her first step, one message beside the person's: who they are to her (anyone but you by name, as the one
    she is talking with), her notes, her look at what was said before, her mood's news, and her gut's line. Her word
    habits are in that line only with people at closeness 40 or more, so a way of talking she has with you stays
    with you.
  - After her reply, beside the conversation: the exchange word for word, her mood and notes from her own model, the
    surface letting go of what is old, once a day her impression of the person, and a lesson for her gut. No key of its
    own: it uses the model the session uses.
  - Each sender a chat channel names is a person of their own; `accounts` says which accounts are you, and `others`
    what everyone else is to her. A turn that starts any other way is her speaking up on her own: her message is kept
    as hers, as the first thing said, and nothing of what started it (another plugin's words to her); her mood
    follows it.
  - In a group, her look reads what the person writing said with her, in any chat, and what was said with her in that
    group, never anyone else's private chats. The mention of her own account a message opens with (`@20002 …`) is left
    out of what she keeps and reads. She knows her account once the same mention has opened two group messages and
    nobody writes from it.
  - `$first` and `$new` (with `deep` and `gut`), typed as messages and answered by the plugin, every one of them with
    no model call, in the language the person writes in (English or Chinese): that of the words they give with the
    command, else of what they wrote last (a command's own words, such as `on` or `deep`, are in no language);
    `/mneme-first` and `/mneme-new` in DSH's own command list.
  - Her tools `mneme_search` and `mneme_read`, over everything said with the person she is talking with.
  - Her folder is under DSH's home (`$DSH_HOME`, or `~/.dsh`).
- **Changed:** the package's starter for the gut, `starter.json.gz`, holds feelings only: a companion's word habits
  come from her own replies alone.
- **Changed:** `observe` is async and returns a promise. With no model and no embedder, everything it keeps is kept by
  the time it returns.
- **Fixed:** on Node 22.13 to 22.15, a write that failed left its transaction open, and every later write failed with
  it; it is rolled back now.

With the Python package, a few things come out slightly otherwise:

- **Vectors with numpy.** Python with numpy compares vectors in single precision; this side compares them as Python
  without numpy does. Their similarities agree to about one part in ten million, so a note or an exchange right at a
  bar, or tied with another, may come out otherwise. Against Python without numpy, every value is the same.
- **One kind of number.** A whole number written as a float in a model's reply or a tool's arguments (`"level": 1.0`) is
  read as Python reads it, and the file keeps floats where Python does. In a table you pass in, `5.0` and `5` are one
  number, so text shown to a model may say `5` where Python says `5.0`.
- **A look that stops waiting** for its query's vector (after `lookWait`, 3 seconds) cannot cancel the request; its
  answer is dropped, but a failure that comes later still rests the embedder.
- **A bare function as an embedder** is named after its JavaScript name (`custom:toy`), Python's after its qualified
  name. The name keeps the vectors apart, so give both sides `new Embeddings(fn, name)` to share them.

## 0.1.0

The first version.

- **The file**, schema 2, the one the Python package mneme-llm 0.4.0 keeps: WAL, transactions, and a file of another
  schema refused before anything changes.
- **Text and dates** read as that package reads them: Python 3.13's Unicode tables, talking days and local times in any
  zone, and a tokenizer that needs no rebuild on either side.
- **Deep memory and the surface**: exchanges kept word for word, the look, fading by talking days, the summary and
  `letGo`, first prompts; roles and closeness; the config, with every key and default.
- **The gut**: `Turn.feel` and `Turn.learn`, sides, `Gut.wipe`, its lessons in an SQLite file of its own.
- **The plugin** for DeepSeek Harness: every exchange kept word for word, and her gut's line before she answers.

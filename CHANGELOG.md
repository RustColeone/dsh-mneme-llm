# Changelog

## 0.3.0 (unreleased)

Her gut as mneme-llm 0.5.0 has it, so a file still moves between the two, whichever writes it.

- **Her feelings are 24 ends on 13 bars** (`BARS`, `ENDS`, `CHINESE`, `FEELINGS`): 难过 or 开心, 担心 or 踏实, 慌乱·崩溃 or
  平静, 嫌弃 or 甜蜜, 严厉 or 温柔, 易怒 or 平和, 委屈 or 不服, 羞愧 or 得意, 害羞 or 调皮, 胆小 or 大胆, 内向 or 外向, and 吃醋 and
  心疼. Each end is a strength of its own, so both ends of a bar can be strong at once. `MOODS` and `NORMAL` are gone.
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
- **A word she says mostly to one person is theirs** (`OWN`, 80% of its uses): their name or their in-joke shows in her
  line only with them, never to someone new.
- **A panel in DeepSeek Harness** (`plugin/client.js`, the plugin's client half). On the plugin's page under Plugins:
  her gut's settings, changed in the running plugin and kept in her gut file (`tau`, sensitivity, her age with a
  "young again", and nature and now for each of her 24 ends, by bar), saved together. In the right sidebar, a tab
  (Her gut, 她的直觉) with the star map of her heart and the people she knows, her bars lately against usual, SAN
  and self-esteem, and how grown up she is, looking again every few seconds while it is in view; a button in the
  conversation's header opens it. Light and dark themes, phone widths too. Both read and change her gut through three routes on DSH's own API,
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
- **A new `starter.json.gz`:** a smaller birth with the 24 ends, 1,119 lessons, including the moments everyday chat
  lacks (fear, blame, mockery, a rival, praise, shame, wanting quiet or a long talk, an apology, being let down). It
  is a lean: her character's prompt gives the rest.

## 0.2.0

What she remembers about each person and how she feels, a command line and an MCP server, and a plugin that brings all
of it into DeepSeek Harness. A file used by this version and by the Python package mneme-llm 0.4.0 stays one file,
whichever writes it.

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

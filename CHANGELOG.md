# Changelog

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
    keeps of the person, as turns of their own: their first prompt if they turned it on, the summary of what she let
    go, and their newest exchanges from any session. Her persona and the first prompt are what she reads first.
  - Before her first step, one message beside the person's: who they are to her (and, when they are not you, who her
    owner is, by name), her notes, her look at what was said before, her mood's news, and her gut's line. Her word
    habits are in that line only with people at closeness 40 or more, so a way of talking she has with you stays
    with you.
  - After her reply, beside the conversation: the exchange word for word, her mood and notes from her own model, the
    surface letting go of what is old, once a day her impression of the person, and a lesson for her gut. No key of its
    own: it uses the model the session uses.
  - Each sender a chat channel names is a person of their own; `accounts` says which accounts are you, and `others`
    what everyone else is to her. A turn that starts any other way is her speaking up on her own, kept as hers.
  - In a group, the mention of her own account a message opens with (`@20002 …`) is left out of what she keeps and
    reads. She knows her account once the same mention has opened two group messages and nobody writes from it.
  - `$first` and `$new` (with `deep` and `gut`), typed as messages and answered by the plugin, every one of them with
    no model call, in the language the person writes in (English or Chinese); `/mneme-first` and `/mneme-new` in
    DSH's own command list.
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

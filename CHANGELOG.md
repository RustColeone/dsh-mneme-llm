# Changelog

## 0.2.0

The rest of mneme-llm 0.4.0's library, ported: what a companion remembers, how she feels, and meaning. A file used by
this version and by Python's mneme-llm 0.4.0 stays one file, whichever writes it.

- **Notes.** `remember` with kinds, keys and their history, importance, feeling and dates; the daily quota of automatic
  notes; `forget`, `purge`, pruning; recall by words (`recall`) and by meaning (`arecall`), with the reasons for what
  was chosen and skipped (`explain()`); the context block, the profile card, the recall log.
- **The judge and the note writer.** `observe` asks one decision for the mood and "worth remembering?", and calls the
  note writer only when it is; `capture` and `reflect` too. The judge runs on your chat model (`complete`), or is one of
  your own (`judge: { async decide(input, questions) }`).
- **Mood**, as in Python: judged by the expected level, held by its guardrails, fading, told once (`news`), in English
  and Chinese. **Aliases.**
- **Meaning.** OpenAI's embeddings through `fetch` (the key from `apiKey` or OPENAI_API_KEY), or any function of yours
  (`new Embeddings(fn, name)`); each model's floor measured in the file and refined as it grows; the look's bar on
  exchanges by how far they have faded (`alook`, `asearch`, `aprompt`); the unify tier (glosses and translated queries
  on your model, `regloss`). A provider that fails rests for a minute.
- **Tools** for a model in every style (`specs('openai' | 'responses' | 'anthropic' | 'gemini' | 'mcp')`) and the
  `Toolbox`: remember, recall, forget, mood, search, read.
- **People.** `link` joins what each account kept, under the rules writing keeps; `unlink`, `erase`, `wipe`,
  `everyone`, `exportData` and `importData`.
- **Config files.** `config` may be a TOML file, read as Python's `tomllib` reads it (`lib/toml.js`), with the same
  errors; `config.toToml()` writes the config as a file, and `toToml(DEFAULTS)` is `mneme-llm config template`.
- **Migration** of a schema 1 file (`migrate(file)`), as `python -m mneme_llm.migrate` does it.
- **Changed:** `observe` is async and returns a promise. With no model and no embedder, everything it keeps is kept by
  the time it returns, as before. The plugin passes `embed: false`, so it sends nothing anywhere, as before.

What cannot be identical:

- **Vectors with numpy.** Python with numpy compares vectors in single precision; this port compares them as Python
  without numpy does, each float32 value times the query's in double precision, added as Python's `sum` adds. Their
  similarities agree to about one part in ten million, so a note or an exchange right at a bar, or tied with another,
  may come out otherwise. Against Python without numpy, every value is the same.
- **One kind of number.** A whole number written as a float in a model's reply or a tool's arguments (`"level": 1.0`)
  is read as Python reads it. In a table you give, or an export, `5.0` and `5` are one number here: wherever the file
  keeps a float, this port writes one, as Python does, but text shown to a model says `5` where Python says `5.0`.
- **A look that stops waiting** for its query's vector (after `lookWait`, 3 seconds) cannot cancel the request; its
  answer is dropped, as in Python, but a failure that comes later still rests the embedder.
- **A bare function as an embedder** is named after its JavaScript name (`custom:toy`); Python uses its qualified name.
  The name keeps the vectors apart, so give both sides `new Embeddings(fn, name)` to share them.
- **Tests:** the parity fixtures and the files-both-ways tests cover all of this, with models and an embedder made of
  rules (`tools/models.py`, `tools/models.js`), so no test reaches a network.

## 0.1.0

The first version: the foundation of mneme-llm 0.4.0 in JavaScript, and a DeepSeek Harness plugin.

- **The file.** Schema 2, made by the same statements as Python's, so the schema text is the same. A file of another
  schema is refused before anything changes, with what to do. WAL, `begin immediate`, savepoints.
- **Text and dates as Python reads them.** Python 3.13's Unicode tables (`lib/unicode.js`), its whitespace, code
  points rather than UTF-16 units, its float `repr`, `round` and `json.dumps`, and correctly rounded `exp` and `log`.
  The tokenizer is Python's without jieba, version `4`, so neither side rebuilds the other's index.
- **Ported:** episodes by words (keep, search, look, render, fading by talking days, rehearsal once a day), the surface
  and first prompts (with the summary, `letGo`), relations, reading links, the config (every key, default and rule;
  a new space's rows are byte for byte Python's), sentences and prompts, and a `Mneme` for one space. Notes' search
  index is rebuilt with the rest, so a file stays whole for Python.
- **The gut,** moved here from dsh-mneme-gut and brought to 0.4.0: `Turn.feel(before, ...)`, `Turn.learn(reply)`,
  `Gut.wipe`, its lessons in an SQLite file like Python's, and shuffles with Python's own random numbers. Its tests
  use mneme-llm's `tests/gut_vectors.json` unchanged.
- **The plugin** keeps every exchange word for word in the shared file, as well as what dsh-mneme-gut did. Closeness
  comes from the file when you have a role.
- **Compatibility tests:** fixtures from Python (`tools/fixtures.py`), one scenario run by both sides, and files both
  ways against Python itself (`test/compat.test.js`), which CI runs against mneme-llm 0.4.0 from PyPI.

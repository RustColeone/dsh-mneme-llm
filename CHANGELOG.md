# Changelog

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

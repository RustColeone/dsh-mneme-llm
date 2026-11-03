# dsh-mneme-llm

**mneme-llm in JavaScript, and a DeepSeek Harness plugin that uses it.**

[mneme-llm](https://github.com/RustColeone/mneme-llm) keeps an AI companion's memory in one SQLite file that any
model can use. It is a Python package. People should not need Python to use it, so it is being ported to JavaScript,
whole, over time. This is that port.

The two share one file format. A file written by the Python package is read and written here, and a file written here
is read and written by the Python package. So memory can move between hosts: a Python bot and a JavaScript one can use
the same file, one after the other.

This is version 0.1.0, the foundation. It needs Node 22.13 or later (for `node:sqlite`) and nothing else: no
dependencies.

## What 0.1.0 ports

It ports mneme-llm 0.4.0 (file schema 2).

| Part | In 0.1.0 | Python |
|---|---|---|
| The file: every table and index, schema 2, other versions refused, WAL, transactions | yes | `store.py` |
| Search terms, token counts, cleaning and cutting text (tokenizer version 4, no jieba) | yes | `text.py` |
| Talking days and local times, in any zone | yes | `dates.py` |
| Exchanges kept word for word: keep, search, look, ranking, fading, rehearsal | yes, by words | `episodes.py` |
| The surface: recent turns, its summary, clearing, first prompts | yes | `surface.py` |
| Roles and closeness | yes | `relations.py` |
| Reading links between accounts | yes | `people.py` |
| The config: every key, default and rule | yes, from a table | `config.py` |
| Sentences and prompts, English and Chinese | yes | `i18n.py`, `prompts.py` |
| The gut | yes, as in 0.4.0 | `gut.py` |
| Notes and recall, the profile card, aliases | later | `memory.py`, `capture.py`, `aliases.py` |
| Mood and the judge | later | `mood.py`, `decide.py` |
| Meaning: embeddings, the look's bar, the unify tier | later | `meaning/` |
| Tools for the model (search, read) | later | `tools.py` |
| Linking accounts, erase and wipe, export and import | later | `__init__.py` |
| Config files (TOML), the command line, migration | later | `config.py`, `cli.py`, `migrate.py` |
| In DSH: the look in her prompt | later | |
| In DSH: the surface put in front of a new session | later | |

Notes are not ported yet, but their search index is. When this port rebuilds the indexes of a file, the file stays
whole for Python.

Linking, erasing and wiping touch every part of a file, notes and mood too. Until those parts are ported, `Mneme` does
none of them. It reads the links Python made.

## How compatibility is tested

Correct compatibility matters more than how much is ported. It is tested three ways.

**Parity fixtures.** `tools/fixtures.py` runs Python's mneme-llm on fixed inputs and writes what it gives to
`test/fixtures/parity.json`. The normal tests check this port against that file, so they need no Python:

- text: terms, tokens, folding, cleaning, cutting and splitting for 337 listed strings, and for 20,000 more drawn
  with Python's own random numbers (ported here) and compared by digest;
- talking days and local times for 205 moments in 13 zones, across summer time changes: 2,665 checks;
- the surface's bounds for 35 inputs;
- every one of the 200 config rows of a new space, byte for byte, and 31 values checked by the rules;
- 36 relation lines, weights and closeness as it fades;
- the gut born from its starter, after a sleep, and its word habits, with Python's shuffles;
- one scenario, `test/fixtures/scenario.json`: 40 operations (exchanges in Chinese and English, a group, a summary, a
  clear, first prompts, searches that rehearse), then everything read back at three moments: 24 exchanges with their
  fading, every read of the surface, 14 searches and looks, 6 rendered blocks. The file it makes must hold the same
  rows as Python's, value for value (a digest of every row).

**Files both ways.** `test/compat.test.js` runs against Python itself when it is there:

- the same operations make the same file, here and in Python: every row, value and storage class, and the schema;
- a file Python wrote, with a link, is read here as Python reads it;
- what this port adds to that file, Python reads as this port reads it, and the file is the one Python would have made;
- a gut file moves both ways;
- all 1,112,064 code points fold and normalize as in Python;
- talking days in the machine's own zone match under several `TZ` settings.

These tests skip when Python or the package is not found. Set `MNEME_LLM_PYTHON` to a Python, and `PYTHONPATH` to a
checkout of mneme-llm if it is not installed.

**CI.** One job tests on Node 22 and 24. Another installs Python 3.13 and `mneme-llm==0.4.0` from PyPI, writes the
fixtures again and fails on any difference, checks the Unicode tables, and runs every test with the files both ways.

### What cannot be identical

- **The last bit of `exp` and `log`.** Retention uses `exp`, the search ranking uses `log`. V8's own functions differ
  from the C library's in the last bit about one time in ten. This port computes them correctly rounded instead. The
  C library is almost always correctly rounded, and where it is not (about 1 in 1,400 for `exp` and 1 in 2,200 for
  `log`, in a test of half a million values) the two differ in the last bit. Python itself differs this way between
  machines. In the scenario every value matches exactly.
- **Unicode versions.** Python 3.13 uses Unicode 15.1; Node uses its own, newer one. This port reads every character
  with Python 3.13's tables (`lib/unicode.js`, written by `tools/unicode.py`), so it splits text as Python 3.13 does.
  Python 3.14 uses Unicode 16, and may split characters added since differently, as Python versions do among
  themselves.
- **Time zones.** Node uses ICU's zone data, Python the system's. They agree unless one is older than a change to a
  zone's rules.
- **The gut's weights.** The gut uses V8's own `exp`, which is faster, so its weights agree with Python's to about
  one part in a trillion, not to the bit. The lines she is told and the words she learns come out the same.

## Use the library

```js
import { Mneme } from 'dsh-mneme-llm/lib'

const m = new Mneme('companion.db', 'dafeiyu', { config: { companion: { name: '大肥鱼', zone: 'UTC+8' } } })
m.relate('discord:42', 'creator')
m.observe('discord:42', [['Leo', message], ['大肥鱼', reply]], { conversation: 'dm' })   // kept word for word
const context = m.surface.read('discord:42', { userName: 'Leo' }).messages              // recent turns
const block = m.look('discord:42', message, { userName: 'Leo', own: true })             // what comes to mind
await m.surface.letGo('discord:42', { userName: 'Leo', complete })                      // a summary when it is long
```

Names follow the Python, in JavaScript's form: `set_first` is `setFirst`, `alet_go` is `letGo`, keyword arguments are
an options object. `complete(system, user)` is your own model, an async function that returns text. The config is a
table here, not a TOML file; the file keeps its own copy from then on, as in Python. Zones are `null` (the machine's),
`{ name: 'Asia/Shanghai' }` or `{ offset: 28800 }`, or a config's `companion.zone` such as `UTC+8`.

The gut is in the library too: `import { Gut, Turn } from 'dsh-mneme-llm/lib'`. Its file is the one Python's gut
keeps.

## Use the plugin

```yaml
- id: mneme-llm
  name: dsh-mneme-llm
  config:
    name: xiaojing            # her folder: ~/.dsh/mneme-llm/xiaojing (memory.db and gut.db)
    companion: 小鲸            # her name, as the file keeps her lines
    user: Leo                 # your name, as the file keeps your lines
    character: 你是小鲸……      # who she is: her vote and her note speak as this character
    role: family              # who you are to her; then closeness comes from the file
    closeness: 85             # without a role: how close you are, 0 to 100; below 40 her gut learns nothing
    tags:                     # 属性: a name from her list and one sentence of what she does
      小绿茶: 你表面天真体贴，提到别的女生时先夸她，再用委屈的语气让她显得不如你。
    # file: /path/to/companion.db   a mneme-llm file shared with another host, Python's too
    # space: xiaojing               whose memory in that file (the name, by default)
    # subject: owner                who you are in that file
    # gut: false                    memory only, no gut
```

Each turn does what the earlier plugin, dsh-mneme-gut, did, and one more thing:

1. A message comes in. Her model reads it into a small form.
2. Before her first step, her gut and her vote give one line beside your message: how she feels, her word habits, her
   side, the language to answer in.
3. When the turn ends, your message and her reply are kept word for word in the mneme-llm file. Deep memory grows from
   the first day, in a file Python's mneme-llm reads too.
4. Beside the conversation, she writes a private note that teaches her gut.

The gut used to keep its lessons in a folder of JSON files. It now keeps them in an SQLite file, as Python's does. The
old folder is not read.

## Develop

```sh
npm test                                   # everything; the files-both-ways tests skip without Python
PYTHONPATH=../mneme-llm npm test           # with a checkout of mneme-llm beside this one
python3 tools/fixtures.py                  # the fixtures again, from that mneme-llm
python3 tools/unicode.py                   # lib/unicode.js again, from Python 3.13's tables
```

MIT.

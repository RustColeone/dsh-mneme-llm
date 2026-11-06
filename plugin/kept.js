// What the plugin's page sets of the plugin's own settings, kept in her folder (settings.json) over them: the latest word
// wins. A value set on the page stands until the plugin's setting for it is changed; then that is the latest word, and
// the page's is let go. What lives in her files (her name, her card, roles, closeness, links, her memory's settings, her
// gut) the page writes there itself: those need nothing here.
import fs from 'node:fs'
import path from 'node:path'

// The settings the page may set: her name and yours, the language she answers in, your role and accounts, the role of
// people she meets, and her chat mode and whether her card is its whole prompt.
export const KEYS = ['companion', 'user', 'language', 'role', 'accounts', 'others', 'chat', 'complete']

const same = (one, other) => JSON.stringify(one ?? null) === JSON.stringify(other ?? null)
const isTable = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The page's words for a plugin whose settings are `config`, in `folder`. */
export function keep (folder, config = {}) {
  const file = path.join(folder, 'settings.json')
  let words = {}
  try {
    const read = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (isTable(read)) {
      words = Object.fromEntries(Object.entries(read).filter(([key, item]) => KEYS.includes(key) && isTable(item) &&
        Object.hasOwn(item, 'value')))
    }
  } catch { /* none yet, or unreadable: the plugin's settings alone */ }
  const standing = key => Object.hasOwn(words, key) && same(words[key].config, config[key])
  return {
    /** The plugin's settings with the page's standing words over them. */
    merged () {
      const found = { ...config }
      for (const key of KEYS) if (standing(key)) found[key] = words[key].value
      return found
    },
    /** Where a setting's value comes from: the page, or the plugin's settings (its default, when they have none). */
    from: key => standing(key) ? 'page' : 'settings',
    /** Keep `values` (KEYS only) as the latest word; one equal to the plugin's own lets the page's go. */
    set (values) {
      for (const [key, value] of Object.entries(values)) {
        if (!KEYS.includes(key)) throw new Error(`not a setting the page keeps: ${key}`)
        if (same(value, config[key])) delete words[key]
        else words[key] = { value, config: config[key] ?? null }
      }
      fs.mkdirSync(folder, { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      fs.writeFileSync(temporary, JSON.stringify(words, null, 1))
      fs.renameSync(temporary, file)
    }
  }
}

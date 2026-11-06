// Her settings page (page/settings.js) is one file, the same everywhere it is used: in plugin/client.js, which DSH
// loads as one bundle and so holds it word for word between two marks, and in any other copy named here (a host's own
// page, mneme-llm's tuner), as the file itself.
//
//     node tools/copies.mjs [copy.js ...]           write plugin/client.js's and each copy named
//     node tools/copies.mjs --check [copy.js ...]   say which differ, and fail if any does
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const PAGE = fileURLToPath(new URL('../page/settings.js', import.meta.url))
const CLIENT = fileURLToPath(new URL('../plugin/client.js', import.meta.url))
export const START = '    // ---- page/settings.js, word for word (node tools/copies.mjs writes it) ----\n'
export const END = '    // ---- end of page/settings.js ----\n'
const OPEN = '    const MnemeSettings = (() => {\n      const module = undefined, self = {} // (so that it is this bundle\'s own)\n'
const CLOSE = '      return self.MnemeSettings\n    })()\n'

/** plugin/client.js with `page` between its marks. */
export function bundled (client, page) {
  const at = client.indexOf(START), end = client.indexOf(END)
  if (at < 0 || end < at) throw new Error('plugin/client.js has no marks for page/settings.js')
  return client.slice(0, at + START.length) + OPEN + page + CLOSE + client.slice(end)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const args = process.argv.slice(2), checking = args.includes('--check')
  const page = fs.readFileSync(PAGE, 'utf8'), copies = args.filter(arg => arg !== '--check')
  let differ = 0
  const client = fs.readFileSync(CLIENT, 'utf8'), made = bundled(client, page)
  for (const [where, now, wanted] of [[CLIENT, client, made],
    ...copies.map(copy => [copy, fs.existsSync(copy) ? fs.readFileSync(copy, 'utf8') : null, page])]) {
    if (now === wanted) continue
    differ += 1
    if (checking) console.log(`differs: ${where}`)
    else {
      fs.writeFileSync(where, wanted)
      console.log(`written: ${where}`)
    }
  }
  if (checking && differ) process.exit(1)
}

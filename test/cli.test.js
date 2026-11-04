// The command line and the MCP server against Python's: what `mneme-llm` printed for a run of commands on one file and
// what its MCP server answered (tools/fixtures.py wrote them), here through `main` with the same clock; and the server
// over a real stdio pipe.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { Readable } from 'node:stream'
import { mock, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { main, parse } from '../lib/cli.js'
import { specs } from '../lib/tools.js'

const P = JSON.parse(fs.readFileSync(new URL('./fixtures/parity.json', import.meta.url), 'utf8')).cli
const BIN = fileURLToPath(new URL('../bin/dsh-mneme-llm.js', import.meta.url))
const PYTHON_SERVER = '"serverInfo": {"name": "mneme-llm", "version": "0.5.0"}'
const SERVER = '"serverInfo": {"name": "dsh-mneme-llm", "version": "0.3.0"}'
const BOUND = ['--db', 'mcp.db', '--config', 'companion.toml', 'mcp', '--subject', 'discord:42']
const UNBOUND = ['--db', 'mcp2.db', '--config', 'companion.toml', 'mcp']

async function run (argv, input = Buffer.alloc(0)) {
  let out = '', err = ''
  const code = await main(argv, { stdout: { write: text => { out += text } },
    stderr: { write: text => { err += text } }, stdin: Readable.from([input]), env: {} })
  return [code, out, err]
}

/** In a new folder with the fixtures' config file, on Python's clock, without an OpenAI key. */
async function inFolder (work) {
  const here = process.cwd(), key = process.env.OPENAI_API_KEY
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-cli-')))
  delete process.env.OPENAI_API_KEY
  mock.timers.enable({ apis: ['Date'], now: P.start * 1000 })
  try {
    fs.writeFileSync('companion.toml', P.toml)
    await work()
  } finally {
    mock.timers.reset()
    if (key !== undefined) process.env.OPENAI_API_KEY = key
    process.chdir(here)
  }
}

const said = text => text.slice(text.lastIndexOf('error: ')) // (argparse lays out its usage otherwise)

test('every command prints what Python\'s printed, one after another on one file', () => inFolder(async () => {
  for (const [index, argv] of P.commands.entries()) {
    mock.timers.setTime((P.start + 60 * index) * 1000)
    const [code, out, err] = await run([...P.file, ...argv]), wanted = P.out[index]
    if (wanted[2].startsWith('usage: ')) {
      assert.deepEqual([code, out, err.startsWith('usage: dsh-mneme-llm'), said(err)],
        [wanted[0], wanted[1], true, said(wanted[2])], argv.join(' '))
    } else assert.deepEqual([code, out, err], wanted, argv.join(' '))
  }
}))

test('the MCP server answers what Python\'s answered, bound to a person and not', () => inFolder(async () => {
  for (const [argv, wanted] of [[BOUND, P.bound], [UNBOUND, P.unbound]]) {
    const [code, out, err] = await run(argv, Buffer.from(P.mcp, 'hex'))
    assert.deepEqual([code, out, err], [wanted[0], wanted[1].replace(PYTHON_SERVER, SERVER), wanted[2]])
  }
}))

test('the MCP server over a real stdio pipe: the handshake, Python\'s tool list, a note kept and recalled',
  async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mneme-mcp-'))
  fs.writeFileSync(path.join(folder, 'companion.toml'), P.toml)
  const child = spawn(process.execPath, [BIN, ...BOUND], { cwd: folder, env: { ...process.env, OPENAI_API_KEY: '' },
    stdio: ['pipe', 'pipe', 'inherit'] })
  const exited = new Promise(resolve => child.once('exit', resolve))
  const replies = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]()
  const sent = Buffer.from(P.mcp, 'hex').toString('utf8').split('\n').slice(0, 8)
  const wanted = P.bound[1].replace(PYTHON_SERVER, SERVER).split('\n').slice(0, 7)
  child.stdin.write(sent[0] + '\n') // the client waits for the server's answer before it goes on
  assert.equal((await replies.next()).value, wanted[0])
  child.stdin.end(sent.slice(1).join('\n') + '\n')
  const found = [wanted[0]]
  for (let reply = await replies.next(); !reply.done; reply = await replies.next()) found.push(reply.value)
  assert.deepEqual(found, wanted)
  assert.deepEqual(JSON.parse(found[1]).result.tools, specs('mcp'))
  assert.equal(await exited, 0)
})

test('help, the version, and command lines as argparse reads them', async () => {
  const [code, out] = await run(['--help'])
  assert.ok(code === 0 && out.startsWith('usage: dsh-mneme-llm [-h] [--db DB]'), out)
  assert.ok(out.includes('  remember              keep a note'))
  assert.deepEqual(await run(['--version']), [0, 'dsh-mneme-llm 0.3.0\n', ''])
  const found = parse(['--sp', 'x', 'remember', 'a', '--imp', '4', '--', '--kind=plan'], { MNEME_LLM_DB: 'x.db' })
  assert.deepEqual([found.db, found.space, found.command, found.subject, found.text, found.kind, found.importance],
    ['x.db', 'x', 'remember', 'a', '--kind=plan', 'fact', 4])
  assert.equal(parse(['relate', 'a', '--closeness', '-5']).closeness, -5)
  assert.deepEqual(parse(['config', 'defaults', 'a', 'b']).keys, ['a', 'b'])
  const [wrong, , told] = await run(['--d', 'x.db', 'subjects'])
  assert.deepEqual([wrong, told.split('\n')[1]],
    [2, 'dsh-mneme-llm: error: ambiguous option: --d could match --db, --display-language'])
})

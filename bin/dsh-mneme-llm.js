#!/usr/bin/env node
// The `dsh-mneme-llm` command (lib/cli.js).
import { main } from '../lib/cli.js'

process.exitCode = await main()

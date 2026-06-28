#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { parseConfig, HelpRequested, helpText } from './config.js'
import { ShellTaskExecutor } from './executor.js'
import { FileLocalStateStore, withLocalLock } from './localState.js'
import { runLoop, runOnce } from './runner.js'
import { HttpWorkerApi } from './workerApi.js'
import type { Logger } from './types.js'

const logger: Logger = {
  error: (message) => console.error(message),
  info: (message) => console.log(message),
  warn: (message) => console.warn(message)
}

export const main = async (argv = process.argv.slice(2)) => {
  let config

  try {
    config = parseConfig({ argv })
  } catch (error) {
    if (error instanceof HelpRequested) {
      console.log(helpText)
      return 0
    }

    throw error
  }

  const api = new HttpWorkerApi({
    accessToken: config.accessToken,
    workerSecret: config.workerSecret,
    workerUrl: config.workerUrl
  })
  const executor = new ShellTaskExecutor(config.command)
  const stateStore = new FileLocalStateStore(config.stateDir)

  await withLocalLock(config.stateDir, async () => {
    if (config.mode === 'loop') {
      await runLoop({ api, config, executor, logger, stateStore })
    } else {
      await runOnce({ api, config, executor, logger, stateStore })
    }
  })

  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

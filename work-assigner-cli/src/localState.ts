import { constants } from 'node:fs'
import { mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ActiveLeaseState, LocalStateStore } from './types.js'

const activeLeaseFile = 'active-lease.json'
const lockFile = 'runner.lock'

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => (
  error instanceof Error && 'code' in error
)

const isProcessAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return isNodeError(error) && error.code === 'EPERM'
  }
}

export class FileLocalStateStore implements LocalStateStore {
  private readonly stateDir: string

  constructor(stateDir: string) {
    this.stateDir = stateDir
  }

  async clearActiveLease() {
    await rm(this.activeLeasePath, { force: true })
  }

  async readActiveLease() {
    try {
      return JSON.parse(await readFile(this.activeLeasePath, 'utf8')) as ActiveLeaseState
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined
      }

      throw error
    }
  }

  async writeActiveLease(state: ActiveLeaseState) {
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.activeLeasePath, `${JSON.stringify(state, null, 2)}\n`)
  }

  private get activeLeasePath() {
    return join(this.stateDir, activeLeaseFile)
  }
}

export const withLocalLock = async <T>(stateDir: string, run: () => Promise<T>): Promise<T> => {
  await mkdir(stateDir, { recursive: true })
  const path = join(stateDir, lockFile)
  const handle = await createLock(path)

  try {
    return await run()
  } finally {
    await handle.close()
    await unlink(path).catch((error: unknown) => {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error
      }
    })
  }
}

const createLock = async (path: string) => {
  try {
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR)
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`)
    return handle
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'EEXIST') {
      throw error
    }

    const existing = await readExistingLock(path)

    if (existing?.pid && isProcessAlive(existing.pid)) {
      throw new Error(`Another work assigner process is already running with pid ${existing.pid}.`)
    }

    await unlink(path)
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR)
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, recoveredAt: new Date().toISOString() })}\n`)
    return handle
  }
}

const readExistingLock = async (path: string) => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as { pid?: number }
  } catch {
    return undefined
  }
}

export const localProcessIsAlive = isProcessAlive

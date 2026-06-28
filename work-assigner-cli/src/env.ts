import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

type LoadCliEnvironmentInput = {
  argv: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

const cleanString = (value: string | undefined) => value?.trim() ?? ''

const stripQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

const parseDotEnv = (source: string) => {
  const parsed: Record<string, string> = {}

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')

    if (separatorIndex < 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    if (!key) {
      continue
    }

    parsed[key] = stripQuotes(value)
  }

  return parsed
}

const readOption = (argv: string[], index: number, name: string) => {
  const value = argv[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }

  return value
}

const readEnvFile = async (path: string) => {
  try {
    return parseDotEnv(await readFile(path, 'utf8'))
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {}
    }

    throw error
  }
}

export const getRequestedEnvFiles = (argv: string[], cwd = process.cwd()) => {
  const files: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--env-file') {
      files.push(resolve(cwd, readOption(argv, index, '--env-file')))
      index += 1
    }
  }

  return files
}

export const loadCliEnvironment = async ({
  argv,
  cwd = process.cwd(),
  env = process.env
}: LoadCliEnvironmentInput) => {
  const merged = {
    ...(await readEnvFile(resolve(cwd, 'work-assigner-cli/.env.defaults'))),
    ...(await readEnvFile(resolve(cwd, 'work-assigner-cli/.env.local')))
  }

  for (const file of getRequestedEnvFiles(argv, cwd)) {
    Object.assign(merged, await readEnvFile(file))
  }

  for (const [key, value] of Object.entries(env)) {
    if (cleanString(value)) {
      merged[key] = value ?? ''
    }
  }

  return merged
}

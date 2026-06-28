import { hostname } from 'node:os'
import { resolve } from 'node:path'
import type { WorkAssignerConfig } from './types.js'

type ParseConfigInput = {
  argv: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

const defaultCommand = 'codex exec -'

const cleanString = (value: string | undefined) => value?.trim() ?? ''

const parseInteger = (value: string | undefined, label: string, fallback: number) => {
  if (!cleanString(value)) {
    return fallback
  }

  const parsed = Number.parseInt(cleanString(value), 10)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }

  return parsed
}

const parseCapabilities = (values: string[]) => (
  values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
)

const readOption = (argv: string[], index: number, name: string) => {
  const value = argv[index + 1]

  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`)
  }

  return value
}

export const helpText = `Project Management work assigner

Usage:
  npm run work-assigner -- --backlog-id <uuid> [--once|--loop]

Options:
  --access-token <token>              Supabase bearer token for the worker API.
  --backlog-id <uuid>                 Backlog to claim from.
  --capability <name>                 Worker capability. Can be repeated.
  --capabilities <a,b>                Comma-separated worker capabilities.
  --command <shell command>           Command to run for a claimed item. Default: codex exec -
  --dry-run                           Validate config and exit without claiming work.
  --env-file <path>                   Additional env file loaded after work-assigner-cli/.env.defaults and .env.local.
  --heartbeat-interval-seconds <n>    Lease heartbeat interval. Default: 60.
  --lease-seconds <n>                 Lease duration requested from the API. Default: 1800.
  --loop                              Poll forever.
  --max-concurrent-tasks <n>          Must be 1 in this first version.
  --once                              Poll once and exit. Default.
  --poll-seconds <n>                  Loop sleep when no work is available. Default: 60.
  --state-dir <path>                  Local lock/state directory. Default: .work-assigner.
  --worker-display-name <name>        Human-readable worker name.
  --worker-id <id>                    Stable worker identifier. Default: host name.
  --worker-secret <secret>            Worker API secret. Prefer env-file or OS env injection.
  --worker-url <url>                  Worker API URL. Prefer env-file or OS env injection.
  --help                              Show this help.

Environment equivalents:
  PROJECT_MANAGEMENT_ACCESS_TOKEN
  PROJECT_MANAGEMENT_BACKLOG_ID
  PROJECT_MANAGEMENT_WORKER_SECRET
  PROJECT_MANAGEMENT_WORKER_URL
  WORK_ASSIGNER_CAPABILITIES
  WORK_ASSIGNER_COMMAND
  WORK_ASSIGNER_HEARTBEAT_SECONDS
  WORK_ASSIGNER_LEASE_SECONDS
  WORK_ASSIGNER_POLL_SECONDS
  WORK_ASSIGNER_STATE_DIR
  WORK_ASSIGNER_WORKER_DISPLAY_NAME
  WORK_ASSIGNER_WORKER_ID`

export const parseConfig = ({ argv, cwd = process.cwd(), env = process.env }: ParseConfigInput): WorkAssignerConfig => {
  const flags: Record<string, string | undefined> = {}
  const capabilityValues: string[] = []
  let dryRun = false
  let help = false
  let loop = false
  let once = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--access-token':
      case '--backlog-id':
      case '--capabilities':
      case '--command':
      case '--env-file':
      case '--heartbeat-interval-seconds':
      case '--lease-seconds':
      case '--max-concurrent-tasks':
      case '--poll-seconds':
      case '--state-dir':
      case '--worker-display-name':
      case '--worker-id':
      case '--worker-secret':
      case '--worker-url':
        flags[arg] = readOption(argv, index, arg)
        index += 1
        break
      case '--capability':
        capabilityValues.push(readOption(argv, index, arg))
        index += 1
        break
      case '--dry-run':
        dryRun = true
        break
      case '--help':
      case '-h':
        help = true
        break
      case '--loop':
        loop = true
        break
      case '--once':
        once = true
        break
      default:
        throw new Error(`Unsupported argument: ${arg}`)
    }
  }

  if (help) {
    throw new HelpRequested()
  }

  if (loop && once) {
    throw new Error('Choose either --once or --loop, not both.')
  }

  const maxConcurrentTasks = parseInteger(flags['--max-concurrent-tasks'], 'maxConcurrentTasks', 1)

  if (maxConcurrentTasks !== 1) {
    throw new Error('This first work assigner version only supports --max-concurrent-tasks 1.')
  }

  const backlogId = cleanString(flags['--backlog-id']) || cleanString(env.PROJECT_MANAGEMENT_BACKLOG_ID)
  const workerUrl = cleanString(flags['--worker-url']) || cleanString(env.PROJECT_MANAGEMENT_WORKER_URL)

  if (!backlogId && !dryRun) {
    throw new Error('backlogId is required. Use --backlog-id or PROJECT_MANAGEMENT_BACKLOG_ID.')
  }

  const workerSecret = cleanString(flags['--worker-secret']) || cleanString(env.PROJECT_MANAGEMENT_WORKER_SECRET) || undefined
  const accessToken = cleanString(flags['--access-token']) || cleanString(env.PROJECT_MANAGEMENT_ACCESS_TOKEN) || undefined

  if (!workerSecret && !accessToken && !dryRun) {
    throw new Error('Provide --worker-secret, --access-token, PROJECT_MANAGEMENT_WORKER_SECRET, or PROJECT_MANAGEMENT_ACCESS_TOKEN.')
  }

  if (!workerUrl && !dryRun) {
    throw new Error('workerUrl is required. Use --worker-url, PROJECT_MANAGEMENT_WORKER_URL, or an env file.')
  }

  return {
    accessToken,
    backlogId,
    command: cleanString(flags['--command']) || cleanString(env.WORK_ASSIGNER_COMMAND) || defaultCommand,
    dryRun,
    heartbeatIntervalSeconds: parseInteger(
      flags['--heartbeat-interval-seconds'] ?? env.WORK_ASSIGNER_HEARTBEAT_SECONDS,
      'heartbeatIntervalSeconds',
      60
    ),
    leaseSeconds: parseInteger(flags['--lease-seconds'] ?? env.WORK_ASSIGNER_LEASE_SECONDS, 'leaseSeconds', 1800),
    maxConcurrentTasks: 1,
    mode: loop ? 'loop' : 'once',
    pollIntervalSeconds: parseInteger(flags['--poll-seconds'] ?? env.WORK_ASSIGNER_POLL_SECONDS, 'pollIntervalSeconds', 60),
    stateDir: resolve(cwd, cleanString(flags['--state-dir']) || cleanString(env.WORK_ASSIGNER_STATE_DIR) || '.work-assigner'),
    workerCapabilities: parseCapabilities([
      cleanString(env.WORK_ASSIGNER_CAPABILITIES),
      cleanString(flags['--capabilities']),
      ...capabilityValues
    ]),
    workerDisplayName: cleanString(flags['--worker-display-name'])
      || cleanString(env.WORK_ASSIGNER_WORKER_DISPLAY_NAME)
      || cleanString(flags['--worker-id'])
      || cleanString(env.WORK_ASSIGNER_WORKER_ID)
      || hostname(),
    workerId: cleanString(flags['--worker-id']) || cleanString(env.WORK_ASSIGNER_WORKER_ID) || hostname(),
    workerSecret,
    workerUrl
  }
}

export class HelpRequested extends Error {
  constructor() {
    super('Help requested.')
  }
}

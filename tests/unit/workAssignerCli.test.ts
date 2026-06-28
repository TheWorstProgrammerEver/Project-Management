import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseConfig } from '../../work-assigner-cli/src/config'
import { loadCliEnvironment } from '../../work-assigner-cli/src/env'
import { createTaskPrompt } from '../../work-assigner-cli/src/prompt'
import { runOnce } from '../../work-assigner-cli/src/runner'
import type {
  ActiveLeaseState,
  ClaimNextWorkItemParams,
  ExecuteTaskInput,
  LocalStateStore,
  Logger,
  TaskExecutor,
  WorkAssignerConfig,
  WorkerApi,
  WorkerClaim,
  WorkItem
} from '../../work-assigner-cli/src/types'

const logger: Logger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}

const workItem = (overrides: Partial<WorkItem> = {}): WorkItem => ({
  acceptanceCriteria: ['Tests pass', 'Implementation is scoped'],
  assignee: '',
  backlogId: 'backlog-1',
  createdAt: '2026-06-28T00:00:00Z',
  description: 'Build the first worker loop.',
  id: 'item-1',
  labels: ['agent'],
  priorityRank: 10,
  repository: 'TheWorstProgrammerEver/Project-Management',
  resultSummary: '',
  resultUrl: '',
  status: 'claimed',
  title: 'Create the first autonomous worker loop',
  updatedAt: '2026-06-28T00:00:00Z',
  ...overrides
})

const claim = (overrides: Partial<WorkerClaim> = {}): WorkerClaim => ({
  leaseExpiresAt: '2026-06-28T01:00:00Z',
  leaseToken: 'lease-token',
  workItem: workItem(),
  ...overrides
})

const config = (overrides: Partial<WorkAssignerConfig> = {}): WorkAssignerConfig => ({
  backlogId: 'backlog-1',
  command: 'codex exec -',
  dryRun: false,
  heartbeatIntervalSeconds: 60,
  leaseSeconds: 1800,
  maxConcurrentTasks: 1,
  mode: 'once',
  pollIntervalSeconds: 60,
  stateDir: '/tmp/work-assigner',
  workerCapabilities: ['code'],
  workerDisplayName: 'Daedalus',
  workerId: 'daedalus',
  workerSecret: 'secret',
  workerUrl: 'http://127.0.0.1:54321/functions/v1/worker',
  ...overrides
})

class MemoryStateStore implements LocalStateStore {
  state: ActiveLeaseState | undefined
  writes: ActiveLeaseState[] = []

  constructor(state?: ActiveLeaseState) {
    this.state = state
  }

  async clearActiveLease() {
    this.state = undefined
  }

  async readActiveLease() {
    return this.state
  }

  async writeActiveLease(state: ActiveLeaseState) {
    this.state = state
    this.writes.push(state)
  }
}

const api = (claimed: WorkerClaim | null): WorkerApi & {
  claims: ClaimNextWorkItemParams[]
  completed: string[]
  failed: string[]
  resultUrls: string[]
} => ({
  claims: [],
  completed: [],
  failed: [],
  resultUrls: [],
  async claimNextWorkItem(params) {
    this.claims.push(params)
    return claimed
  },
  async completeWorkItem(leaseToken, _resultSummary, resultUrl) {
    this.completed.push(leaseToken)
    this.resultUrls.push(resultUrl ?? '')
  },
  async failWorkItem(leaseToken) {
    this.failed.push(leaseToken)
  },
  async heartbeatLease() {
    return undefined
  },
  async releaseLease() {
    return undefined
  }
})

const executor = (
  exitCode: number,
  stdoutTail: string,
  resultFileBody?: Record<string, unknown>
): TaskExecutor & { prompts: string[]; resultFiles: string[] } => ({
  prompts: [],
  resultFiles: [],
  async run(input: ExecuteTaskInput) {
    this.prompts.push(input.prompt)
    this.resultFiles.push(input.environment.WORK_ASSIGNER_RESULT_FILE)
    await input.onChildPid(123456)

    if (resultFileBody) {
      await mkdir(dirname(input.environment.WORK_ASSIGNER_RESULT_FILE), { recursive: true })
      await writeFile(input.environment.WORK_ASSIGNER_RESULT_FILE, JSON.stringify(resultFileBody))
    }

    return {
      exitCode,
      stdoutTail
    }
  }
})

describe('work assigner config', () => {
  it('defaults to one-shot Codex execution and one local task at a time', () => {
    const result = parseConfig({
      argv: ['--backlog-id', 'backlog-1', '--worker-secret', 'secret'],
      cwd: '/repo',
      env: {
        PROJECT_MANAGEMENT_WORKER_URL: 'http://127.0.0.1:54321/functions/v1/worker',
        WORK_ASSIGNER_CAPABILITIES: 'code,github'
      }
    })

    expect(result.command).toBe('codex exec -')
    expect(result.maxConcurrentTasks).toBe(1)
    expect(result.mode).toBe('once')
    expect(result.stateDir).toBe('/repo/.work-assigner')
    expect(result.workerCapabilities).toEqual(['code', 'github'])
  })

  it('requires a worker URL when not using dry-run mode', () => {
    expect(() => parseConfig({
      argv: ['--backlog-id', 'backlog-1', '--worker-secret', 'secret'],
      env: {}
    })).toThrow('workerUrl is required')
  })

  it('rejects concurrent task settings above one', () => {
    expect(() => parseConfig({
      argv: ['--dry-run', '--max-concurrent-tasks', '2'],
      env: {}
    })).toThrow('only supports --max-concurrent-tasks 1')
  })

  it('loads checked-in defaults, local overrides, and explicit env files before parsing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'work-assigner-config-'))
    const workAssignerDir = join(cwd, 'work-assigner-cli')

    await mkdir(workAssignerDir, { recursive: true })
    await writeFile(join(workAssignerDir, '.env.defaults'), [
      'PROJECT_MANAGEMENT_WORKER_URL=http://127.0.0.1:54321/functions/v1/worker',
      'PROJECT_MANAGEMENT_WORKER_SECRET=default-secret',
      'WORK_ASSIGNER_CAPABILITIES=code'
    ].join('\n'))
    await writeFile(join(workAssignerDir, '.env.local'), [
      'PROJECT_MANAGEMENT_WORKER_SECRET=local-secret',
      'WORK_ASSIGNER_CAPABILITIES=code,github'
    ].join('\n'))
    await writeFile(join(cwd, 'custom.env'), [
      'PROJECT_MANAGEMENT_WORKER_URL=http://192.168.4.49:54321/functions/v1/worker',
      'WORK_ASSIGNER_CAPABILITIES=code,github,review'
    ].join('\n'))

    try {
      const env = await loadCliEnvironment({
        argv: ['--env-file', 'custom.env'],
        cwd,
        env: {
          PROJECT_MANAGEMENT_WORKER_SECRET: 'process-secret'
        }
      })
      const result = parseConfig({
        argv: ['--backlog-id', 'backlog-1'],
        cwd,
        env
      })

      expect(result.workerSecret).toBe('process-secret')
      expect(result.workerUrl).toBe('http://192.168.4.49:54321/functions/v1/worker')
      expect(result.workerCapabilities).toEqual(['code', 'github', 'review'])
    } finally {
      await rm(cwd, { force: true, recursive: true })
    }
  })
})

describe('work assigner prompt', () => {
  it('tells the child command to stay on the claimed work item', () => {
    const prompt = createTaskPrompt(claim(), '/tmp/result.json')

    expect(prompt).toContain('already been atomically claimed')
    expect(prompt).toContain('Do not claim another backlog item')
    expect(prompt).toContain('Do not call the Project Management worker API yourself')
    expect(prompt).toContain('/tmp/result.json')
    expect(prompt).toContain('"status":"blocked"')
    expect(prompt).toContain('Create the first autonomous worker loop')
    expect(prompt).toContain('- Tests pass')
  })
})

describe('work assigner runner', () => {
  it('does not mutate worker state during dry runs', async () => {
    const fakeApi = api(null)
    const stateStore = new MemoryStateStore({
      leaseExpiresAt: '2026-06-28T01:00:00Z',
      leaseToken: 'abandoned-token',
      startedAt: '2026-06-28T00:00:00Z',
      workItemId: 'abandoned-item',
      workItemTitle: 'Half-finished work',
      workerId: 'daedalus'
    })

    const result = await runOnce({
      api: fakeApi,
      config: config({ dryRun: true }),
      executor: executor(0, 'unused'),
      logger,
      stateStore
    })

    expect(result).toEqual({ status: 'dry-run' })
    expect(fakeApi.claims).toEqual([])
    expect(fakeApi.failed).toEqual([])
    expect(stateStore.state?.leaseToken).toBe('abandoned-token')
  })

  it('claims from the worker API and idles when no ready item is returned', async () => {
    const fakeApi = api(null)
    const fakeExecutor = executor(0, 'unused')

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: fakeExecutor,
      logger,
      stateStore: new MemoryStateStore()
    })

    expect(result).toEqual({ status: 'idle' })
    expect(fakeApi.claims).toEqual([{
      backlogId: 'backlog-1',
      leaseSeconds: 1800,
      workerCapabilities: ['code'],
      workerDisplayName: 'Daedalus',
      workerId: 'daedalus'
    }])
    expect(fakeExecutor.prompts).toEqual([])
  })

  it('completes the lease when the child command exits successfully', async () => {
    const fakeApi = api(claim())
    const fakeExecutor = executor(0, 'unused stdout', {
      resultUrl: 'https://example.com/pr/1',
      status: 'completed',
      summary: 'Implemented and verified from result file.'
    })
    const stateStore = new MemoryStateStore()

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: fakeExecutor,
      logger,
      stateStore
    })

    expect(result).toEqual({ status: 'completed', workItemId: 'item-1' })
    expect(fakeApi.completed).toEqual(['lease-token'])
    expect(fakeApi.resultUrls).toEqual(['https://example.com/pr/1'])
    expect(fakeApi.failed).toEqual([])
    expect(stateStore.state).toBeUndefined()
    expect(stateStore.writes.at(-1)?.childPid).toBe(123456)
    expect(fakeExecutor.resultFiles[0]).toBe('/tmp/work-assigner/item-1-result.json')
  })

  it('blocks the item when the child writes a blocked result even if it exits successfully', async () => {
    const fakeApi = api(claim())

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: executor(0, 'stdout says success', {
        status: 'blocked',
        summary: 'Need Ryan to message the Telegram bot first.'
      }),
      logger,
      stateStore: new MemoryStateStore()
    })

    expect(result).toEqual({ status: 'failed', workItemId: 'item-1' })
    expect(fakeApi.completed).toEqual([])
    expect(fakeApi.failed).toEqual(['lease-token'])
  })

  it('does not crash the loop when a child already closed the failed lease', async () => {
    const fakeApi = api(claim())
    fakeApi.failWorkItem = async () => {
      throw new Error('active lease not found')
    }

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: executor(0, 'stdout says success', {
        status: 'blocked',
        summary: 'Already moved to blocked through another path.'
      }),
      logger,
      stateStore: new MemoryStateStore()
    })

    expect(result).toEqual({ status: 'failed', workItemId: 'item-1' })
  })

  it('blocks the item instead of crashing when the child writes an invalid result file', async () => {
    const fakeApi = api(claim())

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: executor(0, 'stdout says success', {
        status: 'unknown',
        summary: 'Not a valid status.'
      }),
      logger,
      stateStore: new MemoryStateStore()
    })

    expect(result).toEqual({ status: 'failed', workItemId: 'item-1' })
    expect(fakeApi.completed).toEqual([])
    expect(fakeApi.failed).toEqual(['lease-token'])
  })

  it('blocks the item when the child command fails', async () => {
    const fakeApi = api(claim())

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: executor(1, 'Need user input.'),
      logger,
      stateStore: new MemoryStateStore()
    })

    expect(result).toEqual({ status: 'failed', workItemId: 'item-1' })
    expect(fakeApi.completed).toEqual([])
    expect(fakeApi.failed).toEqual(['lease-token'])
  })

  it('fails an abandoned local lease before claiming new work', async () => {
    const fakeApi = api(null)
    const stateStore = new MemoryStateStore({
      leaseExpiresAt: '2026-06-28T01:00:00Z',
      leaseToken: 'abandoned-token',
      startedAt: '2026-06-28T00:00:00Z',
      workItemId: 'abandoned-item',
      workItemTitle: 'Half-finished work',
      workerId: 'daedalus'
    })

    const result = await runOnce({
      api: fakeApi,
      config: config(),
      executor: executor(0, 'unused'),
      logger,
      stateStore
    })

    expect(result).toEqual({ status: 'idle' })
    expect(fakeApi.failed).toEqual(['abandoned-token'])
    expect(fakeApi.claims).toHaveLength(1)
  })
})

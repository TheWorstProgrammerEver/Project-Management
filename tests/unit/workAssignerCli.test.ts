import { describe, expect, it, vi } from 'vitest'
import { parseConfig } from '../../work-assigner-cli/src/config'
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
} => ({
  claims: [],
  completed: [],
  failed: [],
  async claimNextWorkItem(params) {
    this.claims.push(params)
    return claimed
  },
  async completeWorkItem(leaseToken) {
    this.completed.push(leaseToken)
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

const executor = (exitCode: number, stdoutTail: string): TaskExecutor & { prompts: string[] } => ({
  prompts: [],
  async run(input: ExecuteTaskInput) {
    this.prompts.push(input.prompt)
    await input.onChildPid(123456)

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
        WORK_ASSIGNER_CAPABILITIES: 'code,github'
      }
    })

    expect(result.command).toBe('codex exec -')
    expect(result.maxConcurrentTasks).toBe(1)
    expect(result.mode).toBe('once')
    expect(result.stateDir).toBe('/repo/.work-assigner')
    expect(result.workerCapabilities).toEqual(['code', 'github'])
  })

  it('rejects concurrent task settings above one', () => {
    expect(() => parseConfig({
      argv: ['--dry-run', '--max-concurrent-tasks', '2'],
      env: {}
    })).toThrow('only supports --max-concurrent-tasks 1')
  })
})

describe('work assigner prompt', () => {
  it('tells the child command to stay on the claimed work item', () => {
    const prompt = createTaskPrompt(claim())

    expect(prompt).toContain('already been atomically claimed')
    expect(prompt).toContain('Do not claim another backlog item')
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
    const fakeExecutor = executor(0, 'Implemented and verified.')
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
    expect(fakeApi.failed).toEqual([])
    expect(stateStore.state).toBeUndefined()
    expect(stateStore.writes.at(-1)?.childPid).toBe(123456)
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

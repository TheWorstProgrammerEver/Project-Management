export type WorkItemStatus =
  | 'backlog'
  | 'ready'
  | 'claimed'
  | 'in_progress'
  | 'review'
  | 'testing'
  | 'blocked'
  | 'done'
  | 'cancelled'

export type WorkItem = {
  id: string
  backlogId: string
  title: string
  description: string
  repository: string
  acceptanceCriteria: string[]
  labels: string[]
  status: WorkItemStatus
  priorityRank: number
  assignee: string
  resultSummary: string
  resultUrl: string
  createdAt: string
  updatedAt: string
}

export type WorkerClaim = {
  leaseToken: string
  leaseExpiresAt: string
  workItem: WorkItem
}

export type RunnerMode = 'once' | 'loop'

export type WorkAssignerConfig = {
  accessToken?: string
  backlogId: string
  command: string
  dryRun: boolean
  heartbeatIntervalSeconds: number
  leaseSeconds: number
  maxConcurrentTasks: 1
  mode: RunnerMode
  pollIntervalSeconds: number
  stateDir: string
  workerCapabilities: string[]
  workerDisplayName: string
  workerId: string
  workerSecret?: string
  workerUrl: string
}

export type Logger = {
  error: (message: string) => void
  info: (message: string) => void
  warn: (message: string) => void
}

export type WorkerApi = {
  claimNextWorkItem: (params: ClaimNextWorkItemParams) => Promise<WorkerClaim | null>
  completeWorkItem: (leaseToken: string, resultSummary: string, resultUrl?: string) => Promise<void>
  failWorkItem: (leaseToken: string, errorSummary: string) => Promise<void>
  heartbeatLease: (leaseToken: string, leaseSeconds: number) => Promise<void>
  releaseLease: (leaseToken: string, reason: string) => Promise<void>
}

export type ClaimNextWorkItemParams = {
  backlogId: string
  leaseSeconds: number
  workerCapabilities: string[]
  workerDisplayName: string
  workerId: string
}

export type ActiveLeaseState = {
  childPid?: number
  leaseExpiresAt: string
  leaseToken: string
  startedAt: string
  workItemId: string
  workItemTitle: string
  workerId: string
}

export type LocalStateStore = {
  clearActiveLease: () => Promise<void>
  readActiveLease: () => Promise<ActiveLeaseState | undefined>
  writeActiveLease: (state: ActiveLeaseState) => Promise<void>
}

export type ExecuteTaskInput = {
  claim: WorkerClaim
  environment: Record<string, string>
  prompt: string
  signal: AbortSignal
  onChildPid: (pid: number) => Promise<void>
}

export type ExecuteTaskResult = {
  exitCode: number
  signal?: NodeJS.Signals
  stdoutTail: string
}

export type TaskExecutor = {
  run: (input: ExecuteTaskInput) => Promise<ExecuteTaskResult>
}

export type RunOnceResult =
  | { status: 'dry-run' }
  | { status: 'idle' }
  | { status: 'completed'; workItemId: string }
  | { status: 'failed'; workItemId: string }

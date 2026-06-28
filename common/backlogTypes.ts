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
  activeLease?: ActiveLease
}

export type ActiveLease = {
  id: string
  workerId: string
  heartbeatAt: string
  expiresAt: string
}

export type RunEvent = {
  id: string
  workItemId: string
  workerId: string
  eventType: string
  summary: string
  createdAt: string
}

export type BacklogState = {
  workItems: WorkItem[]
  recentEvents: RunEvent[]
}

export type WorkItemInput = {
  title: string
  description: string
  repository: string
  acceptanceCriteria: string[]
  labels: string[]
  status: WorkItemStatus
  priorityRank: number
  assignee: string
}

export type WorkerClaim = {
  leaseToken: string
  leaseExpiresAt: string
  workItem: WorkItem
}

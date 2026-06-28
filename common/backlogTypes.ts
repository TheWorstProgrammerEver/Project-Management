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

export type Team = {
  id: string
  name: string
  slug: string
}

export type Backlog = {
  id: string
  teamId: string
  name: string
  slug: string
  description: string
}

export type BacklogState = {
  backlogs: Backlog[]
  workItems: WorkItem[]
  recentEvents: RunEvent[]
  selectedBacklogId?: string
  selectedTeamId?: string
  teams: Team[]
}

export type WorkItemInput = {
  backlogId: string
  title: string
  description: string
  repository: string
  acceptanceCriteria: string[]
  labels: string[]
  status: WorkItemStatus
  priorityRank: number
  assignee: string
}

export type LoadBacklogParams = {
  backlogId?: string
  teamId?: string
}

export type WorkerClaim = {
  leaseToken: string
  leaseExpiresAt: string
  workItem: WorkItem
}

import type { ActiveLease, Backlog, RunEvent, Team, WorkItem } from '../../../common/backlogTypes.ts'

type WorkItemRow = {
  id: string
  backlog_id: string
  title: string
  description: string
  repository: string
  acceptance_criteria: string[]
  labels: string[]
  status: WorkItem['status']
  priority_rank: number
  assignee: string
  result_summary: string
  result_url: string
  created_at: string
  updated_at: string
}

type TeamRow = {
  id: string
  name: string
  slug: string
}

type BacklogRow = {
  id: string
  team_id: string
  name: string
  slug: string
  description: string
}

type LeaseRow = {
  id: string
  work_item_id: string
  worker_id: string
  heartbeat_at: string
  expires_at: string
}

type EventRow = {
  id: string
  work_item_id: string
  worker_id: string
  event_type: string
  summary: string
  created_at: string
}

export const mapActiveLease = (row: LeaseRow): ActiveLease => ({
  id: row.id,
  workerId: row.worker_id,
  heartbeatAt: row.heartbeat_at,
  expiresAt: row.expires_at
})

export const mapWorkItem = (row: WorkItemRow, activeLease?: ActiveLease): WorkItem => ({
  id: row.id,
  backlogId: row.backlog_id,
  title: row.title,
  description: row.description,
  repository: row.repository,
  acceptanceCriteria: row.acceptance_criteria,
  labels: row.labels,
  status: row.status,
  priorityRank: row.priority_rank,
  assignee: row.assignee,
  resultSummary: row.result_summary,
  resultUrl: row.result_url,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  activeLease
})

export const mapTeam = (row: TeamRow): Team => ({
  id: row.id,
  name: row.name,
  slug: row.slug
})

export const mapBacklog = (row: BacklogRow): Backlog => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name,
  slug: row.slug,
  description: row.description
})

export const mapRunEvent = (row: EventRow): RunEvent => ({
  id: row.id,
  workItemId: row.work_item_id,
  workerId: row.worker_id,
  eventType: row.event_type,
  summary: row.summary,
  createdAt: row.created_at
})

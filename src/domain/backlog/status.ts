import type { WorkItem, WorkItemStatus } from '../../../common/backlogTypes'

export const workItemStatuses: WorkItemStatus[] = [
  'backlog',
  'ready',
  'claimed',
  'in_progress',
  'review',
  'testing',
  'blocked',
  'done',
  'cancelled'
]

export const workItemStatusLabels: Record<WorkItemStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  claimed: 'Claimed',
  in_progress: 'In progress',
  review: 'Review',
  testing: 'Testing',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled'
}

export const workerOwnedStatuses = new Set<WorkItemStatus>([
  'claimed',
  'in_progress'
])

export const sortedWorkItems = (workItems: WorkItem[]) => (
  [...workItems].sort((left, right) => (
    left.priorityRank - right.priorityRank
    || left.createdAt.localeCompare(right.createdAt)
    || left.title.localeCompare(right.title)
  ))
)

export const workItemsByStatus = (workItems: WorkItem[]) => (
  workItemStatuses.map((status) => ({
    status,
    items: sortedWorkItems(workItems.filter((item) => item.status === status))
  })).filter((group) => group.items.length > 0 || ['backlog', 'ready', 'in_progress', 'review', 'blocked'].includes(group.status))
)

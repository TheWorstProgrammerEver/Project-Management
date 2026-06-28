import type { BacklogState, WorkItem } from '../../common/backlogTypes'
import { sortedWorkItems } from '../domain/backlog/status'

export const emptyBacklogState: BacklogState = {
  backlogs: [],
  recentEvents: [],
  teams: [],
  workItems: []
}

export const withSavedWorkItem = (state: BacklogState, item: WorkItem): BacklogState => {
  const existingIndex = state.workItems.findIndex((candidate) => candidate.id === item.id)
  const workItems = existingIndex === -1
    ? [...state.workItems, item]
    : state.workItems.map((candidate) => candidate.id === item.id ? item : candidate)

  return {
    ...state,
    workItems: sortedWorkItems(workItems)
  }
}

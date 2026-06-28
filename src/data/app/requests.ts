import { createCommandType, createQueryType } from '../../../lib/dispatch/dispatch'
import { appRequestIdentifiers } from '../../../common/appRequestIdentifiers'
import type {
  BacklogState,
  WorkItem,
  WorkItemInput,
  WorkItemStatus
} from '../../../common/backlogTypes'

export type UpdateWorkItemParams = {
  id: string
  input: WorkItemInput
}

export type UpdateWorkItemStatusParams = {
  id: string
  status: WorkItemStatus
}

export const LoadBacklogQuery = createQueryType(appRequestIdentifiers.loadBacklog)<BacklogState>()
export const CreateWorkItemCommand = createCommandType(appRequestIdentifiers.createWorkItem)<WorkItem, WorkItemInput>()
export const UpdateWorkItemCommand = createCommandType(appRequestIdentifiers.updateWorkItem)<WorkItem, UpdateWorkItemParams>()
export const UpdateWorkItemStatusCommand = createCommandType(appRequestIdentifiers.updateWorkItemStatus)<WorkItem, UpdateWorkItemStatusParams>()

export const appRequestTypes = [
  LoadBacklogQuery,
  CreateWorkItemCommand,
  UpdateWorkItemCommand,
  UpdateWorkItemStatusCommand
]

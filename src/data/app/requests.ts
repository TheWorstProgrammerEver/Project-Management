import { createCommandType, createQueryType } from '../../../lib/dispatch/dispatch'
import { appRequestIdentifiers } from '../../../common/appRequestIdentifiers'
import type {
  BacklogState,
  InviteTeamMemberParams,
  LoadBacklogParams,
  TeamInvitationActionParams,
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

export const LoadBacklogQuery = createQueryType(appRequestIdentifiers.loadBacklog)<BacklogState, LoadBacklogParams>()
export const CreateWorkItemCommand = createCommandType(appRequestIdentifiers.createWorkItem)<WorkItem, WorkItemInput>()
export const InviteTeamMemberCommand = createCommandType(appRequestIdentifiers.inviteTeamMember)<BacklogState, InviteTeamMemberParams>()
export const AcceptTeamInvitationCommand = createCommandType(appRequestIdentifiers.acceptTeamInvitation)<BacklogState, TeamInvitationActionParams>()
export const RejectTeamInvitationCommand = createCommandType(appRequestIdentifiers.rejectTeamInvitation)<BacklogState, TeamInvitationActionParams>()
export const UpdateWorkItemCommand = createCommandType(appRequestIdentifiers.updateWorkItem)<WorkItem, UpdateWorkItemParams>()
export const UpdateWorkItemStatusCommand = createCommandType(appRequestIdentifiers.updateWorkItemStatus)<WorkItem, UpdateWorkItemStatusParams>()

export const appRequestTypes = [
  LoadBacklogQuery,
  CreateWorkItemCommand,
  InviteTeamMemberCommand,
  AcceptTeamInvitationCommand,
  RejectTeamInvitationCommand,
  UpdateWorkItemCommand,
  UpdateWorkItemStatusCommand
]

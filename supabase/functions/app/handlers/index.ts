import { createRequestHandlers } from '../../../../lib/dispatch/dispatch.ts'
import type { AppInvocationContext } from '../types/context.ts'
import {
  createAcceptTeamInvitationHandler,
  createCreateWorkItemHandler,
  createInviteTeamMemberHandler,
  createLoadBacklogHandler,
  createRejectTeamInvitationHandler,
  createUpdateWorkItemHandler,
  createUpdateWorkItemStatusHandler
} from './backlog.ts'

const handlerFactories = [
  createLoadBacklogHandler,
  createCreateWorkItemHandler,
  createInviteTeamMemberHandler,
  createAcceptTeamInvitationHandler,
  createRejectTeamInvitationHandler,
  createUpdateWorkItemHandler,
  createUpdateWorkItemStatusHandler
]

export const createAppRequestHandlers = (context: AppInvocationContext) => (
  createRequestHandlers(handlerFactories.map((factory) => ({
    identifier: factory.requestIdentifier,
    handler: factory(context)
  })))
)

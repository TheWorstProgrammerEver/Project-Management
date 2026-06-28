import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IRequest } from '../../lib/dispatch/dispatch'
import { useLoader } from '../../lib/hooks/useLoader'
import type {
  BacklogState,
  InviteTeamMemberParams,
  LoadBacklogParams,
  WorkItem,
  WorkItemInput,
  WorkItemStatus
} from '../../common/backlogTypes'
import { appDispatcher } from '../data/app/appDispatcher'
import {
  AcceptTeamInvitationCommand,
  CreateWorkItemCommand,
  InviteTeamMemberCommand,
  LoadBacklogQuery,
  RejectTeamInvitationCommand,
  UpdateWorkItemCommand,
  UpdateWorkItemStatusCommand
} from '../data/app/requests'
import type { Account } from '../types/auth'
import { emptyBacklogState, withSavedWorkItem } from './backlogStateUpdates'

const errorMessage = (error: unknown) => (
  error instanceof Error ? error.message : 'Backlog request failed.'
)

export const useBacklog = (currentAccount?: Account) => {
  const [state, setState] = useState<BacklogState>(emptyBacklogState)
  const backlogLoad = useLoader({ getErrorMessage: errorMessage })
  const invitationActionLoad = useLoader({ getErrorMessage: errorMessage })
  const inviteMemberLoad = useLoader({ getErrorMessage: errorMessage })
  const backlogLoadState = useMemo(() => ({
    ...backlogLoad,
    busy: Boolean(currentAccount) && (!backlogLoad.settled || backlogLoad.busy)
  }), [backlogLoad, currentAccount])

  const reload = useCallback(async (params?: LoadBacklogParams) => {
    try {
      const nextState = await backlogLoad.execute(() => appDispatcher.dispatch(new LoadBacklogQuery(params ?? {})))
      setState(nextState)

      return nextState
    } catch {
      setState(emptyBacklogState)

      return undefined
    }
  }, [backlogLoad.execute])

  useEffect(() => {
    if (!currentAccount) {
      setState(emptyBacklogState)
      backlogLoad.clearError()
      return
    }

    void reload()
  }, [backlogLoad.clearError, currentAccount, reload])

  const runAction = useCallback(async <TResult, TParams>(
    request: IRequest<TResult, TParams>,
    applyResult: (currentState: BacklogState, result: TResult) => BacklogState
  ) => {
    const result = await appDispatcher.dispatch(request)
    setState((currentState) => applyResult(currentState, result))

    return result
  }, [])

  const createWorkItem = useCallback((input: WorkItemInput) => (
    runAction(new CreateWorkItemCommand({
      ...input,
      backlogId: input.backlogId || state.selectedBacklogId || ''
    }), withSavedWorkItem)
  ), [runAction, state.selectedBacklogId])

  const updateWorkItem = useCallback((id: string, input: WorkItemInput) => (
    runAction(new UpdateWorkItemCommand({ id, input }), withSavedWorkItem)
  ), [runAction])

  const updateWorkItemStatus = useCallback((id: string, status: WorkItemStatus) => (
    runAction(new UpdateWorkItemStatusCommand({ id, status }), withSavedWorkItem)
  ), [runAction])

  const inviteTeamMember = useCallback(async (params: InviteTeamMemberParams) => {
    const nextState = await inviteMemberLoad.execute(() => (
      appDispatcher.dispatch(new InviteTeamMemberCommand(params))
    ))

    setState(nextState)

    return nextState
  }, [inviteMemberLoad])

  const acceptTeamInvitation = useCallback(async (invitationId: string) => {
    const nextState = await invitationActionLoad.execute(() => (
      appDispatcher.dispatch(new AcceptTeamInvitationCommand({ invitationId }))
    ))

    setState(nextState)

    return nextState
  }, [invitationActionLoad])

  const rejectTeamInvitation = useCallback(async (invitationId: string) => {
    const nextState = await invitationActionLoad.execute(() => (
      appDispatcher.dispatch(new RejectTeamInvitationCommand({ invitationId }))
    ))

    setState(nextState)

    return nextState
  }, [invitationActionLoad])

  const readyItems = useMemo(
    () => state.workItems.filter((item) => item.status === 'ready'),
    [state.workItems]
  )

  const activeLeases = useMemo(
    () => state.workItems.filter((item) => Boolean(item.activeLease)),
    [state.workItems]
  )

  const selectedTeam = useMemo(
    () => state.teams.find((team) => team.id === state.selectedTeamId),
    [state.selectedTeamId, state.teams]
  )

  const selectedBacklog = useMemo(
    () => state.backlogs.find((backlog) => backlog.id === state.selectedBacklogId),
    [state.backlogs, state.selectedBacklogId]
  )

  const selectTeam = useCallback((teamId: string) => (
    reload({ teamId })
  ), [reload])

  const selectBacklog = useCallback((backlogId: string) => (
    reload({ backlogId })
  ), [reload])

  return {
    activeLeases,
    acceptTeamInvitation,
    backlogLoad: backlogLoadState,
    createWorkItem,
    currentAccount,
    invitationActionLoad,
    inviteMemberLoad,
    inviteTeamMember,
    readyItems,
    rejectTeamInvitation,
    reload,
    selectBacklog,
    selectTeam,
    selectedBacklog,
    selectedTeam,
    state,
    updateWorkItem,
    updateWorkItemStatus
  }
}

export type BacklogController = ReturnType<typeof useBacklog>

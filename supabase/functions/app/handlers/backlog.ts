import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import type { LoadBacklogParams, WorkItemInput, WorkItemStatus } from '../../../../common/backlogTypes.ts'
import { appRequestIdentifiers } from '../../../../common/appRequestIdentifiers.ts'
import { cleanPositiveInteger, cleanString, cleanStringArray, HttpError } from '../helpers.ts'
import { mapActiveLease, mapBacklog, mapRunEvent, mapTeam, mapWorkItem } from '../mappers.ts'
import { createAppRequestHandlerFactory } from './handlerFactory.ts'

const statusValues = new Set<WorkItemStatus>([
  'backlog',
  'ready',
  'claimed',
  'in_progress',
  'review',
  'testing',
  'blocked',
  'done',
  'cancelled'
])

const normalizeStatus = (value: unknown, fallback: WorkItemStatus = 'backlog') => (
  typeof value === 'string' && statusValues.has(value as WorkItemStatus)
    ? value as WorkItemStatus
    : fallback
)

const normalizeInput = (value: unknown): WorkItemInput => {
  const source = typeof value === 'object' && value ? value as Record<string, unknown> : {}
  const backlogId = cleanString(source.backlogId)
  const title = cleanString(source.title)

  if (!backlogId) {
    throw new HttpError(400, 'Backlog id is required.')
  }

  if (!title) {
    throw new HttpError(400, 'Title is required.')
  }

  return {
    backlogId,
    title,
    description: cleanString(source.description),
    repository: cleanString(source.repository),
    acceptanceCriteria: cleanStringArray(source.acceptanceCriteria),
    labels: cleanStringArray(source.labels),
    status: normalizeStatus(source.status),
    priorityRank: cleanPositiveInteger(source.priorityRank, 1000),
    assignee: cleanString(source.assignee)
  }
}

const rowFromInput = (input: WorkItemInput, createdByUserId?: string) => ({
  backlog_id: input.backlogId,
  title: input.title,
  description: input.description,
  repository: input.repository,
  acceptance_criteria: input.acceptanceCriteria,
  labels: input.labels,
  status: input.status,
  priority_rank: input.priorityRank,
  assignee: input.assignee,
  ...(createdByUserId ? { created_by_user_id: createdByUserId } : {})
})

const normalizeLoadParams = (value: unknown): LoadBacklogParams => {
  const source = typeof value === 'object' && value ? value as Record<string, unknown> : {}

  return {
    backlogId: cleanString(source.backlogId),
    teamId: cleanString(source.teamId)
  }
}

const loadBacklog = async (client: SupabaseClient, params: LoadBacklogParams = {}) => {
  const { error: inviteError } = await client.rpc('accept_pending_team_invitations')

  if (inviteError) {
    throw inviteError
  }

  const { error: expiryError } = await client.rpc('expire_stale_work_leases')

  if (expiryError) {
    throw expiryError
  }

  const [teamsResult, backlogsResult] = await Promise.all([
    client
      .from('teams')
      .select('id, name, slug')
      .order('name', { ascending: true }),
    client
      .from('backlogs')
      .select('id, team_id, name, slug, description')
      .order('name', { ascending: true })
  ])

  if (teamsResult.error) {
    throw teamsResult.error
  }

  if (backlogsResult.error) {
    throw backlogsResult.error
  }

  const teams = teamsResult.data.map(mapTeam)
  const backlogs = backlogsResult.data.map(mapBacklog)
  const requestedBacklog = backlogs.find((backlog) => backlog.id === params.backlogId)
  const selectedTeamId = requestedBacklog?.teamId
    ?? teams.find((team) => team.id === params.teamId)?.id
    ?? teams[0]?.id
  const selectedBacklogId = requestedBacklog?.id
    ?? backlogs.find((backlog) => backlog.teamId === selectedTeamId)?.id
    ?? backlogs[0]?.id

  if (!selectedBacklogId) {
    return {
      backlogs,
      recentEvents: [],
      selectedBacklogId,
      selectedTeamId,
      teams,
      workItems: []
    }
  }

  const [itemsResult, leasesResult] = await Promise.all([
    client
      .from('work_items')
      .select('*')
      .eq('backlog_id', selectedBacklogId)
      .order('priority_rank', { ascending: true })
      .order('created_at', { ascending: true }),
    client
      .from('work_leases')
      .select('id, work_item_id, worker_id, heartbeat_at, expires_at')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
  ])

  if (itemsResult.error) {
    throw itemsResult.error
  }

  if (leasesResult.error) {
    throw leasesResult.error
  }

  const workItemIds = itemsResult.data.map((row) => row.id)
  const eventsResult = workItemIds.length > 0
    ? await client
      .from('run_events')
      .select('id, work_item_id, worker_id, event_type, summary, created_at')
      .in('work_item_id', workItemIds)
      .order('created_at', { ascending: false })
      .limit(80)
    : { data: [], error: null }

  if (eventsResult.error) {
    throw eventsResult.error
  }

  const leasesByItem = new Map(
    leasesResult.data.map((row) => [row.work_item_id, mapActiveLease(row)])
  )

  return {
    backlogs,
    workItems: itemsResult.data.map((row) => mapWorkItem(row, leasesByItem.get(row.id))),
    recentEvents: eventsResult.data.map(mapRunEvent),
    selectedBacklogId,
    selectedTeamId,
    teams
  }
}

export const createLoadBacklogHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.loadBacklog,
  ({ client }) => async (request) => loadBacklog(client, normalizeLoadParams(request.params))
)

export const createCreateWorkItemHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.createWorkItem,
  ({ client, user }) => async (request) => {
    const input = normalizeInput(request.params)
    const { data, error } = await client
      .from('work_items')
      .insert(rowFromInput(input, user.id))
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return mapWorkItem(data)
  }
)

export const createUpdateWorkItemHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.updateWorkItem,
  ({ client }) => async (request) => {
    const params = request.params as { id?: unknown, input?: unknown }
    const id = cleanString(params.id)

    if (!id) {
      throw new HttpError(400, 'Work item id is required.')
    }

    const input = normalizeInput(params.input)
    const { data, error } = await client
      .from('work_items')
      .update(rowFromInput(input))
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return mapWorkItem(data)
  }
)

export const createUpdateWorkItemStatusHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.updateWorkItemStatus,
  ({ client }) => async (request) => {
    const params = request.params as { id?: unknown, status?: unknown }
    const id = cleanString(params.id)

    if (!id) {
      throw new HttpError(400, 'Work item id is required.')
    }

    const status = normalizeStatus(params.status, 'backlog')
    const { data, error } = await client
      .from('work_items')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return mapWorkItem(data)
  }
)

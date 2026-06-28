import type { SupabaseClient } from 'npm:@supabase/supabase-js@^2'
import type { WorkItemInput, WorkItemStatus } from '../../../../common/backlogTypes.ts'
import { appRequestIdentifiers } from '../../../../common/appRequestIdentifiers.ts'
import { cleanPositiveInteger, cleanString, cleanStringArray, HttpError } from '../helpers.ts'
import { mapActiveLease, mapRunEvent, mapWorkItem } from '../mappers.ts'
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
  const title = cleanString(source.title)

  if (!title) {
    throw new HttpError(400, 'Title is required.')
  }

  return {
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

const loadBacklog = async (client: SupabaseClient) => {
  const { error: expiryError } = await client.rpc('expire_stale_work_leases')

  if (expiryError) {
    throw expiryError
  }

  const [itemsResult, leasesResult, eventsResult] = await Promise.all([
    client
      .from('work_items')
      .select('*')
      .order('priority_rank', { ascending: true })
      .order('created_at', { ascending: true }),
    client
      .from('work_leases')
      .select('id, work_item_id, worker_id, heartbeat_at, expires_at')
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString()),
    client
      .from('run_events')
      .select('id, work_item_id, worker_id, event_type, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(80)
  ])

  if (itemsResult.error) {
    throw itemsResult.error
  }

  if (leasesResult.error) {
    throw leasesResult.error
  }

  if (eventsResult.error) {
    throw eventsResult.error
  }

  const leasesByItem = new Map(
    leasesResult.data.map((row) => [row.work_item_id, mapActiveLease(row)])
  )

  return {
    workItems: itemsResult.data.map((row) => mapWorkItem(row, leasesByItem.get(row.id))),
    recentEvents: eventsResult.data.map(mapRunEvent)
  }
}

export const createLoadBacklogHandler = createAppRequestHandlerFactory(
  appRequestIdentifiers.loadBacklog,
  ({ client }) => async () => loadBacklog(client)
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

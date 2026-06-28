import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appRequestIdentifiers } from '../../../common/appRequestIdentifiers'
import {
  createAdminClient,
  createAnonymousClient,
  createSignedInClient,
  getLocalSupabaseConfig,
  requireLocalFunctionsReady
} from './localSupabase'

const password = 'password123'
const prefix = `security-${Date.now()}-${randomUUID().slice(0, 8)}`
const userEmail = `${prefix}@example.com`
let anonymousClient: SupabaseClient
let signedInClient: SupabaseClient

const workerRequest = async (body: Record<string, unknown>, secret = 'local-dev-worker-secret') => {
  const { url } = getLocalSupabaseConfig()
  const response = await fetch(`${url}/functions/v1/worker`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-worker-secret': secret
    },
    method: 'POST'
  })

  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status
  }
}

const createReadyItem = async (title: string) => {
  const { data, error } = await createAdminClient()
    .from('work_items')
    .insert({
      acceptance_criteria: ['Only one worker can claim this item.'],
      assignee: 'Daedalus',
      description: `${prefix} claim safety fixture`,
      labels: ['security'],
      priority_rank: 1,
      repository: 'TheWorstProgrammerEver/Project-Management',
      status: 'ready',
      title
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data.id as string
}

beforeAll(async () => {
  await requireLocalFunctionsReady()
  anonymousClient = createAnonymousClient()

  const { error } = await createAdminClient().auth.admin.createUser({
    email: userEmail,
    email_confirm: true,
    password,
    user_metadata: {
      display_name: 'Security User'
    }
  })

  if (error) {
    throw error
  }

  signedInClient = await createSignedInClient(userEmail, password)
})

afterAll(async () => {
  await createAdminClient()
    .from('work_items')
    .delete()
    .like('title', `${prefix}%`)
  await createAdminClient()
    .from('workers')
    .delete()
    .like('id', `${prefix}%`)

  const { data } = await createAdminClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000
  })
  const user = data.users.find((candidate) => candidate.email === userEmail)

  if (user) {
    await createAdminClient().auth.admin.deleteUser(user.id)
  }
})

describe('backlog security integration', () => {
  test('anonymous users cannot call the app function', async () => {
    const { data, error } = await anonymousClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.loadBacklog,
        params: {}
      }
    })

    expect(error).toBeTruthy()
    expect(data).toBeFalsy()
  })

  test('anonymous users cannot read or mutate app tables directly', async () => {
    for (const table of ['work_items', 'workers', 'work_leases', 'run_events']) {
      const { data } = await anonymousClient
        .from(table)
        .select('id')
        .limit(10)

      expect(data ?? [], table).toHaveLength(0)
    }

    const { data } = await anonymousClient
      .from('work_items')
      .insert({
        priority_rank: 1,
        status: 'ready',
        title: `${prefix} anonymous insert`
      })
      .select('id')

    expect(data ?? []).toHaveLength(0)
  })

  test('authenticated users can create work through the app function', async () => {
    const { data, error } = await signedInClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.createWorkItem,
        params: {
          acceptanceCriteria: ['Created through the app boundary.'],
          assignee: 'Daedalus',
          description: `${prefix} app function creation`,
          labels: ['security'],
          priorityRank: 4,
          repository: 'TheWorstProgrammerEver/Project-Management',
          status: 'backlog',
          title: `${prefix} app-created item`
        }
      }
    })

    expect(error).toBeFalsy()
    expect(data).toEqual(expect.objectContaining({
      title: `${prefix} app-created item`
    }))
  })

  test('worker function rejects missing or invalid secrets', async () => {
    const result = await workerRequest({
      action: 'claim_next_work_item',
      workerId: `${prefix}-invalid-worker`
    }, 'wrong-secret')

    expect(result.ok).toBe(false)
    expect(result.body.error).toContain('Worker secret is invalid')
  })

  test('concurrent workers cannot claim the same ready item', async () => {
    const workItemId = await createReadyItem(`${prefix} single-claim item`)
    const [first, second] = await Promise.all([
      workerRequest({
        action: 'claim_next_work_item',
        leaseSeconds: 600,
        workerDisplayName: 'Security Worker A',
        workerId: `${prefix}-worker-a`
      }),
      workerRequest({
        action: 'claim_next_work_item',
        leaseSeconds: 600,
        workerDisplayName: 'Security Worker B',
        workerId: `${prefix}-worker-b`
      })
    ])

    const claimed = [first.body, second.body].filter(Boolean)
    const targetedClaims = claimed.filter((claim) => claim.workItem?.id === workItemId)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(targetedClaims).toHaveLength(1)

    const { data, error } = await createAdminClient()
      .from('work_leases')
      .select('id')
      .eq('work_item_id', workItemId)
      .eq('status', 'active')

    expect(error).toBeFalsy()
    expect(data ?? []).toHaveLength(1)
  })
})

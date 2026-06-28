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
const memberEmail = `${prefix}-member@example.com`
const inviteeEmail = `${prefix}-invitee@example.com`
const outsiderEmail = `${prefix}-outsider@example.com`
let anonymousClient: SupabaseClient
let memberClient: SupabaseClient
let inviteeClient: SupabaseClient
let outsiderClient: SupabaseClient
let memberUserId: string
let inviteeUserId: string
let outsiderUserId: string
let teamId: string
let backlogId: string

const workerRequest = async (
  body: Record<string, unknown>,
  options: { authorization?: string, secret?: string } = { secret: 'local-dev-worker-secret' }
) => {
  const { url } = getLocalSupabaseConfig()
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  }

  if (options.secret) {
    headers['x-worker-secret'] = options.secret
  }

  if (options.authorization) {
    headers.authorization = `Bearer ${options.authorization}`
  }

  const response = await fetch(`${url}/functions/v1/worker`, {
    body: JSON.stringify(body),
    headers,
    method: 'POST'
  })

  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status
  }
}

const createWorkItem = async (
  title: string,
  targetBacklogId = backlogId,
  status = 'ready',
  priorityRank = 1
) => {
  const { data, error } = await createAdminClient()
    .from('work_items')
    .insert({
      acceptance_criteria: ['Only one worker can claim this item.'],
      assignee: 'Daedalus',
      backlog_id: targetBacklogId,
      description: `${prefix} claim safety fixture`,
      labels: ['security'],
      priority_rank: priorityRank,
      repository: 'TheWorstProgrammerEver/Project-Management',
      status,
      title
    })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return data.id as string
}

const createReadyItem = async (title: string, targetBacklogId = backlogId, priorityRank = 1) => (
  createWorkItem(title, targetBacklogId, 'ready', priorityRank)
)

const getAccessToken = async (client: SupabaseClient) => {
  const { data, error } = await client.auth.getSession()

  if (error || !data.session) {
    throw error ?? new Error('Missing test session.')
  }

  return data.session.access_token
}

beforeAll(async () => {
  await requireLocalFunctionsReady()
  anonymousClient = createAnonymousClient()

  const users = await Promise.all([
    createAdminClient().auth.admin.createUser({
      email: memberEmail,
      email_confirm: true,
      password,
      user_metadata: {
        display_name: 'Security Member'
      }
    }),
    createAdminClient().auth.admin.createUser({
      email: inviteeEmail,
      email_confirm: true,
      password,
      user_metadata: {
        display_name: 'Security Invitee'
      }
    }),
    createAdminClient().auth.admin.createUser({
      email: outsiderEmail,
      email_confirm: true,
      password,
      user_metadata: {
        display_name: 'Security Outsider'
      }
    })
  ])

  for (const result of users) {
    if (result.error || !result.data.user) {
      throw result.error ?? new Error('Could not create security test user.')
    }
  }

  const memberUser = users[0].data.user
  const inviteeUser = users[1].data.user
  const outsiderUser = users[2].data.user

  if (!memberUser || !inviteeUser || !outsiderUser) {
    throw new Error('Could not read created security test users.')
  }

  memberUserId = memberUser.id
  inviteeUserId = inviteeUser.id
  outsiderUserId = outsiderUser.id

  const teamResult = await createAdminClient()
    .from('teams')
    .insert({
      name: `${prefix} Team`,
      slug: `${prefix}-team`
    })
    .select('id')
    .single()

  if (teamResult.error) {
    throw teamResult.error
  }

  teamId = teamResult.data.id

  const backlogResult = await createAdminClient()
    .from('backlogs')
    .insert({
      description: `${prefix} security backlog`,
      name: `${prefix} Backlog`,
      slug: `${prefix}-backlog`,
      team_id: teamId
    })
    .select('id')
    .single()

  if (backlogResult.error) {
    throw backlogResult.error
  }

  backlogId = backlogResult.data.id

  const membershipResult = await createAdminClient()
    .from('team_memberships')
    .insert({
      display_name: 'Security Member',
      role: 'member',
      team_id: teamId,
      user_id: memberUserId
    })

  if (membershipResult.error) {
    throw membershipResult.error
  }

  memberClient = await createSignedInClient(memberEmail, password)
  inviteeClient = await createSignedInClient(inviteeEmail, password)
  outsiderClient = await createSignedInClient(outsiderEmail, password)
})

afterAll(async () => {
  await createAdminClient()
    .from('teams')
    .delete()
    .like('slug', `${prefix}%`)
  await createAdminClient()
    .from('workers')
    .delete()
    .like('id', `${prefix}%`)

  for (const userId of [memberUserId, inviteeUserId, outsiderUserId]) {
    if (userId) {
      await createAdminClient().auth.admin.deleteUser(userId)
    }
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
    for (const table of ['teams', 'team_memberships', 'team_invitations', 'backlogs', 'work_items', 'workers', 'work_leases', 'run_events']) {
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
    const { data, error } = await memberClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.createWorkItem,
        params: {
          acceptanceCriteria: ['Created through the app boundary.'],
          assignee: 'Daedalus',
          backlogId,
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
      backlogId,
      title: `${prefix} app-created item`
    }))
  })

  test('team non-members cannot read or mutate another team backlog', async () => {
    const workItemId = await createWorkItem(`${prefix} outsider-hidden item`, backlogId, 'backlog')
    const { data: directItems } = await outsiderClient
      .from('work_items')
      .select('id')
      .eq('id', workItemId)

    expect(directItems ?? []).toHaveLength(0)

    const { data: loadData, error: loadError } = await outsiderClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.loadBacklog,
        params: {}
      }
    })

    expect(loadError).toBeFalsy()
    expect(loadData).toEqual(expect.objectContaining({
      backlogs: [],
      teams: [],
      workItems: []
    }))

    const { error: updateError } = await outsiderClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.updateWorkItemStatus,
        params: {
          id: workItemId,
          status: 'done'
        }
      }
    })

    expect(updateError).toBeTruthy()
  })

  test('team members can invite people and invitees accept explicitly', async () => {
    const { error: inviteError } = await memberClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.inviteTeamMember,
        params: {
          email: inviteeEmail,
          teamId
        }
      }
    })

    expect(inviteError).toBeFalsy()

    const { data: pendingData, error: pendingError } = await inviteeClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.loadBacklog,
        params: {}
      }
    })

    expect(pendingError).toBeFalsy()
    expect(pendingData.teams).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: teamId })
    ]))
    expect(pendingData.backlogs).toEqual([])
    expect(pendingData.pendingInvitations).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: inviteeEmail, teamId })
    ]))

    const invitationId = pendingData.pendingInvitations[0].id
    const { data, error } = await inviteeClient.functions.invoke('app', {
      body: {
        identifier: appRequestIdentifiers.acceptTeamInvitation,
        params: {
          invitationId
        }
      }
    })

    expect(error).toBeFalsy()
    expect(data.backlogs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: backlogId })
    ]))
    expect(data.pendingInvitations).toHaveLength(0)

    const { data: memberships } = await createAdminClient()
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', inviteeUserId)

    expect(memberships ?? []).toHaveLength(1)
  })

  test('worker function rejects missing or invalid secrets', async () => {
    const result = await workerRequest({
      backlogId,
      action: 'claim_next_work_item',
      workerId: `${prefix}-invalid-worker`
    }, { secret: 'wrong-secret' })

    expect(result.ok).toBe(false)
    expect(result.body.error).toContain('Worker secret')
  })

  test('concurrent workers cannot claim the same ready item', async () => {
    const workItemId = await createReadyItem(`${prefix} single-claim item`)
    const [first, second] = await Promise.all([
      workerRequest({
        action: 'claim_next_work_item',
        backlogId,
        leaseSeconds: 600,
        workerDisplayName: 'Security Worker A',
        workerId: `${prefix}-worker-a`
      }),
      workerRequest({
        action: 'claim_next_work_item',
        backlogId,
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

  test('bearer-authenticated workers must belong to the target backlog team', async () => {
    const workItemId = await createReadyItem(`${prefix} bearer visible item`)
    const memberToken = await getAccessToken(memberClient)
    const outsiderToken = await getAccessToken(outsiderClient)
    const blocked = await workerRequest({
      action: 'claim_next_work_item',
      backlogId,
      leaseSeconds: 600,
      workerDisplayName: 'Security Outsider Worker',
      workerId: `${prefix}-outsider-worker`
    }, { authorization: outsiderToken })

    expect(blocked.ok).toBe(false)
    expect(blocked.body.error).toContain('backlog is not visible')

    const claimed = await workerRequest({
      action: 'claim_next_work_item',
      backlogId,
      leaseSeconds: 600,
      workerDisplayName: 'Security Member Worker',
      workerId: `${prefix}-member-worker`
    }, { authorization: memberToken })

    expect(claimed.ok).toBe(true)
    expect(claimed.body.workItem.id).toBe(workItemId)
  })
})

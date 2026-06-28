import { createClient } from 'npm:@supabase/supabase-js@^2'

type WorkerRequest = {
  action?: string
  backlogId?: string
  workerId?: string
  workerDisplayName?: string
  workerCapabilities?: string[]
  leaseSeconds?: number
  leaseToken?: string
  reason?: string
  resultSummary?: string
  resultUrl?: string
  errorSummary?: string
}

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, content-type, x-worker-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*'
}

const response = (body: unknown, status = 200) => (
  Response.json(body, { status, headers: corsHeaders })
)

const errorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Worker request failed.'
}

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }

  return value.trim()
}

const getUrl = () => {
  const url = Deno.env.get('SUPABASE_URL')

  if (!url) {
    throw new Error('Worker function needs SUPABASE_URL.')
  }

  return url
}

const getServiceClient = () => {
  const url = getUrl()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!serviceRoleKey) {
    throw new Error('Worker function needs SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

const getUserClient = (authorization: string) => {
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

  if (!publishableKey) {
    throw new Error('Worker function needs SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY for bearer auth.')
  }

  return createClient(getUrl(), publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: authorization
      }
    }
  })
}

const getRpcClient = (request: Request) => {
  const expected = Deno.env.get('WORKER_API_SECRET') ?? 'local-dev-worker-secret'
  const actual = request.headers.get('x-worker-secret')
  const authorization = request.headers.get('authorization')

  if (actual && actual === expected) {
    return getServiceClient()
  }

  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return getUserClient(authorization)
  }

  throw new Error('Worker secret is invalid or bearer authorization is missing.')
}

const callRpc = async (client: ReturnType<typeof createClient>, name: string, params: Record<string, unknown>) => {
  const { data, error } = await client.rpc(name, params)

  if (error) {
    throw new Error(error.message)
  }

  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return response({ error: 'Method not allowed' }, 405)
  }

  try {
    const client = getRpcClient(request)

    const body = await request.json() as WorkerRequest

    switch (body.action) {
      case 'claim_next_work_item':
        return response(await callRpc(client, 'claim_next_work_item', {
          worker_id: requiredString(body.workerId, 'workerId'),
          worker_display_name: body.workerDisplayName ?? body.workerId,
          worker_capabilities: Array.isArray(body.workerCapabilities) ? body.workerCapabilities : [],
          lease_seconds: body.leaseSeconds ?? 1800,
          target_backlog_id: requiredString(body.backlogId, 'backlogId')
        }))
      case 'heartbeat_lease':
        return response(await callRpc(client, 'heartbeat_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          lease_seconds: body.leaseSeconds ?? 1800
        }))
      case 'release_lease':
        return response(await callRpc(client, 'release_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          reason: body.reason ?? ''
        }))
      case 'complete_work_item':
        return response(await callRpc(client, 'complete_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          result_summary: body.resultSummary ?? '',
          result_url: body.resultUrl ?? ''
        }))
      case 'fail_work_item':
        return response(await callRpc(client, 'fail_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          error_summary: body.errorSummary ?? ''
        }))
      default:
        return response({ error: 'Unsupported worker action.' }, 400)
    }
  } catch (error) {
    return response({ error: errorMessage(error) }, 400)
  }
})

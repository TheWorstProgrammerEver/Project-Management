import { createClient } from 'npm:@supabase/supabase-js@^2'

type WorkerRequest = {
  action?: string
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

const requiredString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }

  return value.trim()
}

const getServiceClient = () => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('Worker function needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

const assertWorkerSecret = (request: Request) => {
  const expected = Deno.env.get('WORKER_API_SECRET') ?? 'local-dev-worker-secret'
  const actual = request.headers.get('x-worker-secret')

  if (!actual || actual !== expected) {
    throw new Error('Worker secret is invalid.')
  }
}

const callRpc = async (name: string, params: Record<string, unknown>) => {
  const { data, error } = await getServiceClient().rpc(name, params)

  if (error) {
    throw error
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
    assertWorkerSecret(request)

    const body = await request.json() as WorkerRequest

    switch (body.action) {
      case 'claim_next_work_item':
        return response(await callRpc('claim_next_work_item', {
          worker_id: requiredString(body.workerId, 'workerId'),
          worker_display_name: body.workerDisplayName ?? body.workerId,
          worker_capabilities: Array.isArray(body.workerCapabilities) ? body.workerCapabilities : [],
          lease_seconds: body.leaseSeconds ?? 1800
        }))
      case 'heartbeat_lease':
        return response(await callRpc('heartbeat_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          lease_seconds: body.leaseSeconds ?? 1800
        }))
      case 'release_lease':
        return response(await callRpc('release_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          reason: body.reason ?? ''
        }))
      case 'complete_work_item':
        return response(await callRpc('complete_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          result_summary: body.resultSummary ?? '',
          result_url: body.resultUrl ?? ''
        }))
      case 'fail_work_item':
        return response(await callRpc('fail_work_lease', {
          target_lease_token: requiredString(body.leaseToken, 'leaseToken'),
          error_summary: body.errorSummary ?? ''
        }))
      default:
        return response({ error: 'Unsupported worker action.' }, 400)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Worker request failed.'

    return response({ error: message }, 400)
  }
})

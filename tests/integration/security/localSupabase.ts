import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SupabaseStatus = {
  ANON_KEY?: string
  API_URL?: string
  PUBLISHABLE_KEY?: string
  SERVICE_ROLE_KEY?: string
}

type RuntimeConfig = {
  supabase?: {
    publishableKey?: string
    url?: string
  }
}

type LocalSupabaseConfig = {
  publishableKey: string
  serviceRoleKey: string
  url: string
}

let cachedConfig: LocalSupabaseConfig | undefined
let cachedAdminClient: SupabaseClient | undefined

const getLocalSupabaseStatus = () => {
  try {
    const output = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const jsonStart = output.indexOf('{')

    if (jsonStart === -1) {
      return undefined
    }

    return JSON.parse(output.slice(jsonStart)) as SupabaseStatus
  } catch {
    return undefined
  }
}

const getVisualTestConfig = () => (
  JSON.parse(readFileSync('tests/visual/config.test.json', 'utf8')) as RuntimeConfig
)

export const getLocalSupabaseConfig = () => {
  if (cachedConfig) {
    return cachedConfig
  }

  const status = getLocalSupabaseStatus()
  const visualTestConfig = getVisualTestConfig()
  const url = process.env.SUPABASE_URL ?? status?.API_URL ?? visualTestConfig.supabase?.url
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? status?.PUBLISHABLE_KEY
    ?? status?.ANON_KEY
    ?? visualTestConfig.supabase?.publishableKey
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status?.SERVICE_ROLE_KEY

  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error('Security integration tests need local Supabase running. Run npm run get-going first.')
  }

  cachedConfig = { publishableKey, serviceRoleKey, url }

  return cachedConfig
}

export const createAnonymousClient = () => {
  const { publishableKey, url } = getLocalSupabaseConfig()

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export const createAdminClient = () => {
  if (cachedAdminClient) {
    return cachedAdminClient
  }

  const { serviceRoleKey, url } = getLocalSupabaseConfig()
  cachedAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  return cachedAdminClient
}

export const createSignedInClient = async (email: string, password: string) => {
  const client = createAnonymousClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  if (!data.session) {
    throw new Error(`Could not sign in ${email} for security integration tests.`)
  }

  return client
}

export const requireLocalFunctionsReady = async () => {
  const { url } = getLocalSupabaseConfig()
  const response = await fetch(`${url}/functions/v1/app-health`, {
    signal: AbortSignal.timeout(3000)
  }).catch(() => undefined)

  if (!response?.ok) {
    throw new Error('Security integration tests need local Edge Functions running. Run npm run get-going first.')
  }
}

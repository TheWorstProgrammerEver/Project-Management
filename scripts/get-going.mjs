import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { networkInterfaces, platform } from 'node:os'

const appPort = 5173
const supabasePort = 54321
const databasePort = 54322
const studioPort = 54323
const mailPort = 54324
const supabaseConfigPath = 'supabase/config.toml'
const managedProcesses = []

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false
  })
  let stdout = ''
  let stderr = ''

  if (options.capture) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
  }

  child.on('error', reject)
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr })
      return
    }

    const error = new Error(`${command} ${args.join(' ')} exited ${code}`)
    error.stdout = stdout
    error.stderr = stderr
    reject(error)
  })
})

const commandOk = async (command, args) => {
  try {
    await run(command, args, { capture: true })
    return true
  } catch {
    return false
  }
}

const httpOk = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return response.status < 500
  } catch {
    return false
  }
}

const waitFor = async (label, check, timeoutMs = 60000) => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return true
    }

    await sleep(1500)
  }

  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds`)
}

const getLanAddress = () => {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => address.address)

  return addresses.find((address) => address.startsWith('192.168.'))
    ?? addresses.find((address) => address.startsWith('10.'))
    ?? addresses.find((address) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(address))
    ?? addresses[0]
}

const writeLocalConfig = (lanAddress) => {
  console.log(existsSync('public/config.local.json')
    ? 'Refreshing public/config.local.json for this machine...'
    : 'No public/config.local.json found; generating one for this machine...')

  const configTemplate = readFileSync('public/config.json', 'utf8')
  const config = JSON.parse(
    configTemplate
      .replaceAll('"#{BUILD_VERSION}#"', '"dev"')
      .replaceAll('"#{ENVIRONMENT}#"', '"local"')
      .replaceAll('#{AUTH_EMAIL_PASSWORD_ENABLED}#', 'true')
      .replaceAll('#{AUTH_OTP_ENABLED}#', 'true')
      .replaceAll('#{AUTH_MAGIC_LINK_ENABLED}#', 'true')
      .replaceAll('"#{SUPABASE_URL}#"', '"http://127.0.0.1:54321"')
      .replaceAll('"#{SUPABASE_PUBLISHABLE_KEY}#"', '"sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"')
  )
  const supabaseHost = lanAddress ?? '127.0.0.1'

  const localConfig = {
    ...config,
    buildVersion: 'dev',
    environment: 'local',
    supabase: {
      ...config.supabase,
      url: `http://${supabaseHost}:${supabasePort}`
    }
  }

  writeFileSync('public/config.local.json', `${JSON.stringify(localConfig, null, 2)}\n`)
}

const ensureDependencies = async () => {
  if (existsSync('node_modules/.bin/supabase') && existsSync('node_modules/.bin/vite')) {
    return
  }

  console.log('Installing npm dependencies...')
  await run('npm', ['install'])
}

const getSupabaseProjectId = () => {
  const config = readFileSync(supabaseConfigPath, 'utf8')
  const match = config.match(/^project_id\s*=\s*"([^"]+)"\s*$/m)

  if (!match) {
    throw new Error('Could not find project_id in supabase/config.toml')
  }

  return match[1]
}

const ensureDocker = async () => {
  if (await commandOk('docker', ['info'])) {
    return
  }

  if (platform() === 'darwin') {
    console.log('Opening Docker Desktop...')
    await run('open', ['-a', 'Docker'])
  }

  console.log('Waiting for Docker...')
  await waitFor('Docker', () => commandOk('docker', ['info']), 120000)
}

const disableSupabaseContainerRestarts = async () => {
  const projectId = getSupabaseProjectId()
  const result = await run('docker', [
    'ps',
    '-aq',
    '--filter',
    `label=com.supabase.cli.project=${projectId}`
  ], { capture: true })
  const containerIds = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (containerIds.length === 0) {
    return
  }

  console.log('Disabling Docker auto-restart for local Supabase containers...')
  await run('docker', ['update', '--restart=no', ...containerIds])
}

const startSupabase = async () => {
  console.log('Starting Supabase...')

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await run('npm', ['run', 'supabase:start'])
      break
    } catch (error) {
      if (attempt === 3) {
        throw error
      }

      console.log('Supabase is still warming up; retrying...')
      await sleep(5000)
    }
  }

  await waitFor('Supabase API', () => httpOk(`http://127.0.0.1:${supabasePort}/auth/v1/settings`))
}

const startManagedProcess = (label, command, args) => {
  console.log(`Starting ${label}...`)
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false
  })

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`${label} exited with code ${code}`)
    }
  })

  managedProcesses.push(child)
}

const ensureEdgeFunctions = async () => {
  const healthUrl = `http://127.0.0.1:${supabasePort}/functions/v1/app-health`

  if (await httpOk(healthUrl)) {
    return
  }

  startManagedProcess('Supabase Edge Functions', 'npm', ['run', 'supabase:functions:serve'])
  await waitFor('Supabase Edge Functions', () => httpOk(healthUrl))
}

const ensureVite = async () => {
  const appUrl = `http://127.0.0.1:${appPort}/`

  if (await httpOk(appUrl)) {
    return
  }

  startManagedProcess('Project Management dev server', 'npm', ['run', 'dev', '--', '--host', '0.0.0.0'])
  await waitFor('Project Management dev server', () => httpOk(appUrl))
}

const checkEndpoint = async (label, url) => {
  const ok = await httpOk(url)
  const icon = ok ? 'OK ' : 'ERR'

  console.log(`${icon} ${label.padEnd(22)} ${url}`)
}

const printEndpoints = async (lanAddress) => {
  const local = '127.0.0.1'
  const lan = lanAddress

  console.log('\nProject Management dev endpoints')
  console.log('--------------------------------')
  await checkEndpoint('App local', `http://localhost:${appPort}/`)
  if (lan) {
    await checkEndpoint('App LAN', `http://${lan}:${appPort}/`)
  }

  console.log('\nSupabase endpoints')
  console.log('--------------------------------')
  await checkEndpoint('API local', `http://${local}:${supabasePort}`)
  if (lan) {
    await checkEndpoint('API LAN', `http://${lan}:${supabasePort}`)
  }
  await checkEndpoint('REST local', `http://${local}:${supabasePort}/rest/v1`)
  if (lan) {
    await checkEndpoint('REST LAN', `http://${lan}:${supabasePort}/rest/v1`)
  }
  await checkEndpoint('GraphQL local', `http://${local}:${supabasePort}/graphql/v1`)
  if (lan) {
    await checkEndpoint('GraphQL LAN', `http://${lan}:${supabasePort}/graphql/v1`)
  }
  await checkEndpoint('Studio local', `http://${local}:${studioPort}`)
  if (lan) {
    await checkEndpoint('Studio LAN', `http://${lan}:${studioPort}`)
  }
  await checkEndpoint('Mailpit local', `http://${local}:${mailPort}`)
  if (lan) {
    await checkEndpoint('Mailpit LAN', `http://${lan}:${mailPort}`)
  }
  await checkEndpoint('MCP local', `http://${local}:${supabasePort}/mcp`)
  if (lan) {
    await checkEndpoint('MCP LAN', `http://${lan}:${supabasePort}/mcp`)
  }

  console.log('\nEdge Functions')
  console.log('--------------------------------')
  await checkEndpoint('Functions local', `http://${local}:${supabasePort}/functions/v1`)
  if (lan) {
    await checkEndpoint('Functions LAN', `http://${lan}:${supabasePort}/functions/v1`)
  }
  await checkEndpoint('Health local', `http://${local}:${supabasePort}/functions/v1/app-health`)
  if (lan) {
    await checkEndpoint('Health LAN', `http://${lan}:${supabasePort}/functions/v1/app-health`)
  }

  console.log('\nDatabase')
  console.log('--------------------------------')
  console.log(`Local                  postgresql://postgres:postgres@${local}:${databasePort}/postgres`)
  if (lan) {
    console.log(`LAN                    postgresql://postgres:postgres@${lan}:${databasePort}/postgres`)
  }

  console.log('\nGenerated local-only config: public/config.local.json')
}

const stopManagedProcesses = () => {
  for (const child of managedProcesses) {
    child.kill('SIGINT')
  }
}

process.on('SIGINT', () => {
  stopManagedProcesses()
  process.exit(130)
})

process.on('SIGTERM', () => {
  stopManagedProcesses()
  process.exit(143)
})

const main = async () => {
  const lanAddress = getLanAddress()

  await ensureDependencies()
  writeLocalConfig(lanAddress)
  await ensureDocker()
  await startSupabase()
  await disableSupabaseContainerRestarts()
  await ensureEdgeFunctions()
  await ensureVite()
  await printEndpoints(lanAddress)

  if (managedProcesses.length > 0) {
    console.log('\nPress Ctrl+C to stop the dev processes started by this script.')
    await new Promise(() => {})
  }
}

main().catch((error) => {
  stopManagedProcesses()
  console.error(error.message)
  process.exit(1)
})

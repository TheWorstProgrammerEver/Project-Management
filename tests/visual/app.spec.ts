import { expect, test } from '@playwright/test'
import { routeRuntimeConfig } from './runtimeConfig'
import { deleteSupabaseUsersByEmail, getSupabaseAdminClient } from './supabaseTestAuth'

const visualRunId = `${Date.now()}`
const visualEmail = `visual-${visualRunId}@example.com`
const visualPassword = 'password123'
const visualTeamName = `Visual Team ${visualRunId}`
const visualTeamSlug = `visual-team-${visualRunId}`
const visualBacklogName = `Visual Backlog ${visualRunId}`
const visualBacklogSlug = `visual-backlog-${visualRunId}`
let visualTeamId = ''
let visualBacklogId = ''
let visualUserId = ''

test.beforeAll(async () => {
  const admin = getSupabaseAdminClient()
  const userResult = await admin.auth.admin.createUser({
    email: visualEmail,
    email_confirm: true,
    password: visualPassword,
    user_metadata: {
      display_name: 'Visual User'
    }
  })

  if (userResult.error || !userResult.data.user) {
    throw userResult.error ?? new Error('Could not create visual test user.')
  }

  visualUserId = userResult.data.user.id

  const teamResult = await admin
    .from('teams')
    .insert({
      name: visualTeamName,
      slug: visualTeamSlug
    })
    .select('id')
    .single()

  if (teamResult.error) {
    throw teamResult.error
  }

  visualTeamId = teamResult.data.id

  const backlogResult = await admin
    .from('backlogs')
    .insert({
      description: 'Visual route hierarchy fixture.',
      name: visualBacklogName,
      slug: visualBacklogSlug,
      team_id: visualTeamId
    })
    .select('id')
    .single()

  if (backlogResult.error) {
    throw backlogResult.error
  }

  visualBacklogId = backlogResult.data.id

  const membershipResult = await admin
    .from('team_memberships')
    .insert({
      display_name: 'Visual User',
      role: 'member',
      team_id: visualTeamId,
      user_id: visualUserId
    })

  if (membershipResult.error) {
    throw membershipResult.error
  }
})

test.afterAll(async () => {
  const admin = getSupabaseAdminClient()

  if (visualTeamSlug) {
    await admin.from('teams').delete().eq('slug', visualTeamSlug)
  }

  await deleteSupabaseUsersByEmail([visualEmail])
})

test.beforeEach(async ({ page }) => {
  await routeRuntimeConfig(page)
})

test('renders the auth screen from runtime config', async ({ page }) => {
  await page.goto('/sign-in')

  await expect(page.getByRole('heading', { name: 'Project Management' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
})

test('protects app routes until the user signs in', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Project Management' })).toBeVisible()
})

test('renders teams, team detail, and backlog routes after sign in', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('textbox', { name: 'Email' }).fill(visualEmail)
  await page.getByRole('textbox', { name: 'Password' }).fill(visualPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Teams', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: visualTeamName })).toBeVisible()

  await page.getByRole('link', { name: visualTeamName }).click()
  await expect(page).toHaveURL(new RegExp(`/teams/${visualTeamId}$`))
  await expect(page.getByRole('heading', { name: visualTeamName })).toBeVisible()
  await expect(page.getByText(visualBacklogName)).toBeVisible()

  await page.getByRole('link', { name: 'Open', exact: true }).first().click()
  await expect(page).toHaveURL(new RegExp(`/teams/${visualTeamId}/backlogs/${visualBacklogId}$`))
  await expect(page.getByRole('heading', { name: visualBacklogName })).toBeVisible()
})

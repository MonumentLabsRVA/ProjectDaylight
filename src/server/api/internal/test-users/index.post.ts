import { randomUUID } from 'node:crypto'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getServiceClient } from '../../../utils/service-client'
import type { Database } from '~/types/database.types'

/**
 * POST /api/internal/test-users
 *
 * Employee-only. Creates a throwaway Supabase auth user, marks their profile as
 * `is_test_user = true`, and returns a magic link the caller can open in an
 * incognito tab (or paste into the browser to switch sessions in-place).
 *
 * Gate is purely DB-driven via profiles.is_employee — no NODE_ENV bypass.
 */
export default defineEventHandler(async (event) => {
  // 1. Resolve caller.
  const authUser = await serverSupabaseUser(event)
  const callerId = (authUser as any)?.sub ?? (authUser as any)?.id ?? null
  if (!callerId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // 2. Employee gate.
  const client = await serverSupabaseClient<Database>(event)
  const { data: profile } = await client
    .from('profiles')
    .select('is_employee')
    .eq('id', callerId)
    .maybeSingle()

  if (profile?.is_employee !== true) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  // 3. Privileged work begins here.
  const serviceClient = getServiceClient()

  const ts = Date.now()
  const password = randomUUID()
  const primaryEmail = `test+${ts}@daylight-test.local`
  const fallbackEmail = `test+${ts}@daylight-test.test`
  const createdAtIso = new Date().toISOString()

  const userMetadata = {
    is_test_user: true,
    created_by: callerId,
    created_at: createdAtIso
  }

  // Try the .local domain first; some Supabase projects reject it, so retry on .test.
  let createResult = await serviceClient.auth.admin.createUser({
    email: primaryEmail,
    password,
    email_confirm: true,
    user_metadata: userMetadata
  })

  let email = primaryEmail
  if (createResult.error) {
    console.log('[test-users:create] .local rejected, retrying with .test:', createResult.error.message)
    createResult = await serviceClient.auth.admin.createUser({
      email: fallbackEmail,
      password,
      email_confirm: true,
      user_metadata: userMetadata
    })
    email = fallbackEmail
  }

  if (createResult.error || !createResult.data?.user) {
    console.error('[test-users:create] auth.admin.createUser failed:', createResult.error)
    throw createError({
      statusCode: 500,
      statusMessage: createResult.error?.message ?? 'Failed to create test user'
    })
  }

  const newUser = createResult.data.user

  // 4. Upsert profile row.
  const { error: profileError } = await serviceClient
    .from('profiles')
    .upsert({
      id: newUser.id,
      email,
      full_name: `Test User ${ts}`,
      is_test_user: true,
      onboarding_completed_at: null
    }, { onConflict: 'id' })

  if (profileError) {
    console.error('[test-users:create] profiles upsert failed:', profileError)
    // Best-effort cleanup of the auth user we just created.
    await serviceClient.auth.admin.deleteUser(newUser.id).catch((cleanupErr: unknown) => {
      console.error('[test-users:create] cleanup deleteUser failed:', cleanupErr)
    })
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to upsert test user profile: ${profileError.message}`
    })
  }

  // 5. Magic link.
  let origin: string
  try {
    origin = getRequestURL(event).origin
  } catch {
    origin = getHeader(event, 'origin') ?? ''
  }
  if (!origin) {
    origin = getHeader(event, 'origin') ?? ''
  }

  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent('/home')}`

  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo }
  })

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[test-users:create] generateLink failed:', linkError)
    throw createError({
      statusCode: 500,
      statusMessage: linkError?.message ?? 'Failed to generate magic link'
    })
  }

  console.log(`[test-users:create] created ${newUser.id} (${email}) by ${callerId}`)

  return {
    userId: newUser.id,
    email,
    magicLink: linkData.properties.action_link
  }
})

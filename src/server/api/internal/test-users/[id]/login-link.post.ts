import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getServiceClient } from '../../../../utils/service-client'
import type { Database } from '~/types/database.types'

/**
 * POST /api/internal/test-users/[id]/login-link
 *
 * Employee-only. Re-issues a magic link for an existing test user. Defense-in-depth:
 * we re-verify `is_test_user = true` so this endpoint can never mint a magic link
 * for a real user account, even if the caller is an employee.
 */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  const callerId = (authUser as any)?.sub ?? (authUser as any)?.id ?? null
  if (!callerId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient<Database>(event)
  const { data: profile } = await client
    .from('profiles')
    .select('is_employee')
    .eq('id', callerId)
    .maybeSingle()

  if (profile?.is_employee !== true) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  }

  const serviceClient = getServiceClient()

  const { data: target, error: targetError } = await serviceClient
    .from('profiles')
    .select('email, is_test_user')
    .eq('id', id)
    .maybeSingle()

  if (targetError) {
    console.error('[test-users:login-link] profile lookup failed:', targetError)
    throw createError({ statusCode: 500, statusMessage: targetError.message })
  }
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Test user not found' })
  }
  if (target.is_test_user !== true) {
    throw createError({ statusCode: 403, statusMessage: 'Target is not a test user' })
  }
  if (!target.email) {
    throw createError({ statusCode: 500, statusMessage: 'Test user has no email on file' })
  }

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
    email: target.email,
    options: { redirectTo }
  })

  if (linkError || !linkData?.properties?.action_link) {
    console.error('[test-users:login-link] generateLink failed:', linkError)
    throw createError({
      statusCode: 500,
      statusMessage: linkError?.message ?? 'Failed to generate magic link'
    })
  }

  return { magicLink: linkData.properties.action_link }
})

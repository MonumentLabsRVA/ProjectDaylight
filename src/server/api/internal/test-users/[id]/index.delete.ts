import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getServiceClient } from '../../../../utils/service-client'
import { deleteTestUserCascade } from '../../../../utils/test-user-deletion'
import type { Database } from '~/types/database.types'

/**
 * DELETE /api/internal/test-users/[id]
 *
 * Employee-only. Hard-deletes a single test user and all of their data via
 * `deleteTestUserCascade`. Re-verifies `is_test_user = true` before deleting.
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
    console.error('[test-users:delete] profile lookup failed:', targetError)
    throw createError({ statusCode: 500, statusMessage: targetError.message })
  }
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Test user not found' })
  }
  if (target.is_test_user !== true) {
    throw createError({ statusCode: 403, statusMessage: 'Target is not a test user' })
  }

  await deleteTestUserCascade(serviceClient, id)

  console.log(`[test-users:delete] deleted ${id} by ${callerId}`)

  return { success: true }
})

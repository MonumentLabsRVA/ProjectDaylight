import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getServiceClient } from '../../../utils/service-client'
import type { Database } from '~/types/database.types'

/**
 * GET /api/internal/test-users
 *
 * Employee-only. Lists every profile flagged `is_test_user = true`, newest
 * first, with a per-user case count joined via a single follow-up query
 * (no N+1).
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

  const serviceClient = getServiceClient()

  const { data: rows, error: listError } = await serviceClient
    .from('profiles')
    .select('id, email, full_name, created_at, onboarding_completed_at')
    .eq('is_test_user', true)
    .order('created_at', { ascending: false })

  if (listError) {
    console.error('[test-users:list] profiles select failed:', listError)
    throw createError({ statusCode: 500, statusMessage: listError.message })
  }

  const testUsers = rows ?? []
  const ids = testUsers.map(u => u.id)

  // Per-user case count via one follow-up query, grouped in JS.
  const caseCounts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: caseRows, error: caseError } = await serviceClient
      .from('cases')
      .select('user_id')
      .in('user_id', ids)

    if (caseError) {
      console.error('[test-users:list] cases select failed:', caseError)
      throw createError({ statusCode: 500, statusMessage: caseError.message })
    }

    for (const row of caseRows ?? []) {
      const uid = (row as { user_id: string | null }).user_id
      if (!uid) continue
      caseCounts.set(uid, (caseCounts.get(uid) ?? 0) + 1)
    }
  }

  return {
    testUsers: testUsers.map(u => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      created_at: u.created_at,
      onboarding_completed_at: u.onboarding_completed_at,
      case_count: caseCounts.get(u.id) ?? 0
    }))
  }
})

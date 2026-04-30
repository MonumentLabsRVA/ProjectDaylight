import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getServiceClient } from '../../../utils/service-client'
import { deleteTestUserCascade } from '../../../utils/test-user-deletion'
import type { Database } from '~/types/database.types'

interface BulkDeleteBody {
  ids?: string[]
}

/**
 * POST /api/internal/test-users/bulk-delete
 *
 * Employee-only. Deletes a batch of test users. If `ids` is omitted/empty,
 * targets every profile flagged `is_test_user = true`. Each id is re-validated
 * against the same flag (single batch query, not per-id) before deletion.
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

  const body = await readBody<BulkDeleteBody>(event).catch(() => ({} as BulkDeleteBody))
  const requestedIds = Array.isArray(body?.ids) ? body!.ids!.filter(Boolean) : []

  const serviceClient = getServiceClient()

  // Resolve the working set: either the explicit ids or every test user.
  let candidateIds: string[]
  if (requestedIds.length > 0) {
    candidateIds = requestedIds
  } else {
    const { data: allRows, error: allError } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('is_test_user', true)

    if (allError) {
      console.error('[test-users:bulk-delete] list-all failed:', allError)
      throw createError({ statusCode: 500, statusMessage: allError.message })
    }
    candidateIds = (allRows ?? []).map(r => r.id)
  }

  if (candidateIds.length === 0) {
    return { matched: 0, deleted: 0, failed: [] as Array<{ id: string, error: string }> }
  }

  // Single batch query to filter to only confirmed test users (defense-in-depth).
  const { data: validRows, error: validateError } = await serviceClient
    .from('profiles')
    .select('id')
    .in('id', candidateIds)
    .eq('is_test_user', true)

  if (validateError) {
    console.error('[test-users:bulk-delete] validation query failed:', validateError)
    throw createError({ statusCode: 500, statusMessage: validateError.message })
  }

  const validIds = (validRows ?? []).map(r => r.id)

  let deleted = 0
  const failed: Array<{ id: string, error: string }> = []

  for (const id of validIds) {
    try {
      await deleteTestUserCascade(serviceClient, id)
      deleted += 1
    } catch (err: any) {
      console.error(`[test-users:bulk-delete] cascade failed for ${id}:`, err)
      failed.push({ id, error: err?.message ?? String(err) })
    }
  }

  console.log(`[test-users:bulk-delete] matched=${validIds.length} deleted=${deleted} failed=${failed.length} by ${callerId}`)

  return {
    matched: validIds.length,
    deleted,
    failed
  }
})

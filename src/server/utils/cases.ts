import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/**
 * Resolve the active case id for the current user, or `null` if the user has
 * no cases yet. Use this in **read** endpoints (timeline, journal, evidence,
 * home) — they should return empty results rather than 404 when the user
 * hasn't created a case yet.
 *
 * Order of precedence:
 *   1. `override` arg (e.g. `?caseId=` query param or request body field)
 *   2. `profiles.active_case_id` (set by the sidebar CaseSwitcher; persistent across devices)
 *   3. The user's most-recently-created case
 *   4. `null` if none of the above resolve.
 */
export async function getActiveCaseIdOrNull(
  supabase: SupabaseClient<Database>,
  userId: string,
  override?: string | null
): Promise<string | null> {
  const candidate = override?.trim() || null

  if (candidate) {
    const { data } = await supabase
      .from('cases')
      .select('id')
      .eq('id', candidate)
      .eq('user_id', userId)
      .maybeSingle()
    if (data?.id) return data.id
    // override stale or pointed to a foreign case; fall through.
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_case_id')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.active_case_id) {
    const { data: stored } = await supabase
      .from('cases')
      .select('id')
      .eq('id', profile.active_case_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (stored?.id) return stored.id
  }

  const { data, error } = await supabase
    .from('cases')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  return data?.id ?? null
}

/**
 * Resolve the active case id, throwing 404 if the user has no cases.
 * Use this in **write** endpoints (journal/submit, evidence-upload, capture
 * paths) where a target case is required to insert a row.
 */
export async function getActiveCaseId(
  supabase: SupabaseClient<Database>,
  userId: string,
  override?: string | null
): Promise<string> {
  const id = await getActiveCaseIdOrNull(supabase, userId, override)
  if (!id) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No case found for this user. Create one before continuing.'
    })
  }
  return id
}

/**
 * Verify that the given user owns the given case. Throws 403 if not.
 *
 * Plan 03 will extend this to also accept users granted access via
 * `case_collaborators`. Until then, ownership === access.
 */
export async function requireCaseAccess(
  supabase: SupabaseClient<Database>,
  userId: string,
  caseId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  if (!data) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
}

/**
 * Update the user's persisted active case pointer.
 * Caller is responsible for verifying access first via `requireCaseAccess`.
 */
export async function setActiveCaseId(
  supabase: SupabaseClient<Database>,
  userId: string,
  caseId: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ active_case_id: caseId })
    .eq('id', userId)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
}

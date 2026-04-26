import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { requireUserId } from '../../utils/auth'

interface CaseListItem {
  id: string
  title: string
  isActive: boolean
}

interface ResponseShape {
  cases: CaseListItem[]
  activeCaseId: string | null
}

export default defineEventHandler(async (event): Promise<ResponseShape> => {
  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  const [casesResult, profileResult] = await Promise.all([
    supabase
      .from('cases')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('active_case_id')
      .eq('id', userId)
      .maybeSingle()
  ])

  if (casesResult.error) {
    throw createError({ statusCode: 500, statusMessage: casesResult.error.message })
  }

  const cases = casesResult.data ?? []
  const persistedActive = profileResult.data?.active_case_id ?? null
  // If the persisted pointer doesn't exist or is stale, fall back to the most-recent case.
  const validActive = cases.find((c) => c.id === persistedActive)?.id
    ?? cases[0]?.id
    ?? null

  return {
    cases: cases.map((c) => ({
      id: c.id,
      title: c.title,
      isActive: c.id === validActive
    })),
    activeCaseId: validActive
  }
})

import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { requireUserId } from '../../utils/auth'
import { requireCaseAccess, setActiveCaseId } from '../../utils/cases'

interface Body {
  caseId?: string
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  const body = await readBody<Body>(event)
  const caseId = body?.caseId?.trim()

  if (!caseId) {
    throw createError({ statusCode: 400, statusMessage: 'caseId is required' })
  }

  await requireCaseAccess(supabase, userId, caseId)
  await setActiveCaseId(supabase, userId, caseId)

  setResponseStatus(event, 204)
  return null
})

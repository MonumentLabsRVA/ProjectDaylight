import type { UIMessage } from 'ai'
import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../utils/auth'
import { getActiveCaseId, requireCaseAccess } from '../utils/cases'
import { normalizeMessages, serializeMessages } from '../utils/chats'
import type { Database } from '~/types/database.types'

interface CreateBody {
  id?: string
  caseId?: string
  message?: UIMessage
}

/**
 * Create a new chat row scoped to the active case (or to caseId if provided).
 * The first user message is persisted with the row so the streaming endpoint
 * can pick up immediately on the next request.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  const body = await readBody<CreateBody>(event)
  const chatId = body.id?.trim() || crypto.randomUUID()
  const [userMessage] = normalizeMessages(body.message ? [body.message] : [])
  if (!userMessage || userMessage.role !== 'user') {
    throw createError({ statusCode: 400, statusMessage: 'a valid user message is required' })
  }

  const caseId = await getActiveCaseId(supabase, userId, body.caseId ?? null)
  await requireCaseAccess(supabase, userId, caseId)

  const { data, error } = await supabase
    .from('chats')
    .insert({
      id: chatId,
      case_id: caseId,
      user_id: userId,
      title: '',
      agent: 'case_assistant',
      messages: serializeMessages([userMessage])
    })
    .select('id, title')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: `Failed to create chat: ${error.message}` })
  }

  return data
})

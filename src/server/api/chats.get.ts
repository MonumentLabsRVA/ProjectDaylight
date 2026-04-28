import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../utils/auth'
import { getActiveCaseIdOrNull } from '../utils/cases'
import { extractTextFromParts, readChatsForCase } from '../utils/chats'
import type { Database } from '~/types/database.types'

/**
 * List chats for the active case (or `?caseId=` override). Returns light
 * metadata for the sidebar/list view; the full message history is loaded only
 * when the user opens a specific chat.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  const query = getQuery(event)
  const override = typeof query.caseId === 'string' ? query.caseId : null
  const caseId = await getActiveCaseIdOrNull(supabase, userId, override)
  if (!caseId) return []

  const chats = await readChatsForCase(supabase, caseId)

  return chats.map((chat) => {
    const firstUser = chat.messages.find(m => m.role === 'user')
    const preview = firstUser ? extractTextFromParts(firstUser.parts).slice(0, 160) : ''
    return {
      id: chat.id,
      caseId: chat.caseId,
      title: chat.title,
      agent: chat.agent,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      preview
    }
  })
})

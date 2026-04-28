import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../../utils/auth'
import { findChat } from '../../utils/chats'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const supabase = await serverSupabaseClient<Database>(event)
  await requireUserId(event, supabase)

  const chat = await findChat(supabase, id)
  if (!chat) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })

  return chat
})

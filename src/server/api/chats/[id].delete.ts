import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../../utils/auth'
import { deleteChat } from '../../utils/chats'
import type { Database } from '~/types/database.types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const supabase = await serverSupabaseClient<Database>(event)
  await requireUserId(event, supabase)

  const deleted = await deleteChat(supabase, id)
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Chat not found' })

  return { ok: true }
})

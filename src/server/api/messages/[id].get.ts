import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../../utils/auth'

/**
 * GET /api/messages/:id
 *
 * Returns the requested message plus its thread context (siblings sharing the
 * same thread_id within the same case, ordered ascending by sent_at). RLS
 * keeps the data scoped to the user's owned cases.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing message id.' })
  }

  const { data: message, error } = await supabase
    .from('messages')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/messages/:id] supabase error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load message.' })
  }
  if (!message) {
    throw createError({ statusCode: 404, statusMessage: 'Message not found.' })
  }

  // RLS already enforces case ownership; this is belt-and-braces for clarity.
  if (message.user_id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden.' })
  }

  let thread: typeof message[] = []
  if (message.thread_id) {
    const { data: threadRows, error: threadError } = await supabase
      .from('messages')
      .select('*')
      .eq('case_id', message.case_id)
      .eq('thread_id', message.thread_id)
      .order('sent_at', { ascending: true })
    if (threadError) {
      // eslint-disable-next-line no-console
      console.error('[GET /api/messages/:id] thread lookup error:', threadError)
    } else {
      thread = threadRows ?? []
    }
  }

  return { message, thread }
})

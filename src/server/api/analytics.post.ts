import { getRequestIP } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import { resolveUserId } from '../utils/auth'

interface AnalyticsEventBody {
  event_type: string
  payload?: Record<string, unknown>
  context?: Record<string, unknown>
}

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*$/

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const actorId = await resolveUserId(event, supabase)

  const body = await readBody<AnalyticsEventBody>(event)

  if (!body.event_type || typeof body.event_type !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'event_type is required' })
  }

  if (!EVENT_TYPE_PATTERN.test(body.event_type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'event_type must be snake_case (e.g., journal_entry_submitted)'
    })
  }

  const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
  const context = body.context && typeof body.context === 'object' ? body.context : {}

  const enrichedContext = {
    ...context,
    ip: getRequestIP(event, { xForwardedFor: true }),
    timestamp_server: new Date().toISOString()
  }

  const { error } = await supabase.schema('analytics' as any).rpc('log_event', {
    p_event_type: body.event_type,
    p_actor_id: actorId,
    p_payload: payload,
    p_context: enrichedContext
  })

  if (error) {
    console.error('[analytics] failed to log event:', error)
    return { success: true, logged: false }
  }

  return { success: true, logged: true }
})

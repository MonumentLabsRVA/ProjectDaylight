import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import { resolveUserId } from './auth'

export async function logAnalyticsEvent(
  event: H3Event,
  eventType: string,
  payload: Record<string, unknown> = {},
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = await serverSupabaseClient(event)
    const actorId = await resolveUserId(event, supabase)

    const { error } = await supabase.schema('analytics' as any).rpc('log_event', {
      p_event_type: eventType,
      p_actor_id: actorId,
      p_payload: payload,
      p_context: {
        ...context,
        source: 'backend',
        ip: getRequestIP(event, { xForwardedFor: true }),
        timestamp_server: new Date().toISOString()
      }
    })

    if (error) {
      console.error('[analytics] backend log failed:', eventType, error)
    }
  } catch (err) {
    console.error('[analytics] backend log threw:', eventType, err)
  }
}

import { getHeader, getRequestIP } from 'h3'
import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../utils/auth'

interface AttributionBody {
  referrer?: string | null
  landing_path?: string
  landing_at?: string
  user_agent?: string | null
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  gclid?: string
}

const STRING_FIELDS = [
  'referrer',
  'landing_path',
  'landing_at',
  'user_agent',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid'
] as const

function pickString(value: unknown, max = 2048): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const body = await readBody<AttributionBody>(event)

  const payload: Record<string, string> = {}
  for (const field of STRING_FIELDS) {
    const cleaned = pickString((body ?? {})[field])
    if (cleaned) payload[field] = cleaned
  }

  const context = {
    source: 'client',
    ip: getRequestIP(event, { xForwardedFor: true }),
    request_user_agent: getHeader(event, 'user-agent'),
    timestamp_server: new Date().toISOString()
  }

  const { error } = await supabase.schema('analytics' as any).rpc('log_event', {
    p_event_type: 'signup_attribution',
    p_actor_id: userId,
    p_payload: payload,
    p_context: context
  })

  if (error) {
    console.error('[signup-attribution] log_event failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to log signup attribution' })
  }

  // Persist gclid on the profile so Stripe → Google Ads offline conversion
  // attribution can join on a single column without scanning analytics events.
  // First-touch wins: only set if not already populated.
  if (payload.gclid) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase-generated types lag migration 0051 until regenerated; matches the existing 'analytics' as any pattern above.
    const { error: profileError } = await (supabase.from('profiles') as any)
      .update({
        gclid: payload.gclid,
        gclid_captured_at: new Date().toISOString()
      })
      .eq('id', userId)
      .is('gclid', null)

    if (profileError) {
      console.error('[signup-attribution] profile gclid update failed:', profileError)
    }
  }

  return { success: true, logged: true }
})

import { getHeader } from 'h3'
import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the current authenticated user ID.
 *
 * Order of precedence:
 * - Authorization: Bearer <supabase_access_token> (explicit client auth)
 * - Cookie-based auth via Nuxt Supabase module (serverSupabaseUser)
 *
 * Returns null when no authenticated user can be resolved.
 */
export async function resolveUserId(
  event: H3Event,
  supabase: SupabaseClient
): Promise<string | null> {
  // Prefer bearer token explicitly provided by the client.
  const authHeader = getHeader(event, 'authorization') || getHeader(event, 'Authorization')
  const bearerPrefix = 'Bearer '
  const token = authHeader?.startsWith(bearerPrefix)
    ? authHeader.slice(bearerPrefix.length).trim()
    : undefined

  if (token) {
    const { data: userResult, error: userError } = await supabase.auth.getUser(token)

    if (userError) {
      // eslint-disable-next-line no-console
      console.error('Supabase auth.getUser error:', userError)
    } else {
      return userResult.user?.id ?? null
    }
  }

  // Fall back to cookie-based auth.
  const authUser = await serverSupabaseUser(event)
  return (authUser as any)?.sub || authUser?.id || null
}

/**
 * Resolve the current authenticated user ID, throwing a 401 if missing.
 */
export async function requireUserId(
  event: H3Event,
  supabase: SupabaseClient,
  statusMessage = 'User is not authenticated. Please sign in and try again.'
): Promise<string> {
  const userId = await resolveUserId(event, supabase)
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage
    })
  }
  return userId
}


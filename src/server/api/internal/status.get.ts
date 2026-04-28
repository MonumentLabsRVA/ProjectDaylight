import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type CheckSnapshot = {
  ok: boolean
  latencyMs: number | null
  error: string | null
  detail: string | null
}

type StatusPayload = {
  checkedAt: string
  env: {
    nodeEnv: string
    nodeVersion: string
    hasSupabaseUrl: boolean
    hasSupabaseAnonKey: boolean
    hasSupabaseServiceKey: boolean
    hasOpenAIKey: boolean
    hasInngestEventKey: boolean
    hasInngestSigningKey: boolean
  }
  checks: {
    supabase: CheckSnapshot
    profile: CheckSnapshot
  }
  whoami: {
    userId: string
    email: string | null
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null, latencyMs: number, error: string | null }> {
  const start = performance.now()
  try {
    const value = await fn()
    return { value, latencyMs: Math.round(performance.now() - start), error: null }
  } catch (err: any) {
    return { value: null, latencyMs: Math.round(performance.now() - start), error: err?.message ?? String(err) }
  }
}

export default defineEventHandler(async (event): Promise<StatusPayload> => {
  const authUser = await serverSupabaseUser(event)
  const email = (authUser as any)?.email ?? null
  const userId = (authUser as any)?.sub ?? (authUser as any)?.id ?? null

  if (!userId) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const client = await serverSupabaseClient(event)

  const { data: profile } = await client
    .from('profiles')
    .select('is_employee')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.is_employee !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const config = useRuntimeConfig(event)

  const env = {
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    nodeVersion: process.version,
    hasSupabaseUrl: Boolean(config.public?.supabase?.url || process.env.SUPABASE_URL),
    hasSupabaseAnonKey: Boolean(config.public?.supabase?.key || process.env.SUPABASE_KEY),
    hasSupabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY || (config as any).openaiApiKey),
    hasInngestEventKey: Boolean(process.env.INNGEST_EVENT_KEY),
    hasInngestSigningKey: Boolean(process.env.INNGEST_SIGNING_KEY)
  }

  const supabasePing = await timed(async () => {
    const { error } = await client.from('profiles').select('id').limit(1)
    if (error && error.code !== 'PGRST116') throw error
    return true
  })

  const profilePing = await timed(async () => {
    if (!userId) throw new Error('no user id')
    const { data, error } = await client.from('profiles').select('id, email').eq('id', userId).maybeSingle()
    if (error && error.code !== 'PGRST116') throw error
    return data
  })

  return {
    checkedAt: new Date().toISOString(),
    env,
    checks: {
      supabase: {
        ok: !supabasePing.error,
        latencyMs: supabasePing.latencyMs,
        error: supabasePing.error,
        detail: supabasePing.error ? 'Query against profiles failed' : 'Read against profiles succeeded'
      },
      profile: {
        ok: !profilePing.error && profilePing.value !== null,
        latencyMs: profilePing.latencyMs,
        error: profilePing.error,
        detail: profilePing.value ? `Resolved profile for ${(profilePing.value as any)?.email ?? 'self'}` : 'No matching profile row'
      }
    },
    whoami: {
      userId: userId ?? '',
      email
    }
  }
})

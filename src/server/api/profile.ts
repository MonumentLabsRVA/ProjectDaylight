import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const client = await serverSupabaseClient(event)
  
  // Fetch profile with onboarding status and preferences
  const { data: profile, error } = await client
    .from('profiles')
    .select('id, full_name, email, timezone, avatar_url, onboarding_completed_at, created_at, updated_at')
    .eq('id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned (new user without profile yet)
    console.error('[Profile API] Error fetching profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch profile'
    })
  }

  return {
    profile: profile ?? null,
    needsOnboarding: !profile?.onboarding_completed_at
  }
})


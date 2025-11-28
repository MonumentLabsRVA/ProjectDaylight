import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  
  // Resolve user ID from either .sub (JWT) or .id (Supabase User object)
  const userId = authUser?.sub || authUser?.id
  
  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const client = await serverSupabaseClient(event)
  
  // Build update object based on provided fields
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString()
  }
  
  // Only allow updating specific fields
  if (body.full_name !== undefined) {
    updateData.full_name = body.full_name
  }
  
  if (body.timezone !== undefined) {
    updateData.timezone = body.timezone
  }
  
  if (body.avatar_url !== undefined) {
    updateData.avatar_url = body.avatar_url
  }
  
  if (body.onboarding_completed_at !== undefined) {
    updateData.onboarding_completed_at = body.onboarding_completed_at
  }
  
  // Check if profile exists
  const { data: existingProfile } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  let profile
  
  if (existingProfile) {
    // Update existing profile
    const { data, error } = await client
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()
      
    if (error) {
      console.error('[Profile PATCH] Error updating profile:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update profile'
      })
    }
    
    profile = data
  } else {
    // Create profile if it doesn't exist
    const { data, error } = await client
      .from('profiles')
      .insert({
        id: userId,
        email: authUser?.email,
        ...updateData
      })
      .select()
      .single()
      
    if (error) {
      console.error('[Profile PATCH] Error creating profile:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create profile'
      })
    }
    
    profile = data
  }

  return { profile }
})


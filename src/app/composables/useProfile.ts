/**
 * Composable for managing user profile data throughout the application.
 * 
 * Features:
 * - Fetches profile from database (profiles table)
 * - Falls back to OAuth metadata for avatar/name
 * - Provides reactive profile state
 */

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  timezone: string | null
  avatar_url: string | null
  onboarding_completed_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileResponse {
  profile: Profile | null
  needsOnboarding: boolean
}

export function useProfile() {
  const user = useSupabaseUser()
  
  // Helper to get user ID (could be in .id or .sub depending on context)
  const getUserId = () => (user.value as any)?.id || (user.value as any)?.sub
  
  // Reactive profile state
  const profile = useState<Profile | null>('user-profile', () => null)
  const isLoading = ref(false)
  const isFetched = ref(false)
  const needsOnboarding = useState<boolean>('needs-onboarding', () => false)

  // Fetch profile from API
  async function fetchProfile(): Promise<Profile | null> {
    if (!getUserId()) return null

    isLoading.value = true
    try {
      const response = await $fetch<ProfileResponse>('/api/profile')
      profile.value = response.profile
      needsOnboarding.value = response.needsOnboarding
      isFetched.value = true
      return response.profile
    } catch (err) {
      console.error('[useProfile] Error fetching profile:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Update profile
  async function updateProfile(updates: Partial<Pick<Profile, 'full_name' | 'timezone' | 'avatar_url' | 'onboarding_completed_at'>>): Promise<Profile | null> {
    if (!getUserId()) return null

    isLoading.value = true
    try {
      const response = await $fetch<{ profile: Profile }>('/api/profile', {
        method: 'PATCH',
        body: updates
      })
      profile.value = response.profile
      
      // Update onboarding status if that was changed
      if (updates.onboarding_completed_at !== undefined) {
        needsOnboarding.value = !response.profile.onboarding_completed_at
      }
      
      return response.profile
    } catch (err) {
      console.error('[useProfile] Error updating profile:', err)
      return null
    } finally {
      isLoading.value = false
    }
  }

  // Get display name (profile > OAuth > email > fallback)
  const displayName = computed(() => {
    // Prefer profile full_name
    if (profile.value?.full_name) {
      return profile.value.full_name
    }
    
    // Fall back to OAuth metadata
    const oauthMeta = (user.value as any)?.user_metadata
    if (oauthMeta?.preferred_name) return oauthMeta.preferred_name
    if (oauthMeta?.full_name) return oauthMeta.full_name
    if (oauthMeta?.name) return oauthMeta.name
    
    // Fall back to email
    return profile.value?.email || user.value?.email || 'Account'
  })

  // Get avatar URL (profile > OAuth > empty)
  const avatarUrl = computed(() => {
    // Prefer profile avatar_url (user-set)
    if (profile.value?.avatar_url) {
      return profile.value.avatar_url
    }
    
    // Fall back to OAuth provider avatar
    const oauthMeta = (user.value as any)?.user_metadata
    return oauthMeta?.avatar_url || oauthMeta?.picture || ''
  })

  // Get email
  const email = computed(() => {
    return profile.value?.email || user.value?.email || ''
  })

  // Initialize on auth change
  watch(user, async (newUser) => {
    const userId = (newUser as any)?.id || (newUser as any)?.sub
    if (userId) {
      // Fetch profile when user logs in
      if (!isFetched.value) {
        await fetchProfile()
      }
    } else {
      // Clear profile when user logs out
      profile.value = null
      isFetched.value = false
      needsOnboarding.value = false
    }
  }, { immediate: true })

  return {
    // State
    profile: readonly(profile),
    isLoading: readonly(isLoading),
    isFetched: readonly(isFetched),
    needsOnboarding: readonly(needsOnboarding),
    
    // Computed
    displayName,
    avatarUrl,
    email,
    
    // Actions
    fetchProfile,
    updateProfile
  }
}


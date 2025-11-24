export default defineNuxtPlugin(async () => {
  const supabase = useSupabaseClient()
  
  // Ensure session is initialized on client
  if (process.client) {
    await supabase.auth.getSession()
    
    // Listen for auth changes and update the session cookie
    supabase.auth.onAuthStateChange((event, session) => {
      // The module will automatically sync the session to cookies
      if (event === 'SIGNED_OUT') {
        // Clear any local storage if needed
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_redirect')
        }
      }
    })
  }
})


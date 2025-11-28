export default defineNuxtRouteMiddleware(async (to, from) => {
  const user = useSupabaseUser()
  
  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',                      // Landing page
    '/auth/login',            // Login page
    '/auth/signup',           // Signup page
    '/auth/confirm',          // Email confirmation page
    '/privacy',               // Privacy policy page
    '/terms',                 // Terms and conditions page
    '/security'               // Security page
  ]
  
  // Check if the current route is public
  const isPublicRoute = publicRoutes.some(route => 
    to.path === route || to.path.startsWith(route + '/')
  )
  
  // All other routes are protected by default
  const isProtectedRoute = !isPublicRoute
  const isOnboardingRoute = to.path === '/onboarding'
  
  // If user is not authenticated and trying to access a protected route
  if (!user.value && isProtectedRoute) {
    // Store the intended destination for redirect after login
    const redirectTo = to.fullPath
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`)
  }
  
  // If user is authenticated and trying to access auth pages or landing page
  if (user.value && (to.path === '/auth/login' || to.path === '/auth/signup' || to.path === '/')) {
    // Check if there's a redirect parameter
    const redirect = to.query.redirect as string
    if (redirect) {
      return navigateTo(redirect)
    }
    return navigateTo('/home')
  }
  
  // For authenticated users on protected routes (except onboarding), check onboarding status
  if (user.value && isProtectedRoute && !isOnboardingRoute) {
    // Only check on client side to avoid SSR issues and reduce server calls
    if (import.meta.client) {
      try {
        const { data } = await useFetch('/api/profile', {
          key: `profile-${user.value.id}`,
          // Cache for the session
          getCachedData: (key, nuxtApp) => {
            return nuxtApp.payload.data[key] || nuxtApp.static.data[key]
          }
        })
        
        if (data.value?.needsOnboarding) {
          return navigateTo('/onboarding')
        }
      } catch (error) {
        // If profile check fails, allow navigation but log the error
        console.warn('[Auth Middleware] Failed to check onboarding status:', error)
      }
    }
  }
  
  // Allow navigation for all other cases
})

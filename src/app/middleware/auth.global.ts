export default defineNuxtRouteMiddleware((to, from) => {
  const user = useSupabaseUser()
  
  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',                      // Landing page
    '/auth/login',            // Login page
    '/auth/signup',           // Signup page
    '/auth/confirm',          // Email confirmation page
    '/privacy',        // Privacy policy page
    '/terms'   // Terms and conditions page
  ]
  
  // Check if the current route is public
  const isPublicRoute = publicRoutes.some(route => 
    to.path === route || to.path.startsWith(route + '/')
  )
  
  // All other routes are protected by default
  const isProtectedRoute = !isPublicRoute
  
  // If user is not authenticated and trying to access a protected route
  if (!user.value && isProtectedRoute) {
    // Store the intended destination for redirect after login
    const redirectTo = to.fullPath
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`)
  }
  
  // If user is authenticated and trying to access auth pages or landing page, redirect to home
  if (user.value && (to.path === '/auth/login' || to.path === '/auth/signup' || to.path === '/')) {
    // Check if there's a redirect parameter
    const redirect = to.query.redirect as string
    if (redirect) {
      return navigateTo(redirect)
    }
    return navigateTo('/home')
  }
  
  // Allow navigation for all other cases
})




/**
 * Page middleware: blocks anyone who is not an employee.
 * The check is purely DB-driven via profiles.is_employee — no NODE_ENV bypass.
 *
 * Returns a 404 (rather than redirect) so the existence of internal-only
 * routes is not advertised to non-employees.
 */
export default defineNuxtRouteMiddleware(async () => {
  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo('/auth/login')
  }

  try {
    const response = await $fetch<{ profile?: { is_employee?: boolean } }>('/api/profile', {
      headers: useRequestHeaders(['cookie'])
    })

    if (response?.profile?.is_employee !== true) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
    }
  } catch (err: any) {
    if (err?.statusCode === 404) throw err
    throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
  }
})

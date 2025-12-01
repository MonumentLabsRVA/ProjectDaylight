import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    })
  }

  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, category, subject, description, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('[BugReports] Failed to fetch bug reports:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch bug reports'
    })
  }

  return data || []
})


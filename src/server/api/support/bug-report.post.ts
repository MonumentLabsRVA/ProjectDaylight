import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { generateReportMetadata } from '../../utils/generate-subject'

interface BugReportBody {
  description: string
  pageUrl?: string
  userAgent?: string
}

export default defineEventHandler(async (event) => {
  // Require authentication
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Please log in to submit feedback'
    })
  }

  const body = await readBody<BugReportBody>(event)

  // Validation - only description is required
  if (!body?.description?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Please tell us what\'s on your mind'
    })
  }

  // Generate subject and category from description
  const { subject, category } = await generateReportMetadata(body.description.trim())

  // Save to database
  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('bug_reports')
    .insert({
      user_id: userId,
      email: user?.email || null,
      category,
      subject,
      description: body.description.trim(),
      page_url: body.pageUrl || null,
      user_agent: body.userAgent || null
    })
    .select('id, created_at')
    .single()

  if (error) {
    console.error('[BugReport] Failed to create bug report:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to submit feedback. Please try again or email hello@monumentlabs.io directly.'
    })
  }

  return {
    success: true,
    reportId: data.id,
    subject,
    category
  }
})

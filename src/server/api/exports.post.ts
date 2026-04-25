import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { canExport } from '../utils/subscription'
import { logAnalyticsEvent } from '../utils/analytics'

interface ExportCreateBody {
  title: string
  markdown_content: string
  focus: 'full-timeline' | 'incidents-only' | 'positive-parenting'
  metadata?: {
    case_title?: string
    court_name?: string
    recipient?: string
    overview_notes?: string
    include_evidence_index?: boolean
    include_overview?: boolean
    include_ai_summary?: boolean
    events_count?: number
    evidence_count?: number
    ai_summary_included?: boolean
  }
}

export default defineEventHandler(async (event) => {
  // Auth check
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Check if user can create exports (feature gating - Pro only)
  const exportCheck = await canExport(event, userId)
  if (!exportCheck.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: exportCheck.reason || 'Exports are a Pro feature. Please upgrade to create court-ready documents.'
    })
  }

  const body = await readBody<ExportCreateBody>(event)

  if (!body?.title?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required'
    })
  }

  if (!body?.markdown_content?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Markdown content is required'
    })
  }

  const supabase = await serverSupabaseClient(event)

  const { data, error } = await supabase
    .from('exports')
    .insert({
      user_id: userId,
      title: body.title.trim(),
      markdown_content: body.markdown_content,
      focus: body.focus || 'full-timeline',
      metadata: body.metadata || {}
    })
    .select()
    .single()

  if (error) {
    console.error('[Exports] Failed to create export:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save export'
    })
  }

  await logAnalyticsEvent(event, 'export_created', {
    exportId: data.id,
    focus: data.focus,
    eventsCount: body.metadata?.events_count ?? null,
    evidenceCount: body.metadata?.evidence_count ?? null,
    aiSummaryIncluded: !!body.metadata?.ai_summary_included
  })

  return { export: data }
})



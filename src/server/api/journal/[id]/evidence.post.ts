import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * POST /api/journal/[id]/evidence
 * 
 * Links an evidence item to a journal entry (capture).
 * Expects: { evidenceId: string, annotation?: string }
 */

interface AttachEvidenceBody {
  evidenceId: string
  annotation?: string
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const captureId = getRouterParam(event, 'id')
  if (!captureId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing journal entry ID' })
  }

  const body = await readBody<AttachEvidenceBody>(event)
  if (!body?.evidenceId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing evidence ID' })
  }

  const client = await serverSupabaseClient<Database>(event)

  // Verify the capture belongs to the user
  const { data: capture, error: captureError } = await client
    .from('captures')
    .select('id')
    .eq('id', captureId)
    .eq('user_id', userId)
    .single()

  if (captureError || !capture) {
    throw createError({ statusCode: 404, statusMessage: 'Journal entry not found' })
  }

  // Verify the evidence belongs to the user
  const { data: evidence, error: evidenceError } = await client
    .from('evidence')
    .select('id')
    .eq('id', body.evidenceId)
    .eq('user_id', userId)
    .single()

  if (evidenceError || !evidence) {
    throw createError({ statusCode: 404, statusMessage: 'Evidence not found' })
  }

  // Update evidence annotation if provided
  if (body.annotation) {
    await client
      .from('evidence')
      .update({ user_annotation: body.annotation })
      .eq('id', body.evidenceId)
  }

  // Get the current max sort_order for this capture
  const { data: existingLinks } = await client
    .from('capture_evidence')
    .select('sort_order')
    .eq('capture_id', captureId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = ((existingLinks?.[0]?.sort_order ?? -1) + 1)

  // Check if already linked
  const { data: existingLink } = await client
    .from('capture_evidence')
    .select('id')
    .eq('capture_id', captureId)
    .eq('evidence_id', body.evidenceId)
    .single()

  if (existingLink) {
    // Already linked, just update annotation
    return { success: true, alreadyLinked: true }
  }

  // Link evidence to capture
  const { error: linkError } = await client
    .from('capture_evidence')
    .insert({
      capture_id: captureId,
      evidence_id: body.evidenceId,
      sort_order: nextSortOrder,
      is_processed: true,
      processed_at: new Date().toISOString()
    })

  if (linkError) {
    console.error('Failed to link evidence to capture:', linkError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to attach evidence' })
  }

  return { success: true }
})


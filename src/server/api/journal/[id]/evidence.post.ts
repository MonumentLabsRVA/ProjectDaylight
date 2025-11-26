import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * POST /api/journal/[id]/evidence
 * 
 * Links an evidence item to a journal entry.
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

  const journalEntryId = getRouterParam(event, 'id')
  if (!journalEntryId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing journal entry ID' })
  }

  const body = await readBody<AttachEvidenceBody>(event)
  if (!body?.evidenceId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing evidence ID' })
  }

  const client = await serverSupabaseClient<Database>(event)

  // Verify the journal entry belongs to the user
  const { data: entry, error: entryError } = await client
    .from('journal_entries')
    .select('id')
    .eq('id', journalEntryId)
    .eq('user_id', userId)
    .single()

  if (entryError || !entry) {
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

  // Get the current max sort_order for this journal entry
  const { data: existingLinks } = await client
    .from('journal_entry_evidence')
    .select('sort_order')
    .eq('journal_entry_id', journalEntryId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSortOrder = ((existingLinks?.[0]?.sort_order ?? -1) + 1)

  // Check if already linked
  const { data: existingLink } = await client
    .from('journal_entry_evidence')
    .select('id')
    .eq('journal_entry_id', journalEntryId)
    .eq('evidence_id', body.evidenceId)
    .single()

  if (existingLink) {
    // Already linked, just update annotation
    return { success: true, alreadyLinked: true }
  }

  // Link evidence to journal entry
  const { error: linkError } = await client
    .from('journal_entry_evidence')
    .insert({
      journal_entry_id: journalEntryId,
      evidence_id: body.evidenceId,
      sort_order: nextSortOrder,
      is_processed: true,
      processed_at: new Date().toISOString()
    })

  if (linkError) {
    console.error('Failed to link evidence to journal entry:', linkError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to attach evidence' })
  }

  return { success: true }
})


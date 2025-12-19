import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { inngest } from '../../../inngest/client'

interface JournalReprocessResponse {
  journalEntryId: string
  jobId: string
  message: string
}

/**
 * POST /api/journal/[id]/reprocess
 *
 * Re-run AI extraction for an existing journal entry.
 * - Creates a new background job
 * - Optionally cleans up previously generated events for this entry
 * - Uses the current journal text, reference date, and linked evidence
 */
export default defineEventHandler(async (event): Promise<JournalReprocessResponse> => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const journalEntryId = getRouterParam(event, 'id')
  if (!journalEntryId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing journal entry ID' })
  }

  const client = await serverSupabaseClient(event)

  // Load the journal entry to reprocess
  const { data: entry, error: entryError } = await client
    .from('journal_entries')
    .select('id, event_text, reference_date, status')
    .eq('id', journalEntryId)
    .eq('user_id', userId)
    .single()

  if (entryError || !entry) {
    throw createError({ statusCode: 404, statusMessage: 'Journal entry not found' })
  }

  if (!entry.event_text || !entry.event_text.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot re-run extraction for an empty journal entry.'
    })
  }

  // Collect any previously generated event IDs from the latest job summary
  let previousEventIds: string[] = []

  const { data: previousJob } = await (client as any)
    .from('jobs')
    .select('result_summary')
    .eq('journal_entry_id', journalEntryId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (previousJob?.result_summary && typeof previousJob.result_summary === 'object') {
    const summary = previousJob.result_summary as { event_ids?: string[] }
    previousEventIds = summary.event_ids || []
  }

  if (previousEventIds.length > 0) {
    // Clean up previously generated events and related records
    await client
      .from('event_participants')
      .delete()
      .in('event_id', previousEventIds)

    await client
      .from('evidence_mentions')
      .delete()
      .in('event_id', previousEventIds)

    await client
      .from('event_evidence')
      .delete()
      .in('event_id', previousEventIds)

    await client
      .from('action_items')
      .delete()
      .in('event_id', previousEventIds)

    await client
      .from('events')
      .delete()
      .in('id', previousEventIds)
      .eq('user_id', userId)
  }

  // Gather evidence currently linked to this journal entry
  const { data: evidenceLinks, error: evidenceError } = await client
    .from('journal_entry_evidence')
    .select('evidence_id')
    .eq('journal_entry_id', journalEntryId)

  if (evidenceError) {
    console.error('[journal/reprocess] Failed to load evidence links:', evidenceError)
  }

  const evidenceIds = (evidenceLinks || []).map((row: any) => row.evidence_id as string)

  // Create a new job record for this reprocessing run
  const { data: job, error: jobError } = await (client as any)
    .from('jobs')
    .insert({
      user_id: userId,
      type: 'journal_extraction',
      status: 'pending',
      journal_entry_id: journalEntryId
    })
    .select('id')
    .single()

  if (jobError || !job) {
    console.error('[journal/reprocess] Failed to create job:', jobError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create reprocessing job' })
  }

  // Optimistically mark the journal entry as processing and clear prior error
  await client
    .from('journal_entries')
    .update({
      status: 'processing',
      processing_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', journalEntryId)
    .eq('user_id', userId)

  // Fire background extraction event using the current text, date, and evidence
  try {
    await inngest.send({
      name: 'journal/extraction.requested',
      data: {
        jobId: job.id,
        journalEntryId,
        userId,
        eventText: entry.event_text,
        referenceDate: entry.reference_date || null,
        evidenceIds
      }
    })
  } catch (error: any) {
    console.error('[journal/reprocess] Failed to enqueue Inngest job:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to queue background processing'
    })
  }

  return {
    journalEntryId,
    jobId: job.id,
    message: 'Reprocessing started'
  }
})

import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { JournalEntryDetail } from '~/types/journal'

export default defineEventHandler(async (event): Promise<JournalEntryDetail> => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing journal entry ID' })
  }

  const client = await serverSupabaseClient<Database>(event)

  // Handle different HTTP methods
  const method = event.method

  if (method === 'GET') {
    return await getJournalEntry(client, userId, id)
  }

  if (method === 'PATCH') {
    const body = await readBody(event)
    return await updateJournalEntry(client, userId, id, body)
  }

  if (method === 'DELETE') {
    const body = await readBody(event).catch(() => ({}))
    const options = {
      deleteEvidence: body?.deleteEvidence === true,
      deleteEvents: body?.deleteEvents !== false // Default to true
    }
    await deleteJournalEntry(client, userId, id, options)
    return { success: true } as any
  }

  throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
})

async function getJournalEntry(
  client: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>,
  userId: string,
  id: string
): Promise<JournalEntryDetail> {
  // Fetch the journal entry
  const { data: entry, error: entryError } = await client
    .from('journal_entries')
    .select(`
      id,
      event_text,
      reference_date,
      reference_time_description,
      status,
      extraction_raw,
      processing_error,
      created_at,
      updated_at,
      processed_at,
      completed_at
    `)
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (entryError || !entry) {
    throw createError({ statusCode: 404, statusMessage: 'Journal entry not found' })
  }

  // Fetch associated evidence
  const { data: entryEvidence, error: evidenceError } = await client
    .from('journal_entry_evidence')
    .select(`
      sort_order,
      is_processed,
      processed_at,
      evidence:evidence_id (
        id,
        source_type,
        storage_path,
        original_filename,
        mime_type,
        summary,
        tags,
        user_annotation,
        extraction_raw
      )
    `)
    .eq('journal_entry_id', id)
    .order('sort_order', { ascending: true })

  if (evidenceError) {
    console.error('Error fetching evidence:', evidenceError)
  }

  // Map evidence
  const evidence: JournalEntryDetail['evidence'] = []
  if (entryEvidence) {
    for (const je of entryEvidence) {
      if (je.evidence && !Array.isArray(je.evidence)) {
        evidence.push({
          id: je.evidence.id,
          sourceType: je.evidence.source_type,
          storagePath: je.evidence.storage_path,
          originalFilename: je.evidence.original_filename,
          mimeType: je.evidence.mime_type,
          summary: je.evidence.summary,
          tags: je.evidence.tags || [],
          userAnnotation: je.evidence.user_annotation,
          extractionRaw: je.evidence.extraction_raw,
          sortOrder: je.sort_order,
          isProcessed: je.is_processed,
          processedAt: je.processed_at
        })
      }
    }
  }

  return {
    id: entry.id,
    eventText: entry.event_text,
    referenceDate: entry.reference_date,
    referenceTimeDescription: entry.reference_time_description,
    status: entry.status as JournalEntryDetail['status'],
    extractionRaw: entry.extraction_raw,
    processingError: entry.processing_error,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    processedAt: entry.processed_at,
    completedAt: entry.completed_at,
    evidence
  }
}

async function updateJournalEntry(
  client: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>,
  userId: string,
  id: string,
  body: Partial<{
    eventText: string
    referenceDate: string
    referenceTimeDescription: string
    status: string
  }>
): Promise<JournalEntryDetail> {
  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (body.eventText !== undefined) {
    updates.event_text = body.eventText
  }
  if (body.referenceDate !== undefined) {
    updates.reference_date = body.referenceDate || null
  }
  if (body.referenceTimeDescription !== undefined) {
    updates.reference_time_description = body.referenceTimeDescription || null
  }
  if (body.status !== undefined) {
    updates.status = body.status
  }

  const { error: updateError } = await client
    .from('journal_entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)

  if (updateError) {
    console.error('Error updating journal entry:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update journal entry' })
  }

  // Return updated entry
  return await getJournalEntry(client, userId, id)
}

async function deleteJournalEntry(
  client: Awaited<ReturnType<typeof serverSupabaseClient<Database>>>,
  userId: string,
  id: string,
  options: { deleteEvidence: boolean; deleteEvents: boolean }
): Promise<void> {
  // Get evidence IDs linked to this journal entry (for potential deletion)
  const { data: evidenceLinks } = await client
    .from('journal_entry_evidence')
    .select('evidence_id')
    .eq('journal_entry_id', id)

  const evidenceIds = evidenceLinks?.map(link => link.evidence_id) || []

  // Get event IDs from the job result (for potential deletion)
  let eventIds: string[] = []
  if (options.deleteEvents) {
    const { data: job } = await client
      .from('jobs')
      .select('result_summary')
      .eq('journal_entry_id', id)
      .eq('user_id', userId)
      .maybeSingle()

    if (job?.result_summary && typeof job.result_summary === 'object') {
      const summary = job.result_summary as { event_ids?: string[] }
      eventIds = summary.event_ids || []
    }
  }

  // Delete events if requested (and we found any)
  if (options.deleteEvents && eventIds.length > 0) {
    // Delete related records first (cascade doesn't handle all of these)
    await client
      .from('event_participants')
      .delete()
      .in('event_id', eventIds)

    await client
      .from('evidence_mentions')
      .delete()
      .in('event_id', eventIds)

    await client
      .from('event_evidence')
      .delete()
      .in('event_id', eventIds)

    await client
      .from('action_items')
      .delete()
      .in('event_id', eventIds)

    // Delete the events themselves
    const { error: eventsError } = await client
      .from('events')
      .delete()
      .in('id', eventIds)
      .eq('user_id', userId)

    if (eventsError) {
      console.error('Error deleting events:', eventsError)
    }
  }

  // Delete journal_entry_evidence links
  await client
    .from('journal_entry_evidence')
    .delete()
    .eq('journal_entry_id', id)

  // Delete evidence files if requested
  if (options.deleteEvidence && evidenceIds.length > 0) {
    // First remove any event_evidence links to this evidence
    await client
      .from('event_evidence')
      .delete()
      .in('evidence_id', evidenceIds)

    // Delete the evidence records
    const { error: evidenceError } = await client
      .from('evidence')
      .delete()
      .in('id', evidenceIds)
      .eq('user_id', userId)

    if (evidenceError) {
      console.error('Error deleting evidence:', evidenceError)
    }
  }

  // Delete the journal entry
  const { error: deleteError } = await client
    .from('journal_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (deleteError) {
    console.error('Error deleting journal entry:', deleteError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete journal entry' })
  }
}


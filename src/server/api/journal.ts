import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

export interface JournalEntry {
  id: string
  eventText: string | null
  referenceDate: string | null
  referenceTimeDescription: string | null
  status: 'draft' | 'processing' | 'review' | 'completed' | 'cancelled'
  /**
   * High-level categories inferred from extracted events in extraction_raw.
   * Used for journal filters like "incident", "school", "medical", etc.
   */
  eventTypes: Database['public']['Enums']['event_type'][]
  createdAt: string
  updatedAt: string
  processedAt: string | null
  completedAt: string | null
  evidenceCount: number
  evidence: Array<{
    id: string
    sourceType: string
    originalFilename: string | null
    summary: string | null
    sortOrder: number
  }>
}

export default defineEventHandler(async (event): Promise<JournalEntry[]> => {
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const client = await serverSupabaseClient<Database>(event)

  // Fetch all journal entries for this user
  const { data: entries, error: entriesError } = await client
    .from('journal_entries')
    .select(`
      id,
      event_text,
      reference_date,
      reference_time_description,
      status,
      extraction_raw,
      created_at,
      updated_at,
      processed_at,
      completed_at
    `)
    .eq('user_id', userId)
    .order('reference_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (entriesError) {
    console.error('Error fetching journal entries:', entriesError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch journal entries' })
  }

  if (!entries || entries.length === 0) {
    return []
  }

  // Fetch evidence for each journal entry
  const entryIds = entries.map(e => e.id)
  
  const { data: entryEvidence, error: evidenceError } = await client
    .from('journal_entry_evidence')
    .select(`
      journal_entry_id,
      sort_order,
      evidence:evidence_id (
        id,
        source_type,
        original_filename,
        summary
      )
    `)
    .in('journal_entry_id', entryIds)
    .order('sort_order', { ascending: true })

  if (evidenceError) {
    console.error('Error fetching journal entry evidence:', evidenceError)
    // Continue without evidence data
  }

  // Group evidence by journal_entry_id
  const evidenceByEntry = new Map<string, JournalEntry['evidence']>()
  if (entryEvidence) {
    for (const je of entryEvidence) {
      const existing = evidenceByEntry.get(je.journal_entry_id) || []
      if (je.evidence && !Array.isArray(je.evidence)) {
        existing.push({
          id: je.evidence.id,
          sourceType: je.evidence.source_type,
          originalFilename: je.evidence.original_filename,
          summary: je.evidence.summary,
          sortOrder: je.sort_order
        })
      }
      evidenceByEntry.set(je.journal_entry_id, existing)
    }
  }

  // Map to response format
  return entries.map(entry => {
    const evidence = evidenceByEntry.get(entry.id) || []

    // Derive high-level event categories from extraction_raw, if present
    const raw = (entry as any).extraction_raw as any | null
    const eventTypes: JournalEntry['eventTypes'] = []

    if (raw && Array.isArray(raw.events)) {
      for (const ev of raw.events) {
        const type = ev?.type as Database['public']['Enums']['event_type'] | undefined
        if (type && !eventTypes.includes(type)) {
          eventTypes.push(type)
        }
      }
    }

    return {
      id: entry.id,
      eventText: entry.event_text,
      referenceDate: entry.reference_date,
      referenceTimeDescription: entry.reference_time_description,
      status: entry.status as JournalEntry['status'],
      eventTypes,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
      processedAt: entry.processed_at,
      completedAt: entry.completed_at,
      evidenceCount: evidence.length,
      evidence
    }
  })
})


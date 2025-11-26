import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

export interface JournalEntry {
  id: string
  eventText: string | null
  referenceDate: string | null
  referenceTimeDescription: string | null
  status: 'draft' | 'processing' | 'review' | 'completed' | 'cancelled'
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

  // Fetch all captures (journal entries) for this user
  const { data: captures, error: capturesError } = await client
    .from('captures')
    .select(`
      id,
      event_text,
      reference_date,
      reference_time_description,
      status,
      created_at,
      updated_at,
      processed_at,
      completed_at
    `)
    .eq('user_id', userId)
    .order('reference_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (capturesError) {
    console.error('Error fetching journal entries:', capturesError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch journal entries' })
  }

  if (!captures || captures.length === 0) {
    return []
  }

  // Fetch evidence for each capture
  const captureIds = captures.map(c => c.id)
  
  const { data: captureEvidence, error: evidenceError } = await client
    .from('capture_evidence')
    .select(`
      capture_id,
      sort_order,
      evidence:evidence_id (
        id,
        source_type,
        original_filename,
        summary
      )
    `)
    .in('capture_id', captureIds)
    .order('sort_order', { ascending: true })

  if (evidenceError) {
    console.error('Error fetching capture evidence:', evidenceError)
    // Continue without evidence data
  }

  // Group evidence by capture_id
  const evidenceByCapture = new Map<string, JournalEntry['evidence']>()
  if (captureEvidence) {
    for (const ce of captureEvidence) {
      const existing = evidenceByCapture.get(ce.capture_id) || []
      if (ce.evidence && !Array.isArray(ce.evidence)) {
        existing.push({
          id: ce.evidence.id,
          sourceType: ce.evidence.source_type,
          originalFilename: ce.evidence.original_filename,
          summary: ce.evidence.summary,
          sortOrder: ce.sort_order
        })
      }
      evidenceByCapture.set(ce.capture_id, existing)
    }
  }

  // Map to response format
  return captures.map(capture => {
    const evidence = evidenceByCapture.get(capture.id) || []
    return {
      id: capture.id,
      eventText: capture.event_text,
      referenceDate: capture.reference_date,
      referenceTimeDescription: capture.reference_time_description,
      status: capture.status as JournalEntry['status'],
      createdAt: capture.created_at,
      updatedAt: capture.updated_at,
      processedAt: capture.processed_at,
      completedAt: capture.completed_at,
      evidenceCount: evidence.length,
      evidence
    }
  })
})


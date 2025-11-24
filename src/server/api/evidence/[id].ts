import type { EvidenceItem } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

type EvidenceRow = Tables<'evidence'>
type EventEvidenceRow = Tables<'event_evidence'>
type CommunicationRow = Tables<'communications'>

function mapSourceType(rawType: string | null): EvidenceItem['sourceType'] {
  const normalized = rawType || 'other'

  // Keep this in sync with /api/evidence.ts so list and detail views
  // present the same source type for a given database value.
  if (normalized === 'recording' || normalized === 'other') {
    return 'document'
  }

  return normalized as EvidenceItem['sourceType']
}

interface EvidenceDetailResponse extends EvidenceItem {
  // Additional fields from the database
  storagePath?: string
  mimeType?: string
  updatedAt: string
  
  // Related data
  relatedEvents?: Array<{
    id: string
    type: string
    title: string
    timestamp: string
    isPrimary: boolean
  }>
  
  relatedCommunications?: Array<{
    id: string
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

function mapEvidenceToDetailResponse(
  row: EvidenceRow,
  relatedEvents: any[],
  relatedCommunications: CommunicationRow[]
): EvidenceDetailResponse {
  const sourceType = mapSourceType(row.source_type)
  
  const typeLabels: Record<string, string> = {
    text: 'Text message',
    email: 'Email communication',
    document: 'Legal document',
    photo: 'Photo evidence',
    recording: 'Recording',
    other: 'Evidence item'
  }
  
  const originalName = row.original_filename ||
    typeLabels[sourceType] ||
    'Evidence item'
  
  return {
    id: row.id,
    sourceType,
    originalName,
    createdAt: row.created_at,
    summary: row.summary || '',
    tags: (row.tags ?? []) as string[],
    
    // Additional fields
    storagePath: row.storage_path || undefined,
    mimeType: row.mime_type || undefined,
    updatedAt: row.updated_at,
    
    // Related data
    relatedEvents: relatedEvents.map(e => ({
      id: e.id,
      type: e.type,
      title: e.title || 'Untitled Event',
      timestamp: e.primary_timestamp || e.created_at,
      isPrimary: e.is_primary || false
    })),
    
    relatedCommunications: relatedCommunications.map(c => ({
      id: c.id,
      medium: c.medium,
      direction: c.direction,
      subject: c.subject || undefined,
      summary: c.summary,
      sentAt: c.sent_at || undefined
    }))
  }
}

export default eventHandler(async (event): Promise<EvidenceDetailResponse> => {
  const supabase = await serverSupabaseServiceRole(event)
  const evidenceIdParam = getRouterParam(event, 'id')

  if (!evidenceIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Evidence ID is required.'
    })
  }

  // Allow both numeric (dev seed) and UUID-style IDs.
  // Supabase is strict about type matching in filters, so we coerce accordingly.
  const evidenceId: string | number = /^\d+$/.test(evidenceIdParam)
    ? Number(evidenceIdParam)
    : evidenceIdParam
  
  if (!evidenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Evidence ID is required.'
    })
  }

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Fetch the evidence
  const { data: evidenceRow, error: evidenceError } = await supabase
    .from('evidence')
    .select('*')
    .eq('id', evidenceId)
    .eq('user_id', userId)
    .single()

  if (evidenceError || !evidenceRow) {
    console.error('Supabase select evidence error (evidence detail):', evidenceError)
    throw createError({
      statusCode: 404,
      statusMessage: 'Evidence not found.'
    })
  }

  // Fetch all related data in parallel
  const [
    { data: eventEvidenceRows, error: eventEvidenceError },
    { data: communicationsRows, error: communicationsError }
  ] = await Promise.all([
    supabase
      .from('event_evidence')
      .select(`
        *,
        events!inner (
          id,
          type,
          title,
          primary_timestamp,
          created_at
        )
      `)
      .eq('evidence_id', evidenceId)
      .eq('events.user_id', userId),
    
    supabase
      .from('communications')
      .select('*')
      .eq('evidence_id', evidenceId)
      .eq('user_id', userId)
  ])

  // Log any errors but don't fail the request
  if (eventEvidenceError) console.error('Error fetching related events:', eventEvidenceError)
  if (communicationsError) console.error('Error fetching related communications:', communicationsError)

  // Process related events
  const relatedEvents = (eventEvidenceRows || []).map((row: any) => ({
    ...row.events,
    is_primary: row.is_primary
  }))

  return mapEvidenceToDetailResponse(
    evidenceRow as EvidenceRow,
    relatedEvents,
    (communicationsRows || []) as CommunicationRow[]
  )
})

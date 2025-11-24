import type { TimelineEvent } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

type EventRow = Tables<'events'>
type EventParticipantRow = Tables<'event_participants'>
type EventEvidenceRow = Tables<'event_evidence'>
type EvidenceMentionRow = Tables<'evidence_mentions'>
type ActionItemRow = Tables<'action_items'>
type CommunicationRow = Tables<'communications'>

interface EventDetailResponse extends TimelineEvent {
  // Additional fields from the database
  childInvolved?: boolean
  agreementViolation?: boolean
  safetyConcern?: boolean
  welfareImpact?: string
  durationMinutes?: number
  timestampPrecision?: string
  createdAt: string
  updatedAt: string
  
  // Related data
  evidenceDetails?: Array<{
    id: string
    sourceType: string
    originalName?: string
    summary?: string
    tags: string[]
    isPrimary: boolean
  }>
  
  evidenceMentions?: Array<{
    id: string
    type: string
    description: string
    status: string
  }>
  
  actionItems?: Array<{
    id: string
    priority: string
    type: string
    description: string
    deadline?: string
    status: string
  }>
  
  communications?: Array<{
    id: string
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

function mapEventToDetailResponse(
  row: EventRow,
  participants: string[],
  evidenceRows: any[],
  evidenceMentions: EvidenceMentionRow[],
  actionItems: ActionItemRow[],
  communications: CommunicationRow[]
): EventDetailResponse {
  return {
    id: row.id,
    timestamp: row.primary_timestamp || row.created_at,
    type: row.type as TimelineEvent['type'],
    title: row.title || 'Untitled Event',
    description: row.description || '',
    participants,
    location: row.location || undefined,
    evidenceIds: evidenceRows.map(e => e.evidence_id),
    
    // Additional fields
    childInvolved: row.child_involved || undefined,
    agreementViolation: row.agreement_violation || undefined,
    safetyConcern: row.safety_concern || undefined,
    welfareImpact: row.welfare_impact || undefined,
    durationMinutes: row.duration_minutes || undefined,
    timestampPrecision: row.timestamp_precision || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    
    // Related data
    evidenceDetails: evidenceRows.map(e => ({
      id: e.evidence_id,
      sourceType: e.source_type || 'unknown',
      originalName: e.original_filename,
      summary: e.summary,
      tags: e.tags || [],
      isPrimary: e.is_primary || false
    })),
    
    evidenceMentions: evidenceMentions.map(em => ({
      id: em.id,
      type: em.type,
      description: em.description,
      status: em.status
    })),
    
    actionItems: actionItems.map(ai => ({
      id: ai.id,
      priority: ai.priority,
      type: ai.type,
      description: ai.description,
      deadline: ai.deadline || undefined,
      status: ai.status
    })),
    
    communications: communications.map(c => ({
      id: c.id,
      medium: c.medium,
      direction: c.direction,
      subject: c.subject || undefined,
      summary: c.summary,
      sentAt: c.sent_at || undefined
    }))
  }
}

export default eventHandler(async (event): Promise<EventDetailResponse> => {
  const supabase = await serverSupabaseServiceRole(event)
  const eventId = getRouterParam(event, 'id')
  
  if (!eventId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Event ID is required.'
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

  // Fetch the event
  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('user_id', userId)
    .single()

  if (eventError || !eventRow) {
    console.error('Supabase select event error (event detail):', eventError)
    throw createError({
      statusCode: 404,
      statusMessage: 'Event not found.'
    })
  }

  // Fetch all related data in parallel
  const [
    { data: participantsRows, error: participantsError },
    { data: evidenceRows, error: evidenceError },
    { data: evidenceMentionsRows, error: evidenceMentionsError },
    { data: actionItemsRows, error: actionItemsError },
    { data: communicationsRows, error: communicationsError }
  ] = await Promise.all([
    supabase
      .from('event_participants')
      .select('*')
      .eq('event_id', eventId),
    
    supabase
      .from('event_evidence')
      .select(`
        *,
        evidence (*)
      `)
      .eq('event_id', eventId),
    
    supabase
      .from('evidence_mentions')
      .select('*')
      .eq('event_id', eventId),
    
    supabase
      .from('action_items')
      .select('*')
      .eq('event_id', eventId),
    
    supabase
      .from('communications')
      .select('*')
      .eq('event_id', eventId)
  ])

  // Log any errors but don't fail the request
  if (participantsError) console.error('Error fetching participants:', participantsError)
  if (evidenceError) console.error('Error fetching evidence:', evidenceError)
  if (evidenceMentionsError) console.error('Error fetching evidence mentions:', evidenceMentionsError)
  if (actionItemsError) console.error('Error fetching action items:', actionItemsError)
  if (communicationsError) console.error('Error fetching communications:', communicationsError)

  // Extract participant labels
  const participants = (participantsRows || []).map(p => p.label)
  
  // Process evidence with details
  const evidenceDetails = (evidenceRows || []).map((row: any) => ({
    evidence_id: row.evidence_id,
    is_primary: row.is_primary,
    source_type: row.evidence?.source_type,
    original_filename: row.evidence?.original_filename,
    summary: row.evidence?.summary,
    tags: row.evidence?.tags
  }))

  return mapEventToDetailResponse(
    eventRow as EventRow,
    participants,
    evidenceDetails,
    (evidenceMentionsRows || []) as EvidenceMentionRow[],
    (actionItemsRows || []) as ActionItemRow[],
    (communicationsRows || []) as CommunicationRow[]
  )
})

import type { Tables } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type EventRow = Tables<'events'> & {
  type_v2?: string | null
  welfare_category?: string | null
  welfare_direction?: string | null
  welfare_severity?: string | null
  child_statements?: any[] | null
  coparent_interaction?: any | null
}

export interface FullEventDetail {
  id: string
  timestamp: string
  type: string
  extractionType?: string | null
  title: string
  description: string
  location?: string
  durationMinutes?: number
  childInvolved?: boolean
  agreementViolation?: boolean
  safetyConcern?: boolean
  welfareImpact?: string
  welfareCategory?: string | null
  welfareDirection?: string | null
  welfareSeverity?: string | null
  childStatements?: Array<{ statement: string; context?: string; concerning?: boolean }>
  coparentInteraction?: {
    your_tone?: string
    their_tone?: string
    your_response_appropriate?: boolean | null
  } | null
  participants: string[]
  evidenceDetails?: Array<{
    id: string
    sourceType: string
    originalName?: string
    summary?: string
  }>
  actionItems?: Array<{
    priority: string
    type: string
    description: string
    deadline?: string
    status: string
  }>
  communications?: Array<{
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

export default eventHandler(async (event): Promise<FullEventDetail[]> => {
  const supabase = await serverSupabaseClient(event)

  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const { data: eventsRows, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .order('primary_timestamp', { ascending: true, nullsFirst: false })

  if (eventsError) {
    console.error('Supabase select events error (events-full):', eventsError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load events.'
    })
  }

  const events = (eventsRows ?? []) as EventRow[]

  if (!events.length) {
    return []
  }

  const eventIds = events.map((e) => e.id)

  const [
    { data: participantsRows, error: participantsError },
    { data: evidenceRows, error: evidenceError },
    { data: actionItemsRows, error: actionItemsError },
    { data: communicationsRows, error: communicationsError }
  ] = await Promise.all([
    supabase
      .from('event_participants')
      .select('event_id, label')
      .in('event_id', eventIds),
    supabase
      .from('event_evidence')
      .select('event_id, evidence_id, evidence (id, source_type, original_filename, summary)')
      .in('event_id', eventIds),
    supabase
      .from('action_items')
      .select('event_id, priority, type, description, deadline, status')
      .in('event_id', eventIds),
    supabase
      .from('communications')
      .select('event_id, medium, direction, subject, summary, sent_at')
      .in('event_id', eventIds)
  ])

  if (participantsError) console.error('Error fetching participants (events-full):', participantsError)
  if (evidenceError) console.error('Error fetching evidence (events-full):', evidenceError)
  if (actionItemsError) console.error('Error fetching action items (events-full):', actionItemsError)
  if (communicationsError) console.error('Error fetching communications (events-full):', communicationsError)

  const participantsByEvent = new Map<string, string[]>()
  for (const row of (participantsRows ?? []) as any[]) {
    const list = participantsByEvent.get(row.event_id) ?? []
    list.push(row.label)
    participantsByEvent.set(row.event_id, list)
  }

  const evidenceByEvent = new Map<string, any[]>()
  for (const row of (evidenceRows ?? []) as any[]) {
    const list = evidenceByEvent.get(row.event_id) ?? []
    list.push(row)
    evidenceByEvent.set(row.event_id, list)
  }

  const actionsByEvent = new Map<string, any[]>()
  for (const row of (actionItemsRows ?? []) as any[]) {
    const list = actionsByEvent.get(row.event_id) ?? []
    list.push(row)
    actionsByEvent.set(row.event_id, list)
  }

  const commsByEvent = new Map<string, any[]>()
  for (const row of (communicationsRows ?? []) as any[]) {
    const list = commsByEvent.get(row.event_id) ?? []
    list.push(row)
    commsByEvent.set(row.event_id, list)
  }

  return events.map((row): FullEventDetail => {
    const participants = participantsByEvent.get(row.id) ?? []
    const evidence = evidenceByEvent.get(row.id) ?? []
    const actions = actionsByEvent.get(row.id) ?? []
    const comms = commsByEvent.get(row.id) ?? []

    return {
      id: row.id,
      timestamp: row.primary_timestamp || row.created_at,
      type: row.type,
      extractionType: (row as any).type_v2 || null,
      title: row.title || 'Untitled Event',
      description: row.description || '',
      location: row.location || undefined,
      durationMinutes: row.duration_minutes || undefined,
      childInvolved: row.child_involved || undefined,
      agreementViolation: row.agreement_violation || undefined,
      safetyConcern: row.safety_concern || undefined,
      welfareImpact: row.welfare_impact || undefined,
      welfareCategory: (row as any).welfare_category || undefined,
      welfareDirection: (row as any).welfare_direction || undefined,
      welfareSeverity: (row as any).welfare_severity || undefined,
      childStatements: (row as any).child_statements?.length ? (row as any).child_statements : undefined,
      coparentInteraction: (row as any).coparent_interaction || undefined,
      participants: participants.length ? participants : ['You'],
      evidenceDetails: evidence.length
        ? evidence.map((e: any) => ({
            id: e.evidence_id,
            sourceType: e.evidence?.source_type || 'unknown',
            originalName: e.evidence?.original_filename,
            summary: e.evidence?.summary
          }))
        : undefined,
      actionItems: actions.length
        ? actions.map((a: any) => ({
            priority: a.priority,
            type: a.type,
            description: a.description,
            deadline: a.deadline || undefined,
            status: a.status
          }))
        : undefined,
      communications: comms.length
        ? comms.map((c: any) => ({
            medium: c.medium,
            direction: c.direction,
            subject: c.subject || undefined,
            summary: c.summary,
            sentAt: c.sent_at || undefined
          }))
        : undefined
    }
  })
})

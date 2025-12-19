import type { TimelineEvent } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type EventRow = Tables<'events'> & {
  // New granular event type column added in migration 0039
  type_v2?: string | null
}
type EventParticipantRow = Tables<'event_participants'>
type EventEvidenceRow = Tables<'event_evidence'>

type ExtractionEventType =
  | 'parenting_time'
  | 'caregiving'
  | 'household'
  | 'coparent_conflict'
  | 'gatekeeping'
  | 'communication'
  | 'medical'
  | 'school'
  | 'legal'

function mapLegacyTypeToExtractionType(legacyType: EventRow['type']): ExtractionEventType {
  const mapping: Record<EventRow['type'], ExtractionEventType> = {
    incident: 'coparent_conflict',
    positive: 'parenting_time',
    medical: 'medical',
    school: 'school',
    communication: 'communication',
    legal: 'legal'
  }

  return mapping[legacyType] ?? 'parenting_time'
}

function getExtractionTypeFromRow(row: EventRow): ExtractionEventType {
  const typeV2 = (row as any).type_v2 as string | null | undefined
  if (typeV2) {
    return typeV2 as ExtractionEventType
  }

  return mapLegacyTypeToExtractionType(row.type)
}

function mapEventToTimelineEvent(
  row: EventRow,
  participants: string[],
  evidenceIds: string[]
): TimelineEvent {
  return {
    id: row.id,
    timestamp: (row.primary_timestamp as string | null) ?? (row.created_at as string),
    type: row.type as TimelineEvent['type'],
    extractionType: getExtractionTypeFromRow(row),
    title: row.title,
    description: row.description,
    participants: participants.length ? participants : ['You'],
    location: row.location ?? undefined,
    evidenceIds: evidenceIds.length ? evidenceIds : undefined
  }
}

export default eventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const {
    data: eventsRows,
    error: eventsError
  } = await supabase
    .from('events')
    .select(
      'id, type, type_v2, title, description, primary_timestamp, location, created_at'
    )
    .eq('user_id', userId)
    .order('primary_timestamp', { ascending: false, nullsFirst: false })
    .limit(100)

  if (eventsError) {
    // eslint-disable-next-line no-console
    console.error('Supabase select events error (timeline):', eventsError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load timeline events.'
    })
  }

  const events = (eventsRows ?? []) as EventRow[]

  if (!events.length) {
    return []
  }

  const eventIds = events.map((e) => e.id)

  const [
    { data: participantsRows, error: participantsError },
    { data: eventEvidenceRows, error: eventEvidenceError }
  ] = await Promise.all([
    supabase
      .from('event_participants')
      .select('event_id, label')
      .in('event_id', eventIds),
    supabase
      .from('event_evidence')
      .select('event_id, evidence_id')
      .in('event_id', eventIds)
  ])

  if (participantsError) {
    // eslint-disable-next-line no-console
    console.error('Supabase select event_participants error (timeline):', participantsError)
  }

  if (eventEvidenceError) {
    // eslint-disable-next-line no-console
    console.error('Supabase select event_evidence error (timeline):', eventEvidenceError)
  }

  const participantsByEvent = new Map<string, string[]>()
  const evidenceIdsByEvent = new Map<string, string[]>()

  for (const row of (participantsRows ?? []) as EventParticipantRow[]) {
    const list = participantsByEvent.get(row.event_id) ?? []
    list.push(row.label)
    participantsByEvent.set(row.event_id, list)
  }

  for (const row of (eventEvidenceRows ?? []) as EventEvidenceRow[]) {
    const list = evidenceIdsByEvent.get(row.event_id) ?? []
    list.push(row.evidence_id)
    evidenceIdsByEvent.set(row.event_id, list)
  }

  return events.map((row) =>
    mapEventToTimelineEvent(
      row,
      participantsByEvent.get(row.id) ?? [],
      evidenceIdsByEvent.get(row.id) ?? []
    )
  )
})



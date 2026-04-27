import type { TimelineEvent, TimelineItem, TimelineMessage } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getActiveCaseIdOrNull } from '../utils/cases'

type EventRow = Tables<'events'> & {
  // New granular event type column added in migration 0039
  type_v2?: string | null
}
type EventParticipantRow = Tables<'event_participants'>
type EventEvidenceRow = Tables<'event_evidence'>
type MessageRow = Tables<'messages'>

// Both events and messages render on the same timeline. We UNION them in
// memory because typical case sizes (≤ a few thousand items) are well within
// the limits of a 100-item paginated merge. Beyond ~5k items per case, switch
// to a SQL UNION ALL view — see the file header in Plan 01 § 3b.
const EVENT_LIMIT = 200
const MESSAGE_LIMIT = 500
const BODY_PREVIEW_CHARS = 240

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

function mapMessageToTimelineMessage(row: MessageRow): TimelineMessage {
  return {
    id: row.id,
    timestamp: row.sent_at,
    sender: row.sender,
    recipient: row.recipient,
    subject: row.subject,
    bodyPreview: row.body.length > BODY_PREVIEW_CHARS
      ? row.body.slice(0, BODY_PREVIEW_CHARS).trimEnd() + '…'
      : row.body,
    threadId: row.thread_id,
    messageNumber: row.message_number,
    evidenceId: row.evidence_id
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

  const query = getQuery(event)
  const overrideCaseId = typeof query.caseId === 'string' ? query.caseId : null
  const caseId = await getActiveCaseIdOrNull(supabase, userId, overrideCaseId)

  // No case yet → empty timeline. The user will create their first case via
  // onboarding or the sidebar's "Manage case" entry.
  if (!caseId) return [] as TimelineItem[]

  const [
    { data: eventsRows, error: eventsError },
    { data: messagesRows, error: messagesError }
  ] = await Promise.all([
    supabase
      .from('events')
      .select('id, type, type_v2, title, description, primary_timestamp, location, created_at, case_id, user_id')
      .eq('case_id', caseId)
      .order('primary_timestamp', { ascending: false, nullsFirst: false })
      .limit(EVENT_LIMIT),
    supabase
      .from('messages')
      .select('id, sent_at, sender, recipient, subject, body, thread_id, message_number, evidence_id, case_id, user_id, sequence_number, attachments, first_viewed_at, word_count, created_at')
      .eq('case_id', caseId)
      .order('sent_at', { ascending: false })
      .limit(MESSAGE_LIMIT)
  ])

  if (eventsError) {
    // eslint-disable-next-line no-console
    console.error('Supabase select events error (timeline):', eventsError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load timeline events.'
    })
  }
  if (messagesError) {
    // eslint-disable-next-line no-console
    console.error('Supabase select messages error (timeline):', messagesError)
  }

  const events = (eventsRows ?? []) as EventRow[]
  const messages = (messagesRows ?? []) as MessageRow[]

  let eventItems: ({ kind: 'event' } & TimelineEvent)[] = []
  if (events.length) {
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

    eventItems = events.map((row) => ({
      kind: 'event' as const,
      ...mapEventToTimelineEvent(
        row,
        participantsByEvent.get(row.id) ?? [],
        evidenceIdsByEvent.get(row.id) ?? []
      )
    }))
  }

  const messageItems: ({ kind: 'message' } & TimelineMessage)[] = messages.map((row) => ({
    kind: 'message' as const,
    ...mapMessageToTimelineMessage(row)
  }))

  // Merge by timestamp desc; ties broken by id for stability.
  const merged: TimelineItem[] = [...eventItems, ...messageItems].sort((a, b) => {
    if (a.timestamp === b.timestamp) return a.id < b.id ? 1 : -1
    return a.timestamp < b.timestamp ? 1 : -1
  })

  return merged
})



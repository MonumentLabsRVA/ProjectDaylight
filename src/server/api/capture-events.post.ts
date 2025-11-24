import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

interface ExtractionEventParticipantGroups {
  primary?: string[]
  witnesses?: string[]
  professionals?: string[]
}

interface ExtractionCustodyRelevance {
  agreement_violation?: boolean | null
  safety_concern?: boolean | null
  welfare_impact?: string | null
}

interface ExtractionEvidenceMention {
  type: 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other'
  description: string
  status: 'have' | 'need_to_get' | 'need_to_create'
}

interface ExtractionEvent {
  type: 'incident' | 'positive' | 'medical' | 'school' | 'communication' | 'legal'
  title: string
  description: string
  primary_timestamp?: string | null
  timestamp_precision?: 'exact' | 'day' | 'approximate' | 'unknown'
  duration_minutes?: number | null
  location?: string | null
  participants?: ExtractionEventParticipantGroups
  child_involved?: boolean
  evidence_mentioned?: ExtractionEvidenceMention[]
  patterns_noted?: string[]
  custody_relevance?: ExtractionCustodyRelevance
}

interface ExtractionPayload {
  events?: ExtractionEvent[]
  // action_items and metadata are currently stored only inside extraction_raw
  // on the voice_recordings row for debugging / future features.
}

interface CaptureEventsBody {
  transcript: string
  extraction: ExtractionPayload
  recordingId?: string | null
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseServiceRole(event)
  const authUser = await serverSupabaseUser(event)

  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const body = await readBody<CaptureEventsBody>(event)

  if (!body?.transcript?.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Transcript is required to save events.'
    })
  }

  const events = body.extraction?.events ?? []

  if (!events.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No events were provided in the extraction payload.'
    })
  }

  // Optionally attach extraction JSON to the voice_recordings row
  if (body.recordingId) {
    const { error: updateError } = await supabase
      .from('voice_recordings')
      .update({
        extraction_raw: body.extraction,
        transcript: body.transcript
      })
      .eq('id', body.recordingId)
      .eq('user_id', userId)

    if (updateError) {
      // eslint-disable-next-line no-console
      console.error('Failed to attach extraction to voice_recordings:', updateError)
    }
  }

  const eventsToInsert = events.map((e) => ({
    user_id: userId,
    recording_id: body.recordingId ?? null,
    type: e.type,
    title: e.title || 'Untitled event',
    description: e.description || body.transcript,
    primary_timestamp: e.primary_timestamp ?? null,
    timestamp_precision: e.timestamp_precision ?? 'unknown',
    duration_minutes: e.duration_minutes ?? null,
    location: e.location ?? null,
    child_involved: e.child_involved ?? false,
    agreement_violation: e.custody_relevance?.agreement_violation ?? null,
    safety_concern: e.custody_relevance?.safety_concern ?? null,
    welfare_impact: (e.custody_relevance?.welfare_impact as any) ?? 'unknown'
  }))

  const { data: insertedEvents, error: insertEventsError } = await supabase
    .from('events')
    .insert(eventsToInsert)
    .select('id')

  if (insertEventsError) {
    // eslint-disable-next-line no-console
    console.error('Failed to insert events:', insertEventsError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save events to timeline.'
    })
  }

  const participantsToInsert: {
    user_id: string
    event_id: string
    role: 'primary' | 'witness' | 'professional'
    label: string
  }[] = []

  const evidenceMentionsToInsert: {
    user_id: string
    event_id: string
    type: ExtractionEvidenceMention['type']
    description: string
    status: ExtractionEvidenceMention['status']
  }[] = []

  insertedEvents.forEach((inserted, index) => {
    const source = events[index]
    const eventId = inserted.id as string

    if (source.participants) {
      source.participants.primary?.forEach((label) => {
        if (!label) return
        participantsToInsert.push({
          user_id: userId,
          event_id: eventId,
          role: 'primary',
          label
        })
      })

      source.participants.witnesses?.forEach((label) => {
        if (!label) return
        participantsToInsert.push({
          user_id: userId,
          event_id: eventId,
          role: 'witness',
          label
        })
      })

      source.participants.professionals?.forEach((label) => {
        if (!label) return
        participantsToInsert.push({
          user_id: userId,
          event_id: eventId,
          role: 'professional',
          label
        })
      })
    }

    source.evidence_mentioned?.forEach((mention) => {
      if (!mention?.description) return

      evidenceMentionsToInsert.push({
        user_id: userId,
        event_id: eventId,
        type: mention.type,
        description: mention.description,
        status: mention.status
      })
    })
  })

  if (participantsToInsert.length) {
    const { error: participantsError } = await supabase
      .from('event_participants')
      .insert(participantsToInsert)

    if (participantsError) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert event participants:', participantsError)
    }
  }

  if (evidenceMentionsToInsert.length) {
    const { error: mentionsError } = await supabase
      .from('evidence_mentions')
      .insert(evidenceMentionsToInsert)

    if (mentionsError) {
      // eslint-disable-next-line no-console
      console.error('Failed to insert evidence mentions:', mentionsError)
    }
  }

  return {
    createdEventIds: insertedEvents.map(e => e.id)
  }
}
)



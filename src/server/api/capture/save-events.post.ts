import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * POST /api/capture/save-events
 * 
 * Saves the extracted events to the database and links them to evidence.
 * This is called after the user reviews and confirms the extraction.
 */

interface ExtractionParticipants {
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
  participants?: ExtractionParticipants
  child_involved?: boolean
  evidence_mentioned?: ExtractionEvidenceMention[]
  patterns_noted?: string[]
  custody_relevance?: ExtractionCustodyRelevance
}

interface ExtractionActionItem {
  priority: 'urgent' | 'high' | 'normal' | 'low'
  type: 'document' | 'contact' | 'file' | 'obtain' | 'other'
  description: string
  deadline?: string | null
}

interface ExtractionPayload {
  events?: ExtractionEvent[]
  action_items?: ExtractionActionItem[]
}

interface SaveEventsBody {
  extraction: ExtractionPayload
  evidenceIds?: string[]
  // Journal entry data
  eventText?: string
  referenceDate?: string
  referenceTimeDescription?: string
}

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Get authenticated user
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const body = await readBody<SaveEventsBody>(event)
  const events = body?.extraction?.events || []
  const actionItems = body?.extraction?.action_items || []
  const evidenceIds = body?.evidenceIds || []
  const eventText = body?.eventText
  const referenceDate = body?.referenceDate
  const referenceTimeDescription = body?.referenceTimeDescription

  if (!events.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No events to save.'
    })
  }

  try {
    // Create a journal entry record to preserve the original narrative
    let journalEntryId: string | null = null
    if (eventText) {
      const { data: entryData, error: entryError } = await supabase
        .from('journal_entries')
        .insert({
          user_id: userId,
          event_text: eventText,
          reference_date: referenceDate || null,
          reference_time_description: referenceTimeDescription || null,
          status: 'completed',
          extraction_raw: body.extraction,
          processed_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
        .select('id')
        .single()

      if (entryError) {
        console.error('Failed to create journal entry record:', entryError)
        // Don't fail the whole operation, just log
      } else {
        journalEntryId = entryData?.id || null
      }

      // Link evidence to the journal entry record
      if (journalEntryId && evidenceIds.length) {
        const entryEvidenceLinks = evidenceIds.map((evidenceId, index) => ({
          journal_entry_id: journalEntryId,
          evidence_id: evidenceId,
          sort_order: index,
          is_processed: true,
          processed_at: new Date().toISOString()
        }))

        const { error: entryLinkError } = await supabase
          .from('journal_entry_evidence')
          .insert(entryEvidenceLinks)

        if (entryLinkError) {
          console.error('Failed to link evidence to journal entry:', entryLinkError)
        }
      }
    }

    // Insert events
    const eventsToInsert = events.map((e) => ({
      user_id: userId,
      recording_id: null,
      type: e.type,
      title: e.title || 'Untitled event',
      description: e.description,
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
      console.error('Failed to insert events:', insertEventsError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to save events.'
      })
    }

    const createdEventIds = (insertedEvents ?? []).map((row: any) => row.id as string)

    // Insert participants and evidence mentions
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

    createdEventIds.forEach((eventId, index) => {
      const source = events[index]
      if (!source) return

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
        console.error('Failed to insert participants:', participantsError)
      }
    }

    if (evidenceMentionsToInsert.length) {
      const { error: mentionsError } = await supabase
        .from('evidence_mentions')
        .insert(evidenceMentionsToInsert)

      if (mentionsError) {
        console.error('Failed to insert evidence mentions:', mentionsError)
      }
    }

    // Link evidence to events via event_evidence junction table
    // Link all provided evidence to all created events (they're all part of the same capture)
    if (evidenceIds.length && createdEventIds.length) {
      const eventEvidenceLinks: {
        event_id: string
        evidence_id: string
        is_primary: boolean
      }[] = []

      for (const eventId of createdEventIds) {
        for (let i = 0; i < evidenceIds.length; i++) {
          eventEvidenceLinks.push({
            event_id: eventId,
            evidence_id: evidenceIds[i],
            is_primary: i === 0 // First evidence is primary
          })
        }
      }

      const { error: linkError } = await supabase
        .from('event_evidence')
        .insert(eventEvidenceLinks)

      if (linkError) {
        console.error('Failed to link evidence to events:', linkError)
      }
    }

    // Insert action items if any
    if (actionItems.length) {
      const actionItemsToInsert = actionItems.map((item) => ({
        user_id: userId,
        event_id: createdEventIds[0] ?? null, // Link to first event
        priority: item.priority,
        type: item.type,
        description: item.description,
        deadline: item.deadline ?? null,
        status: 'open' as const
      }))

      const { error: actionItemsError } = await supabase
        .from('action_items')
        .insert(actionItemsToInsert)

      if (actionItemsError) {
        console.error('Failed to insert action items:', actionItemsError)
      }
    }

    return {
      createdEventIds,
      linkedEvidenceCount: evidenceIds.length,
      journalEntryId
    }
  } catch (error: any) {
    console.error('Save events error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to save events. Please try again.'
    })
  }
})


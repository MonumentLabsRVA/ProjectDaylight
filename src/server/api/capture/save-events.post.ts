import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { canCreateJournalEntry } from '../../utils/subscription'

/**
 * POST /api/capture/save-events
 *
 * Saves the extracted events to the database and links them to evidence.
 * This is called after the user reviews and confirms the extraction.
 *
 * Feature gating: Free users limited to 5 journal entries.
 *
 * NOTE: The extraction schema here is aligned with the LLM extraction
 * schema used in `extract-events.post.ts` and the background
 * `journal-extraction` Inngest function. We dual-write to both the new
 * structured columns (type_v2, welfare_*, child_statements, etc.) and
 * the legacy enum columns for backward compatibility.
 */

type ExtractionEvidenceType = 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other'
type ExtractionEvidenceStatus = 'have' | 'need_to_get' | 'need_to_create'

interface ExtractionParticipants {
  primary?: string[]
  witnesses?: string[]
  professionals?: string[]
}

interface ExtractionChildStatement {
  statement: string
  context: string
  concerning: boolean
}

type ExtractionTone = 'neutral' | 'cooperative' | 'defensive' | 'hostile'

interface ExtractionCoparentInteraction {
  your_tone: ExtractionTone | null
  their_tone: ExtractionTone | null
  your_response_appropriate: boolean | null
}

type ExtractionPatternType =
  | 'schedule_violation'
  | 'communication_failure'
  | 'escalating_hostility'
  | 'delegation_of_parenting'
  | 'routine_disruption'
  | 'information_withholding'
  | 'unilateral_decisions'

type ExtractionPatternFrequency = 'first_time' | 'recurring' | 'chronic'

interface ExtractionPatternNoted {
  pattern_type: ExtractionPatternType
  description: string
  frequency: ExtractionPatternFrequency | null
}

type ExtractionWelfareCategory =
  | 'routine'
  | 'emotional'
  | 'medical'
  | 'educational'
  | 'social'
  | 'safety'
  | 'none'

type ExtractionWelfareDirection = 'positive' | 'negative' | 'neutral'
type ExtractionWelfareSeverity = 'minimal' | 'moderate' | 'significant'

interface ExtractionWelfareImpact {
  category: ExtractionWelfareCategory
  direction: ExtractionWelfareDirection
  severity: ExtractionWelfareSeverity | null
}

interface ExtractionCustodyRelevance {
  agreement_violation?: boolean | null
  safety_concern?: boolean | null
  welfare_impact?: ExtractionWelfareImpact
}

interface ExtractionEvidenceMention {
  type: ExtractionEvidenceType
  description: string
  status: ExtractionEvidenceStatus
}

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

interface ExtractionEvent {
  type: ExtractionEventType
  title: string
  description: string
  primary_timestamp?: string | null
  timestamp_precision?: 'exact' | 'day' | 'approximate' | 'unknown'
  duration_minutes?: number | null
  location?: string | null
  participants?: ExtractionParticipants
  child_involved?: boolean
  evidence_mentioned?: ExtractionEvidenceMention[]
  child_statements?: ExtractionChildStatement[]
  coparent_interaction?: ExtractionCoparentInteraction | null
  patterns_noted?: ExtractionPatternNoted[]
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

  // Check if user can create journal entries (feature gating)
  const journalCheck = await canCreateJournalEntry(event, userId)
  if (!journalCheck.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: journalCheck.reason || 'Journal entry limit reached. Please upgrade to Pro.'
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

    // Insert events (dual-write to legacy and new schema columns)
    const eventsToInsert = events.map((e) => {
      const welfareImpact = e.custody_relevance?.welfare_impact

      return {
        user_id: userId,
        recording_id: null,
        // New granular type column
        type_v2: e.type,
        // Legacy type column for backward compatibility
        type: mapNewToLegacyType(e.type),
        title: e.title || 'Untitled event',
        description: e.description,
        primary_timestamp: e.primary_timestamp ?? null,
        timestamp_precision: e.timestamp_precision ?? 'unknown',
        duration_minutes: e.duration_minutes ?? null,
        location: e.location ?? null,
        child_involved: e.child_involved ?? false,
        agreement_violation: e.custody_relevance?.agreement_violation ?? null,
        safety_concern: e.custody_relevance?.safety_concern ?? null,
        // New structured welfare impact columns
        welfare_category: welfareImpact?.category ?? null,
        welfare_direction: welfareImpact?.direction ?? null,
        welfare_severity: welfareImpact?.severity ?? null,
        // Legacy welfare_impact enum for backward compatibility
        welfare_impact: mapNewToLegacyWelfare(welfareImpact) ?? 'unknown',
        // New JSONB enrichment fields
        child_statements: e.child_statements ?? [],
        coparent_interaction: e.coparent_interaction ?? null,
        patterns_noted_v2: e.patterns_noted ?? []
      }
    })

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

    // Link evidence to events via event_evidence junction table.
    // IMPORTANT: Avoid a cartesian product (all evidence -> all events), which makes evidence appear
    // "attached to everything" and creates confusing UI relationships.
    //
    // We only auto-link when there is exactly one created event; otherwise we keep evidence scoped to
    // the journal entry (journal_entry_evidence) and allow explicit linking later.
    if (evidenceIds.length && createdEventIds.length === 1) {
      const eventEvidenceLinks: {
        event_id: string
        evidence_id: string
        is_primary: boolean
      }[] = []

      const eventId = createdEventIds[0]!
      for (let i = 0; i < evidenceIds.length; i++) {
        eventEvidenceLinks.push({
          event_id: eventId,
          evidence_id: evidenceIds[i],
          is_primary: i === 0 // First evidence is primary
        })
      }

      const { error: linkError } = await supabase
        .from('event_evidence')
        .insert(eventEvidenceLinks)

      if (linkError) {
        console.error('Failed to link evidence to events:', linkError)
      }
    } else if (evidenceIds.length && createdEventIds.length > 1) {
      console.info(
        `[capture/save-events] Skipping auto-linking ${evidenceIds.length} evidence item(s) to ${createdEventIds.length} events to avoid over-linking.`
      )
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

function mapNewToLegacyType(newType: ExtractionEventType): 'incident' | 'positive' | 'medical' | 'school' | 'communication' | 'legal' {
  const mapping: Record<ExtractionEventType, 'incident' | 'positive' | 'medical' | 'school' | 'communication' | 'legal'> = {
    parenting_time: 'positive',
    caregiving: 'positive',
    household: 'positive',
    coparent_conflict: 'incident',
    gatekeeping: 'incident',
    communication: 'communication',
    medical: 'medical',
    school: 'school',
    legal: 'legal'
  }

  return mapping[newType] ?? 'incident'
}

function mapNewToLegacyWelfare(
  welfareImpact: ExtractionWelfareImpact | undefined
): 'none' | 'minor' | 'moderate' | 'significant' | 'positive' | 'unknown' | null {
  if (!welfareImpact) return null

  if (welfareImpact.direction === 'positive') {
    return 'positive'
  }

  if (welfareImpact.direction === 'neutral') {
    return 'none'
  }

  if (welfareImpact.severity === 'minimal') return 'minor'
  if (welfareImpact.severity === 'moderate') return 'moderate'
  if (welfareImpact.severity === 'significant') return 'significant'

  return 'unknown'
}


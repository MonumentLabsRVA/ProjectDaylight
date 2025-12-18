import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { inngest } from '../client'
import type { Database } from '~/types/database.types'

type PublicClient = SupabaseClient<Database, 'public'>

interface JournalExtractionEvent {
  name: 'journal/extraction.requested'
  data: {
    jobId: string
    journalEntryId: string
    userId: string
    eventText: string
    referenceDate?: string | null
    evidenceIds?: string[]
  }
}

interface EvidenceSummary {
  evidenceId: string
  annotation: string
  summary: string
}

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

interface JobResultSummary {
  events_created: number
  evidence_processed: number
  action_items_created: number
  event_ids: string[]
}

// Shared Zod schemas reused from the capture extraction endpoint
const ParticipantsSchema = z.object({
  primary: z.array(z.enum(['co-parent', 'child', 'self', 'other'])).describe('Primary participants'),
  witnesses: z.array(z.string()).describe('Witnesses present'),
  professionals: z.array(z.string()).describe('Professionals involved')
})

const CustodyRelevanceSchema = z.object({
  agreement_violation: z.boolean().nullable().describe('Whether this violates a custody agreement'),
  safety_concern: z.boolean().nullable().describe('Whether there are safety concerns'),
  welfare_impact: z
    .enum(['none', 'minor', 'moderate', 'significant', 'positive', 'unknown'])
    .describe('Impact on child welfare')
})

const EvidenceMentionedSchema = z.object({
  type: z.enum(['text', 'email', 'photo', 'document', 'recording', 'other']).describe('Type of evidence'),
  description: z.string().describe('Description of the evidence'),
  status: z.enum(['have', 'need_to_get', 'need_to_create']).describe('Current status of the evidence')
})

const EventSchema = z.object({
  type: z.enum(['incident', 'positive', 'medical', 'school', 'communication', 'legal']).describe('Type of event'),
  title: z.string().describe('Brief factual summary'),
  description: z.string().describe('Detailed factual narrative'),
  primary_timestamp: z.string().nullable().describe('ISO-8601 timestamp or null if unknown'),
  timestamp_precision: z.enum(['exact', 'day', 'approximate', 'unknown']).describe('How precise the timestamp is'),
  duration_minutes: z.number().nullable().describe('Duration in minutes if applicable'),
  location: z.string().nullable().describe('Location where event occurred'),
  participants: ParticipantsSchema,
  child_involved: z.boolean().describe('Whether a child was involved'),
  evidence_mentioned: z.array(EvidenceMentionedSchema),
  patterns_noted: z.array(z.string()),
  custody_relevance: CustodyRelevanceSchema
})

const ActionItemSchema = z.object({
  priority: z.enum(['urgent', 'high', 'normal', 'low']).describe('Priority level'),
  type: z.enum(['document', 'contact', 'file', 'obtain', 'other']).describe('Type of action'),
  description: z.string().describe('Description of the action item'),
  deadline: z.string().nullable().describe('Deadline for the action')
})

const MetadataSchema = z.object({
  extraction_confidence: z.number().nullable().describe('Confidence score for extraction'),
  ambiguities: z.array(z.string()).describe('Notes about ambiguous elements')
})

const ExtractionSchema = z.object({
  extraction: z.object({
    events: z.array(EventSchema).describe('Extracted events'),
    action_items: z.array(ActionItemSchema).describe('Action items identified'),
    metadata: MetadataSchema
  })
})

type ExtractionResult = z.infer<typeof ExtractionSchema>

function createServiceClient(): PublicClient {
  // Use process.env directly instead of useRuntimeConfig() because Inngest functions
  // run in a webhook callback context where Nuxt's runtime config may not be available
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables')
  }

  return createClient<Database>(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        persistSession: false
      }
    }
  )
}

async function processEvidenceItem(
  supabase: PublicClient,
  evidenceId: string,
  userId: string
): Promise<EvidenceSummary | null> {
  const { data, error } = await supabase
    .from('evidence')
    .select('id, user_id, user_annotation, summary, extraction_raw')
    .eq('id', evidenceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    console.error('[journal-extraction] Evidence not found or inaccessible', { evidenceId, error })
    return null
  }

  let summary = data.summary || ''

  // If we have a structured extraction, prefer its summary field
  const raw = data.extraction_raw as any | null
  if (raw && typeof raw === 'object' && raw.extraction?.summary) {
    summary = raw.extraction.summary as string
  }

  return {
    evidenceId: data.id,
    annotation: data.user_annotation || '',
    summary: summary || ''
  }
}

async function extractEventsFromText(
  supabase: PublicClient,
  userId: string,
  eventText: string,
  referenceDate: string | null,
  evidenceSummaries: EvidenceSummary[]
): Promise<ExtractionPayload> {
  // Use process.env directly instead of useRuntimeConfig() because Inngest functions
  // run in a webhook callback context where Nuxt's runtime config may not be available
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (!openaiApiKey) {
    throw new Error('OpenAI API key is not configured (OPENAI_API_KEY environment variable)')
  }

  const trimmedText = eventText.trim()
  const trimmedReferenceDate = referenceDate?.trim() || null

  if (!trimmedText) {
    throw new Error('eventText is required')
  }

  // Load user profile
  let userDisplayName: string | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.full_name) {
    userDisplayName = profile.full_name
  }

  // Load richer case context
  let caseContext = 'The speaker is involved in a family court / custody / divorce matter.'

  const { data: rawCaseRow } = await supabase
    .from('cases')
    .select(
      [
        'title',
        'case_number',
        'jurisdiction_state',
        'jurisdiction_county',
        'court_name',
        'case_type',
        'stage',
        'your_role',
        'opposing_party_name',
        'opposing_party_role',
        'children_count',
        'children_summary',
        'parenting_schedule',
        'goals_summary',
        'risk_flags',
        'next_court_date'
      ].join(', ')
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // The Supabase client typing for this query falls back to a generic error type,
  // so explicitly assert the correct row shape from our generated Database types.
  const caseRow = rawCaseRow as Database['public']['Tables']['cases']['Row'] | null

  if (caseRow) {
    const lines: string[] = ['CASE CONTEXT:']

    if (caseRow.title) lines.push(`- Case title: ${caseRow.title}`)
    if (caseRow.case_number) lines.push(`- Case number: ${caseRow.case_number}`)

    if (caseRow.jurisdiction_state || caseRow.jurisdiction_county) {
      const parts: string[] = []
      if (caseRow.jurisdiction_county) parts.push(caseRow.jurisdiction_county)
      if (caseRow.jurisdiction_state) parts.push(caseRow.jurisdiction_state)
      lines.push(`- Jurisdiction: ${parts.join(', ')}`)
    }

    if (caseRow.court_name) lines.push(`- Court: ${caseRow.court_name}`)
    if (caseRow.case_type) lines.push(`- Case type: ${caseRow.case_type}`)
    if (caseRow.stage) lines.push(`- Case stage: ${caseRow.stage}`)
    if (caseRow.your_role) lines.push(`- Speaker role: ${caseRow.your_role}`)
    if (caseRow.opposing_party_name) {
      const roleSuffix = caseRow.opposing_party_role ? ` (${caseRow.opposing_party_role})` : ''
      lines.push(`- Opposing party: ${caseRow.opposing_party_name}${roleSuffix}`)
    }

    if (typeof caseRow.children_count === 'number') {
      lines.push(`- Number of children: ${caseRow.children_count}`)
    }
    if (caseRow.children_summary) {
      lines.push(`- Children summary: ${caseRow.children_summary}`)
    }
    if (caseRow.parenting_schedule) {
      lines.push(`- Parenting schedule: ${caseRow.parenting_schedule}`)
    }

    if (caseRow.goals_summary) {
      lines.push(`- Parent goals: ${caseRow.goals_summary}`)
    }

    if (Array.isArray(caseRow.risk_flags) && caseRow.risk_flags.length > 0) {
      lines.push(`- Risk flags: ${caseRow.risk_flags.join(', ')}`)
    }

    if (caseRow.next_court_date) {
      const nextCourtIso = new Date(caseRow.next_court_date).toISOString()
      lines.push(`- Next court date: ${nextCourtIso}`)
    }

    if (lines.length > 1) {
      caseContext = lines.join('\n')
    }
  }

  // Temporal guidance
  let recordingTimestampIso: string
  if (trimmedReferenceDate) {
    const parsed = new Date(trimmedReferenceDate)
    if (!Number.isNaN(parsed.getTime())) {
      recordingTimestampIso = parsed.toISOString()
    } else {
      recordingTimestampIso = new Date().toISOString()
    }
  } else {
    recordingTimestampIso = new Date().toISOString()
  }

  const temporalGuidance = [
    `The reference date for these events is: ${recordingTimestampIso}`,
    'Resolve relative time references (like "yesterday", "this morning") based on this date.',
    'If you cannot determine a specific time, set timestamp_precision to "approximate" or "unknown".'
  ].join('\n')

  // Evidence context section
  let evidenceContext = ''
  if (evidenceSummaries.length > 0) {
    const evidenceLines = evidenceSummaries.map((e, i) => {
      let line = `Evidence ${i + 1}:`
      if (e.annotation) line += `\n  User's note: "${e.annotation}"`
      if (e.summary) line += `\n  Analysis: ${e.summary}`
      return line
    })
    evidenceContext = [
      '',
      '## Attached Evidence',
      'The user has attached the following evidence to support their description:',
      '',
      ...evidenceLines,
      '',
      'Use information from this evidence to enhance the accuracy of extracted events.',
      'Reference specific details (timestamps, quotes, facts) from the evidence when relevant.'
    ].join('\n')
  }

  const speakerLine = userDisplayName
    ? `The speaker is ${userDisplayName}. When they say "I" or "me", they refer to ${userDisplayName}.`
    : 'The speaker is the user. References to "I" or "me" refer to the same person.'

  const systemPrompt = [
    'You are an extraction engine for Project Daylight.',
    'Given a description of events from a parent in a custody situation, extract factual, legally relevant information.',
    'Do not provide advice, opinions, or legal conclusions.',
    '',
    speakerLine,
    caseContext,
    '',
    temporalGuidance,
    evidenceContext,
    '',
    'Rules:',
    '- Extract facts, not interpretations or emotions.',
    '- If information is unknown, use null or "unknown" appropriately.',
    '- Prefer under-extraction to guessing.',
    '- Keep tone neutral and factual.',
    '- You may extract multiple events from a single description.',
    '- Cross-reference the attached evidence to corroborate details.'
  ].join('\n')

  const openai = new OpenAI({
    apiKey: openaiApiKey
  })

  const response = await openai.responses.parse({
    model: 'gpt-5.2',
    reasoning: {effort: 'high'},
    text: {
      format: zodTextFormat(ExtractionSchema, 'extraction')
    },
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }]
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: trimmedText }]
      }
    ]
  })

  const extraction = response.output_parsed as ExtractionResult

  if (!extraction) {
    throw new Error('Event extraction returned empty response.')
  }

  return extraction.extraction as ExtractionPayload
}

async function saveExtractedEvents(
  supabase: PublicClient,
  userId: string,
  journalEntryId: string,
  extraction: ExtractionPayload,
  evidenceIds: string[]
): Promise<JobResultSummary> {
  const events = extraction.events || []
  const actionItems = extraction.action_items || []

  if (!events.length) {
    return {
      events_created: 0,
      evidence_processed: evidenceIds.length,
      action_items_created: 0,
      event_ids: []
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
    console.error('[journal-extraction] Failed to insert events:', insertEventsError)
    throw new Error('Failed to save events.')
  }

  const createdEventIds = (insertedEvents ?? []).map((row: any) => row.id as string)

  // Participants and evidence mentions
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
      console.error('[journal-extraction] Failed to insert participants:', participantsError)
    }
  }

  if (evidenceMentionsToInsert.length) {
    const { error: mentionsError } = await supabase
      .from('evidence_mentions')
      .insert(evidenceMentionsToInsert)

    if (mentionsError) {
      console.error('[journal-extraction] Failed to insert evidence mentions:', mentionsError)
    }
  }

  // Link evidence to events
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
          is_primary: i === 0
        })
      }
    }

    const { error: linkError } = await supabase
      .from('event_evidence')
      .insert(eventEvidenceLinks)

    if (linkError) {
      console.error('[journal-extraction] Failed to link evidence to events:', linkError)
    }
  }

  // Link evidence directly to the journal entry (if not already linked)
  if (evidenceIds.length) {
    const { data: existingLinks, error: existingError } = await supabase
      .from('journal_entry_evidence')
      .select('evidence_id, sort_order')
      .eq('journal_entry_id', journalEntryId)

    if (existingError) {
      console.error('[journal-extraction] Failed to load existing journal_entry_evidence links:', existingError)
    } else {
      const existingMap = new Map<string, number>()
      let maxSortOrder = -1

      for (const row of existingLinks ?? []) {
        existingMap.set((row as any).evidence_id as string, (row as any).sort_order as number)
        if ((row as any).sort_order > maxSortOrder) {
          maxSortOrder = (row as any).sort_order
        }
      }

      const linksToInsert: {
        journal_entry_id: string
        evidence_id: string
        sort_order: number
        is_processed: boolean
        processed_at: string | null
      }[] = []

      for (const evidenceId of evidenceIds) {
        if (existingMap.has(evidenceId)) continue
        maxSortOrder += 1
        linksToInsert.push({
          journal_entry_id: journalEntryId,
          evidence_id: evidenceId,
          sort_order: maxSortOrder,
          is_processed: true,
          processed_at: new Date().toISOString()
        })
      }

      if (linksToInsert.length) {
        const { error: entryLinkError } = await supabase
          .from('journal_entry_evidence')
          .insert(linksToInsert)

        if (entryLinkError) {
          console.error('[journal-extraction] Failed to link evidence to journal entry:', entryLinkError)
        }
      }
    }
  }

  // Insert action items
  if (actionItems.length) {
    const actionItemsToInsert = actionItems.map((item) => ({
      user_id: userId,
      event_id: createdEventIds[0] ?? null,
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
      console.error('[journal-extraction] Failed to insert action items:', actionItemsError)
    }
  }

  return {
    events_created: createdEventIds.length,
    evidence_processed: evidenceIds.length,
    action_items_created: actionItems.length,
    event_ids: createdEventIds
  }
}

export const journalExtractionFunction = inngest.createFunction(
  {
    id: 'journal-extraction',
    retries: 2,
    onFailure: async ({ event, error }) => {
      const supabase = createServiceClient()

      const failedEvent = event as unknown as JournalExtractionEvent

      // Mark job as failed
      await (supabase as any)
        .from('jobs')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', failedEvent.data.jobId)

      // Also update journal entry status if possible
      await supabase
        .from('journal_entries')
        .update({
          status: 'cancelled',
          processing_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', failedEvent.data.journalEntryId)
    }
  },
  { event: 'journal/extraction.requested' },
  async ({ event, step }) => {
    const extractionEvent = event as unknown as JournalExtractionEvent
    const { jobId, journalEntryId, userId, eventText, referenceDate, evidenceIds = [] } =
      extractionEvent.data

    const supabase = createServiceClient()

    // Step 1: Mark processing
    await step.run('mark-processing', async () => {
      await (supabase as any)
        .from('jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('id', jobId)

      await supabase
        .from('journal_entries')
        .update({
          status: 'processing',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', journalEntryId)
    })

    // Step 2: Load evidence summaries (no-op if none provided)
    const evidenceSummaries: EvidenceSummary[] = []

    for (const evidenceId of evidenceIds) {
      const result = await step.run(`load-evidence-${evidenceId}`, async () => {
        return await processEvidenceItem(supabase, evidenceId, userId)
      })

      if (result) {
        evidenceSummaries.push(result)
      }
    }

    // Step 3: Extract events
    const extraction = await step.run('extract-events', async () => {
      return await extractEventsFromText(
        supabase,
        userId,
        eventText,
        referenceDate || null,
        evidenceSummaries
      )
    })

    // Step 4: Save to database
    const savedSummary = await step.run('save-events', async () => {
      return await saveExtractedEvents(
        supabase,
        userId,
        journalEntryId,
        extraction as ExtractionPayload,
        evidenceIds
      )
    })

    // Step 5: Complete
    await step.run('finalize', async () => {
      await supabase
        .from('journal_entries')
        .update({
          status: 'completed',
          extraction_raw: extraction as any,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', journalEntryId)

      await (supabase as any)
        .from('jobs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_summary: savedSummary as any
        })
        .eq('id', jobId)
    })

    return savedSummary
  }
)



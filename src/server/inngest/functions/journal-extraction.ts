import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { inngest } from '../client'
import type { Database } from '~/types/database.types'
import { getStateGuidance } from '../../utils/state-guidance'

type PublicClient = SupabaseClient<Database, 'public'>

interface JournalExtractionEvent {
  name: 'journal/extraction.requested'
  data: {
    jobId: string
    journalEntryId: string
    userId: string
    eventText: string
    referenceDate?: string | null
    timezone?: string
    evidenceIds?: string[]
  }
}

interface EvidenceSummary {
  evidenceId: string
  annotation: string
  summary: string
}

type ExtractionEvidenceType = 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other'
type ExtractionEvidenceStatus = 'have' | 'need_to_get' | 'need_to_create'

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

interface ExtractionEvidenceMention {
  type: ExtractionEvidenceType
  description: string
  status: ExtractionEvidenceStatus
}

interface JobResultSummary {
  events_created: number
  evidence_processed: number
  action_items_created: number
  event_ids: string[]
}

// Shared Zod schemas (aligned with capture extraction endpoint)
const ParticipantsSchema = z.object({
  primary: z.array(z.enum(['co-parent', 'child', 'self', 'other'])).describe('Primary participants'),
  witnesses: z.array(z.string()).describe('Witnesses present'),
  professionals: z.array(z.string()).describe('Professionals involved')
})

const ChildStatementSchema = z.object({
  statement: z
    .string()
    .describe('Direct quote or paraphrased statement from the child'),
  context: z
    .string()
    .describe('When and where the statement was made'),
  concerning: z
    .boolean()
    .describe('Whether this statement indicates alienation, coaching, or distress')
})

const CoparentInteractionSchema = z
  .object({
    your_tone: z
      .enum(['neutral', 'cooperative', 'defensive', 'hostile'])
      .nullable(),
    their_tone: z
      .enum(['neutral', 'cooperative', 'defensive', 'hostile'])
      .nullable(),
    your_response_appropriate: z
      .boolean()
      .nullable()
      .describe("Whether the user's response was appropriate to the situation")
  })
  .nullable()
  .describe('Analysis of co-parent interaction tone when applicable')

const PatternNotedSchema = z.object({
  pattern_type: z.enum([
    'schedule_violation',
    'communication_failure',
    'escalating_hostility',
    'delegation_of_parenting',
    'routine_disruption',
    'information_withholding',
    'unilateral_decisions'
  ]),
  description: z.string(),
  frequency: z.enum(['first_time', 'recurring', 'chronic']).nullable()
})

const WelfareImpactSchema = z
  .object({
    category: z.enum([
      'routine', // Daily routines, schedules
      'emotional', // Emotional wellbeing, stress, anxiety
      'medical', // Physical health, medical care
      'educational', // School, learning, development
      'social', // Friendships, activities, extracurriculars
      'safety', // Physical safety, supervision
      'none' // No impact on child welfare
    ]),
    direction: z.enum(['positive', 'negative', 'neutral']),
    severity: z.enum(['minimal', 'moderate', 'significant']).nullable()
  })
  .describe('Impact on child welfare with category, direction, and severity')

const CustodyRelevanceSchema = z.object({
  agreement_violation: z
    .boolean()
    .nullable()
    .describe('Whether this violates a custody agreement'),
  safety_concern: z
    .boolean()
    .nullable()
    .describe('Whether there are safety concerns'),
  welfare_impact: WelfareImpactSchema
})

const EvidenceMentionedSchema = z.object({
  type: z
    .enum(['text', 'email', 'photo', 'document', 'recording', 'other'])
    .describe('Type of evidence'),
  description: z.string().describe('Description of the evidence'),
  status: z
    .enum(['have', 'need_to_get', 'need_to_create'])
    .describe('Current status of the evidence')
})

const EventSchema = z.object({
  type: z
    .enum([
      'parenting_time', // Actual engaged time with child (reading, playing, activities)
      'caregiving', // Meals, baths, bedtime routines, medical care
      'household', // Chores, maintenance, logistics
      'coparent_conflict', // Disputes, violations, hostility between parents
      'gatekeeping', // Interference, withholding info, alienating language
      'communication', // Neutral coordination (scheduling, logistics)
      'medical', // Medical appointments, health decisions, medications
      'school', // School events, homework, academic matters
      'legal' // Court filings, attorney communications, legal proceedings
    ])
    .describe('Type of event'),
  title: z.string().describe('Brief factual summary'),
  description: z.string().describe('Detailed factual narrative'),
  primary_timestamp: z
    .string()
    .nullable()
    .describe('ISO-8601 timestamp or null if unknown'),
  timestamp_precision: z
    .enum(['exact', 'day', 'approximate', 'unknown'])
    .describe('How precise the timestamp is'),
  duration_minutes: z
    .number()
    .nullable()
    .describe('Duration in minutes if applicable'),
  location: z.string().nullable().describe('Location where event occurred'),
  participants: ParticipantsSchema,
  child_involved: z.boolean().describe('Whether a child was involved'),
  evidence_mentioned: z.array(EvidenceMentionedSchema),
  child_statements: z
    .array(ChildStatementSchema)
    .describe('Direct quotes or paraphrased statements from the child')
    .default([]),
  coparent_interaction: CoparentInteractionSchema,
  patterns_noted: z
    .array(PatternNotedSchema)
    .describe('Patterns relevant to custody with type and frequency')
    .default([]),
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
type ExtractionPayload = ExtractionResult['extraction']

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
  timezone: string,
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

  // Jurisdiction-specific legal guidance (if we know the state)
  let jurisdictionGuidance = ''
  if (caseRow?.jurisdiction_state) {
    const guidance = getStateGuidance(caseRow.jurisdiction_state)
    if (guidance.state !== 'Unknown') {
      jurisdictionGuidance = [
        '',
        'JURISDICTION-SPECIFIC GUIDANCE:',
        guidance.promptGuidance
      ].join('\n')
    }
  }

  // Temporal guidance with timezone awareness
  // The user's timezone is critical for accurate timestamp generation
  const userTimezone = timezone || 'UTC'
  
  // Build the reference date context
  let referenceDateContext: string
  if (trimmedReferenceDate) {
    // User provided a date like "2026-01-30" - this is in their local timezone
    referenceDateContext = trimmedReferenceDate
  } else {
    // Use current date in user's timezone
    const now = new Date()
    referenceDateContext = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now)
  }

  const temporalGuidance = [
    `The user is in timezone: ${userTimezone}`,
    `The reference date for these events is: ${referenceDateContext} (in the user's local timezone)`,
    '',
    'IMPORTANT: When generating primary_timestamp values:',
    `- Generate timestamps in the user's timezone (${userTimezone})`,
    '- For example, if the user says "yesterday at 7pm" and the reference date is 2026-01-30, generate "2026-01-29T19:00:00" (without Z suffix) to represent 7pm local time',
    '- Include timezone offset in ISO format, e.g., "2026-01-29T19:00:00-05:00" for Eastern Time',
    '- Resolve relative time references (like "yesterday", "this morning", "last week") based on the reference date',
    '- If you cannot determine a specific time, set timestamp_precision to "approximate" or "unknown"'
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

  const systemPromptLines: string[] = [
    'You are an extraction engine for Project Daylight.',
    'Given a description of events from a parent in a custody situation, extract factual, legally relevant information.',
    'Do not provide advice, opinions, or legal conclusions.',
    '',
    speakerLine,
    caseContext
  ]

  if (jurisdictionGuidance) {
    systemPromptLines.push(jurisdictionGuidance)
  }

  systemPromptLines.push(
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
    '- Cross-reference the attached evidence to corroborate details.',
    '- Flag "gatekeeping" behaviors explicitly: schedule interference, withholding information (medical, school, location), controlling access to the child\'s belongings, alienating language to or about the other parent in the child\'s presence, and unilateral decisions about the child\'s schedule or activities.',
    '- Note patterns relevant to custody, including:',
    '  - Repeated schedule violations (late pickups, early dropoffs, missed exchanges)',
    '  - Consistent failure to communicate about the child\'s welfare',
    '  - Escalating hostility in co-parent interactions',
    '  - Delegation of parenting to third parties (new partners, grandparents doing primary care)',
    '  - Disruption of the child\'s routine (bedtime, meals, activities)',
    '  - Withholding of medical or school information',
    '  - Pattern of unilateral decision-making about major issues.'
  )

  const systemPrompt = systemPromptLines.join('\n')

  const openai = new OpenAI({
    apiKey: openaiApiKey
  })

  const response = await openai.responses.parse({
    model: 'gpt-5.2',
    reasoning: { effort: 'high' },
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

function mapNewToLegacyType(
  newType: ExtractionEventType
): 'incident' | 'positive' | 'medical' | 'school' | 'communication' | 'legal' {
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

  return mapping[newType] || 'incident'
}

function mapNewToLegacyWelfare(
  welfareImpact: {
    category: string
    direction: 'positive' | 'negative' | 'neutral'
    severity: 'minimal' | 'moderate' | 'significant' | null
  } | null | undefined
): 'none' | 'minor' | 'moderate' | 'significant' | 'positive' | 'unknown' | null {
  if (!welfareImpact) {
    return null
  }

  if (welfareImpact.direction === 'positive') {
    // Preserve a single positive bucket in the legacy enum
    return 'positive'
  }

  if (welfareImpact.direction === 'neutral') {
    // Neutral/no meaningful impact
    return 'none'
  }

  // Negative direction: map severity
  if (welfareImpact.severity === 'minimal') return 'minor'
  if (welfareImpact.severity === 'moderate') return 'moderate'
  if (welfareImpact.severity === 'significant') return 'significant'

  return 'unknown'
}

/**
 * Reinterpret a timestamp that the AI generated as UTC but actually represents local time.
 * 
 * The AI often returns timestamps like "2026-01-29T15:15:00.000Z" when the user said "3:15 PM"
 * in their local timezone. This function reinterprets that as 3:15 PM in the given timezone
 * and returns the correct UTC timestamp.
 * 
 * @param timestamp - The AI-generated timestamp (may have Z suffix or timezone offset)
 * @param timezone - The user's timezone (e.g., "America/New_York")
 * @returns The corrected UTC timestamp, or null if input is null/invalid
 */
function reinterpretTimestampInTimezone(timestamp: string | null, timezone: string): string | null {
  if (!timestamp) return null
  
  // If the timestamp already has a non-UTC timezone offset (like -05:00), it's correct
  // Only reinterpret if it ends with Z or has no timezone info
  const hasUtcSuffix = timestamp.endsWith('Z')
  const hasOffset = /[+-]\d{2}:\d{2}$/.test(timestamp)
  
  if (hasOffset && !hasUtcSuffix) {
    // Already has a proper timezone offset, use as-is
    return timestamp
  }
  
  // Strip the Z suffix if present to get the local time values
  const localTimeStr = timestamp.replace(/Z$/, '').replace(/\.\d{3}$/, '')
  
  // Parse the local time components
  const match = localTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/)
  if (!match) return timestamp // Can't parse, return as-is
  
  const [, year, month, day, hour, minute, second = '00'] = match
  
  // Create a date string that JavaScript will interpret as local time in the given timezone
  // by using toLocaleString to find the offset, then adjusting
  try {
    // Create a date assuming the values are in UTC
    const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
    
    // Format that date in the user's timezone to see what local time it represents
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    
    const parts = formatter.formatToParts(utcDate)
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00'
    
    const tzHour = parseInt(getPart('hour'))
    const tzMinute = parseInt(getPart('minute'))
    const origHour = parseInt(hour)
    const origMinute = parseInt(minute)
    
    // Calculate the offset in milliseconds
    // If UTC 15:00 shows as 10:00 in timezone, offset is -5 hours
    // We want to go the other direction: treat 15:00 as local time
    const hourDiff = tzHour - origHour
    const minuteDiff = tzMinute - origMinute
    const offsetMs = (hourDiff * 60 + minuteDiff) * 60 * 1000
    
    // Apply the inverse offset to get the correct UTC time
    const correctedUtc = new Date(utcDate.getTime() - offsetMs)
    
    return correctedUtc.toISOString()
  } catch {
    // If anything fails, return the original
    return timestamp
  }
}

async function saveExtractedEvents(
  supabase: PublicClient,
  userId: string,
  journalEntryId: string,
  extraction: ExtractionPayload,
  evidenceIds: string[],
  timezone: string = 'UTC'
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

  // Insert events (dual-write to legacy and new schema columns)
  const eventsToInsert = events.map((e) => {
    const welfareImpact = e.custody_relevance?.welfare_impact
    
    // Reinterpret the timestamp if the AI returned it as UTC but meant local time
    const correctedTimestamp = reinterpretTimestampInTimezone(e.primary_timestamp, timezone)

    return {
      user_id: userId,
      journal_entry_id: journalEntryId,
      recording_id: null,
      // New granular type column
      type_v2: e.type,
      // Legacy type column for backward compatibility
      type: mapNewToLegacyType(e.type),
      title: e.title || 'Untitled event',
      description: e.description,
      primary_timestamp: correctedTimestamp,
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
    type: ExtractionEvidenceType
    description: string
    status: ExtractionEvidenceStatus
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

  // Link evidence to events.
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
        is_primary: i === 0
      })
    }

    const { error: linkError } = await supabase
      .from('event_evidence')
      .insert(eventEvidenceLinks)

    if (linkError) {
      console.error('[journal-extraction] Failed to link evidence to events:', linkError)
    }
  } else if (evidenceIds.length && createdEventIds.length > 1) {
    console.info(
      `[journal-extraction] Skipping auto-linking ${evidenceIds.length} evidence item(s) to ${createdEventIds.length} events to avoid over-linking.`
    )
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
    const { jobId, journalEntryId, userId, eventText, referenceDate, timezone = 'UTC', evidenceIds = [] } =
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
        timezone,
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
        evidenceIds,
        timezone
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



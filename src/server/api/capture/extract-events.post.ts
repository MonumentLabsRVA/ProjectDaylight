import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { getStateGuidance } from '../../utils/state-guidance'
import { getTimezoneWithProfileFallback } from '../../utils/timezone'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * POST /api/capture/extract-events
 * 
 * Extracts structured events from the user's event description.
 * This is called AFTER evidence has been processed.
 * 
 * The LLM receives:
 * - The user's event text (voice transcript or typed description)
 * - Reference date for temporal reasoning
 * - Summaries from processed evidence
 * - Case context
 * 
 * It produces structured events that match the events table schema.
 */

interface EvidenceSummary {
  evidenceId: string | null
  annotation: string
  summary: string
}

interface ExtractEventsBody {
  eventText: string
  referenceDate?: string
  evidenceSummaries?: EvidenceSummary[]
}

// Zod schemas matching the existing voice-extraction schema
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
  type: z.enum(['text', 'email', 'photo', 'document', 'recording', 'other']).describe('Type of evidence'),
  description: z.string().describe('Description of the evidence'),
  status: z.enum(['have', 'need_to_get', 'need_to_create']).describe('Current status of the evidence')
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

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openai?.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI API key is not configured.'
    })
  }

  const body = await readBody<ExtractEventsBody>(event)
  const eventText = body?.eventText?.trim()
  const referenceDate = body?.referenceDate?.trim()
  const evidenceSummaries = body?.evidenceSummaries || []

  if (!eventText) {
    throw createError({
      statusCode: 400,
      statusMessage: 'eventText is required.'
    })
  }

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

  try {
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

    // Load richer case context so the model understands the broader situation.
    let caseContext = 'The speaker is involved in a family court / custody / divorce matter.'

    const { data: caseRow } = await supabase
      .from('cases')
      .select(
        [
          'title',
          'case_numbers',
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

    if (caseRow) {
      const lines: string[] = ['CASE CONTEXT:']

      if (caseRow.title) lines.push(`- Case title: ${caseRow.title}`)
      if (caseRow.case_numbers?.length) lines.push(`- Case number(s): ${caseRow.case_numbers.join(', ')}`)

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

    // Build temporal guidance with timezone awareness
    // Uses profile timezone as fallback when no X-Timezone header is provided
    const userTimezone = await getTimezoneWithProfileFallback(event, supabase, userId)
    
    // Build the reference date context
    let referenceDateContext: string
    if (referenceDate) {
      // User provided a date like "2026-01-30" - this is in their local timezone
      referenceDateContext = referenceDate
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

    // Build evidence context section
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
      apiKey: config.openai.apiKey
    })

    const response = await openai.responses.parse({
      model: 'gpt-5-mini',
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
          content: [{ type: 'input_text', text: eventText }]
        }
      ]
    })

    const extraction = response.output_parsed as ExtractionResult

    if (!extraction) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Event extraction returned empty response.'
      })
    }

    return {
      extraction: extraction.extraction,
      _usage: response.usage
    }
  } catch (error: any) {
    console.error('Event extraction error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to extract events. Please try again.'
    })
  }
})


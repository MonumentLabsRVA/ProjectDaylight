import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { getTimezoneWithProfileFallback } from '../utils/timezone'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

interface VoiceExtractionBody {
  transcript?: string
  /**
   * Optional, free-form description of when the events occurred.
   * Examples: "yesterday at 6pm", "last Tuesday evening", "around Halloween".
   * When provided, this should be treated as the primary reference for resolving
   * event timestamps during extraction.
   */
  referenceTimeDescription?: string
  /**
   * Optional calendar date (YYYY-MM-DD) selected by the user for when the events occurred.
   * When provided, this will be used as the base "recording" date for resolving relative
   * phrases like "yesterday" or "this morning".
   */
  referenceDate?: string
}

// Define Zod schemas for structured extraction
const EvidenceMentionedSchema = z.object({
  type: z.enum(['text', 'email', 'photo', 'document', 'recording']).describe('Type of evidence'),
  description: z.string().describe('Description of the evidence'),
  status: z.enum(['have', 'need_to_get', 'need_to_create']).describe('Current status of the evidence')
})

const ParticipantsSchema = z.object({
  primary: z.array(z.enum(['co-parent', 'child', 'self', 'other'])).describe('Primary participants'),
  witnesses: z.array(z.string()).describe('Witnesses present'),
  professionals: z.array(z.string()).describe('Professionals involved')
})

const CustodyRelevanceSchema = z.object({
  agreement_violation: z.boolean().nullable().describe('Whether this violates a custody agreement'),
  safety_concern: z.boolean().nullable().describe('Whether there are safety concerns'),
  welfare_impact: z.enum(['none', 'minor', 'moderate', 'significant', 'positive', 'unknown']).describe('Impact on child welfare')
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
  recording_timestamp: z.string().nullable().describe('ISO-8601 timestamp of the recording'),
  recording_duration_seconds: z.number().nullable().describe('Duration of the recording in seconds'),
  transcription_confidence: z.number().nullable().describe('Confidence score for transcription'),
  extraction_confidence: z.number().nullable().describe('Confidence score for extraction'),
  ambiguities: z.array(z.string()).describe('Notes about ambiguous elements')
})

const ExtractionSchema = z.object({
  extraction: z.object({
    events: z.array(EventSchema).describe('Extracted events from the transcript'),
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
      statusMessage: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.'
    })
  }

  const body = await readBody<VoiceExtractionBody>(event)
  const transcript = body?.transcript?.trim()
  const referenceTimeDescription = body?.referenceTimeDescription?.trim() || null
  const referenceDate = body?.referenceDate?.trim() || null

  if (!transcript) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Transcript is required for extraction.'
    })
  }

  try {
    // Load user and supabase client first for timezone lookup
    const supabase = await serverSupabaseClient(event)
    const authUser = await serverSupabaseUser(event)
    const userId = authUser?.sub || authUser?.id || null

    // Get user's timezone with profile fallback for accurate timestamp generation
    const userTimezone = userId 
      ? await getTimezoneWithProfileFallback(event, supabase, userId)
      : 'UTC'
    
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

    const temporalGuidanceLines: string[] = [
      `The user is in timezone: ${userTimezone}`,
      `The reference date for these events is: ${referenceDateContext} (in the user's local timezone)`,
      '',
      'IMPORTANT: When generating primary_timestamp values:',
      `- Generate timestamps in the user's timezone (${userTimezone})`,
      '- For example, if the user says "at 10am", generate a timestamp like "2026-01-30T10:00:00" with the appropriate timezone offset',
      '- Include timezone offset in ISO format, e.g., "2026-01-30T10:00:00-05:00" for Eastern Time',
      '- For relative phrases like "this morning", "tonight", or "earlier today", choose a reasonable time on that same day and set timestamp_precision to "approximate"',
      '- If you cannot reasonably resolve a date or time, leave primary_timestamp as null and set timestamp_precision to "unknown"'
    ]

    if (referenceTimeDescription) {
      temporalGuidanceLines.push(
        '',
        'The user also provided this description of when the events occurred relative to the calendar:',
        `"${referenceTimeDescription}"`,
        'Treat this description as the primary reference for resolving dates and times for the events you extract.',
        'If there is any conflict between this description and assumptions from the reference date, prefer the user-provided description.'
      )
    }

    // Best-effort: load user display name and case context to give the model more precise guidance
    // about who is speaking and what their legal matter is.

    let userDisplayName: string | null =
      // supabase auth user metadata may already include full_name
      (authUser as any)?.user_metadata?.full_name ||
      (authUser as any)?.full_name ||
      (authUser as any)?.name ||
      authUser?.email ||
      null

    if (userId) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()

        if (profile?.full_name) {
          userDisplayName = profile.full_name
        }
      } catch {
        // Ignore profile lookup failures; we can fall back to a generic name.
      }
    }

    let caseContextDescription =
      'The speaker is involved in a family court / custody / divorce matter and is documenting events for legal purposes.'

    if (userId) {
      try {
        const { data: caseRow } = await supabase
          .from('cases')
          .select('case_type, stage, your_role, opposing_party_name, goals_summary')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (caseRow) {
          const parts: string[] = []

          if (caseRow.case_type) {
            parts.push(`case type: ${caseRow.case_type}`)
          }

          if (caseRow.your_role) {
            parts.push(`your role: ${caseRow.your_role}`)
          }

          if (caseRow.stage) {
            parts.push(`stage: ${caseRow.stage}`)
          }

          if (caseRow.opposing_party_name) {
            parts.push(`opposing party: ${caseRow.opposing_party_name}`)
          }

          if (caseRow.goals_summary) {
            parts.push(`user goals: ${caseRow.goals_summary}`)
          }

          if (parts.length) {
            caseContextDescription = `The speaker is involved in a family law matter with the following context: ${parts.join(
              '; '
            )}. They are using this voice note to document events for their case.`
          }
        }
      } catch {
        // Ignore case lookup failures; we can fall back to a generic description.
      }
    }

    const speakerLine = userDisplayName
      ? `The voice note speaker is ${userDisplayName}. When they say "I" or "me", they are referring to ${userDisplayName}.`
      : 'The voice note speaker is the user. When they say "I" or "me", they are referring to the same person consistently.'

    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    /**
     * Use the Responses API with structured output parsing via Zod schemas.
     * This provides type-safe validation and automatic JSON parsing.
     *
     * The model will:
     * - Extract factual, legally relevant information from the transcript
     * - Identify events, action items, and metadata
     * - Produce a validated JSON object matching the voice extraction schema
     */
    const response = await openai.responses.parse({
      model: 'gpt-5-mini',
      text: {
        format: zodTextFormat(ExtractionSchema, 'extraction')
      },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'You are an extraction engine for Project Daylight.',
                'Given a voice note transcript from a parent in a custody situation, you must extract factual, legally relevant information only.',
                'Do not provide advice, opinions, or legal conclusions.',
                '',
                speakerLine,
                caseContextDescription,
                '',
                ...temporalGuidanceLines,
                '',
                'Rules:',
                '- If a field is unknown or not mentioned, set it to null, an empty array, or "unknown" where appropriate.',
                '- Prefer under-extraction to guessing. Do not invent details.',
                '- Keep tone neutral and factual.',
                '- You may extract multiple events from a single transcript.',
                `- When metadata.recording_timestamp is not otherwise clearly specified by the user, you may set it to the recording timestamp provided above: ${recordingTimestampIso}.`
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: transcript
            }
          ]
        }
      ]
    })

    // Use the parsed output from the Zod schema
    const extraction = response.output_parsed as ExtractionResult
    const usage = response.usage ?? null

    if (!extraction) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Extraction model returned an empty response.'
      })
    }

    // Persist extracted events (and related participants / evidence mentions) to Supabase.
    // We already resolved `supabase` and `userId` above when building context.
    if (!userId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Unauthorized - Please log in'
      })
    }

    const events = extraction.extraction?.events ?? []

    let createdEventIds: string[] = []

    if (events.length) {
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
        welfare_impact: e.custody_relevance?.welfare_impact ?? 'unknown'
      }))

      const { data: insertedEvents, error: insertEventsError } = await supabase
        .from('events')
        .insert(eventsToInsert)
        .select('id')

      if (insertEventsError) {
        // eslint-disable-next-line no-console
        console.error('Failed to insert events from voice extraction:', insertEventsError)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to save extracted events.'
        })
      }

      createdEventIds = (insertedEvents ?? []).map((row: any) => row.id as string)

      type EvidenceMention = z.infer<typeof EvidenceMentionedSchema>

      const participantsToInsert: {
        user_id: string
        event_id: string
        role: 'primary' | 'witness' | 'professional'
        label: string
      }[] = []

      const evidenceMentionsToInsert: {
        user_id: string
        event_id: string
        type: EvidenceMention['type']
        description: string
        status: EvidenceMention['status']
      }[] = []

      createdEventIds.forEach((eventId, index) => {
        const source = events[index]
        if (!source) {
          return
        }

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
          console.error('Failed to insert event participants from voice extraction:', participantsError)
        }
      }

      if (evidenceMentionsToInsert.length) {
        const { error: mentionsError } = await supabase
          .from('evidence_mentions')
          .insert(evidenceMentionsToInsert)

        if (mentionsError) {
          // eslint-disable-next-line no-console
          console.error('Failed to insert evidence mentions from voice extraction:', mentionsError)
        }
      }
    }

    let payload: any = extraction

    // Attach token usage information from OpenAI
    payload._usage = usage

    if (createdEventIds.length) {
      payload._db = {
        ...(payload._db || {}),
        created_event_ids: createdEventIds
      }
    }

    // Optionally compute a cost estimate in USD if per-1K token rates are provided via env
    // OPENAI_GPT5_MINI_INPUT_RATE_USD_PER_1K_TOKENS and OPENAI_GPT5_MINI_OUTPUT_RATE_USD_PER_1K_TOKENS
    let costEstimateUsd: number | null = null

    if (usage) {
      const inputRatePer1K = Number(process.env.OPENAI_GPT5_MINI_INPUT_RATE_USD_PER_1K_TOKENS || '0')
      const outputRatePer1K = Number(process.env.OPENAI_GPT5_MINI_OUTPUT_RATE_USD_PER_1K_TOKENS || '0')

      if (inputRatePer1K > 0 || outputRatePer1K > 0) {
        const inputTokens = usage.input_tokens ?? 0
        const outputTokens = usage.output_tokens ?? 0

        const inputCost = inputRatePer1K > 0 ? (inputTokens / 1000) * inputRatePer1K : 0
        const outputCost = outputRatePer1K > 0 ? (outputTokens / 1000) * outputRatePer1K : 0

        costEstimateUsd = Number((inputCost + outputCost).toFixed(6))
      }

      payload._cost = {
        model: 'gpt-5-mini',
        currency: 'USD',
        total_usd: costEstimateUsd,
        input_rate_per_1k: process.env.OPENAI_GPT5_MINI_INPUT_RATE_USD_PER_1K_TOKENS || null,
        output_rate_per_1k: process.env.OPENAI_GPT5_MINI_OUTPUT_RATE_USD_PER_1K_TOKENS || null
      }
    }

    return payload
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Voice extraction error:', error)

    if (error?.status === 401) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid OpenAI API key. Please check your configuration.'
      })
    }

    if (error?.status === 429) {
      throw createError({
        statusCode: 429,
        statusMessage: 'OpenAI API rate limit exceeded. Please try again later.'
      })
    }

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to extract structured information from transcript. Please try again.'
    })
  }
})



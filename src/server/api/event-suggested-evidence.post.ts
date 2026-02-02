import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

interface EventSuggestedEvidenceBody {
  /**
   * IDs of events to generate suggested evidence for.
   * All events must belong to the authenticated user.
   */
  eventIds: string[]
}

// Reuse the same evidence source types and "have/need" semantics used by evidence_mentions.
const EvidenceSuggestionItemSchema = z.object({
  evidence_type: z
    .enum(['text', 'email', 'photo', 'document', 'recording', 'other'])
    .describe('Type of evidence that would support this event, aligned with evidence_source_type.'),
  evidence_status: z
    .enum(['have', 'need_to_get', 'need_to_create'])
    .describe('Whether the user already has this evidence, needs to obtain it, or needs to create it.'),
  description: z
    .string()
    .describe(
      'Short, factual description of the specific evidence item (e.g., "Screenshot of text thread where co-parent confirmed late pickup").'
    )
})

const EventEvidenceSuggestionsSchema = z.object({
  event_id: z
    .string()
    .describe('ID of the event this suggestion applies to. Must match one of the input event IDs.'),
  suggestions: z
    .array(EvidenceSuggestionItemSchema)
    .describe('Suggested evidence items for this event. Can be empty if nothing meaningful is suggested.')
})

const ExtractionSchema = z.object({
  extraction: z.object({
    suggestions: z
      .array(EventEvidenceSuggestionsSchema)
      .describe('Per-event evidence suggestions generated from the supplied event list.'),
    metadata: z.object({
      notes: z
        .array(z.string())
        .describe('Optional notes about uncertainties, overlaps between events, or conservative choices.')
    })
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

  const body = await readBody<EventSuggestedEvidenceBody>(event)
  const eventIds = (body?.eventIds || []).map((id) => id.trim()).filter(Boolean)

  if (!eventIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'eventIds is required and must contain at least one non-empty event ID.'
    })
  }

  try {
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

    // Load the requested events and basic case context to ground the suggestions.
    const [{ data: events, error: eventsError }, { data: latestCase }] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, user_id, type, title, description, primary_timestamp, timestamp_precision, location, child_involved, agreement_violation, safety_concern, welfare_impact'
        )
        .in('id', eventIds)
        .eq('user_id', userId),
      supabase
        .from('cases')
        .select('title, case_numbers, case_type, stage, your_role, opposing_party_name, goals_summary, children_summary')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (eventsError) {
      // eslint-disable-next-line no-console
      console.error('Supabase select events error (event-suggested-evidence):', eventsError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to load events for suggested evidence.'
      })
    }

    const eventRows = events || []

    if (!eventRows.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No matching events were found for the current user.'
      })
    }

    const caseContextLines: string[] = []

    if (latestCase) {
      caseContextLines.push('CASE CONTEXT:')

      if (latestCase.title) caseContextLines.push(`- Title: ${latestCase.title}`)
      if (latestCase.case_numbers?.length) caseContextLines.push(`- Case Number(s): ${latestCase.case_numbers.join(', ')}`)
      if (latestCase.case_type) caseContextLines.push(`- Case Type: ${latestCase.case_type}`)
      if (latestCase.stage) caseContextLines.push(`- Stage: ${latestCase.stage}`)
      if (latestCase.your_role) caseContextLines.push(`- User Role: ${latestCase.your_role}`)
      if (latestCase.opposing_party_name) {
        caseContextLines.push(`- Opposing Party: ${latestCase.opposing_party_name}`)
      }
      if (latestCase.children_summary) {
        caseContextLines.push(`- Children: ${latestCase.children_summary}`)
      }
      if (latestCase.goals_summary) {
        caseContextLines.push(`- User Goals: ${latestCase.goals_summary}`)
      }
    }

    const eventsBlockLines: string[] = ['EVENTS:']

    for (const e of eventRows) {
      const timestamp = e.primary_timestamp || e.created_at
      const tsLabel = timestamp ? new Date(timestamp).toISOString() : 'unknown'

      eventsBlockLines.push(
        [
          `- ID: ${e.id}`,
          `  Type: ${e.type}`,
          `  Timestamp: ${tsLabel} (precision: ${e.timestamp_precision || 'unknown'})`,
          `  Title: ${e.title}`,
          `  Description: ${e.description}`,
          e.location ? `  Location: ${e.location}` : null,
          `  Child involved: ${e.child_involved ? 'yes' : 'no'}`,
          e.agreement_violation === null || e.agreement_violation === undefined
            ? '  Agreement violation: unknown'
            : `  Agreement violation: ${e.agreement_violation ? 'yes' : 'no'}`,
          e.safety_concern === null || e.safety_concern === undefined
            ? '  Safety concern: unknown'
            : `  Safety concern: ${e.safety_concern ? 'yes' : 'no'}`,
          `  Welfare impact: ${e.welfare_impact || 'unknown'}`
        ]
          .filter(Boolean)
          .join('\n')
      )
    }

    const contextText = [
      caseContextLines.join('\n'),
      '',
      eventsBlockLines.join('\n'),
      '',
      'Each event ID above corresponds to a single timeline entry for the same user.'
    ]
      .filter(Boolean)
      .join('\n')

    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    /**
     * Use the Responses API with structured output parsing via Zod schemas, mirroring
     * the existing voice-extraction and communication extraction routes, but using
     * the lower-cost gpt-5-nano model.
     *
     * The model receives a compact description of each event and must emit
     * per-event evidence suggestions that map cleanly onto our enums.
     */
    const response = await openai.responses.parse({
      model: 'gpt-5-nano',
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
                'You are an AI assistant for Project Daylight.',
                'You receive a list of legal timeline events for a custody/family law matter.',
                'For each event, suggest concrete, fact-focused evidence items that could support or document that event.',
                '',
                'You must follow these rules:',
                '- Only suggest evidence types that match the allowed enums: text, email, photo, document, recording, other.',
                '- Only use evidence_status values: have, need_to_get, need_to_create.',
                '- When you are not sure if specific evidence exists yet, prefer "need_to_get" or "need_to_create" instead of "have".',
                '- Keep descriptions short, neutral, and factual. Do not provide legal advice or conclusions.',
                '- Some events may already be well-documented; you may return an empty suggestions array for those.',
                '',
                'Your output must include every input event_id, even if suggestions is an empty list for that event.'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Here is the current case and event context.',
                '',
                contextText,
                '',
                'For each event listed above, generate a small set of evidence suggestions (or an empty list) and return them in the required JSON shape.'
              ].join('\n')
            }
          ]
        }
      ]
    })

    const extraction = response.output_parsed as ExtractionResult
    const usage = response.usage ?? null

    if (!extraction) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Evidence suggestion model returned an empty response.'
      })
    }

    const suggestions = extraction.extraction?.suggestions ?? []

    // Ensure we only insert suggestions for events that actually belong to this user.
    const validEventIdSet = new Set(eventRows.map((e: any) => e.id))

    const rowsToInsert: Array<{
      user_id: string
      event_id: string
      evidence_type: string
      evidence_status: string
      description: string
    }> = []

    for (const perEvent of suggestions) {
      const eventId = perEvent.event_id
      if (!eventId || !validEventIdSet.has(eventId)) {
        continue
      }

      for (const item of perEvent.suggestions || []) {
        rowsToInsert.push({
          user_id: userId,
          event_id: eventId,
          evidence_type: item.evidence_type,
          evidence_status: item.evidence_status,
          description: item.description
        })
      }
    }

    let createdSuggestionIds: string[] = []

    if (rowsToInsert.length) {
      const { data: inserted, error: insertError } = await supabase
        .from('event_evidence_suggestions')
        .insert(rowsToInsert)
        .select('id')

      if (insertError) {
        // eslint-disable-next-line no-console
        console.error('Failed to insert event evidence suggestions:', insertError)
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to save suggested evidence.'
        })
      }

      createdSuggestionIds = (inserted || []).map((row: any) => row.id as string)
    }

    let payload: any = extraction

    payload._usage = usage

    if (createdSuggestionIds.length) {
      payload._db = {
        ...(payload._db || {}),
        created_event_evidence_suggestion_ids: createdSuggestionIds
      }
    }

    // Optional cost estimation for gpt-5-nano if per-1K token pricing is provided via env.
    let costEstimateUsd: number | null = null

    if (usage) {
      const inputRatePer1K = Number(process.env.OPENAI_GPT5_NANO_INPUT_RATE_USD_PER_1K_TOKENS || '0')
      const outputRatePer1K = Number(process.env.OPENAI_GPT5_NANO_OUTPUT_RATE_USD_PER_1K_TOKENS || '0')

      if (inputRatePer1K > 0 || outputRatePer1K > 0) {
        const inputTokens = usage.input_tokens ?? 0
        const outputTokens = usage.output_tokens ?? 0

        const inputCost = inputRatePer1K > 0 ? (inputTokens / 1000) * inputRatePer1K : 0
        const outputCost = outputRatePer1K > 0 ? (outputTokens / 1000) * outputRatePer1K : 0

        costEstimateUsd = Number((inputCost + outputCost).toFixed(6))
      }

      payload._cost = {
        model: 'gpt-5-nano',
        currency: 'USD',
        total_usd: costEstimateUsd,
        input_rate_per_1k: process.env.OPENAI_GPT5_NANO_INPUT_RATE_USD_PER_1K_TOKENS || null,
        output_rate_per_1k: process.env.OPENAI_GPT5_NANO_OUTPUT_RATE_USD_PER_1K_TOKENS || null
      }
    }

    return payload
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Event suggested evidence error:', error)

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
      statusMessage: 'Failed to generate suggested evidence for events. Please try again.'
    })
  }
})




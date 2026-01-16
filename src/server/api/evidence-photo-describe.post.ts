import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../utils/auth'

interface PhotoDescribeBody {
  /**
   * ID of an existing evidence row that has a stored image file.
   * The server will look up storage_path and create a signed URL for the model.
   */
  evidenceId: string
}

const PhotoDescriptionSchema = z.object({
  suggested_title: z
    .string()
    .describe('Short neutral title for the evidence item, suitable as a display name.'),
  suggested_summary: z
    .string()
    .describe('1–3 sentence neutral, factual description of what the image shows.'),
  suggested_tags: z
    .array(z.string())
    .describe('Suggested tags for the evidence.tags array, such as "photo", "injury", "location".')
})

const ExtractionSchema = z.object({
  extraction: PhotoDescriptionSchema
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

  const body = await readBody<PhotoDescribeBody>(event)
  const evidenceId = body?.evidenceId?.trim()

  if (!evidenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'evidenceId is required and must be a non-empty string.'
    })
  }

  try {
    const supabase = await serverSupabaseClient(event)

    const userId = await requireUserId(event, supabase)

    // Best-effort: load user and case context to help the model understand who is providing
    // this photo evidence and what legal matter it relates to.
    let userDisplayName: string | null = null

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
      // Ignore profile lookup failures; we can still use a generic description.
    }

    let caseContextDescription =
      'The user is involved in a family law / custody / divorce matter and is collecting photo evidence to support their case.'

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
          caseContextDescription = `The user is involved in a family law matter with the following context: ${parts.join(
            '; '
          )}. They are using this photo as evidence for that case.`
        }
      }
    } catch {
      // Ignore case lookup failures; keep generic description.
    }

    const speakerLine = userDisplayName
      ? `The person providing this photo evidence is ${userDisplayName}.`
      : 'The person providing this photo evidence is the user.'

    // Look up the evidence row to get storage_path and enforce ownership.
    const { data: evidenceRow, error: evidenceError } = await supabase
      .from('evidence')
      .select('id, user_id, storage_path, original_filename, mime_type, summary, tags')
      .eq('id', evidenceId)
      .eq('user_id', userId)
      .single()

    if (evidenceError || !evidenceRow) {
      // eslint-disable-next-line no-console
      console.error('Failed to load evidence for photo description:', evidenceError)
      throw createError({
        statusCode: 404,
        statusMessage: 'Evidence not found.'
      })
    }

    if (!evidenceRow.storage_path) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Evidence does not have an associated image file to describe.'
      })
    }

    const bucket = 'daylight-files'
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(evidenceRow.storage_path, 60 * 15)

    if (signedError || !signed?.signedUrl) {
      // eslint-disable-next-line no-console
      console.error('Failed to create signed URL for evidence image:', signedError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create signed URL for evidence image.'
      })
    }

    const imageUrl = signed.signedUrl

    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    /**
     * Use the Responses API with structured output parsing via Zod schemas.
     * This keeps the output aligned with our evidence.summary/tags fields while
     * avoiding full OCR for simple photo evidence.
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
                'You are an assistant for Project Daylight that describes photo evidence in a factual, neutral way.',
                'You receive a single image that may show injuries, locations, documents, or other visual context.',
                '',
                speakerLine,
                caseContextDescription,
                '',
                'Your job is to:',
                '- Provide a short neutral title suitable for an evidence card.',
                '- Provide a 1–3 sentence factual description of what is visible.',
                '- Suggest a small set of tags that will help the user find this evidence later.',
                '',
                'Rules:',
                '- Do not guess about intent or internal states.',
                '- Do not provide legal, medical, or psychological opinions.',
                '- Prefer concrete observations (e.g., "a bruise on the left forearm") over interpretations.',
                '- If something is unclear, simply omit it from the description instead of speculating.',
                '- If there is no visible text in the image, do not mention the absence of text; just describe what the image shows.'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Look at this photo evidence and describe it for use in a legal evidence log.'
            },
            {
              type: 'input_image',
              image_url: imageUrl,
              detail: 'high'
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
        statusMessage: 'Description model returned an empty response.'
      })
    }

    const { suggested_title, suggested_summary, suggested_tags } = extraction.extraction

    const { data: updatedEvidence, error: updateError } = await supabase
      .from('evidence')
      .update({
        // Preserve existing summary/tags if the model produced empty values (should be rare).
        summary: suggested_summary || evidenceRow.summary || null,
        tags: (suggested_tags && suggested_tags.length > 0 ? suggested_tags : evidenceRow.tags) ?? []
      })
      .eq('id', evidenceRow.id)
      .eq('user_id', userId)
      .select('id, summary, tags')
      .single()

    if (updateError) {
      // eslint-disable-next-line no-console
      console.error('Failed to update evidence with photo description:', updateError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to save photo description to evidence.'
      })
    }

    let payload: any = {
      extraction: extraction.extraction,
      evidence: updatedEvidence,
      display: {
        title: suggested_title,
        summary: suggested_summary,
        tags: suggested_tags
      }
    }

    payload._usage = usage

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
    console.error('Photo evidence description error:', error)

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
      statusMessage: 'Failed to describe photo evidence. Please try again.'
    })
  }
})




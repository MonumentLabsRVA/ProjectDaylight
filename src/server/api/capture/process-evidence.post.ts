import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * POST /api/capture/process-evidence
 * 
 * Processes a single piece of evidence with LLM analysis.
 * This is called during the capture flow BEFORE event extraction.
 * 
 * The LLM receives:
 * - The evidence file (image/document)
 * - The user's annotation about what it shows
 * - Case context for the user
 * 
 * It produces a structured extraction that will be used during event extraction.
 */

interface ProcessEvidenceBody {
  evidenceId: string
  userAnnotation?: string
}

// Schema for evidence extraction
const EvidenceExtractionSchema = z.object({
  extraction: z.object({
    // What the evidence shows
    summary: z.string().describe('1-3 sentence factual description of what this evidence shows'),
    
    // Key facts extracted
    key_facts: z.array(z.object({
      fact: z.string().describe('A specific fact visible in the evidence'),
      confidence: z.enum(['high', 'medium', 'low']).describe('How confident we are in this fact')
    })).describe('Specific facts extracted from the evidence'),
    
    // Timestamps if visible
    timestamps: z.array(z.object({
      value: z.string().describe('The timestamp value as shown'),
      iso: z.string().nullable().describe('ISO-8601 representation if parseable'),
      context: z.string().describe('What this timestamp refers to')
    })).describe('Any timestamps visible in the evidence'),
    
    // Quotes if this is a communication
    quotes: z.array(z.object({
      speaker: z.string().describe('Who said this'),
      text: z.string().describe('The exact quote'),
      context: z.string().nullable().describe('Context around the quote')
    })).describe('Direct quotes visible in the evidence'),
    
    // People mentioned or visible
    people_mentioned: z.array(z.string()).describe('Names or identifiers of people mentioned'),
    
    // Relevance assessment
    relevance: z.object({
      child_related: z.boolean().describe('Whether this involves or mentions children'),
      agreement_related: z.boolean().describe('Whether this relates to custody agreements'),
      safety_related: z.boolean().describe('Whether this relates to safety concerns'),
      communication_type: z.enum(['text', 'email', 'document', 'photo', 'other', 'none']).describe('Type of communication if applicable')
    }),
    
    // Suggested tags
    suggested_tags: z.array(z.string()).describe('Tags for categorizing this evidence')
  })
})

type ExtractionResult = z.infer<typeof EvidenceExtractionSchema>

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openai?.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI API key is not configured.'
    })
  }

  const body = await readBody<ProcessEvidenceBody>(event)
  const evidenceId = body?.evidenceId?.trim()
  const userAnnotation = body?.userAnnotation?.trim() || ''

  if (!evidenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'evidenceId is required.'
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
    // Load the evidence record
    const { data: evidence, error: evidenceError } = await supabase
      .from('evidence')
      .select('id, user_id, storage_path, original_filename, mime_type, source_type')
      .eq('id', evidenceId)
      .eq('user_id', userId)
      .single()

    if (evidenceError || !evidence) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Evidence not found.'
      })
    }

    // Load case context
    let caseContext = 'The user is involved in a family law / custody matter.'

    const { data: caseRow } = await supabase
      .from('cases')
      .select('case_type, stage, your_role, opposing_party_name, goals_summary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (caseRow) {
      const parts: string[] = []
      if (caseRow.case_type) parts.push(`case type: ${caseRow.case_type}`)
      if (caseRow.your_role) parts.push(`their role: ${caseRow.your_role}`)
      if (caseRow.opposing_party_name) parts.push(`opposing party: ${caseRow.opposing_party_name}`)
      if (parts.length) {
        caseContext = `The user is involved in a family law matter: ${parts.join('; ')}.`
      }
    }

    // Get signed URL for the file
    const bucket = 'daylight-files'
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(evidence.storage_path!, 60 * 15)

    if (signedError || !signed?.signedUrl) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to access evidence file.'
      })
    }

    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    // Build the prompt
    const systemPrompt = [
      'You are an evidence analysis assistant for Project Daylight, a legal documentation tool.',
      'You are analyzing a piece of evidence provided by someone in a family law / custody situation.',
      '',
      caseContext,
      '',
      'Your job is to extract factual information from this evidence that could be relevant to their case.',
      '',
      'Rules:',
      '- Be factual and neutral. Do not interpret emotions or make judgments.',
      '- Extract specific facts, timestamps, and quotes when visible.',
      '- If something is unclear, note it but do not guess.',
      '- Do not provide legal advice or opinions.',
      '- Focus on what is objectively visible in the evidence.'
    ].join('\n')

    const userPrompt = userAnnotation
      ? `The user provided this context about this evidence: "${userAnnotation}"\n\nAnalyze this evidence and extract relevant information.`
      : 'Analyze this evidence and extract relevant information.'

    // Determine if this is an image or document
    const isImage = evidence.mime_type?.startsWith('image/')

    const inputContent: any[] = [
      { type: 'input_text', text: userPrompt }
    ]

    if (isImage) {
      inputContent.push({
        type: 'input_image',
        image_url: signed.signedUrl,
        detail: 'high'
      })
    } else {
      // For non-image files, we'd need different handling
      // For now, just note that we can't process non-images directly
      inputContent.push({
        type: 'input_text',
        text: `[This is a ${evidence.mime_type} file named "${evidence.original_filename}". Direct content analysis not available for this file type.]`
      })
    }

    const response = await openai.responses.parse({
      model: 'gpt-5.4-mini',
      text: {
        format: zodTextFormat(EvidenceExtractionSchema, 'extraction')
      },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: inputContent
        }
      ]
    })

    const extraction = response.output_parsed as ExtractionResult

    if (!extraction) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Evidence analysis returned empty response.'
      })
    }

    // Update the evidence record with the extraction and annotation
    const { error: updateError } = await supabase
      .from('evidence')
      .update({
        user_annotation: userAnnotation || null,
        extraction_raw: extraction,
        summary: extraction.extraction.summary,
        tags: extraction.extraction.suggested_tags
      })
      .eq('id', evidenceId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('Failed to update evidence with extraction:', updateError)
    }

    return {
      evidenceId,
      extraction: extraction.extraction,
      _usage: response.usage
    }
  } catch (error: any) {
    console.error('Evidence processing error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to process evidence. Please try again.'
    })
  }
})


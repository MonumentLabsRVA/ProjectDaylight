import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

const ReportMetadataSchema = z.object({
  subject: z.string().describe('A concise subject line (max 60 chars) summarizing the feedback'),
  category: z.enum(['bug', 'feature_request', 'question', 'feedback', 'other']).describe('The type of feedback: bug for issues/errors, feature_request for new ideas, question for help needed, feedback for general thoughts/praise, other for anything else')
})

export type ReportMetadata = z.infer<typeof ReportMetadataSchema>

/**
 * Generate a subject line and category from user feedback using GPT-5-nano.
 * Used for bug reports when the user doesn't provide these fields.
 */
export async function generateReportMetadata(description: string): Promise<ReportMetadata> {
  const config = useRuntimeConfig()

  const fallback: ReportMetadata = {
    subject: description.slice(0, 50).trim() + (description.length > 50 ? '...' : ''),
    category: 'feedback'
  }

  if (!config.openai?.apiKey) {
    return fallback
  }

  try {
    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    const response = await openai.responses.parse({
      model: 'gpt-5-mini',
      reasoning: { effort: 'minimal' },
      text: {
        format: zodTextFormat(ReportMetadataSchema, 'report_metadata')
      },
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'Analyze user feedback and generate:',
                '1. A concise subject line (max 60 characters) capturing the main point',
                '2. A category that best fits the feedback:',
                '   - bug: something is broken, not working, or causing errors',
                '   - feature_request: a new feature idea or improvement suggestion',
                '   - question: user needs help or has a question',
                '   - feedback: general thoughts, praise, or opinions',
                '   - other: anything that doesn\'t fit above',
                '',
                'Be accurate with categorization. Praise should be "feedback", issues should be "bug".'
              ].join('\n')
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: description.slice(0, 1000)
            }
          ]
        }
      ]
    })

    const result = response.output_parsed as ReportMetadata
    
    if (result?.subject && result?.category) {
      return {
        subject: result.subject.slice(0, 60),
        category: result.category
      }
    }

    return fallback
  } catch (error) {
    console.error('[generateReportMetadata] LLM call failed:', error)
    return fallback
  }
}

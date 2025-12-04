import OpenAI from 'openai'
import { serverSupabaseUser } from '#supabase/server'

interface ExportSummaryBody {
  timeline: any[]
  evidence: any[]
  caseInfo?: any
  exportFocus?: 'full-timeline' | 'incidents-only' | 'positive-parenting'
  userPreferences?: {
    caseTitle?: string
    courtName?: string
    recipient?: string
    overviewNotes?: string
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  if (!config.openai?.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.'
    })
  }

  // Ensure the request is authenticated via cookies/JWT (no manual Authorization header)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const body = await readBody<ExportSummaryBody>(event)
  
  if (!body) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Request body is required'
    })
  }

  const { timeline = [], evidence = [], caseInfo, exportFocus = 'full-timeline', userPreferences = {} } = body

  // Check if there's enough data to generate a meaningful summary
  if (timeline.length === 0 && evidence.length === 0) {
    return {
      summary: 'No timeline events or evidence items available to summarize. Begin by capturing events and uploading evidence to build your case documentation.',
      metadata: {
        exportFocus,
        eventsAnalyzed: 0,
        evidenceAnalyzed: 0,
        generatedAt: new Date().toISOString(),
        usage: null
      }
    }
  }

  try {
    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    // Build context for the AI based on the export data
    const contextParts: string[] = []
    
    // Add case information if available
    if (caseInfo) {
      contextParts.push('CASE INFORMATION:')
      if (caseInfo.title) contextParts.push(`- Title: ${caseInfo.title}`)
      if (caseInfo.case_number) contextParts.push(`- Case Number: ${caseInfo.case_number}`)
      if (caseInfo.jurisdiction_state && caseInfo.jurisdiction_county) {
        contextParts.push(`- Jurisdiction: ${caseInfo.jurisdiction_county}, ${caseInfo.jurisdiction_state}`)
      }
      if (caseInfo.court_name) contextParts.push(`- Court: ${caseInfo.court_name}`)
      if (caseInfo.goals_summary) contextParts.push(`- Goals: ${caseInfo.goals_summary}`)
      if (caseInfo.children_summary) contextParts.push(`- Children: ${caseInfo.children_summary}`)
      if (caseInfo.parenting_schedule) contextParts.push(`- Parenting Schedule: ${caseInfo.parenting_schedule}`)
      if (caseInfo.next_court_date) contextParts.push(`- Next Court Date: ${caseInfo.next_court_date}`)
      if (caseInfo.risk_flags && caseInfo.risk_flags.length > 0) {
        contextParts.push(`- Risk Flags: ${caseInfo.risk_flags.join(', ')}`)
      }
      contextParts.push('')
    }

    // Add user preferences/context
    if (userPreferences.overviewNotes) {
      contextParts.push('USER CONTEXT/NOTES:')
      contextParts.push(userPreferences.overviewNotes)
      contextParts.push('')
    }

    // Add timeline events
    if (timeline.length > 0) {
      contextParts.push(`TIMELINE EVENTS (${timeline.length} total):`)
      
      // Filter events based on export focus
      let filteredEvents = timeline
      if (exportFocus === 'incidents-only') {
        filteredEvents = timeline.filter(e => e.type === 'incident')
      } else if (exportFocus === 'positive-parenting') {
        filteredEvents = timeline.filter(e => e.type === 'positive')
      }
      
      filteredEvents.forEach(event => {
        const eventDate = event.timestamp ? new Date(event.timestamp).toLocaleDateString() : 'No date'
        contextParts.push(`- [${eventDate}] ${event.title} (${event.type})`)
        if (event.description) contextParts.push(`  Details: ${event.description}`)
        if (event.location) contextParts.push(`  Location: ${event.location}`)
        if (event.participants?.length) contextParts.push(`  Participants: ${event.participants.join(', ')}`)
      })
      contextParts.push('')
    }

    // Add evidence items
    if (evidence.length > 0) {
      contextParts.push(`EVIDENCE ITEMS (${evidence.length} total):`)
      evidence.forEach(item => {
        const itemDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'No date'
        contextParts.push(`- [${itemDate}] ${item.originalName} (${item.sourceType})`)
        if (item.summary) contextParts.push(`  Summary: ${item.summary}`)
        if (item.tags?.length) contextParts.push(`  Tags: ${item.tags.join(', ')}`)
      })
      contextParts.push('')
    }

    // Build the prompt based on export focus
    let focusInstruction = ''
    let structureGuidance = ''
    
    switch (exportFocus) {
      case 'incidents-only':
        focusInstruction = `Focus exclusively on documented incidents, concerning behaviors, and potential safety issues.
Organize by: 1) Most serious/recent incidents, 2) Patterns of concerning behavior, 3) Documentation quality of each incident.
Emphasize: Specific dates, times, locations, witnesses, and any immediate responses or interventions taken.`
        structureGuidance = 'Structure the summary to highlight the frequency and severity of incidents, with clear chronological context.'
        break
        
      case 'positive-parenting':
        focusInstruction = `Emphasize the parent's active involvement, stability, and positive contributions to the child's wellbeing.
Highlight: 1) Consistent routines and structure, 2) Educational and extracurricular support, 3) Medical and emotional care provided.
Include: Specific examples of positive parenting decisions, child's progress under their care, and proactive problem-solving.`
        structureGuidance = 'Structure the summary to demonstrate consistency, involvement, and the parent\'s prioritization of the child\'s best interests.'
        break
        
      default:
        focusInstruction = `Provide a comprehensive, balanced overview of all documented events and evidence.
Include: 1) Key patterns and trends, 2) Both positive and concerning events, 3) Changes over time.
Balance: Present facts neutrally while noting significant developments in either direction.`
        structureGuidance = 'Structure the summary chronologically with clear sections for different types of events or patterns identified.'
    }
    
    // Tailor language based on recipient
    let recipientContext = ''
    if (userPreferences.recipient) {
      const recipientLower = userPreferences.recipient.toLowerCase()
      if (recipientLower.includes('attorney') || recipientLower.includes('lawyer')) {
        recipientContext = `This summary is for the parent's attorney. Focus on legally actionable information, potential evidence strength, and areas that may need additional documentation. Use precise legal terminology where appropriate.`
      } else if (recipientLower.includes('gal') || recipientLower.includes('guardian')) {
        recipientContext = `This summary is for a Guardian ad Litem. Emphasize child-focused information, parenting capacity, and the child's best interests. Include observations about parent-child interactions and the child's wellbeing.`
      } else if (recipientLower.includes('court') || recipientLower.includes('judge')) {
        recipientContext = `This summary is for the court. Maintain strict neutrality and focus on documented facts. Present information in a clear, organized manner that respects the court's time. Avoid any appearance of bias or emotional language.`
      } else {
        recipientContext = `This summary will be shared with: ${userPreferences.recipient}. Maintain professionalism and focus on documented facts relevant to custody proceedings.`
      }
    }

    const systemPrompt = `You are preparing a custody case documentation summary for a parent navigating family court.
Your role is to transform raw timeline data and evidence into a clear, court-ready narrative.

RECIPIENT CONTEXT:
${recipientContext || 'Create a general summary suitable for legal review.'}

REPORT FOCUS:
${focusInstruction}

${structureGuidance}

CRITICAL REQUIREMENTS:
- Maintain absolute neutrality in tone - state facts, not interpretations
- Use specific dates, times, and locations whenever available
- Identify patterns only when supported by multiple documented instances
- Note any significant gaps in documentation that could be important
- Reference evidence items by type (photo, email, text, document) when relevant
- Keep the summary to 2-3 focused paragraphs (3-4 for complex cases)

OUTPUT PRINCIPLES:
- First paragraph: Overview of documentation scope and key patterns
- Middle paragraph(s): Specific examples and evidence that support the identified patterns
- Final paragraph: Note any documentation gaps or areas needing attention
- Use clear topic sentences and logical flow
- Avoid emotional language, speculation, or legal conclusions
- Write in third person when referring to parties involved

Remember: This document may be presented in court. Every word must be defensible and fact-based.`

    // Add statistics to help the AI understand the scope
    const eventStats = {
      total: timeline.length,
      incidents: timeline.filter(e => e.type === 'incident').length,
      positive: timeline.filter(e => e.type === 'positive').length,
      medical: timeline.filter(e => e.type === 'medical').length,
      school: timeline.filter(e => e.type === 'school').length,
      legal: timeline.filter(e => e.type === 'legal').length
    }
    
    const dateRange = timeline.length > 0 ? {
      start: new Date(Math.min(...timeline.map(e => new Date(e.timestamp || 0).getTime()))).toLocaleDateString(),
      end: new Date(Math.max(...timeline.map(e => new Date(e.timestamp || 0).getTime()))).toLocaleDateString()
    } : null

    const userPrompt = `Please create a summary of the following custody case documentation:

DOCUMENTATION OVERVIEW:
- Date Range: ${dateRange ? `${dateRange.start} to ${dateRange.end}` : 'No dated events'}
- Total Events: ${eventStats.total} (${eventStats.incidents} incidents, ${eventStats.positive} positive, ${eventStats.medical} medical, ${eventStats.school} school, ${eventStats.legal} legal/court)
- Evidence Items: ${evidence.length} total
- Export Focus: ${exportFocus === 'incidents-only' ? 'Incidents and concerns only' : exportFocus === 'positive-parenting' ? 'Positive parenting and stability' : 'Complete timeline'}

${contextParts.join('\n')}

Generate a summary following the structure and requirements specified in your instructions.`

    const response = await openai.responses.create({
      model: 'gpt-5',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }]
        }
      ],
      temperature: 0.3   // Lower temperature for more consistent, fact-based output
    })

    const summary = response.output_text || 'Unable to generate summary.'

    // Return the summary along with token usage info
    return {
      summary,
      metadata: {
        exportFocus,
        eventsAnalyzed: timeline.length,
        evidenceAnalyzed: evidence.length,
        generatedAt: new Date().toISOString(),
        usage: response.usage ? {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens
        } : null
      }
    }
  } catch (error: any) {
    // Handle OpenAI API errors
    if (error?.status === 401) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Invalid OpenAI API key. Please check your configuration.'
      })
    }

    if (error?.status === 429) {
      throw createError({
        statusCode: 429,
        statusMessage: 'OpenAI API rate limit exceeded. Please try again later.'
      })
    }

    console.error('[Export Summary] Error generating summary:', error)
    
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to generate export summary'
    })
  }
})

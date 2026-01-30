import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { canCreateJournalEntry } from '../../utils/subscription'
import { inngest } from '../../inngest/client'
import { getTimezoneWithProfileFallback } from '../../utils/timezone'
import type { JournalSubmitResponse } from '~/types'

export default defineEventHandler(async (event): Promise<JournalSubmitResponse> => {
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Feature gating
  const check = await canCreateJournalEntry(event, userId)
  if (!check.allowed) {
    throw createError({ statusCode: 403, statusMessage: check.reason || 'Not allowed to create journal entry' })
  }

  const body = await readBody<{
    eventText: string
    referenceDate?: string
    timezone?: string
    evidenceIds?: string[]
  }>(event)

  if (!body.eventText?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Event text is required' })
  }

  // 1. Create journal entry in 'processing' state
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      event_text: body.eventText,
      reference_date: body.referenceDate || null,
      status: 'processing'
    })
    .select('id')
    .single()

  if (entryError || !entry) {
    console.error('[journal/submit] Failed to create journal entry:', entryError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create journal entry' })
  }

  // 2. Create job record
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      type: 'journal_extraction',
      status: 'pending',
      journal_entry_id: entry.id
    })
    .select('id')
    .single()

  if (jobError || !job) {
    console.error('[journal/submit] Failed to create job:', jobError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create job' })
  }

  // 3. Resolve user's timezone (prefer body, fallback to profile, then UTC)
  let timezone = body.timezone
  if (!timezone) {
    timezone = await getTimezoneWithProfileFallback(event, supabase, userId)
  }

  // 4. Fire background event
  try {
    await inngest.send({
      name: 'journal/extraction.requested',
      data: {
        jobId: job.id,
        journalEntryId: entry.id,
        userId,
        eventText: body.eventText,
        referenceDate: body.referenceDate || null,
        timezone,
        evidenceIds: body.evidenceIds || []
      }
    })
  } catch (error: any) {
    console.error('[journal/submit] Failed to enqueue Inngest job:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to queue background processing'
    })
  }

  return {
    journalEntryId: entry.id,
    jobId: job.id,
    message: 'Processing started'
  }
})



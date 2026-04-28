import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../../../utils/auth'
import { requireCaseAccess } from '../../../utils/cases'
import type { Database } from '~/types/database.types'

const KINDS = ['event', 'message', 'journal'] as const
type Kind = (typeof KINDS)[number]

/**
 * Fetch the full record behind a chat citation. Three kinds, one endpoint —
 * the chat UI needs the same hover-and-slideover UX for any of them, and a
 * single endpoint keeps the client side small.
 *
 * Returns the row plus, for messages, the surrounding thread.
 */
export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') as Kind | undefined
  const id = getRouterParam(event, 'id')
  if (!kind || !KINDS.includes(kind)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid citation kind' })
  }
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const supabase = await serverSupabaseClient<Database>(event)
  const userId = await requireUserId(event, supabase)

  if (kind === 'event') {
    const { data, error } = await supabase
      .from('events')
      .select('id, case_id, title, description, primary_timestamp, type, child_involved, safety_concern, location, journal_entry_id')
      .eq('id', id)
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'event not found' })
    await requireCaseAccess(supabase, userId, data.case_id)

    const [{ data: parts }, { data: links }] = await Promise.all([
      supabase.from('event_participants').select('label, role').eq('event_id', id),
      supabase.from('event_evidence').select('evidence_id, is_primary').eq('event_id', id)
    ])

    return {
      kind: 'event' as const,
      id: data.id,
      title: data.title,
      description: data.description,
      timestamp: data.primary_timestamp,
      type: data.type,
      childInvolved: data.child_involved,
      safetyConcern: data.safety_concern,
      location: data.location,
      participants: (parts ?? []).map(p => ({ label: p.label, role: p.role })),
      evidenceIds: (links ?? []).map(l => l.evidence_id),
      sourcePath: `/event/${data.id}`
    }
  }

  if (kind === 'message') {
    const { data, error } = await supabase
      .from('messages')
      .select('id, case_id, sent_at, sender, recipient, subject, body, thread_id, message_number, attachments')
      .eq('id', id)
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'message not found' })
    await requireCaseAccess(supabase, userId, data.case_id)

    let thread: Array<{ id: string, sentAt: string | null, sender: string, subject: string | null }> = []
    if (data.thread_id) {
      const { data: ctx } = await supabase
        .from('messages')
        .select('id, sent_at, sender, subject')
        .eq('case_id', data.case_id)
        .eq('thread_id', data.thread_id)
        .order('sent_at', { ascending: true })
        .limit(50)
      thread = (ctx ?? []).map(m => ({
        id: m.id,
        sentAt: m.sent_at,
        sender: m.sender,
        subject: m.subject
      }))
    }

    return {
      kind: 'message' as const,
      id: data.id,
      timestamp: data.sent_at,
      sender: data.sender,
      recipient: data.recipient,
      subject: data.subject,
      body: data.body,
      threadId: data.thread_id,
      messageNumber: data.message_number,
      attachments: data.attachments,
      thread,
      sourcePath: `/messages/${data.id}`
    }
  }

  // journal
  const { data, error } = await supabase
    .from('journal_entries')
    .select('id, case_id, event_text, reference_date, reference_time_description, status, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'journal entry not found' })
  await requireCaseAccess(supabase, userId, data.case_id)

  return {
    kind: 'journal' as const,
    id: data.id,
    text: data.event_text,
    referenceDate: data.reference_date,
    referenceTimeDescription: data.reference_time_description,
    status: data.status,
    createdAt: data.created_at,
    sourcePath: `/journal/${data.id}`
  }
})

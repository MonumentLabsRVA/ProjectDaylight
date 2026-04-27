import { serverSupabaseClient } from '#supabase/server'
import { requireUserId } from '../../utils/auth'
import { getActiveCaseIdOrNull } from '../../utils/cases'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

/**
 * GET /api/messages
 *
 * Query params:
 *   - caseId   override the active case
 *   - from     ISO date — sent_at >= from
 *   - to       ISO date — sent_at <= to
 *   - sender   exact match on sender field (multi-allowed: pass repeated ?sender=)
 *   - q        full-text search over body (Postgres FTS via to_tsvector)
 *   - limit    1..500, default 100
 *   - offset   pagination
 *
 * RLS already scopes by case ownership; we still pass case_id explicitly so the
 * indexes get used. Returns rows ordered newest-first.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase)

  const query = getQuery(event)
  const override = typeof query.caseId === 'string' ? query.caseId : null
  const caseId = await getActiveCaseIdOrNull(supabase, userId, override)

  if (!caseId) {
    return { messages: [], total: 0 }
  }

  const from = typeof query.from === 'string' ? query.from : null
  const to = typeof query.to === 'string' ? query.to : null
  const q = typeof query.q === 'string' ? query.q.trim() : ''
  const sendersRaw = query.sender
  const senders: string[] = Array.isArray(sendersRaw)
    ? sendersRaw.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : typeof sendersRaw === 'string' && sendersRaw.length > 0
      ? [sendersRaw]
      : []

  const requestedLimit = Number.parseInt(typeof query.limit === 'string' ? query.limit : `${DEFAULT_LIMIT}`, 10)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT
  const offsetRaw = Number.parseInt(typeof query.offset === 'string' ? query.offset : '0', 10)
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0

  let builder = supabase
    .from('messages')
    .select(
      'id, sent_at, first_viewed_at, sender, recipient, subject, body, thread_id, message_number, sequence_number, word_count, attachments, evidence_id',
      { count: 'exact' }
    )
    .eq('case_id', caseId)
    .order('sent_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (from) builder = builder.gte('sent_at', from)
  if (to) builder = builder.lte('sent_at', to)
  if (senders.length) builder = builder.in('sender', senders)
  if (q) {
    // websearch_to_tsquery handles user-entered search syntax safely.
    builder = builder.textSearch('body', q, { config: 'english', type: 'websearch' })
  }

  const { data, count, error } = await builder

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/messages] supabase error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load messages.' })
  }

  return {
    messages: data ?? [],
    total: count ?? 0,
    limit,
    offset
  }
})

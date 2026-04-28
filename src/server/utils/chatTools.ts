import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { CitationRegistry } from './citations'

type Client = SupabaseClient<Database>

const MAX_RECORDS = 25
const BODY_PREVIEW_CHARS = 320

const eventTypeEnum = z.enum([
  'incident',
  'positive',
  'medical',
  'school',
  'communication',
  'legal'
])

interface ToolDeps {
  registry: CitationRegistry
}

function safeIso(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Build the case-scoped tool set the chat agent uses. Every tool:
 *   - Filters by case_id (RLS would also block, but explicit filter uses our indexes).
 *   - Returns structured records with stable `id` fields the agent cites via [type:id].
 *   - Caps results at MAX_RECORDS and signals `truncated: true` when a cap hits.
 *   - Returns `{ error: '...' }` instead of throwing, so the agent can recover.
 *
 * The CitationRegistry collects every record id surfaced this turn. After the
 * stream finishes, the streaming endpoint uses it to strip hallucinated citations.
 */
export function createCaseTools(client: Client, caseId: string, deps: ToolDeps) {
  const { registry } = deps

  return {
    search_events: tool({
      description:
        'Search timeline events for the active case by free text, date range, and/or type. '
        + 'Returns up to 25 matches as compact records. Cite each event you mention via [event:<id>].',
      inputSchema: z.object({
        query: z.string().optional().describe('Free text matched against title + description'),
        from: z.string().optional().describe('ISO date — primary_timestamp >= from'),
        to: z.string().optional().describe('ISO date — primary_timestamp <= to'),
        types: z.array(eventTypeEnum).optional()
      }),
      execute: async (args) => {
        try {
          let q = client
            .from('events')
            .select('id, title, description, primary_timestamp, type, child_involved, safety_concern, location')
            .eq('case_id', caseId)
            .order('primary_timestamp', { ascending: false })
            .limit(MAX_RECORDS + 1)

          if (args.query?.trim()) {
            const term = args.query.trim().replace(/[%_]/g, '\\$&')
            q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
          }
          if (args.from) q = q.gte('primary_timestamp', args.from)
          if (args.to) q = q.lte('primary_timestamp', args.to)
          if (args.types?.length) q = q.in('type', args.types)

          const { data, error } = await q
          if (error) return { error: error.message }

          const truncated = (data?.length ?? 0) > MAX_RECORDS
          const items = (data ?? []).slice(0, MAX_RECORDS).map(r => ({
            id: r.id,
            title: r.title,
            description: (r.description ?? '').slice(0, BODY_PREVIEW_CHARS),
            timestamp: safeIso(r.primary_timestamp),
            type: r.type,
            childInvolved: r.child_involved,
            safetyConcern: r.safety_concern,
            location: r.location
          }))
          registry.recordMany(items.map(i => i.id))
          return { items, count: items.length, truncated }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_event: tool({
      description: 'Fetch a single event by id, including participants and any linked evidence ids.',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        try {
          const { data: ev, error } = await client
            .from('events')
            .select('id, title, description, primary_timestamp, type, child_involved, safety_concern, location, journal_entry_id')
            .eq('id', id)
            .eq('case_id', caseId)
            .maybeSingle()
          if (error) return { error: error.message }
          if (!ev) return { error: 'not found in this case' }

          const [{ data: parts }, { data: links }] = await Promise.all([
            client.from('event_participants').select('label, role').eq('event_id', id),
            client.from('event_evidence').select('evidence_id, is_primary').eq('event_id', id)
          ])

          registry.record(ev.id)
          return {
            id: ev.id,
            title: ev.title,
            description: ev.description,
            timestamp: safeIso(ev.primary_timestamp),
            type: ev.type,
            childInvolved: ev.child_involved,
            safetyConcern: ev.safety_concern,
            location: ev.location,
            journalEntryId: ev.journal_entry_id,
            participants: (parts ?? []).map(p => ({ label: p.label, role: p.role })),
            evidenceIds: (links ?? []).map(l => l.evidence_id)
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    search_messages: tool({
      description:
        'Search OFW messages for the active case by sender, date range, and/or full-text body match. '
        + 'Returns up to 25 matches with id, sent_at, sender, recipient, subject, body preview. Cite via [message:<id>].',
      inputSchema: z.object({
        query: z.string().optional(),
        sender: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      }),
      execute: async (args) => {
        try {
          let q = client
            .from('messages')
            .select('id, sent_at, sender, recipient, subject, body, thread_id, message_number')
            .eq('case_id', caseId)
            .order('sent_at', { ascending: false })
            .limit(MAX_RECORDS + 1)

          if (args.sender) q = q.ilike('sender', `%${args.sender}%`)
          if (args.from) q = q.gte('sent_at', args.from)
          if (args.to) q = q.lte('sent_at', args.to)
          if (args.query?.trim()) {
            q = q.textSearch('body', args.query.trim(), { config: 'english', type: 'websearch' })
          }

          const { data, error } = await q
          if (error) return { error: error.message }

          const truncated = (data?.length ?? 0) > MAX_RECORDS
          const items = (data ?? []).slice(0, MAX_RECORDS).map(m => ({
            id: m.id,
            timestamp: safeIso(m.sent_at),
            sender: m.sender,
            recipient: m.recipient,
            subject: m.subject,
            bodyPreview: (m.body ?? '').slice(0, BODY_PREVIEW_CHARS),
            threadId: m.thread_id,
            messageNumber: m.message_number
          }))
          registry.recordMany(items.map(i => i.id))
          return { items, count: items.length, truncated }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_message: tool({
      description: 'Fetch a single message with full body and surrounding thread context (other messages in the same thread).',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        try {
          const { data: m, error } = await client
            .from('messages')
            .select('id, sent_at, sender, recipient, subject, body, thread_id, message_number, attachments')
            .eq('id', id)
            .eq('case_id', caseId)
            .maybeSingle()
          if (error) return { error: error.message }
          if (!m) return { error: 'not found in this case' }

          let thread: Array<Record<string, unknown>> = []
          if (m.thread_id) {
            const { data: ctx } = await client
              .from('messages')
              .select('id, sent_at, sender, subject')
              .eq('case_id', caseId)
              .eq('thread_id', m.thread_id)
              .order('sent_at', { ascending: true })
              .limit(50)
            thread = (ctx ?? []).map(t => ({
              id: t.id,
              timestamp: safeIso(t.sent_at),
              sender: t.sender,
              subject: t.subject
            }))
            registry.recordMany(thread.map(t => t.id as string))
          }

          registry.record(m.id)
          return {
            id: m.id,
            timestamp: safeIso(m.sent_at),
            sender: m.sender,
            recipient: m.recipient,
            subject: m.subject,
            body: m.body,
            threadId: m.thread_id,
            messageNumber: m.message_number,
            attachments: m.attachments,
            thread
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_journal_entries: tool({
      description:
        'Search the user\'s journal entries by free text and/or date range. Returns up to 25 matches. Cite via [journal:<id>].',
      inputSchema: z.object({
        query: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      }),
      execute: async (args) => {
        try {
          let q = client
            .from('journal_entries')
            .select('id, event_text, reference_date, reference_time_description, status, created_at')
            .eq('case_id', caseId)
            .order('reference_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(MAX_RECORDS + 1)

          if (args.query?.trim()) {
            const term = args.query.trim().replace(/[%_]/g, '\\$&')
            q = q.ilike('event_text', `%${term}%`)
          }
          if (args.from) q = q.gte('reference_date', args.from)
          if (args.to) q = q.lte('reference_date', args.to)

          const { data, error } = await q
          if (error) return { error: error.message }

          const truncated = (data?.length ?? 0) > MAX_RECORDS
          const items = (data ?? []).slice(0, MAX_RECORDS).map(j => ({
            id: j.id,
            preview: (j.event_text ?? '').slice(0, BODY_PREVIEW_CHARS),
            referenceDate: j.reference_date,
            referenceTimeDescription: j.reference_time_description,
            status: j.status,
            createdAt: safeIso(j.created_at)
          }))
          registry.recordMany(items.map(i => i.id))
          return { items, count: items.length, truncated }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_action_items: tool({
      description: 'List action items for the case, optionally filtered by priority. Defaults to open items only.',
      inputSchema: z.object({
        priority: z.enum(['urgent', 'high', 'normal', 'low']).optional(),
        includeCompleted: z.boolean().optional()
      }),
      execute: async (args) => {
        try {
          let q = client
            .from('action_items')
            .select('id, description, priority, status, deadline, type, event_id')
            .eq('case_id', caseId)
            .order('priority', { ascending: true })
            .order('deadline', { ascending: true, nullsFirst: false })
            .limit(MAX_RECORDS + 1)

          if (args.priority) q = q.eq('priority', args.priority)
          if (!args.includeCompleted) q = q.in('status', ['open', 'in_progress'])

          const { data, error } = await q
          if (error) return { error: error.message }

          const truncated = (data?.length ?? 0) > MAX_RECORDS
          const items = (data ?? []).slice(0, MAX_RECORDS)
          return { items, count: items.length, truncated }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_timeline_summary: tool({
      description:
        'High-level stats for the case in an optional date range: counts by event type, message counts by sender, '
        + 'overall date range, and total record counts. Use this to orient before drilling in.',
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional()
      }),
      execute: async (args) => {
        try {
          let evQ = client.from('events').select('type, primary_timestamp').eq('case_id', caseId)
          let msgQ = client.from('messages').select('sender, sent_at').eq('case_id', caseId)
          if (args.from) {
            evQ = evQ.gte('primary_timestamp', args.from)
            msgQ = msgQ.gte('sent_at', args.from)
          }
          if (args.to) {
            evQ = evQ.lte('primary_timestamp', args.to)
            msgQ = msgQ.lte('sent_at', args.to)
          }

          const [{ data: events, error: e1 }, { data: messages, error: e2 }] = await Promise.all([evQ, msgQ])
          if (e1) return { error: e1.message }
          if (e2) return { error: e2.message }

          const eventsByType: Record<string, number> = {}
          for (const e of events ?? []) {
            eventsByType[e.type] = (eventsByType[e.type] ?? 0) + 1
          }

          const messagesBySender: Record<string, number> = {}
          for (const m of messages ?? []) {
            const key = m.sender || 'unknown'
            messagesBySender[key] = (messagesBySender[key] ?? 0) + 1
          }

          const allTimestamps = [
            ...(events ?? []).map(e => e.primary_timestamp).filter(Boolean) as string[],
            ...(messages ?? []).map(m => m.sent_at).filter(Boolean) as string[]
          ].map(t => new Date(t).getTime()).filter(n => !Number.isNaN(n))

          const dateRange = allTimestamps.length
            ? {
                earliest: new Date(Math.min(...allTimestamps)).toISOString(),
                latest: new Date(Math.max(...allTimestamps)).toISOString()
              }
            : null

          return {
            totalEvents: events?.length ?? 0,
            totalMessages: messages?.length ?? 0,
            eventsByType,
            messagesBySender,
            dateRange
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    find_contradictions: tool({
      description:
        'Best-effort: given a claim or reference event id, surface messages and events that mention overlapping topics '
        + 'and might contradict it. THIS IS KEYWORD RETRIEVAL, NOT SEMANTIC SEARCH. Always present results as candidates '
        + 'for the user to read in context — do NOT adjudicate truth or label anyone as lying.',
      inputSchema: z.object({
        claim: z.string(),
        referenceEventId: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      }),
      execute: async (args) => {
        try {
          // Naive keyword extraction: split, lowercase, drop stop-words and shorts.
          const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'is', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'his', 'her', 'their', 'it', 'its'])
          const keywords = Array.from(new Set(
            args.claim
              .toLowerCase()
              .replace(/[^a-z0-9 ]/g, ' ')
              .split(/\s+/)
              .filter(w => w.length >= 4 && !STOP.has(w))
          )).slice(0, 5)

          if (!keywords.length) {
            return { candidates: [], note: 'claim too short to extract searchable keywords' }
          }

          const tsQuery = keywords.join(' OR ')

          let mQ = client.from('messages')
            .select('id, sent_at, sender, subject, body')
            .eq('case_id', caseId)
            .textSearch('body', tsQuery, { config: 'english', type: 'websearch' })
            .order('sent_at', { ascending: false })
            .limit(20)
          if (args.from) mQ = mQ.gte('sent_at', args.from)
          if (args.to) mQ = mQ.lte('sent_at', args.to)

          const { data: msgs, error: e1 } = await mQ
          if (e1) return { error: e1.message }

          const candidates = (msgs ?? []).map(m => ({
            kind: 'message' as const,
            id: m.id,
            timestamp: safeIso(m.sent_at),
            sender: m.sender,
            subject: m.subject,
            preview: (m.body ?? '').slice(0, BODY_PREVIEW_CHARS)
          }))
          registry.recordMany(candidates.map(c => c.id))

          return {
            candidates,
            keywords,
            note: 'Candidates surfaced via keyword retrieval. Read in context before drawing conclusions; do not call this a contradiction without verification.'
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    })
  }
}

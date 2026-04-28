import { tool } from 'ai'
import { z } from 'zod'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import type { CitationRegistry } from './citations'

type Client = SupabaseClient<Database>

const MAX_RECORDS = 25
const MAX_THREADS = 10
const MAX_THREADS_TO_RANK = 300
const RANK_MODEL = 'gpt-5.4-mini'
const BODY_PREVIEW_CHARS = 320

const eventTypeEnum = z.enum([
  'incident',
  'positive',
  'medical',
  'school',
  'communication',
  'legal'
])

const toneEnum = z.enum(['cooperative', 'neutral', 'tense', 'hostile', 'mixed'])

interface ToolDeps {
  registry: CitationRegistry
  /** OpenAI API key, used by find_relevant_threads to rank summaries. */
  openaiApiKey: string
}

const RankSchema = z.object({
  matches: z.array(z.object({
    id: z.string().describe('The thread row id from the input. Must match one of the provided ids exactly.'),
    reason: z.string().describe('One short clause (max 15 words) on why this thread matches.')
  })).max(5)
})

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
  const { registry, openaiApiKey } = deps

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

    search_threads: tool({
      description:
        'Search thread-level summaries for the active case. **Start here for any "what happened with X" question** — threads aggregate the full conversation so you do not have to read every message. Returns up to 10 threads with summary, tone, flags, participants, and search anchors. '
        + 'QUERY RULES: pass 1–3 distinctive keywords (a name, a topic, a date), NOT a full sentence. Names beat verbs. Cite a thread via [thread:<id>]. To read individual messages in a thread, call get_thread next.',
      inputSchema: z.object({
        query: z.string().optional().describe('1–3 keywords. Names, topics, distinctive nouns. NOT a full sentence. Names of people mentioned in the bodies (e.g. "Katy") work here — they are indexed via the thread search anchors.'),
        from: z.string().optional().describe('ISO date — last_sent_at >= from'),
        to: z.string().optional().describe('ISO date — last_sent_at <= to'),
        tones: z.array(toneEnum).optional(),
        flags: z.array(z.string()).optional().describe('e.g. ["gatekeeping","schedule_violation","financial_dispute"]')
      }),
      execute: async (args) => {
        try {
          let q = (client as any)
            .from('message_threads')
            .select('id, thread_id, subject, summary, tone, flags, participants, message_count, first_sent_at, last_sent_at, search_anchors')
            .eq('case_id', caseId)
            .order('last_sent_at', { ascending: false, nullsFirst: false })
            .limit(MAX_THREADS + 1)

          if (args.from) q = q.gte('last_sent_at', args.from)
          if (args.to) q = q.lte('last_sent_at', args.to)
          if (args.tones?.length) q = q.in('tone', args.tones)
          if (args.flags?.length) q = q.overlaps('flags', args.flags)

          if (args.query?.trim()) {
            // summary_fts is a stored generated tsvector covering
            // summary + subject + participants. See 0053_message_threads.sql.
            // config: 'english' on the query side matches the column's
            // tokenization (otherwise queries fall back to `simple` and miss
            // stem-equivalent words).
            q = q.textSearch('summary_fts', args.query.trim(), { config: 'english', type: 'websearch' })
          }

          const { data, error } = await q
          if (error) return { error: error.message }

          const truncated = (data?.length ?? 0) > MAX_THREADS
          const items = (data ?? []).slice(0, MAX_THREADS).map((t: any) => ({
            id: t.id,
            threadSlug: t.thread_id,
            subject: t.subject,
            summary: t.summary,
            tone: t.tone,
            flags: t.flags,
            participants: t.participants,
            messageCount: t.message_count,
            firstSentAt: safeIso(t.first_sent_at),
            lastSentAt: safeIso(t.last_sent_at),
            anchors: t.search_anchors
          }))
          registry.recordMany(items.map((i: { id: string }) => i.id))
          return { items, count: items.length, truncated }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    get_thread: tool({
      description:
        'Fetch a single thread summary plus its messages chronologically. Use after search_threads when you need direct quotes, message-level chronology, or the answer hinges on a specific message. Cite individual messages via [message:<id>] and the thread itself via [thread:<id>].',
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        try {
          const { data: t, error } = await (client as any)
            .from('message_threads')
            .select('id, thread_id, subject, summary, tone, flags, participants, message_count, first_sent_at, last_sent_at, search_anchors')
            .eq('id', id)
            .eq('case_id', caseId)
            .maybeSingle()
          if (error) return { error: error.message }
          if (!t) return { error: 'not found in this case' }

          const { data: msgs, error: mErr } = await client
            .from('messages')
            .select('id, sent_at, sender, recipient, subject, body, message_number')
            .eq('case_id', caseId)
            .eq('thread_id', t.thread_id)
            .order('sent_at', { ascending: true })
            .limit(51)
          if (mErr) return { error: mErr.message }

          const messages = (msgs ?? []).slice(0, 50).map(m => ({
            id: m.id,
            timestamp: safeIso(m.sent_at),
            sender: m.sender,
            recipient: m.recipient,
            subject: m.subject,
            bodyPreview: (m.body ?? '').slice(0, BODY_PREVIEW_CHARS),
            messageNumber: m.message_number
          }))

          registry.record(t.id)
          registry.recordMany(messages.map(m => m.id))

          return {
            id: t.id,
            threadSlug: t.thread_id,
            subject: t.subject,
            summary: t.summary,
            tone: t.tone,
            flags: t.flags,
            participants: t.participants,
            messageCount: t.message_count,
            firstSentAt: safeIso(t.first_sent_at),
            lastSentAt: safeIso(t.last_sent_at),
            anchors: t.search_anchors,
            messages,
            truncated: (msgs?.length ?? 0) > 50
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    find_relevant_threads: tool({
      description:
        'Semantic fallback for thread retrieval. Use when the user describes a behavior or pattern with no obvious keyword in the corpus '
        + '(e.g. "withholding the child", "where he was hostile", "money disagreements", "the times we agreed", "what kind of person is he"). '
        + 'A model reads up to 300 thread summaries for the case and returns the top 5 most relevant with a one-clause reason for each. '
        + '**Slower than search_threads (~3s).** Use it when (a) search_threads returned nothing useful and the question is intent-shaped, or '
        + '(b) the question is clearly behavioral and you can already tell keyword search will not bite. '
        + 'Cite each returned thread via [thread:<id>]. To read the messages in a thread, call get_thread next.',
      inputSchema: z.object({
        question: z.string().describe('The user\'s natural-language question. Pass it through verbatim — do not paraphrase or shorten.'),
        from: z.string().optional().describe('ISO date — only consider threads with last_sent_at >= from. Use to narrow the scan on large cases.'),
        to: z.string().optional().describe('ISO date — only consider threads with last_sent_at <= to.')
      }),
      execute: async (args) => {
        try {
          let q = (client as any)
            .from('message_threads')
            .select('id, thread_id, subject, summary, tone, flags, participants, search_anchors, message_count, last_sent_at')
            .eq('case_id', caseId)
            .order('last_sent_at', { ascending: false, nullsFirst: false })
            .limit(MAX_THREADS_TO_RANK + 1)
          if (args.from) q = q.gte('last_sent_at', args.from)
          if (args.to) q = q.lte('last_sent_at', args.to)

          const { data, error } = await q
          if (error) return { error: error.message }
          const truncated = (data?.length ?? 0) > MAX_THREADS_TO_RANK
          const all = (data ?? []).slice(0, MAX_THREADS_TO_RANK)
          if (!all.length) return { items: [], count: 0, totalScanned: 0, truncated: false }

          // Compact card per thread. Skip participants — already covered by
          // proper_nouns and the role-keyed summary prose.
          const cards = all.map((t: any) => ({
            id: t.id,
            subject: t.subject,
            tone: t.tone,
            flags: t.flags,
            summary: t.summary,
            proper_nouns: t.search_anchors?.proper_nouns ?? [],
            topics: t.search_anchors?.topics ?? []
          }))

          const openai = new OpenAI({ apiKey: openaiApiKey })
          const system = [
            'You rank custody-case message-thread summaries by relevance to a question.',
            'Read the question. Read the threads. Pick the up-to-5 most relevant thread ids, ordered best first.',
            'For each, give a one-clause reason (≤15 words).',
            'If the question describes a behavior with no obvious keyword (e.g. "withholding the child"),',
            'consider thread `flags` (e.g. gatekeeping, schedule_violation) and `tone` as well as the prose.',
            'If nothing plausibly matches, return an empty matches array. Do not stretch.'
          ].join(' ')
          const user = `QUESTION:\n${args.question}\n\nTHREADS (${cards.length}):\n${JSON.stringify(cards)}`

          const res = await openai.responses.parse({
            model: RANK_MODEL,
            reasoning: { effort: 'low' },
            text: { format: zodTextFormat(RankSchema, 'rank') },
            input: [
              { role: 'system', content: [{ type: 'input_text', text: system }] },
              { role: 'user', content: [{ type: 'input_text', text: user }] }
            ]
          })

          const parsed = res.output_parsed as { matches: { id: string, reason: string }[] } | null
          const idToThread = new Map(all.map((t: any) => [t.id, t]))
          const items = (parsed?.matches ?? [])
            .map((m) => {
              const t: any = idToThread.get(m.id)
              if (!t) return null
              return {
                id: t.id,
                threadSlug: t.thread_id,
                subject: t.subject,
                summary: t.summary,
                tone: t.tone,
                flags: t.flags,
                participants: t.participants,
                messageCount: t.message_count,
                lastSentAt: safeIso(t.last_sent_at),
                anchors: t.search_anchors,
                reason: m.reason
              }
            })
            .filter(Boolean) as Array<{ id: string }>
          registry.recordMany(items.map(i => i.id))
          return { items, count: items.length, totalScanned: all.length, truncated, model: RANK_MODEL }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    search_messages: tool({
      description:
        'Free-text search across INDIVIDUAL OFW messages. **Prefer search_threads first** — it covers conversations, not isolated messages. Use this only when you already know the thread or you are looking for one specific message. '
        + 'QUERY RULES: pass 1–3 distinctive keywords (a name, a place, an unusual noun). DO NOT pass a full sentence or the user\'s paraphrase — Postgres ANDs every stem and you will get zero hits. '
        + 'Returns up to 25 matches with id, sent_at, sender, recipient, subject, body preview. Cite via [message:<id>].',
      inputSchema: z.object({
        query: z.string().optional().describe('1–3 keywords. Names, places, distinctive nouns. NOT a full sentence.'),
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
        + 'and might contradict it. THIS IS KEYWORD RETRIEVAL, NOT SEMANTIC SEARCH. '
        + 'If you already have a thread context, prefer reading the thread end-to-end via get_thread before reaching for keyword retrieval. '
        + 'Always present results as candidates for the user to read in context — do NOT adjudicate truth or label anyone as lying.',
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

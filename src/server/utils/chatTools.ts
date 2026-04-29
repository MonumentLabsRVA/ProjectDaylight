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
const RANK_CHUNK_SIZE = 50
const RANK_MODEL = 'gpt-5.4-mini'
const BODY_PREVIEW_CHARS = 320

// Regex retrieval — LLM generates POSIX patterns from the user's question;
// Postgres applies them against retrieval_blurb. Uses higher reasoning than
// the rest of the tools because regex generation is the failure mode worth
// spending tokens on.
const REGEX_MODEL = 'gpt-5.4-mini'
const REGEX_REASONING: 'low' | 'medium' | 'high' = 'medium'
const MAX_REGEX_PATTERNS = 4
const MAX_REGEX_HITS_PER_PATTERN = 10
const MAX_REGEX_TOTAL_HITS = 15

const RegexPatternsSchema = z.object({
  patterns: z.array(z.object({
    pattern: z.string().describe(
      'A Postgres POSIX regex pattern. Use \\m and \\M for word boundaries (POSIX does NOT support \\b). '
      + 'Use alternation (foo|bar) freely. Do not include (?i) — the matcher is already case-insensitive. '
      + 'Avoid PCRE-only features: no lookahead/behind, no named groups, no \\d/\\w/\\s shorthands (use [0-9], [A-Za-z]).'
    ),
    intent: z.string().describe('One short clause describing what surface form this pattern targets, e.g. "explicit withholding language", "missed pickup".')
  })).min(1).max(MAX_REGEX_PATTERNS)
})

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
    score: z.number().min(0).max(100).describe('How strongly this thread matches the question, 0–100. Use the full range: 90+ for an obvious match, 50–80 for plausible, <40 only if you are reaching. Calibrate so the scores would be comparable across separate batches of threads.'),
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
          // Active in-band escalation hint. The agent has shown a tendency to
          // permute keywords on 0-result rather than switch tools; this nudges
          // it toward find_relevant_threads when the question is intent-shaped.
          if (items.length === 0 && args.query?.trim()) {
            return {
              items,
              count: 0,
              truncated,
              hint: 'No keyword hits. If the user described a behavior or pattern (e.g. "withheld", "hostile", "kept her", "refused"), call find_relevant_threads next instead of permuting keywords — that vocabulary is unlikely to appear literally in the corpus.'
            }
          }
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
            .select('id, thread_id, subject, summary, retrieval_blurb, tone, flags, participants, search_anchors, message_count, last_sent_at')
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

          // Slim card. retrieval_blurb (when present) is purpose-built for this
          // path — shorter and uses behavioral vocabulary the user actually
          // types. Falls back to summary for un-backfilled rows.
          // proper_nouns/topics already FTS-covered via search_threads; skipping
          // them here saves tokens with no recall hit.
          const cards = all.map((t: any) => ({
            id: t.id,
            subject: t.subject,
            tone: t.tone,
            flags: t.flags,
            blurb: t.retrieval_blurb || t.summary
          }))

          // Chunk the cards and rank each chunk in parallel. 192 threads in one
          // call is ~3.4s; four ~50-thread calls in parallel run ~1.5s for the
          // same cost. Each chunk returns up to 5 matches with a 0–100 score;
          // we merge globally by score and keep the top 5.
          const chunks: typeof cards[] = []
          for (let i = 0; i < cards.length; i += RANK_CHUNK_SIZE) {
            chunks.push(cards.slice(i, i + RANK_CHUNK_SIZE))
          }

          const openai = new OpenAI({ apiKey: openaiApiKey })
          const system = [
            'You rank custody-case message-thread summaries by relevance to a question.',
            'Read the question. Read the threads. Pick up to 5 of the most relevant ids from THIS BATCH, ordered best first.',
            'For each, give a one-clause reason (≤15 words) and a score 0–100.',
            'If the question describes a behavior with no obvious keyword (e.g. "withholding the child"),',
            'consider thread `flags` (e.g. gatekeeping, schedule_violation) and `tone` alongside the prose.',
            'You are seeing one batch of a larger set; calibrate scores so they are comparable across batches.',
            'If nothing in this batch plausibly matches, return an empty matches array. Do not stretch.'
          ].join(' ')

          type Match = { id: string, score: number, reason: string }
          const rankChunk = async (chunk: typeof cards): Promise<Match[]> => {
            const user = `QUESTION:\n${args.question}\n\nTHREADS (${chunk.length}):\n${JSON.stringify(chunk)}`
            const res = await openai.responses.parse({
              model: RANK_MODEL,
              reasoning: { effort: 'low' },
              text: { format: zodTextFormat(RankSchema, 'rank') },
              input: [
                { role: 'system', content: [{ type: 'input_text', text: system }] },
                { role: 'user', content: [{ type: 'input_text', text: user }] }
              ]
            })
            const parsed = res.output_parsed as { matches: Match[] } | null
            return parsed?.matches ?? []
          }

          const chunkResults = await Promise.all(chunks.map(rankChunk))
          const seen = new Set<string>()
          const merged: Match[] = chunkResults
            .flat()
            .sort((a, b) => b.score - a.score)
            .filter((m) => {
              if (seen.has(m.id)) return false
              seen.add(m.id)
              return true
            })
            .slice(0, 5)

          const idToThread = new Map(all.map((t: any) => [t.id, t]))
          const items = merged
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
          return {
            items,
            count: items.length,
            totalScanned: all.length,
            chunkCount: chunks.length,
            truncated,
            model: RANK_MODEL
          }
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'unknown error' }
        }
      }
    }),

    regex_search_threads: tool({
      description:
        'Search threads by an LLM-generated regex against per-thread retrieval_blurbs. **Best for behavior questions where the user named the dynamic with concrete vocabulary** ("withheld", "kept her overnight", "stonewalled", "refused pickup"). '
        + 'A model generates 2-4 alternation patterns from the question, then Postgres applies them case-insensitively. '
        + 'Faster than find_relevant_threads (~1s vs ~2s) and cheaper. Returns matching threads with the patterns that hit. '
        + 'Cite each thread via [thread:<id>]. To read the messages in a thread, call get_thread next.',
      inputSchema: z.object({
        question: z.string().describe('The user\'s question (verbatim) or the behavioral intent in plain English. Pass the loaded vocabulary unchanged — that is what makes regex work here.')
      }),
      execute: async (args) => {
        try {
          const openai = new OpenAI({ apiKey: openaiApiKey })

          const sys = [
            'You generate Postgres POSIX regex patterns to find custody-case threads matching a behavioral intent.',
            'The text being matched is a per-thread retrieval blurb (~40 words) that uses NATURAL framing: real names (Mari, Kyle, Josie) and behavioral verbs (withheld, blocked, refused, hostile, agreed, cooperated).',
            '',
            'Rules:',
            '- Postgres POSIX flavor. Use \\m and \\M for word boundaries (POSIX does NOT support \\b — that will silently fail).',
            '- Pattern is matched case-insensitively (~*). Do NOT include (?i).',
            '- Output 2-4 patterns. Each targets a distinct surface form of the SAME intent.',
            '- Use word boundaries to avoid false positives (e.g. \\mkept\\M not just kept).',
            '- Stay focused on the behavior. Skip stop words and generic verbs ("said", "told").',
            '- No PCRE-only features: no lookahead/behind, no named groups, no \\d/\\w/\\s shorthands. Use [0-9], [A-Za-z], explicit characters.',
            '- Patterns should be lowercase. The matcher is case-insensitive.',
            '',
            'Examples:',
            '',
            'Question: "where Mari withheld Josie"',
            'Patterns:',
            '  pattern: "(\\mwithh[oe]ld[a-z]*\\M|\\mdenied (the )?(exchange|handoff|transfer)\\M|\\mrefused to (return|release|hand over|bring)\\M)"',
            '  intent:  "explicit withholding language"',
            '',
            '  pattern: "\\mkept (her|the child|josie|him) (overnight|past|through|longer|home)\\M"',
            '  intent:  "kept past scheduled time"',
            '',
            '  pattern: "(\\mmissed (the )?(pickup|exchange|handoff|drop[- ]off)\\M|\\mdid (not|n.t) (bring|return|release)\\M)"',
            '  intent:  "missed scheduled exchange"',
            '',
            'Question: "the times he was hostile"',
            'Patterns:',
            '  pattern: "\\m(hostile|aggressive|threatening|nasty|rude|combative)\\M"',
            '  intent:  "explicit hostility vocabulary"',
            '  pattern: "\\m(cursed|yelled|shouted|swore|insulted|berated)\\M"',
            '  intent:  "verbal aggression"',
            '  pattern: "\\m(threatened|intimidat[a-z]+)\\M"',
            '  intent:  "intimidation"'
          ].join('\n')

          const planning = await openai.responses.parse({
            model: REGEX_MODEL,
            reasoning: { effort: REGEX_REASONING },
            text: { format: zodTextFormat(RegexPatternsSchema, 'patterns') },
            input: [
              { role: 'system', content: [{ type: 'input_text', text: sys }] },
              { role: 'user', content: [{ type: 'input_text', text: `Question: ${args.question}` }] }
            ]
          })
          const planned = (planning.output_parsed as { patterns: { pattern: string, intent: string }[] } | null)?.patterns ?? []
          if (planned.length === 0) {
            return { items: [], count: 0, patterns: [], note: 'model returned no patterns' }
          }

          // Run each pattern as its own filter so we can attribute hits.
          // Postgres regex errors are caught per-pattern so one bad regex
          // doesn't kill the whole tool.
          type Hit = {
            id: string
            threadSlug: string
            subject: string | null
            summary: string | null
            retrievalBlurb: string | null
            tone: string | null
            flags: string[] | null
            participants: string[] | null
            messageCount: number
            lastSentAt: string | null
            anchors: any
            matchedPatterns: string[]
          }
          const matchedById = new Map<string, Hit>()
          const patternResults: { pattern: string, intent: string, hits: number, error?: string }[] = []

          for (const p of planned) {
            try {
              const { data, error } = await (client as any)
                .from('message_threads')
                .select('id, thread_id, subject, summary, retrieval_blurb, tone, flags, participants, message_count, last_sent_at, search_anchors')
                .eq('case_id', caseId)
                .filter('retrieval_blurb', 'imatch', p.pattern)
                .order('last_sent_at', { ascending: false, nullsFirst: false })
                .limit(MAX_REGEX_HITS_PER_PATTERN)

              if (error) {
                patternResults.push({ ...p, hits: 0, error: error.message })
                continue
              }
              for (const row of (data ?? []) as any[]) {
                const existing = matchedById.get(row.id)
                if (existing) {
                  existing.matchedPatterns.push(p.intent)
                  continue
                }
                matchedById.set(row.id, {
                  id: row.id,
                  threadSlug: row.thread_id,
                  subject: row.subject,
                  summary: row.summary,
                  retrievalBlurb: row.retrieval_blurb,
                  tone: row.tone,
                  flags: row.flags,
                  participants: row.participants,
                  messageCount: row.message_count,
                  lastSentAt: safeIso(row.last_sent_at),
                  anchors: row.search_anchors,
                  matchedPatterns: [p.intent]
                })
              }
              patternResults.push({ ...p, hits: data?.length ?? 0 })
            } catch (e) {
              patternResults.push({ ...p, hits: 0, error: e instanceof Error ? e.message : 'unknown error' })
            }
          }

          const items = [...matchedById.values()]
            .sort((a, b) => {
              // Sort by number of patterns matched (more = more confident), then recency
              if (b.matchedPatterns.length !== a.matchedPatterns.length) {
                return b.matchedPatterns.length - a.matchedPatterns.length
              }
              const da = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0
              const db = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0
              return db - da
            })
            .slice(0, MAX_REGEX_TOTAL_HITS)
          registry.recordMany(items.map(i => i.id))

          return {
            items,
            count: items.length,
            patterns: patternResults,
            model: REGEX_MODEL
          }
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

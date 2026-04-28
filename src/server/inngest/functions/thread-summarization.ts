import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { inngest } from '../client'
import type { Database } from '~/types/database.types'

type PublicClient = SupabaseClient<Database, 'public'>

interface ThreadSummarizationEventData {
  caseId: string
  userId: string
  evidenceId: string | null
  threadId: string
}

const MODEL = 'gpt-5.4-mini'

/**
 * Bumped when the prompt schema changes in a way that should regenerate
 * everything. The backfill endpoint reads message_threads.summary_version
 * to decide what to re-summarize. Bump deliberately, not casually.
 */
export const SUMMARY_VERSION = 1

/**
 * Body cap when assembling the thread for the LLM. Most threads are well
 * under this; cases that exceed it are rare enough to head/tail later if it
 * matters. Keeps token budget predictable per run.
 */
const MAX_MESSAGES_FOR_SUMMARY = 40

const ThreadSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      'One paragraph, plain English, 80–180 words. What the thread is about and how it resolves (or does not). Name participants by role ("the user", "the co-parent", "the school"), not by tone-loaded labels. No editorializing, no diagnoses.'
    ),
  tone: z
    .enum(['cooperative', 'neutral', 'tense', 'hostile', 'mixed'])
    .describe(
      "Overall conversational temperature of the thread, not a verdict on either parent. `mixed` covers genuinely-mixed and unclear cases."
    ),
  flags: z
    .array(
      z.enum([
        'schedule_violation',
        'gatekeeping',
        'child_welfare_concern',
        'agreement_reference',
        'financial_dispute',
        'medical_decision',
        'school_decision',
        'safety_concern',
        'communication_breakdown',
        'positive_coparenting'
      ])
    )
    .describe(
      'Descriptive (not adjudicative) tags. `gatekeeping` describes the act (info refused or sidestepped), not who is doing it. Multiple flags allowed. Empty array if none apply.'
    ),
  search_anchors: z
    .object({
      proper_nouns: z
        .array(z.string())
        .max(12)
        .describe(
          'People, schools, providers, places named in the thread. Verbatim spelling — these are what the agent will keyword-search later.'
        ),
      topics: z
        .array(z.string())
        .max(8)
        .describe(
          'Concrete topics in the thread (e.g. "after-school pickup", "tuition payment"). 2–4 word noun phrases, lowercase. No editorial labels like "drama".'
        ),
      dates_mentioned: z
        .array(z.string())
        .max(8)
        .describe('ISO dates referenced *in the bodies*, not the message timestamps.'),
      numbers: z
        .array(z.string())
        .max(6)
        .describe(
          'Dollar amounts, durations, counts that appear in the bodies. Often the most distinctive token in a thread.'
        )
    })
    .describe('Keyword retrieval handles for the chat agent. See chat_retrieval.md for philosophy.')
})

type ThreadSummary = z.infer<typeof ThreadSummarySchema>

interface LoadedThread {
  threadId: string
  subject: string | null
  participants: string[]
  messageCount: number
  firstSentAt: string | null
  lastSentAt: string | null
  /** Chronological body excerpts used to build the LLM prompt. */
  messages: Array<{
    sentAt: string | null
    sender: string
    recipient: string
    subject: string | null
    body: string
  }>
}

function createServiceClient(): PublicClient {
  // Same pattern as journal-extraction / ofw-ingest: process.env directly
  // because Inngest webhook callback context lacks useRuntimeConfig().
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })
}

function modeOrFirst(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v
      bestN = n
    }
  }
  return best
}

async function loadThread(
  supabase: PublicClient,
  caseId: string,
  threadId: string
): Promise<LoadedThread | null> {
  const { data, error } = await supabase
    .from('messages')
    .select('sent_at, sender, recipient, subject, body')
    .eq('case_id', caseId)
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  if (error) throw new Error(`loadThread failed: ${error.message}`)
  if (!data || data.length === 0) return null

  const senders = new Set<string>()
  for (const m of data) {
    if (m.sender) senders.add(m.sender)
    if (m.recipient) senders.add(m.recipient)
  }

  const subject = modeOrFirst(data.map(m => m.subject))
  const firstSentAt = data[0]?.sent_at ?? null
  const lastSentAt = data[data.length - 1]?.sent_at ?? null

  return {
    threadId,
    subject,
    participants: [...senders].sort(),
    messageCount: data.length,
    firstSentAt,
    lastSentAt,
    messages: data.map(m => ({
      sentAt: m.sent_at,
      sender: m.sender,
      recipient: m.recipient,
      subject: m.subject,
      body: m.body
    }))
  }
}

function buildSummaryPrompt(thread: LoadedThread): { system: string; user: string } {
  const system = [
    "You are a custody-case thread summarizer for Project Daylight.",
    "You read OFW (Our Family Wizard) message threads between two co-parents and produce a structured summary used by a chat agent for retrieval.",
    "",
    "Hard rules:",
    "- Refer to participants by role ('the user', 'the co-parent', 'the child'), not by name. Names go in search_anchors.proper_nouns.",
    "- Describe what happened. Do not diagnose, label, or speculate about intent.",
    "- `tone` is the conversational temperature of the thread, not a verdict on either parent.",
    "- `flags` are descriptive of the thread, not of a person. `gatekeeping` describes information being refused or sidestepped — never label a person as gatekeeping.",
    "- search_anchors are for keyword retrieval. Extract verbatim nouns and numbers a parent would later type to find this thread again. Skip generic words.",
    "- If the thread is purely logistical with nothing notable, that's fine — short summary, tone='neutral' or 'cooperative', flags=[].",
    "- Never give legal advice or characterize anyone in moral terms.",
    "",
    "Thread metadata you can rely on:",
    `- Subject: ${thread.subject ?? '(none)'}`,
    `- Participants: ${thread.participants.join(', ')}`,
    `- Message count: ${thread.messageCount}`,
    `- Date range: ${thread.firstSentAt ?? '?'} → ${thread.lastSentAt ?? '?'}`
  ].join('\n')

  const cap = Math.min(thread.messages.length, MAX_MESSAGES_FOR_SUMMARY)
  const truncated = thread.messages.length > MAX_MESSAGES_FOR_SUMMARY
  const lines: string[] = []
  for (let i = 0; i < cap; i++) {
    const m = thread.messages[i]!
    lines.push(`[${m.sentAt ?? 'unknown'}] ${m.sender} → ${m.recipient}`)
    if (m.subject) lines.push(`Subject: ${m.subject}`)
    lines.push(m.body.trim())
    lines.push('---')
  }
  if (truncated) {
    lines.push(`(${thread.messages.length - cap} additional messages omitted from this prompt; you can still reference the thread as a whole.)`)
  }

  const user = `Summarize the following thread.\n\n${lines.join('\n')}`
  return { system, user }
}

async function summarizeThread(thread: LoadedThread): Promise<ThreadSummary> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const { system, user } = buildSummaryPrompt(thread)
  const openai = new OpenAI({ apiKey })

  const response = await openai.responses.parse({
    model: MODEL,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(ThreadSummarySchema, 'thread_summary') },
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] }
    ]
  })

  const parsed = response.output_parsed as ThreadSummary | null
  if (!parsed) throw new Error('Thread summarization returned empty response')
  return parsed
}

async function upsertThreadSummary(
  supabase: PublicClient,
  caseId: string,
  evidenceId: string | null,
  thread: LoadedThread,
  summary: ThreadSummary
): Promise<void> {
  const row = {
    case_id: caseId,
    evidence_id: evidenceId,
    thread_id: thread.threadId,
    subject: thread.subject,
    participants: thread.participants,
    message_count: thread.messageCount,
    first_sent_at: thread.firstSentAt,
    last_sent_at: thread.lastSentAt,
    summary: summary.summary,
    tone: summary.tone,
    flags: summary.flags,
    search_anchors: summary.search_anchors,
    model: MODEL,
    summary_version: SUMMARY_VERSION,
    updated_at: new Date().toISOString()
  }

  const { error } = await (supabase as any)
    .from('message_threads')
    .upsert(row, { onConflict: 'case_id,thread_id' })

  if (error) throw new Error(`upsertThreadSummary failed: ${error.message}`)
}

export const threadSummarizationFunction = inngest.createFunction(
  {
    id: 'thread-summarization',
    retries: 2,
    // Concurrency cap so a 100-thread import doesn't blast the OpenAI rate
    // limit. 5 is conservative; tune up if throughput is an issue.
    concurrency: { limit: 5 }
  },
  { event: 'messages/thread.summarize_requested' },
  async ({ event, step }) => {
    const { caseId, evidenceId, threadId } = event.data as ThreadSummarizationEventData

    if (!caseId || !threadId) {
      throw new Error('thread-summarization requires caseId and threadId on the event payload')
    }

    const supabase = createServiceClient()

    const thread = await step.run('load-thread', async () => {
      return await loadThread(supabase, caseId, threadId)
    })

    if (!thread) {
      // Thread vanished between fan-out and execution (race with delete /
      // cancel). No-op rather than fail.
      return { skipped: true, reason: 'thread not found' }
    }

    const summary = await step.run('summarize', async () => {
      return await summarizeThread(thread)
    })

    await step.run('upsert', async () => {
      await upsertThreadSummary(supabase, caseId, evidenceId, thread, summary)
    })

    return {
      caseId,
      threadId,
      messageCount: thread.messageCount,
      tone: summary.tone,
      flagCount: summary.flags.length
    }
  }
)

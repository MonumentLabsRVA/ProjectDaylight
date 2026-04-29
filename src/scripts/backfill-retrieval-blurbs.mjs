// Backfill `retrieval_blurb` on existing message_threads.
//
// Strategy:
//   - Find rows where retrieval_blurb IS NULL
//   - For each, load the original message bodies from `messages`
//   - Ask gpt-5.4-mini for ONLY the blurb (cheaper than re-summarizing)
//   - Update the row in place; the FTS column re-tokenizes on UPDATE
//
// Usage (from src/):
//   node scripts/backfill-retrieval-blurbs.mjs                   # all cases
//   node scripts/backfill-retrieval-blurbs.mjs --case=<uuid>     # single case
//   node scripts/backfill-retrieval-blurbs.mjs --dry             # preview only
//
// Concurrency capped at 5 — same as the Inngest function — so we don't blast
// the OpenAI rate limit on a 384-thread case.

import 'dotenv/config'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('SUPABASE_* missing')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const MODEL = 'gpt-5.4-mini'
const CONCURRENCY = 5
const MAX_MESSAGES_FOR_BLURB = 40
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  })
)
const dry = !!args.dry
const caseFilter = typeof args.case === 'string' ? args.case : null

const BlurbSchema = z.object({
  retrieval_blurb: z
    .string()
    .describe(
      '2-3 sentences (~40 words) describing this thread for retrieval. ' +
      'Use natural framing the parent might search for, INCLUDING loaded behavioral vocabulary when accurate: ' +
      '"withheld", "blocked", "refused", "kept her", "stonewalled", "ignored", "argued", "hostile", "manipulated", ' +
      '"agreed", "cooperated", "compromised", "complied", "denied access", "missed pickup". ' +
      'Use direct names (Mari, John) and the child\'s name when known. ' +
      'Describe the dynamic, not just the topic. ' +
      'Stay factual — no diagnosis. ' +
      'If purely logistical with no notable dynamic, write a short factual sentence — do not manufacture conflict.'
    )
})

async function loadThreadMessages(caseId, threadId) {
  const { data, error } = await supabase
    .from('messages')
    .select('sent_at, sender, recipient, subject, body')
    .eq('case_id', caseId)
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
  if (error) throw new Error(`load failed: ${error.message}`)
  return data ?? []
}

function buildPrompt(thread, messages) {
  const system = [
    'You are a custody-case thread retrieval-blurb writer for Project Daylight.',
    'You read OFW (Our Family Wizard) message threads between two co-parents and write a SEARCH-FRIENDLY synopsis.',
    'A parent searching the case in their own words should hit this thread.',
    '',
    'Hard rules:',
    '- Use natural framing INCLUDING loaded behavioral verbs when accurate (withheld, blocked, refused, hostile, stonewalled, agreed, cooperated, compromised, denied access, missed pickup).',
    '- Use direct names (the actual co-parents and child).',
    '- Describe the dynamic, not just the topic.',
    '- Stay factual — no diagnosis, no labels, no characterization.',
    '- 2-3 sentences, ~40 words. Don\'t pad. Don\'t manufacture conflict in genuinely-logistical threads.',
    '',
    `Subject: ${thread.subject ?? '(none)'}`,
    `Participants: ${(thread.participants ?? []).join(', ')}`,
    `Message count: ${thread.message_count}`,
    `Date range: ${thread.first_sent_at ?? '?'} → ${thread.last_sent_at ?? '?'}`,
    `Existing summary (for context, do not echo): ${thread.summary ?? '(none)'}`,
    `Tone: ${thread.tone ?? 'unknown'}`,
    `Flags: ${(thread.flags ?? []).join(', ') || '(none)'}`,
    `Proper nouns: ${(thread.search_anchors?.proper_nouns ?? []).join(', ') || '(none)'}`
  ].join('\n')

  const cap = Math.min(messages.length, MAX_MESSAGES_FOR_BLURB)
  const truncated = messages.length > MAX_MESSAGES_FOR_BLURB
  const lines = []
  for (let i = 0; i < cap; i++) {
    const m = messages[i]
    lines.push(`[${m.sent_at ?? 'unknown'}] ${m.sender} → ${m.recipient}`)
    if (m.subject) lines.push(`Subject: ${m.subject}`)
    lines.push((m.body ?? '').trim())
    lines.push('---')
  }
  if (truncated) lines.push(`(${messages.length - cap} additional messages omitted.)`)

  const user = `Write the retrieval_blurb for the following thread.\n\n${lines.join('\n')}`
  return { system, user }
}

async function generateBlurb(thread) {
  const messages = await loadThreadMessages(thread.case_id, thread.thread_id)
  if (messages.length === 0) return null
  const { system, user } = buildPrompt(thread, messages)
  const res = await openai.responses.parse({
    model: MODEL,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(BlurbSchema, 'thread_blurb') },
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] }
    ]
  })
  const parsed = res.output_parsed
  return parsed?.retrieval_blurb ?? null
}

async function processThread(thread) {
  try {
    const blurb = await generateBlurb(thread)
    if (!blurb) return { id: thread.id, status: 'skipped_empty' }
    if (dry) return { id: thread.id, status: 'dry', blurb }
    const { error } = await supabase
      .from('message_threads')
      .update({ retrieval_blurb: blurb, summary_version: 2, updated_at: new Date().toISOString() })
      .eq('id', thread.id)
    if (error) return { id: thread.id, status: 'error', error: error.message }
    return { id: thread.id, status: 'ok', blurb }
  } catch (e) {
    return { id: thread.id, status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

async function main() {
  let q = supabase
    .from('message_threads')
    .select('id, case_id, thread_id, subject, summary, tone, flags, participants, search_anchors, message_count, first_sent_at, last_sent_at, retrieval_blurb')
    .is('retrieval_blurb', null)
    .order('last_sent_at', { ascending: false, nullsFirst: false })
  if (caseFilter) q = q.eq('case_id', caseFilter)

  const { data: threads, error } = await q
  if (error) throw new Error(error.message)
  console.log(`Found ${threads.length} threads needing blurbs.`)
  if (dry) console.log('(dry run — no DB writes)')
  if (threads.length === 0) return

  const start = Date.now()
  const results = []
  let inFlight = 0
  let cursor = 0
  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < CONCURRENCY && cursor < threads.length) {
        const t = threads[cursor++]
        inFlight++
        processThread(t).then((r) => {
          results.push(r)
          inFlight--
          if (results.length % 10 === 0 || results.length === threads.length) {
            const elapsed = ((Date.now() - start) / 1000).toFixed(1)
            console.log(`  ${results.length}/${threads.length} (${elapsed}s)`)
          }
          if (cursor < threads.length) pump()
          else if (inFlight === 0) resolve()
        })
      }
    }
    pump()
  })

  const ok = results.filter(r => r.status === 'ok' || r.status === 'dry').length
  const errors = results.filter(r => r.status === 'error')
  const skipped = results.filter(r => r.status === 'skipped_empty').length
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\nDone: ${ok} written, ${skipped} skipped (empty), ${errors.length} errors, ${elapsed}s`)
  if (errors.length) {
    for (const e of errors.slice(0, 5)) console.log(`  ERR ${e.id}: ${e.error}`)
  }
  if (dry && results.length > 0) {
    const sample = results.find(r => r.blurb)
    if (sample) console.log(`\nSample blurb (${sample.id}):\n  ${sample.blurb}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

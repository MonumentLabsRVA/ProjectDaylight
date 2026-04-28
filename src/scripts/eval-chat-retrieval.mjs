// Offline eval harness for chat retrieval. Runs a fixed query set through
// multiple retrieval methods and prints a comparison table.
//
// Methods:
//   A. plain_fts          — search_threads(query=question) verbatim (today's agent)
//   B. naive_keywords     — strip stopwords, take 1–3 distinctive nouns, then FTS
//   C. llm_rank_all       — load all summaries, gpt-5.4-mini ranks top 5 by relevance
//   D. flag_planner       — LLM maps question → {flags, tones}, search_threads with filters
//
// Usage (from src/):
//   node scripts/eval-chat-retrieval.mjs
//   node scripts/eval-chat-retrieval.mjs --method=llm_rank_all --query=2

import 'dotenv/config'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error('SUPABASE_* missing')
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing')

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const RANK_MODEL = 'gpt-5.4-mini'
const TOP_K = 5

// ---------------------------------------------------------------------------
// Eval set
// ---------------------------------------------------------------------------
//
// `relevant` is the rubric — a function (thread) => boolean that decides
// whether a returned thread plausibly answers the question. Loose by design;
// the goal is signal across methods, not absolute precision.

const CASE_KYLE = '3035f234-397c-4d35-9a9f-8a5237135c71' // kyle@monumentlabs.io
const CASE_GKJ  = '830cf878-cf26-444c-b07b-d761f5c6c682' // gkjohns@gmail.com

const EVAL_SET = [
  {
    id: 'Q1_withhold',
    caseId: CASE_GKJ,
    question: 'Show me an instance where Mari withheld Josie',
    description: 'Semantic / behavioral — "withhold" doesn\'t appear in the corpus. Should map to gatekeeping or schedule_violation.',
    relevant: t =>
      (t.flags || []).some(f => f === 'gatekeeping' || f === 'schedule_violation')
      && /josie|pickup|transition|drop|exchange|custody|schedule/i.test((t.summary || '') + ' ' + (t.subject || ''))
  },
  {
    id: 'Q2_ms_katy',
    caseId: CASE_GKJ,
    question: 'find some where Ms Katy was referenced',
    description: 'Named-entity — Katy lives only in search_anchors.proper_nouns (per the summary prompt).',
    relevant: t => {
      const anchors = JSON.stringify(t.search_anchors?.proper_nouns || [])
      return /katy/i.test(anchors) || /katy/i.test(t.summary || '') || /katy/i.test(t.subject || '')
    }
  },
  {
    id: 'Q3_medical_disagreement',
    caseId: CASE_GKJ,
    question: 'medical decisions we disagreed on',
    description: 'Mixed — flag-driven, also tense/hostile tone.',
    relevant: t =>
      (t.flags || []).includes('medical_decision')
      && ['tense', 'hostile', 'mixed'].includes(t.tone)
  },
  {
    id: 'Q4_daycare_money',
    caseId: CASE_GKJ,
    question: 'Mari daycare payment conflict',
    description: 'Mixed keyword + flag — daycare keyword is in the corpus, financial_dispute flag also applies.',
    relevant: t =>
      (t.flags || []).includes('financial_dispute')
      || /daycare/i.test((t.summary || '') + ' ' + (t.subject || ''))
  },
  {
    id: 'Q5_hostile_existing_case',
    caseId: CASE_KYLE,
    question: 'show me hostile threads',
    description: 'Tone filter — a sanity check on the existing tone path.',
    relevant: t => t.tone === 'hostile' || t.tone === 'tense'
  }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadCaseThreads(caseId) {
  const { data, error } = await supabase
    .from('message_threads')
    .select('id, thread_id, subject, summary, tone, flags, participants, search_anchors, message_count, first_sent_at, last_sent_at')
    .eq('case_id', caseId)
    .order('last_sent_at', { ascending: false })
    .limit(500)
  if (error) throw new Error(`loadCaseThreads(${caseId}): ${error.message}`)
  return data || []
}

// Cache per-case so we don't hammer the DB once per query
const threadCache = new Map()
async function getCaseThreads(caseId) {
  if (!threadCache.has(caseId)) threadCache.set(caseId, await loadCaseThreads(caseId))
  return threadCache.get(caseId)
}

const STOP = new Set([
  'the','a','an','and','or','of','to','in','on','at','for','with','is','was','were','be','been',
  'has','have','had','this','that','these','those','i','me','my','we','us','our','you','your',
  'he','she','they','them','his','her','their','it','its','show','find','get','some','any','where',
  'when','what','who','how','please','can','could','would','should','do','does','did','tell',
  'about','from','into','than','then','also','just','so','if','as','but','not','no','yes',
  'instance','instances','example','examples'
])

function naiveKeywords(question, max = 3) {
  const words = (question || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w))
  const seen = new Set()
  const out = []
  for (const w of words) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= max) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

async function methodPlainFts(caseId, question) {
  const t0 = Date.now()
  const { data, error } = await supabase
    .from('message_threads')
    .select('id, thread_id, subject, summary, tone, flags, participants, search_anchors, last_sent_at')
    .eq('case_id', caseId)
    .textSearch('summary_fts', question, { config: 'english', type: 'websearch' })
    .order('last_sent_at', { ascending: false })
    .limit(TOP_K + 1)
  if (error) throw new Error(`plain_fts: ${error.message}`)
  return { items: (data || []).slice(0, TOP_K), latencyMs: Date.now() - t0 }
}

async function methodNaiveKeywords(caseId, question) {
  const t0 = Date.now()
  const kws = naiveKeywords(question, 3)
  if (!kws.length) return { items: [], latencyMs: Date.now() - t0, query: '(no keywords)' }
  const { data, error } = await supabase
    .from('message_threads')
    .select('id, thread_id, subject, summary, tone, flags, participants, search_anchors, last_sent_at')
    .eq('case_id', caseId)
    .textSearch('summary_fts', kws.join(' '), { config: 'english', type: 'websearch' })
    .order('last_sent_at', { ascending: false })
    .limit(TOP_K + 1)
  if (error) throw new Error(`naive_keywords: ${error.message}`)
  return { items: (data || []).slice(0, TOP_K), latencyMs: Date.now() - t0, query: kws.join(' ') }
}

const RankSchema = z.object({
  matches: z.array(z.object({
    id: z.string().describe('The thread row id passed in.'),
    reason: z.string().describe('One short clause on why this thread matches.')
  })).max(TOP_K)
})

async function methodLlmRankAll(caseId, question) {
  const t0 = Date.now()
  const all = await getCaseThreads(caseId)
  if (!all.length) return { items: [], latencyMs: Date.now() - t0, scanned: 0, model: RANK_MODEL }

  // Compact card per thread — id, subject, tone, flags, summary, anchors.
  // ~150–200 input tokens per card. 200 threads ~= 35k tokens.
  const cards = all.map(t => ({
    id: t.id,
    subject: t.subject,
    tone: t.tone,
    flags: t.flags,
    summary: t.summary,
    proper_nouns: t.search_anchors?.proper_nouns || [],
    topics: t.search_anchors?.topics || []
  }))

  const system = [
    'You rank custody-case message-thread summaries by relevance to a question.',
    'Read the question. Read the threads. Pick the up-to-5 most relevant thread ids.',
    'Order by relevance, best first.',
    'For each, give a short reason (one clause, ≤ 15 words).',
    'If the question describes a behavior with no obvious keyword (e.g. "withholding the child"),',
    'consider thread `flags` (e.g. gatekeeping, schedule_violation) and `tone` as well as the prose.',
    'If nothing plausibly matches, return an empty matches array. Do not stretch.'
  ].join(' ')
  const user = `QUESTION:\n${question}\n\nTHREADS (${cards.length}):\n${JSON.stringify(cards)}`

  const res = await openai.responses.parse({
    model: RANK_MODEL,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(RankSchema, 'rank') },
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] }
    ]
  })
  const parsed = res.output_parsed
  const idToThread = new Map(all.map(t => [t.id, t]))
  const items = (parsed?.matches || [])
    .map(m => ({ ...idToThread.get(m.id), reason: m.reason }))
    .filter(t => t.id)

  const usage = res.usage || {}
  return {
    items,
    latencyMs: Date.now() - t0,
    scanned: cards.length,
    model: RANK_MODEL,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens
  }
}

const PlanSchema = z.object({
  keywords: z.array(z.string()).describe('1–3 distinctive nouns from the question. Empty array if none.'),
  flags: z.array(z.enum([
    'schedule_violation','gatekeeping','child_welfare_concern','agreement_reference',
    'financial_dispute','medical_decision','school_decision','safety_concern',
    'communication_breakdown','positive_coparenting'
  ])),
  tones: z.array(z.enum(['cooperative','neutral','tense','hostile','mixed']))
})

async function methodFlagPlanner(caseId, question) {
  const t0 = Date.now()
  const system = [
    'Translate a custody-case search question into structured filters.',
    'Output { keywords, flags, tones }. Keywords: 1–3 distinctive nouns from the question (names, places, distinctive nouns). Empty if none distinctive.',
    'Flags must be from this controlled set: schedule_violation, gatekeeping, child_welfare_concern, agreement_reference, financial_dispute, medical_decision, school_decision, safety_concern, communication_breakdown, positive_coparenting.',
    'Tones: cooperative, neutral, tense, hostile, mixed.',
    'Map intent to flags: "withhold/kept/refused access" → gatekeeping + schedule_violation; "money/expenses/tuition" → financial_dispute; "doctor/medical" → medical_decision; "school" → school_decision; "fight/yelling/hostile" → tones=[hostile,tense]; "agreed/cooperative" → positive_coparenting.',
    'If the question is fully covered by keywords (a name, a number), leave flags/tones empty.',
    'Conservative — do not pile on filters that aren\'t implied.'
  ].join(' ')
  const planRes = await openai.responses.parse({
    model: RANK_MODEL,
    reasoning: { effort: 'low' },
    text: { format: zodTextFormat(PlanSchema, 'search_plan') },
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: question }] }
    ]
  })
  const plan = planRes.output_parsed
  if (!plan) return { items: [], latencyMs: Date.now() - t0, plan: null }

  let q = supabase
    .from('message_threads')
    .select('id, thread_id, subject, summary, tone, flags, participants, search_anchors, last_sent_at')
    .eq('case_id', caseId)
    .order('last_sent_at', { ascending: false })
    .limit(TOP_K + 1)
  if (plan.keywords?.length) {
    q = q.textSearch('summary_fts', plan.keywords.join(' '), { config: 'english', type: 'websearch' })
  }
  if (plan.flags?.length) q = q.overlaps('flags', plan.flags)
  if (plan.tones?.length) q = q.in('tone', plan.tones)
  const { data, error } = await q
  if (error) throw new Error(`flag_planner: ${error.message}`)
  return {
    items: (data || []).slice(0, TOP_K),
    latencyMs: Date.now() - t0,
    plan,
    inputTokens: planRes.usage?.input_tokens,
    outputTokens: planRes.usage?.output_tokens
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const METHODS = {
  plain_fts: methodPlainFts,
  naive_keywords: methodNaiveKeywords,
  llm_rank_all: methodLlmRankAll,
  flag_planner: methodFlagPlanner
}

function scoreItems(eval_, items) {
  if (!items.length) return { hits: 0, total: 0, precision: 0 }
  const hits = items.filter(t => eval_.relevant(t)).length
  return { hits, total: items.length, precision: hits / items.length }
}

function summary(t) {
  return (t.summary || '').slice(0, 80).replace(/\s+/g, ' ')
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? true]
  }))
  const onlyMethod = args.method
  const onlyQuery = args.query ? Number(args.query) : null

  const results = []
  for (let qi = 0; qi < EVAL_SET.length; qi++) {
    if (onlyQuery !== null && qi + 1 !== onlyQuery) continue
    const e = EVAL_SET[qi]
    console.log(`\n==== ${e.id} (case=${e.caseId.slice(0, 8)}) ====`)
    console.log(`Q: ${e.question}`)
    console.log(`(${e.description})\n`)

    for (const [name, fn] of Object.entries(METHODS)) {
      if (onlyMethod && onlyMethod !== name) continue
      try {
        const r = await fn(e.caseId, e.question)
        const score = scoreItems(e, r.items)
        const meta = []
        if (r.query) meta.push(`q="${r.query}"`)
        if (r.plan) meta.push(`plan=${JSON.stringify(r.plan)}`)
        if (r.scanned) meta.push(`scanned=${r.scanned}`)
        if (r.inputTokens) meta.push(`tokens=${r.inputTokens}/${r.outputTokens}`)
        console.log(`  ${name.padEnd(16)} ${`${score.hits}/${score.total}`.padEnd(6)} P=${score.precision.toFixed(2)}  ${r.latencyMs}ms  ${meta.join(' ')}`)
        for (const t of r.items.slice(0, 3)) {
          const ok = e.relevant(t) ? '✓' : '✗'
          const flagBadge = (t.flags || []).join(',') || '-'
          console.log(`    ${ok} [${t.tone}] [${flagBadge}] ${t.subject?.slice(0, 36).padEnd(36)} ${summary(t)}${t.reason ? ` // ${t.reason}` : ''}`)
        }
        results.push({ query: e.id, method: name, ...score, latencyMs: r.latencyMs, items: r.items.map(t => ({ id: t.id, subject: t.subject, tone: t.tone, flags: t.flags, relevant: e.relevant(t), reason: t.reason })) })
      } catch (err) {
        console.error(`  ${name}: ERROR ${err.message}`)
        results.push({ query: e.id, method: name, error: err.message })
      }
    }
  }

  // Aggregate
  console.log('\n\n==== Summary table ====\n')
  const methods = Object.keys(METHODS).filter(m => !onlyMethod || onlyMethod === m)
  const queries = EVAL_SET.filter((_, i) => onlyQuery === null || i + 1 === onlyQuery).map(e => e.id)
  const head = ['method'.padEnd(16), ...queries.map(q => q.padEnd(20))].join(' ')
  console.log(head)
  console.log('-'.repeat(head.length))
  for (const m of methods) {
    const cells = [m.padEnd(16)]
    for (const q of queries) {
      const r = results.find(r => r.query === q && r.method === m)
      cells.push(r && !r.error ? `${r.hits}/${r.total} P=${r.precision.toFixed(2)} ${r.latencyMs}ms`.padEnd(20) : 'ERR'.padEnd(20))
    }
    console.log(cells.join(' '))
  }

  const out = '/Users/kylejohnson/Programming/Workspace/ProjectDaylight/internal_docs/20260428_smarter_chat_retrieval_v2/eval_results.json'
  writeFileSync(out, JSON.stringify(results, null, 2))
  console.log(`\nResults saved to ${out}`)
}

main().catch(err => { console.error(err); process.exit(1) })

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type Client = SupabaseClient<Database>

export interface ThreadDelta {
  threadId: string
  messageCount: number
}

export interface ThreadDriftStats {
  /** Threads that already have a row in message_threads for this case. */
  existing: number
  /** Distinct thread_ids present in the upload. */
  newInUpload: number
  /** thread_ids in the upload that already had a row. */
  overlapping: number
  /** 1 - overlapping / max(existing, 1). 0 = full overlap, 1 = nothing in common. */
  driftRatio: number
}

/**
 * Find threads that need (re-)summarization for a case.
 *
 * Returns every (case_id, thread_id) where:
 *   - no row exists in message_threads, OR
 *   - the row's message_count differs from the live count in messages.
 *
 * Uses the case_thread_message_counts RPC (migration 0055) to get per-thread
 * counts via a server-side GROUP BY. The earlier JS-side aggregation hit
 * supabase-js's 1000-row default cap on cases with >1000 messages, which
 * silently dropped most of the fan-out.
 */
export async function summarizeThreadMissing(
  client: Client,
  caseId: string
): Promise<ThreadDelta[]> {
  const { data: liveRows, error: liveErr } = await client
    .rpc('case_thread_message_counts', { p_case_id: caseId })
  if (liveErr) throw new Error(`summarizeThreadMissing live count failed: ${liveErr.message}`)

  const { data: existingRows, error: existingErr } = await client
    .from('message_threads')
    .select('thread_id, message_count')
    .eq('case_id', caseId)
  if (existingErr) throw new Error(`summarizeThreadMissing existing fetch failed: ${existingErr.message}`)

  const existingCounts = new Map<string, number>()
  for (const r of existingRows ?? []) {
    existingCounts.set(r.thread_id, r.message_count)
  }

  const out: ThreadDelta[] = []
  for (const row of liveRows ?? []) {
    if (!row.thread_id) continue
    const live = Number(row.message_count)
    const existing = existingCounts.get(row.thread_id)
    if (existing === undefined || existing !== live) {
      out.push({ threadId: row.thread_id, messageCount: live })
    }
  }
  return out
}

/**
 * Compute drift between threads already on message_threads (from earlier
 * imports) and the threads present in a freshly uploaded evidence row.
 *
 * Used to decide whether to pause the ingest pipeline for user confirmation
 * (Sprint 6). High drift = the new upload doesn't look like an extension of
 * the previous case file.
 */
export async function diffThreadsForUpload(
  client: Client,
  caseId: string,
  evidenceId: string
): Promise<ThreadDriftStats> {
  const { data: uploadRows, error: uploadErr } = await client
    .rpc('evidence_thread_ids', { p_case_id: caseId, p_evidence_id: evidenceId })
  if (uploadErr) throw new Error(`diffThreadsForUpload upload fetch failed: ${uploadErr.message}`)

  const uploadThreadIds = new Set<string>()
  for (const r of uploadRows ?? []) {
    if (r.thread_id) uploadThreadIds.add(r.thread_id)
  }

  const { data: existingRows, error: existingErr } = await client
    .from('message_threads')
    .select('thread_id')
    .eq('case_id', caseId)
  if (existingErr) throw new Error(`diffThreadsForUpload existing fetch failed: ${existingErr.message}`)

  const existingThreadIds = new Set<string>()
  for (const r of existingRows ?? []) {
    existingThreadIds.add(r.thread_id)
  }

  let overlapping = 0
  for (const t of uploadThreadIds) {
    if (existingThreadIds.has(t)) overlapping += 1
  }

  const existing = existingThreadIds.size
  const newInUpload = uploadThreadIds.size
  const driftRatio = existing === 0 ? 0 : 1 - overlapping / existing

  return { existing, newInUpload, overlapping, driftRatio }
}

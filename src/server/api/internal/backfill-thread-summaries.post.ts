import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { inngest } from '../../inngest/client'
import { summarizeThreadMissing } from '../../utils/threads'
import type { Database } from '~/types/database.types'

interface BackfillBody {
  /** When omitted, backfills only the calling user's cases. Employees can pass `allCases: true` to scan every case. */
  caseId?: string
  allCases?: boolean
}

/**
 * Admin-gated. For each case in scope, finds threads in `messages` that have
 * no row in `message_threads` (or whose message_count drifted) and enqueues
 * one `messages/thread.summarize_requested` event per. Idempotent — re-running
 * is cheap.
 *
 * Run this:
 *   - once after Sprint 2 ships, against existing OFW imports
 *   - whenever SUMMARY_VERSION bumps and you want to regenerate everything
 *     (drop matching rows first, then call this)
 */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  const userId = (authUser as any)?.sub ?? (authUser as any)?.id ?? null
  if (!userId) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

  const client = await serverSupabaseClient<Database>(event)

  const { data: profile } = await client
    .from('profiles')
    .select('is_employee')
    .eq('id', userId)
    .maybeSingle()
  if (profile?.is_employee !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const body = await readBody<BackfillBody>(event).catch(() => ({} as BackfillBody))

  let caseIds: string[]
  if (body.caseId) {
    caseIds = [body.caseId]
  } else if (body.allCases) {
    const { data, error } = await client.from('cases').select('id')
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    caseIds = (data ?? []).map(c => c.id)
  } else {
    const { data, error } = await client.from('cases').select('id').eq('user_id', userId)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    caseIds = (data ?? []).map(c => c.id)
  }

  let enqueuedTotal = 0
  const perCase: { caseId: string; enqueued: number }[] = []

  for (const caseId of caseIds) {
    const deltas = await summarizeThreadMissing(client, caseId)
    if (!deltas.length) {
      perCase.push({ caseId, enqueued: 0 })
      continue
    }
    await inngest.send(deltas.map(d => ({
      name: 'messages/thread.summarize_requested',
      data: {
        caseId,
        userId,
        evidenceId: null,
        threadId: d.threadId
      }
    })))
    enqueuedTotal += deltas.length
    perCase.push({ caseId, enqueued: deltas.length })
  }

  return {
    enqueued: enqueuedTotal,
    cases: perCase.length,
    perCase
  }
})

import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { inngest } from '../../inngest/client'
import { summarizeThreadMissing } from '../../utils/threads'
import type { Database } from '~/types/database.types'

interface ConfirmBody {
  jobId: string
  decision: 'continue' | 'cancel'
}

/**
 * Resume or cancel an OFW ingest job that paused at `pending_confirmation`
 * because the upload's thread set drifted >50% from the case's existing
 * threads. Called from the /evidence UI alert.
 *
 * Auth: the caller must own the case the job belongs to. Not employee-gated
 * because this is a normal-user flow (despite living under /internal/ for
 * surface grouping with other admin/maintenance endpoints).
 */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  const userId = (authUser as any)?.sub ?? (authUser as any)?.id ?? null
  if (!userId) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })

  const body = await readBody<ConfirmBody>(event)
  if (!body?.jobId || (body.decision !== 'continue' && body.decision !== 'cancel')) {
    throw createError({ statusCode: 400, statusMessage: 'jobId and decision (continue|cancel) required' })
  }

  const client = await serverSupabaseClient<Database>(event)

  // Load the job. RLS on jobs ties to user_id directly, so this also enforces
  // ownership — the user must be the one who created the job.
  const { data: job, error: jobErr } = await client
    .from('jobs')
    .select('id, status, type, user_id, result_summary')
    .eq('id', body.jobId)
    .maybeSingle()
  if (jobErr) throw createError({ statusCode: 500, statusMessage: jobErr.message })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'job not found' })
  if (job.type !== 'ofw_ingest') throw createError({ statusCode: 400, statusMessage: 'not an ofw_ingest job' })
  if (job.status !== 'pending_confirmation') {
    throw createError({ statusCode: 409, statusMessage: `job is not pending confirmation (current: ${job.status})` })
  }

  // ofw-ingest stashes evidence_id + case_id in result_summary at finalize.
  const summary = (job.result_summary ?? {}) as Record<string, unknown>
  const evidenceId = typeof summary.evidence_id === 'string' ? summary.evidence_id : null
  const caseId = typeof summary.case_id === 'string' ? summary.case_id : null
  if (!evidenceId || !caseId) {
    throw createError({ statusCode: 500, statusMessage: 'job result_summary missing evidence_id/case_id' })
  }

  if (body.decision === 'cancel') {
    // Cascade: deleting the evidence row drops the messages
    // (messages.evidence_id ON DELETE CASCADE per 0050_ofw_messages.sql).
    // Existing message_threads rows survive (evidence_id ON DELETE SET NULL);
    // their message_count will self-correct on the next ingest or backfill.
    const { error: delErr } = await client.from('evidence').delete().eq('id', evidenceId)
    if (delErr) throw createError({ statusCode: 500, statusMessage: delErr.message })

    const { error: jUpdateErr } = await client.from('jobs').update({
      status: 'failed',
      error_message: 'Cancelled by user after drift warning',
      completed_at: new Date().toISOString()
    }).eq('id', body.jobId)
    if (jUpdateErr) throw createError({ statusCode: 500, statusMessage: jUpdateErr.message })

    return { decision: 'cancelled' as const, evidenceDeleted: true }
  }

  // continue: mark complete, then fan out the held-back summarization work.
  const { error: jUpdateErr } = await client.from('jobs').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', body.jobId)
  if (jUpdateErr) throw createError({ statusCode: 500, statusMessage: jUpdateErr.message })

  const deltas = await summarizeThreadMissing(client, caseId)
  if (deltas.length) {
    await inngest.send(deltas.map(d => ({
      name: 'messages/thread.summarize_requested',
      data: {
        caseId,
        userId,
        evidenceId,
        threadId: d.threadId
      }
    })))
  }

  return { decision: 'continued' as const, enqueued: deltas.length }
})

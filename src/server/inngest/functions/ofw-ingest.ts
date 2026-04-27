import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { inngest } from '../client'
import { parseOFWPdf, type OFWMessage } from '../../utils/ofw-parser'
import type { Database, Json } from '~/types/database.types'

type PublicClient = SupabaseClient<Database, 'public'>

interface OFWIngestEventData {
  evidenceId: string
  caseId: string
  userId: string
  jobId: string
}

const UPSERT_CHUNK_SIZE = 500

function createServiceClient(): PublicClient {
  // Mirror journal-extraction: read process.env directly. Inngest runs in
  // a webhook callback context where useRuntimeConfig() is unavailable.
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variables')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function toMessageRow(
  msg: OFWMessage,
  caseId: string,
  userId: string,
  evidenceId: string
): Database['public']['Tables']['messages']['Insert'] {
  return {
    case_id: caseId,
    user_id: userId,
    evidence_id: evidenceId,
    sequence_number: msg.id,
    message_number: msg.messageNumber,
    sent_at: msg.sent,
    first_viewed_at: msg.firstViewed,
    sender: msg.from,
    recipient: msg.to,
    subject: msg.subject || null,
    body: msg.body,
    thread_id: msg.threadId,
    word_count: msg.wordCount,
    attachments: (msg.attachments ?? []) as unknown as Json
  }
}

export const ofwIngestFunction = inngest.createFunction(
  {
    id: 'ofw-ingest',
    retries: 2,
    onFailure: async ({ event, error }) => {
      try {
        const supabase = createServiceClient()
        const data = event.data as { event?: { data?: OFWIngestEventData } } | OFWIngestEventData
        // Inngest's onFailure event wraps the original event data.
        const inner = (data as { event?: { data?: OFWIngestEventData } }).event?.data
          ?? (data as OFWIngestEventData)
        if (inner?.jobId) {
          await supabase.from('jobs').update({
            status: 'failed',
            error_message: error?.message ?? 'Unknown ingest failure',
            completed_at: new Date().toISOString()
          }).eq('id', inner.jobId)
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[ofw-ingest] onFailure handler crashed:', e)
      }
    }
  },
  { event: 'evidence/ofw_export.uploaded' },
  async ({ event, step }) => {
    const { evidenceId, caseId, userId, jobId } = event.data as OFWIngestEventData
    const supabase = createServiceClient()

    await step.run('mark-processing', async () => {
      const { error } = await supabase.from('jobs').update({
        status: 'processing',
        started_at: new Date().toISOString()
      }).eq('id', jobId)
      if (error) throw new Error(`Failed to mark job processing: ${error.message}`)
    })

    const storagePath = await step.run('lookup-storage-path', async () => {
      const { data, error } = await supabase
        .from('evidence')
        .select('storage_path')
        .eq('id', evidenceId)
        .single()
      if (error || !data?.storage_path) {
        throw new Error(`Evidence ${evidenceId} has no storage_path: ${error?.message ?? 'missing'}`)
      }
      return data.storage_path
    })

    // step.run results must be JSON-serializable, so we download + parse inside one step
    // to avoid round-tripping a multi-MB buffer through Inngest's step state.
    const result = await step.run('download-and-parse', async () => {
      const { data: blob, error } = await supabase.storage
        .from('daylight-files')
        .download(storagePath)
      if (error || !blob) {
        throw new Error(`Failed to download OFW PDF: ${error?.message ?? 'no blob'}`)
      }
      const arrayBuf = await blob.arrayBuffer()
      const parsed = await parseOFWPdf(new Uint8Array(arrayBuf), storagePath)
      return {
        totalMessages: parsed.metadata.totalMessages,
        reportExpected: parsed.metadata.reportExpected,
        threadCount: parsed.metadata.threadCount,
        senders: parsed.metadata.senders,
        dateRange: parsed.metadata.dateRange,
        messages: parsed.messages
      }
    })

    const inserted = await step.run('upsert-messages', async () => {
      const rows = result.messages.map((m: OFWMessage) => toMessageRow(m, caseId, userId, evidenceId))
      const chunks = chunk(rows, UPSERT_CHUNK_SIZE)
      let count = 0
      for (const c of chunks) {
        const { data, error } = await supabase
          .from('messages')
          .upsert(c, { onConflict: 'evidence_id,sequence_number', ignoreDuplicates: true })
          .select('id')
        if (error) throw new Error(`Failed to upsert messages: ${error.message}`)
        count += data?.length ?? 0
      }
      return count
    })

    await step.run('finalize', async () => {
      const { error } = await supabase.from('jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_summary: {
          messages_parsed: result.totalMessages,
          messages_inserted: inserted,
          report_expected: result.reportExpected,
          thread_count: result.threadCount,
          date_range: result.dateRange,
          senders: result.senders
        }
      }).eq('id', jobId)
      if (error) throw new Error(`Failed to finalize job: ${error.message}`)
    })

    return { messagesParsed: result.totalMessages, messagesInserted: inserted }
  }
)

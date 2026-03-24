import type { EvidenceItem } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

type EvidenceRow = Tables<'evidence'>
type EventEvidenceRow = Tables<'event_evidence'>
type CommunicationRow = Tables<'communications'>

function mapSourceType(rawType: string | null): EvidenceItem['sourceType'] {
  const normalized = rawType || 'other'

  // Keep this in sync with /api/evidence.ts so list and detail views
  // present the same source type for a given database value.
  if (normalized === 'recording' || normalized === 'other') {
    return 'document'
  }

  return normalized as EvidenceItem['sourceType']
}

interface EvidenceDetailResponse extends EvidenceItem {
  // Additional fields from the database
  storagePath?: string
  mimeType?: string
  updatedAt: string

  // Signed URLs for file access
  /**
   * Short-lived URL for directly viewing an image in the browser.
   * Present when mimeType starts with image/ and a storagePath exists.
   */
  imageUrl?: string

  /**
   * Short-lived URL for downloading the original file.
   * Present when a storagePath exists, regardless of mimeType.
   */
  downloadUrl?: string

  // Related data
  relatedEvents?: Array<{
    id: string
    type: string
    title: string
    timestamp: string
    isPrimary: boolean
  }>

  relatedCommunications?: Array<{
    id: string
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

function mapEvidenceToDetailResponse(
  row: EvidenceRow,
  relatedEvents: any[],
  relatedCommunications: CommunicationRow[]
): EvidenceDetailResponse {
  const sourceType = mapSourceType(row.source_type)

  const typeLabels: Record<string, string> = {
    text: 'Text message',
    email: 'Email communication',
    document: 'Legal document',
    photo: 'Photo evidence',
    recording: 'Recording',
    other: 'Evidence item'
  }

  const originalName =
    row.original_filename ||
    typeLabels[sourceType] ||
    'Evidence item'

  return {
    id: row.id,
    sourceType,
    originalName,
    createdAt: row.created_at,
    summary: row.summary || '',
    tags: (row.tags ?? []) as string[],

    // Additional fields
    storagePath: row.storage_path || undefined,
    mimeType: row.mime_type || undefined,
    updatedAt: row.updated_at,

    // Related data
    relatedEvents: relatedEvents.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title || 'Untitled Event',
      timestamp: e.primary_timestamp || e.created_at,
      isPrimary: e.is_primary || false
    })),

    relatedCommunications: relatedCommunications.map((c) => ({
      id: c.id,
      medium: c.medium,
      direction: c.direction,
      subject: c.subject || undefined,
      summary: c.summary,
      sentAt: c.sent_at || undefined
    }))
  }
}

export default eventHandler(async (event): Promise<EvidenceDetailResponse | { success: boolean }> => {
  const supabase = await serverSupabaseClient(event)
  const evidenceIdParam = getRouterParam(event, 'id')

  if (!evidenceIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Evidence ID is required.'
    })
  }

  const evidenceId = evidenceIdParam
  
  if (!evidenceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Evidence ID is required.'
    })
  }

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const method = getMethod(event)?.toUpperCase() || 'GET'

  // Handle DELETE for hard-deleting an evidence item (and letting FKs cascade).
  if (method === 'DELETE') {
    // Fetch the evidence first so we can also clean up any stored file path.
    const { data: evidenceRow, error: evidenceError } = await supabase
      .from('evidence')
      .select('id, user_id, storage_path')
      .eq('id', evidenceId)
      .eq('user_id', userId)
      .single()

    if (evidenceError || !evidenceRow) {
      console.error('Supabase select evidence error (delete evidence):', evidenceError)
      throw createError({
        statusCode: 404,
        statusMessage: 'Evidence not found.'
      })
    }

    const { error: deleteError } = await supabase
      .from('evidence')
      .delete()
      .eq('id', evidenceId)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('Supabase delete evidence error:', deleteError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to delete evidence.'
      })
    }

    // Best-effort cleanup of the underlying storage object, if any.
    if (evidenceRow.storage_path) {
      const bucket = 'daylight-files'
      const { error: storageError } = await supabase.storage
        .from(bucket)
        .remove([evidenceRow.storage_path])

      if (storageError) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete evidence file from storage:', storageError)
      }
    }

    return { success: true }
  }

  // Fetch the evidence
  const { data: evidenceRow, error: evidenceError } = await supabase
    .from('evidence')
    .select('*')
    .eq('id', evidenceId)
    .eq('user_id', userId)
    .single()

  if (evidenceError || !evidenceRow) {
    console.error('Supabase select evidence error (evidence detail):', evidenceError)
    throw createError({
      statusCode: 404,
      statusMessage: 'Evidence not found.'
    })
  }

  // Prepare signed URLs for the stored file (if any).
  // We keep these short-lived and scoped to this evidence row only.
  let imageUrl: string | undefined
  let downloadUrl: string | undefined

  if (evidenceRow.storage_path) {
    const bucket = 'daylight-files'

    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(evidenceRow.storage_path, 60 * 15)

    if (!signedError && signed?.signedUrl) {
      downloadUrl = signed.signedUrl

      if (evidenceRow.mime_type && evidenceRow.mime_type.startsWith('image/')) {
        imageUrl = signed.signedUrl
      }
    } else if (signedError) {
      // eslint-disable-next-line no-console
      console.error('Failed to create signed URL for evidence file:', signedError)
    }
  }

  // Fetch all related data in parallel
  const [
    { data: eventEvidenceRows, error: eventEvidenceError },
    { data: communicationsRows, error: communicationsError }
  ] = await Promise.all([
    supabase
      .from('event_evidence')
      .select(`
        *,
        events!inner (
          id,
          type,
          title,
          primary_timestamp,
          created_at
        )
      `)
      .eq('evidence_id', evidenceId)
      .eq('events.user_id', userId),
    
    supabase
      .from('communications')
      .select('*')
      .eq('evidence_id', evidenceId)
      .eq('user_id', userId)
  ])

  // Log any errors but don't fail the request
  if (eventEvidenceError) console.error('Error fetching related events:', eventEvidenceError)
  if (communicationsError) console.error('Error fetching related communications:', communicationsError)

  // Process related events
  const relatedEvents = (eventEvidenceRows || []).map((row: any) => ({
    ...row.events,
    is_primary: row.is_primary
  }))

  const base = mapEvidenceToDetailResponse(
    evidenceRow as EvidenceRow,
    relatedEvents,
    (communicationsRows || []) as CommunicationRow[]
  )

  return {
    ...base,
    imageUrl,
    downloadUrl
  }
})

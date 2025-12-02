import { readFiles } from 'h3-formidable'
import fs from 'fs/promises'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { canUploadEvidence } from '../utils/subscription'

/**
 * POST /api/evidence-upload
 * 
 * Uploads evidence files to storage.
 * Feature gating: Free users limited to 10 evidence uploads.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Check if user can upload evidence (feature gating)
  const evidenceCheck = await canUploadEvidence(event, userId)
  if (!evidenceCheck.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: evidenceCheck.reason || 'Evidence upload limit reached. Please upgrade to Pro.'
    })
  }

  let tempFilePath: string | undefined

  try {
    const { files, fields } = await readFiles(event)
    const file = files.file?.[0]

    if (!file) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No file provided.'
      })
    }

    tempFilePath = file.filepath

    const buffer = await fs.readFile(file.filepath)
    const mimeType = file.mimetype || 'application/octet-stream'
    const originalName = file.originalFilename || 'evidence-upload'
    
    // Sanitize filename for Supabase Storage (no spaces or special chars)
    const sanitizedName = originalName
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .replace(/[^a-zA-Z0-9._-]/g, '') // Remove other special characters
    
    const timestamp = Date.now()

    const bucket = 'daylight-files'
    const storagePath = `evidence/${userId}/${timestamp}-${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false
      })

    if (uploadError) {
      // eslint-disable-next-line no-console
      console.error('Supabase storage upload error (evidence):', uploadError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to store evidence file.'
      })
    }

    // Basic heuristic for evidence source type
    let sourceType: 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other' = 'document'
    if (mimeType.startsWith('image/')) {
      sourceType = 'photo'
    } else if (mimeType.startsWith('audio/')) {
      sourceType = 'recording'
    } else if (mimeType === 'message/rfc822') {
      sourceType = 'email'
    } else if (mimeType.startsWith('text/')) {
      sourceType = 'text'
    }

    // Optional user-provided annotation from the upload form
    let annotation: string | null = null
    const rawAnnotation = (fields as any)?.annotation
    if (typeof rawAnnotation === 'string') {
      annotation = rawAnnotation.trim() || null
    } else if (Array.isArray(rawAnnotation) && typeof rawAnnotation[0] === 'string') {
      annotation = rawAnnotation[0].trim() || null
    }

    const { data, error: insertError } = await supabase
      .from('evidence')
      .insert({
        user_id: userId,
        source_type: sourceType,
        storage_path: storagePath,
        original_filename: originalName,  // Keep original name for display
        mime_type: mimeType,
        summary: `Uploaded file: ${originalName}`,
        user_annotation: annotation,
        tags: []
      })
      .select('id, source_type, storage_path, original_filename, summary, tags, created_at')
      .limit(1)

    if (insertError) {
      // eslint-disable-next-line no-console
      console.error('Supabase insert evidence error:', insertError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to save evidence metadata.'
      })
    }

    const row = data?.[0]

    return {
      id: row.id,
      sourceType: (row.source_type === 'recording' || row.source_type === 'other' ? 'document' : row.source_type),
      originalName: row.original_filename || row.storage_path || 'Untitled',
      createdAt: row.created_at,
      summary: row.summary || '',
      tags: row.tags || []
    }
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Evidence upload error:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to upload evidence file.'
    })
  } finally {
    // Best-effort cleanup of temp files
    try {
      if (tempFilePath) {
        await fs.unlink(tempFilePath).catch(() => {})
      }
    } catch {
      // ignore
    }
  }
})



import { readFiles } from 'h3-formidable'
import fs from 'fs/promises'
import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseServiceRole(event)

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  let tempFilePath: string | undefined

  try {
    const { files } = await readFiles(event)
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
    const safeOriginalName = file.originalFilename || 'evidence-upload'
    const timestamp = Date.now()

    const bucket = 'daylight-files'
    const storagePath = `evidence/${userId}/${timestamp}-${safeOriginalName}`

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

    const { data, error: insertError } = await supabase
      .from('evidence')
      .insert({
        user_id: userId,
        source_type: sourceType,
        storage_path: storagePath,
        original_filename: safeOriginalName,
        mime_type: mimeType,
        summary: `Uploaded file: ${safeOriginalName}`,
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



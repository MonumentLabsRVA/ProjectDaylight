import { readFiles } from 'h3-formidable'
import fs from 'fs/promises'
import { serverSupabaseClient } from '#supabase/server'
import { canUploadEvidence } from '../utils/subscription'
import { requireUserId } from '../utils/auth'
import { logAnalyticsEvent } from '../utils/analytics'
import { getActiveCaseId, requireCaseAccess } from '../utils/cases'
import { inngest } from '../inngest/client'

const MAX_OFW_BYTES = 100 * 1024 * 1024 // 100 MB — OFW exports can be large.

/**
 * POST /api/evidence-ofw-upload
 *
 * Multipart upload of an OFW (Our Family Wizard) "Message Report" PDF.
 * Inserts an evidence row with source_type='ofw_export', creates an
 * ofw_ingest job, and fires `evidence/ofw_export.uploaded` for the
 * Inngest worker to parse + upsert messages.
 *
 * NOTE: this server-side multipart route works fine on the dev server.
 * On Vercel, function payload limits (~4.5 MB) will reject typical OFW
 * exports. v0 ships server-side; v1 should switch to a direct-to-Storage
 * upload from the browser then post the storage_path here.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const userId = await requireUserId(event, supabase, 'Unauthorized - Please log in')

  const evidenceCheck = await canUploadEvidence(event, userId)
  if (!evidenceCheck.allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: evidenceCheck.reason || 'Evidence upload limit reached. Please upgrade to Pro.'
    })
  }

  let tempFilePath: string | undefined

  try {
    const { files, fields } = await readFiles(event, { maxFileSize: MAX_OFW_BYTES })
    const file = files.file?.[0]

    if (!file) {
      throw createError({ statusCode: 400, statusMessage: 'No file provided.' })
    }

    tempFilePath = file.filepath

    const originalName = file.originalFilename || 'ofw-export.pdf'
    const mimeType = file.mimetype || 'application/pdf'

    if (!originalName.toLowerCase().endsWith('.pdf') && mimeType !== 'application/pdf') {
      throw createError({ statusCode: 400, statusMessage: 'OFW exports must be PDF files.' })
    }

    const buffer = await fs.readFile(file.filepath)

    const sanitizedName = originalName
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '')
    const timestamp = Date.now()
    const bucket = 'daylight-files'
    const storagePath = `evidence/${userId}/ofw/${timestamp}-${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (uploadError) {
      // eslint-disable-next-line no-console
      console.error('[evidence-ofw-upload] Storage upload error:', uploadError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to store OFW export.' })
    }

    let overrideCaseId: string | null = null
    const rawCaseId = (fields as Record<string, unknown>)?.caseId
    if (typeof rawCaseId === 'string') {
      overrideCaseId = rawCaseId.trim() || null
    } else if (Array.isArray(rawCaseId) && typeof rawCaseId[0] === 'string') {
      overrideCaseId = rawCaseId[0].trim() || null
    }

    const caseId = await getActiveCaseId(supabase, userId, overrideCaseId)
    await requireCaseAccess(supabase, userId, caseId)

    const { data: evidenceRow, error: insertError } = await supabase
      .from('evidence')
      .insert({
        user_id: userId,
        case_id: caseId,
        source_type: 'ofw_export',
        storage_path: storagePath,
        original_filename: originalName,
        mime_type: 'application/pdf',
        summary: `OFW Message Report: ${originalName}`,
        tags: []
      })
      .select('id, created_at')
      .single()

    if (insertError || !evidenceRow) {
      // eslint-disable-next-line no-console
      console.error('[evidence-ofw-upload] Failed to insert evidence row:', insertError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to record OFW evidence.' })
    }

    const { data: jobRow, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        type: 'ofw_ingest',
        status: 'pending'
      })
      .select('id')
      .single()

    if (jobError || !jobRow) {
      // eslint-disable-next-line no-console
      console.error('[evidence-ofw-upload] Failed to create ofw_ingest job:', jobError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to queue parsing job.' })
    }

    try {
      await inngest.send({
        name: 'evidence/ofw_export.uploaded',
        data: {
          evidenceId: evidenceRow.id,
          caseId,
          userId,
          jobId: jobRow.id
        }
      })
    } catch (sendError) {
      // eslint-disable-next-line no-console
      console.error('[evidence-ofw-upload] Failed to enqueue Inngest job:', sendError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to queue background parsing.' })
    }

    await logAnalyticsEvent(event, 'ofw_export_uploaded', {
      evidenceId: evidenceRow.id,
      jobId: jobRow.id,
      sizeBytes: buffer.length,
      filename: originalName
    })

    return {
      evidenceId: evidenceRow.id,
      jobId: jobRow.id,
      message: 'Parsing started'
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    // eslint-disable-next-line no-console
    console.error('[evidence-ofw-upload] Unexpected error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload OFW export.' })
  } finally {
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {})
    }
  }
})

import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

/**
 * Serves a signed URL redirect for evidence images.
 * Used by the evidence list to display thumbnails.
 */
export default eventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const evidenceIdParam = getRouterParam(event, 'id')

  if (!evidenceIdParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Evidence ID is required.'
    })
  }

  // Allow both numeric (dev seed) and UUID-style IDs.
  const evidenceId: string | number = /^\d+$/.test(evidenceIdParam)
    ? Number(evidenceIdParam)
    : evidenceIdParam

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Fetch the evidence record to get storage path and verify ownership
  const { data: evidenceRow, error: evidenceError } = await supabase
    .from('evidence')
    .select('storage_path, mime_type, user_id')
    .eq('id', evidenceId as string)
    .eq('user_id', userId)
    .single()

  if (evidenceError || !evidenceRow) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Evidence not found.'
    })
  }

  if (!evidenceRow.storage_path) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No file associated with this evidence.'
    })
  }

  // Only serve images
  if (!evidenceRow.mime_type?.startsWith('image/')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'This evidence is not an image.'
    })
  }

  // Generate a signed URL for the image
  const bucket = 'daylight-files'
  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(evidenceRow.storage_path, 60 * 15) // 15 minutes

  if (signedError || !signed?.signedUrl) {
    // eslint-disable-next-line no-console
    console.error('Failed to create signed URL for evidence image:', signedError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to generate image URL.'
    })
  }

  // Redirect to the signed URL
  return sendRedirect(event, signed.signedUrl, 302)
})


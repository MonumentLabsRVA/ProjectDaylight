import OpenAI from 'openai'
import { readFiles } from 'h3-formidable'
import fs from 'fs/promises'
import { serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  // Check if API key is configured
  if (!config.openai?.apiKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.'
    })
  }

  // Require authenticated user (cookie/JWT based)
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  try {
    // Parse the multipart form data
    const { files } = await readFiles(event)
    
    // Get the audio file
    const audioFile = files.audio?.[0]
    if (!audioFile) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No audio file provided'
      })
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    })

    // Read the file as a buffer
    const audioBuffer = await fs.readFile(audioFile.filepath)
    
    // Determine the file type from the original filename or content type
    const mimeType = audioFile.mimetype || 'audio/webm'
    const extension = audioFile.originalFilename?.split('.').pop() || 'webm'
    
    // Create a File object for OpenAI API
    // OpenAI accepts various audio formats including webm, mp3, mp4, mpeg, mpga, m4a, wav, webm
    const file = new File([audioBuffer], `audio.${extension}`, { type: mimeType })

    // Send to OpenAI Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en', // Optional: specify language for better accuracy
      response_format: 'json'
    })

    // Clean up the temporary file
    await fs.unlink(audioFile.filepath).catch(() => {
      // Ignore cleanup errors
    })

    return {
      transcript: transcription.text
    }
  } catch (error: any) {
    // Log the error for debugging
    console.error('Transcription error:', error)
    
    // Handle OpenAI API errors
    if (error?.status === 401) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid OpenAI API key. Please check your configuration.'
      })
    }
    
    if (error?.status === 429) {
      throw createError({
        statusCode: 429,
        statusMessage: 'OpenAI API rate limit exceeded. Please try again later.'
      })
    }
    
    // Re-throw if it's already an H3 error
    if (error.statusCode) {
      throw error
    }
    
    // Generic error
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to transcribe audio. Please try again.'
    })
  }
})



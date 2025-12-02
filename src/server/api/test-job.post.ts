import { inngest } from '../inngest/client'

interface TestJobRequest {
  message?: string
}

interface TestJobResponse {
  success: boolean
  eventId: string
  message: string
}

export default eventHandler(async (event): Promise<TestJobResponse> => {
  const body = await readBody<TestJobRequest>(event)

  try {
    // Send the event to Inngest - this will trigger the test-job function
    const result = await inngest.send({
      name: 'test/job.requested',
      data: {
        message: body?.message || 'Hello from Daylight!',
        timestamp: new Date().toISOString()
      }
    })

    return {
      success: true,
      eventId: result.ids[0] || 'unknown',
      message: 'Test job queued successfully! Check the Inngest dashboard to see it run.'
    }
  } catch (error: any) {
    console.error('[test-job] Failed to send event:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || 'Failed to queue test job'
    })
  }
})


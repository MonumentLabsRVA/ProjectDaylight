import { createClient } from '@supabase/supabase-js'
import { inngest } from '../client'

// Simple test function that actually does background work
export const testJob = inngest.createFunction(
  { id: 'test-job' },
  { event: 'test/job.requested' },
  async ({ event, step }) => {
    const config = useRuntimeConfig()
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      config.supabaseServiceKey
    )

    // Step 1: Write a test record to the database
    const testRecord = await step.run('write-to-db', async () => {
      const { data, error } = await supabase
        .from('test_notes')
        .insert({
          content: `Background job test: ${event.data.message}`,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw new Error(`Failed to write: ${error.message}`)
      return data
    })

    // Step 2: Wait 2 seconds to simulate processing
    await step.sleep('processing-delay', '2s')

    // Step 3: Read back and verify
    const verification = await step.run('verify-record', async () => {
      const { data, error } = await supabase
        .from('test_notes')
        .select('*')
        .eq('id', testRecord.id)
        .single()

      if (error) throw new Error(`Failed to read: ${error.message}`)
      return {
        verified: true,
        record: data,
        verifiedAt: new Date().toISOString()
      }
    })

    // Step 4: Clean up (delete the test record)
    await step.run('cleanup', async () => {
      await supabase
        .from('test_notes')
        .delete()
        .eq('id', testRecord.id)
    })

    return {
      success: true,
      message: event.data.message,
      recordId: testRecord.id,
      createdAt: testRecord.created_at,
      verifiedAt: verification.verifiedAt,
      cleaned: true
    }
  }
)

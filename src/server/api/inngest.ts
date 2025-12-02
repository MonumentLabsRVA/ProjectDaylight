import { Inngest } from 'inngest'
import { serve } from 'inngest/h3'
import { eventHandler, toWebHandler, fromWebHandler } from 'h3'
import { inngest } from '../inngest/client'
import { testJob } from '../inngest/functions'

// Create the Inngest serve handler
const handler = serve({
  client: inngest,
  functions: [
    testJob
  ]
})

// Wrap with eventHandler to avoid deprecation warning
export default eventHandler(handler)


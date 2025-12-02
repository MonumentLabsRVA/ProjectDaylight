import { Inngest } from 'inngest'

// Create a client to send and receive events
export const inngest = new Inngest({
  id: 'daylight',
  // Event key and signing key will be read from environment variables:
  // INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY
})


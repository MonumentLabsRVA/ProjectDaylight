# Background Jobs Implementation Proposal

*Created: December 1, 2025*

## Overview

Decouple journal entry creation from LLM extraction. Users submit entries immediately; extraction happens in the background with toast notifications on completion.

**Current flow:** User waits 30-60s during synchronous processing  
**New flow:** Instant submission → background processing → toast when ready

---

## 1. Type Definitions

### Add to `types/index.d.ts`

```typescript
// Background job types
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type JobType = 'journal_extraction' | 'evidence_processing'

export interface Job {
  id: string
  user_id: string
  type: JobType
  status: JobStatus
  journal_entry_id: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  result_summary: JobResultSummary | null
  created_at: string
  updated_at: string
}

export interface JobResultSummary {
  events_created: number
  evidence_processed: number
  action_items_created: number
  event_ids: string[]
}

// API response types
export interface JournalSubmitResponse {
  journalEntryId: string
  jobId: string
  message: string
}
```

---

## 2. Database Schema

### Migration: `0036_jobs_table.sql`

```sql
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE job_type AS ENUM ('journal_extraction', 'evidence_processing');

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own jobs" ON jobs FOR SELECT USING (auth.uid() = user_id);

-- Enable Realtime for push notifications
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;

CREATE INDEX idx_jobs_user_status ON jobs(user_id, status);
```

### Migration: `0037_journal_entries_job_reference.sql`

```sql
ALTER TABLE journal_entries ADD COLUMN extraction_job_id UUID REFERENCES jobs(id);
```

---

## 3. Background Function

### `server/inngest/functions/journal-extraction.ts`

> **Note:** Inngest is already configured in `server/inngest/client.ts` and `server/api/inngest.ts`. Just add this function and register it.

Key structure - uses Supabase service role client for background operations:

```typescript
import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

// Service role client for background jobs (not user-scoped)
function createServiceClient() {
  const config = useRuntimeConfig()
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    config.supabaseServiceKey
  )
}

export const journalExtractionFunction = inngest.createFunction(
  {
    id: 'journal-extraction',
    retries: 2,
    onFailure: async ({ event, error }) => {
      const supabase = createServiceClient()
      await supabase
        .from('jobs')
        .update({ status: 'failed', error_message: error.message })
        .eq('id', event.data.jobId)
    }
  },
  { event: 'journal/extraction.requested' },
  async ({ event, step }) => {
    const { jobId, journalEntryId, userId, eventText, referenceDate, evidenceIds } = event.data
    const supabase = createServiceClient()

    // Step 1: Mark processing
    await step.run('mark-processing', async () => {
      await supabase.from('jobs').update({ 
        status: 'processing', 
        started_at: new Date().toISOString() 
      }).eq('id', jobId)
    })

    // Step 2: Process evidence (one step per item for checkpointing)
    const evidenceSummaries: Array<{ evidenceId: string; summary: string }> = []
    for (const evidenceId of evidenceIds) {
      const result = await step.run(`process-evidence-${evidenceId}`, async () => {
        // Call existing evidence processing logic
        return await processEvidenceItem(supabase, evidenceId, userId)
      })
      if (result) evidenceSummaries.push(result)
    }

    // Step 3: Extract events
    const extraction = await step.run('extract-events', async () => {
      return await extractEventsFromText(eventText, referenceDate, evidenceSummaries, userId)
    })

    // Step 4: Save to database
    const savedData = await step.run('save-events', async () => {
      return await saveExtractedEvents(supabase, userId, journalEntryId, extraction, evidenceIds)
    })

    // Step 5: Complete
    await step.run('finalize', async () => {
      await supabase.from('journal_entries').update({
        status: 'completed',
        extraction_raw: extraction,
        completed_at: new Date().toISOString()
      }).eq('id', journalEntryId)

      // This update triggers Realtime → frontend toast
      await supabase.from('jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_summary: savedData
      }).eq('id', jobId)
    })

    return savedData
  }
)
```

---

## 4. API Route

### `server/api/journal/submit.post.ts`

```typescript
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { canCreateJournalEntry } from '../../utils/subscription'
import { inngest } from '../../inngest/client'
import type { JournalSubmitResponse } from '~/types'

export default defineEventHandler(async (event): Promise<JournalSubmitResponse> => {
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  // Feature gating
  const check = await canCreateJournalEntry(event, userId)
  if (!check.allowed) {
    throw createError({ statusCode: 403, statusMessage: check.reason })
  }

  const body = await readBody<{
    eventText: string
    referenceDate?: string
    evidenceIds?: string[]
  }>(event)

  if (!body.eventText?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Event text is required' })
  }

  // 1. Create journal entry in 'processing' state
  const { data: entry, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      user_id: userId,
      event_text: body.eventText,
      reference_date: body.referenceDate || null,
      status: 'processing'
    })
    .select('id')
    .single()

  if (entryError || !entry) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create journal entry' })
  }

  // 2. Create job record
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      user_id: userId,
      type: 'journal_extraction',
      status: 'pending',
      journal_entry_id: entry.id
    })
    .select('id')
    .single()

  if (jobError || !job) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create job' })
  }

  // 3. Fire background event
  await inngest.send({
    name: 'journal/extraction.requested',
    data: {
      jobId: job.id,
      journalEntryId: entry.id,
      userId,
      eventText: body.eventText,
      referenceDate: body.referenceDate || null,
      evidenceIds: body.evidenceIds || []
    }
  })

  return {
    journalEntryId: entry.id,
    jobId: job.id,
    message: 'Processing started'
  }
})
```

---

## 5. Frontend Composable

### `composables/useJobs.ts`

Module-level state persists across navigation. Subscribes to Realtime for push updates.

```typescript
import type { Job, JobResultSummary } from '~/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Module-level state (persists across page navigation)
const activeJobs = ref<Map<string, Job>>(new Map())
const channels = ref<Map<string, RealtimeChannel>>(new Map())

export function useJobs() {
  const supabase = useSupabaseClient()
  const toast = useToast()

  function trackJob(job: Pick<Job, 'id' | 'journal_entry_id'> & { status?: Job['status'] }) {
    if (activeJobs.value.has(job.id)) return

    activeJobs.value.set(job.id, {
      ...job,
      status: job.status || 'pending'
    } as Job)

    // Subscribe to Realtime updates
    const channel = supabase
      .channel(`job-${job.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${job.id}`
      }, (payload) => {
        const updated = payload.new as Job
        activeJobs.value.set(job.id, updated)
        handleJobUpdate(updated)
      })
      .subscribe()

    channels.value.set(job.id, channel)
  }

  function handleJobUpdate(job: Job) {
    if (job.status === 'completed') {
      const summary = job.result_summary
      toast.add({
        title: 'Journal entry ready!',
        description: summary?.events_created 
          ? `${summary.events_created} event${summary.events_created !== 1 ? 's' : ''} extracted`
          : 'Processing complete',
        icon: 'i-lucide-check-circle',
        color: 'success',
        actions: job.journal_entry_id ? [{
          label: 'View',
          click: () => navigateTo(`/journal/${job.journal_entry_id}`)
        }] : undefined
      })
      cleanup(job.id)
    } else if (job.status === 'failed') {
      toast.add({
        title: 'Processing failed',
        description: job.error_message || 'Please try again',
        icon: 'i-lucide-alert-circle',
        color: 'error'
      })
      cleanup(job.id)
    }
  }

  function cleanup(jobId: string) {
    const channel = channels.value.get(jobId)
    if (channel) {
      supabase.removeChannel(channel)
      channels.value.delete(jobId)
    }
    activeJobs.value.delete(jobId)
  }

  const hasActiveJobs = computed(() => 
    Array.from(activeJobs.value.values()).some(j => 
      j.status === 'pending' || j.status === 'processing'
    )
  )

  return {
    activeJobs: computed(() => activeJobs.value),
    hasActiveJobs,
    trackJob,
    cleanup
  }
}
```

---

## 6. Frontend Usage

### In `pages/journal/new.vue`

```typescript
async function submitCapture() {
  isSubmitting.value = true

  try {
    // Upload evidence first (fast, synchronous)
    const evidenceIds = await uploadAllEvidence()

    // Submit for background processing
    const result = await $fetch<JournalSubmitResponse>('/api/journal/submit', {
      method: 'POST',
      body: {
        eventText: effectiveEventText.value,
        referenceDate: state.value.referenceDate,
        evidenceIds
      }
    })

    // Track job for toast notification
    const { trackJob } = useJobs()
    trackJob({ id: result.jobId, journal_entry_id: result.journalEntryId })

    incrementJournalEntryCount()

    toast.add({
      title: 'Entry submitted!',
      description: 'You\'ll be notified when processing completes.',
      icon: 'i-lucide-clock',
      color: 'info'
    })

    await navigateTo('/journal')
  } catch (e: any) {
    state.value.error = e?.data?.statusMessage || 'Failed to submit'
  } finally {
    isSubmitting.value = false
  }
}
```

### In `pages/journal/index.vue`

Show processing status inline:

```vue
<UBadge v-if="entry.status === 'processing'" color="info" variant="subtle">
  <UIcon name="i-lucide-loader-2" class="animate-spin mr-1" />
  Processing
</UBadge>
```

---

## 7. Environment Setup

> **Already configured.** Inngest is installed and environment variables are set. No additional setup needed.

---

## Implementation Order

> **Note:** Inngest is already configured and working. See `server/inngest/client.ts` and the existing `testJob` function for reference.

> **Status:** ✅ Phase 1 (Database & Types) completed — migrations and TypeScript definitions implemented and verified in Supabase.

| Phase | Tasks | Est. |
|-------|-------|------|
| **1. Database & Types** | Migrations (`jobs` table, `journal_entries.extraction_job_id`), TypeScript type definitions | 2h |
| **2. Backend** | Background function (`journal-extraction.ts`), Submit API route (`/api/journal/submit.post.ts`), register function in Inngest handler | 5h |
| **3. Frontend** | `useJobs` composable with Realtime subscription, update `journal/new.vue` for async submission, update journal list/detail for status display | 5h |
| **4. Testing** | End-to-end flow testing, error handling, retry scenarios | 2h |

**Total: ~2 days**

---

## Local Development

Inngest dev server runs alongside the Nuxt dev server. Dashboard available at `localhost:8288`.

```bash
# Terminal 1: Nuxt
npm run dev

# Terminal 2: Inngest (already tested and working)
npx inngest-cli@latest dev
```

---

## Open Questions

1. **Review step** - Remove entirely (this proposal) or keep as optional?
2. **Retry UX** - Manual retry button for failed jobs?
3. **Evidence upload** - Keep synchronous (fast) or also background?

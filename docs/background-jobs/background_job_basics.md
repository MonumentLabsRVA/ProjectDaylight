# Background Jobs Pattern

## Problem

Serverless functions (Vercel) timeout after 60s. Long-running LLM pipelines die mid-execution, forcing awkward frontend orchestration.

## Solution

**Inngest** for durable background execution + **Supabase Realtime** for push notifications + **module-level composable** for global state.

```
Frontend → API route → Inngest event → Background function
                                              ↓
                                        Updates DB
                                              ↓
                                    Supabase Realtime
                                              ↓
                                    Composable receives update → Toast
```

## Key Components

### 1. Inngest Function (`server/inngest/functions/`)

Breaks work into checkpointed steps. Each `step.run()` can take up to 5 min. If the function times out, it resumes from the last completed step.

```ts
inngest.createFunction(
  { id: "process-documents" },
  { event: "documents/process.requested" },
  async ({ event, step }) => {
    await step.run("step-1", async () => { /* ... */ });
    await step.run("step-2", async () => { /* ... */ });
  }
);
```

### 2. API Route (`server/api/`)

Creates job record, fires Inngest event, returns immediately.

```ts
await inngest.send({
  name: "documents/process.requested",
  data: { jobId, documentIds, userId },
});
```

### 3. Job Tracking Composable (`composables/useJobs.ts`)

Module-level state persists across page navigation. Subscribes to Supabase Realtime for push updates.

```ts
// Module-level - shared across all components
const activeJobs = ref<Map<string, Job>>(new Map());

export function useJobs() {
  const supabase = useSupabaseClient();
  const toast = useToast(); // Nuxt UI

  function trackJob(job: Job) {
    activeJobs.value.set(job.id, job);
    
    supabase
      .channel(`job-${job.id}`)
      .on("postgres_changes", { /* ... */ }, (payload) => {
        if (payload.new.status === "complete") {
          toast.add({
            title: "Your documents are ready!",
            // ...
          });
        }
      })
      .subscribe();
  }

  return { activeJobs, trackJob, /* ... */ };
}
```

### 4. Usage in Pages

```ts
const { trackJob } = useJobs();

// After calling API to start job:
trackJob({ id: data.jobId, status: "pending" });

// User can navigate away - toast will appear when done
```

## Setup Requirements

1. Enable Realtime on jobs table:
   ```sql
   alter publication supabase_realtime add table public.jobs;
   ```

2. Inngest endpoint at `server/api/inngest.ts`

3. Env vars: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`

## Local Dev

```bash
# Terminal 1
npm run dev

# Terminal 2 - Inngest dashboard at localhost:8288
npx inngest-cli@latest dev
```
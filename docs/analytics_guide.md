# Analytics Guide

> Standard patterns for logging analytics events in Daylight.

---

## Overview

Daylight uses a simple, unified analytics system that logs events to Supabase. Events can be logged from both the client (Vue composable) and server (utility function). The analytics schema is append-only and designed for AI-assisted analysis — no PostHog, no Mixpanel, no Segment, just rows in `analytics.events` that we can query directly.

**Key principles:**

- Analytics should never block the user experience (fire-and-forget).
- Events use `snake_case` naming with the `{entity}_{action}` pattern.
- All events include automatic context (user, route, source, server timestamp).
- Events are immutable — no updates, no deletes.
- Auth lifecycle events (`user_signed_up`, `user_logged_in`) are logged automatically by database triggers — no app code required.

---

## Client-Side Logging

### Basic usage

```ts
// In any Vue component or composable
const { logEvent } = useAnalytics()

// Simple event
logEvent('journal_new_opened')

// Event with payload
logEvent('case_field_edited', {
  field: 'opposing_party_name',
  hadPreviousValue: true
})
```

### With scoped context

```ts
// Pre-fill a logger with context shared across many events
const { scopedLogger } = useAnalytics()
const log = scopedLogger({ journalEntryId: entry.id })

log('journal_review_step_viewed', { step: 'events' })
log('journal_event_edited', { eventId: '123', field: 'description' })
```

### With options

```ts
// Skip conditionally
logEvent('export_preview_opened', { focus }, { skip: isInternalDemo })

// Add ad-hoc context
logEvent('evidence_attached', { evidenceId }, {
  context: { journalEntryId: entry.id }
})
```

### Auto-included context (client)

Every client-side event automatically includes:

- `route` — current page path (e.g. `/journal/new`)
- `userAgent` — browser info
- `userId` — current Supabase user id (if authenticated)

The server endpoint then adds:

- `ip` — client IP (respects `X-Forwarded-For`)
- `timestamp_server` — server-side ISO timestamp

---

## Server-Side Logging

### Basic usage

```ts
import { logAnalyticsEvent } from '~/server/utils/analytics'

export default defineEventHandler(async (event) => {
  // ...handler logic...

  await logAnalyticsEvent(event, 'journal_entry_submitted', {
    journalEntryId: entry.id,
    jobId: job.id,
    eventTextLength: body.eventText.length
  })

  return { journalEntryId: entry.id, jobId: job.id }
})
```

### With additional context

```ts
await logAnalyticsEvent(
  event,
  'extraction_completed',
  {
    journalEntryId,
    durationMs,
    eventsCreated,
    evidenceMentions
  },
  {
    // merged into the standard context object
    triggerSource: 'inngest_worker'
  }
)
```

### Auto-enriched context (server)

The server util adds:

- `source: 'backend'` — distinguishes server events from client events
- `ip` — client IP (from the H3 event)
- `timestamp_server` — server-side ISO timestamp

It also resolves `actor_id` automatically via `resolveUserId(event, supabase)` — same auth helper the rest of the API uses, so it works with both cookie and bearer-token auth. Anonymous calls land with `actor_id = NULL`.

The util **never throws**. Errors are logged to the server console; the main request is never blocked.

### Inngest workers

Workers don't have an `H3Event`, but the same RPC works directly through a service-role Supabase client:

```ts
await supabase.schema('analytics').rpc('log_event', {
  p_event_type: 'extraction_completed',
  p_actor_id: userId,
  p_payload: { journalEntryId, durationMs },
  p_context: { source: 'inngest_worker' }
})
```

---

## Event Naming Convention

Use `snake_case` with the pattern `{entity}_{action}`. The server validates this with `/^[a-z][a-z0-9_]*$/` and returns 400 on bad names.

### Standard actions

| Action | Description | Tense |
|---|---|---|
| `created` | New entity created | Past (backend effect) |
| `submitted` | User submitted form / kicked off processing | Past (backend effect) |
| `updated` | Entity modified | Past (backend effect) |
| `deleted` | Entity removed | Past (backend effect) |
| `uploaded` | File saved to storage | Past (backend effect) |
| `viewed` | Entity opened/viewed | Past (backend effect) |
| `opened` | User opened a screen | Past (frontend intent) |
| `started` | Process began | Past |
| `completed` | Process finished | Past |
| `failed` | Process failed | Past |
| `cancelled` | User cancelled | Past |
| `requested` | User initiated action | Past (frontend intent) |

### Naming patterns

1. **Frontend intent events** — `journal_new_opened`, `recording_started`, `billing_upgrade_requested`.
2. **Backend effect events** — `journal_entry_submitted`, `evidence_uploaded`, `export_created`.
3. **Domain prefix** — start with the entity: `journal_`, `evidence_`, `export_`, `case_`, `user_`, `subscription_`.

### Examples

| Valid | Invalid |
|---|---|
| `journal_entry_submitted` | `JournalEntrySubmitted` (camel) |
| `evidence_uploaded` | `evidence-uploaded` (kebab) |
| `export_created` | `Export_Created` (mixed case) |
| `user_logged_in` | `2_factor_enabled` (leading digit) |

---

## Event Catalog

### Auth (auto-logged by DB triggers)

| Event | Source | Payload | When |
|---|---|---|---|
| `user_signed_up` | `auth.users` trigger | `userId`, `signupMethod` | A new auth user is created |
| `user_logged_in` | `auth.sessions` trigger | `userId`, `loginMethod` | A new session is created (every login) |

`signupMethod` / `loginMethod` come from `auth.users.raw_app_meta_data->>'provider'` (e.g. `email`, `google`).

### Journal

| Event | Source | Payload | When |
|---|---|---|---|
| `journal_new_opened` | Frontend (`pages/journal/new.vue`) | — | User lands on the new-entry page |
| `journal_entry_submitted` | Backend (`api/journal/submit.post.ts`) | `journalEntryId`, `jobId`, `hasReferenceDate`, `evidenceIdsCount`, `eventTextLength` | Entry is queued for extraction |

### Evidence

| Event | Source | Payload | When |
|---|---|---|---|
| `evidence_uploaded` | Backend (`api/evidence-upload.post.ts`) | `evidenceId`, `sourceType`, `mimeType`, `sizeBytes`, `hasAnnotation` | File saved to storage and row inserted |

### Exports

| Event | Source | Payload | When |
|---|---|---|---|
| `export_created` | Backend (`api/exports.post.ts`) | `exportId`, `focus`, `eventsCount`, `evidenceCount`, `aiSummaryIncluded` | Export row inserted |

> The catalog above is the **initial** set. Add new events as you wire them in — keep this table the single source of truth.

---

## TypeScript Interfaces

### Client-side

```ts
interface AnalyticsContext {
  route?: string
  userAgent?: string
  userId?: string
  caseId?: string
  journalEntryId?: string
  evidenceId?: string
  exportId?: string
  [key: string]: unknown
}

interface LogEventOptions {
  /** Additional context to merge with defaults */
  context?: Record<string, unknown>
  /** Skip logging (useful for conditional events) */
  skip?: boolean
}
```

### Composable API

```ts
function useAnalytics(): {
  logEvent: (
    eventType: string,
    payload?: Record<string, unknown>,
    options?: LogEventOptions
  ) => Promise<void>

  scopedLogger: (
    baseContext: Record<string, unknown>
  ) => (eventType: string, payload?: Record<string, unknown>) => void
}
```

### Server-side

```ts
function logAnalyticsEvent(
  event: H3Event,
  eventType: string,
  payload?: Record<string, unknown>,
  context?: Record<string, unknown>
): Promise<void>
```

---

## Database Schema

Events live in the `analytics.events` table. All writes go through the `analytics.log_event` RPC (`SECURITY DEFINER`, hardened `search_path`), called either by the API endpoint, the server util, or DB triggers.

```sql
CREATE TABLE analytics.events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text NOT NULL,
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  context      jsonb NOT NULL DEFAULT '{}',
  inserted_at  timestamptz NOT NULL DEFAULT now()
);
```

Indexes:

- `event_type` (btree)
- partial `actor_id WHERE actor_id IS NOT NULL`
- `inserted_at DESC`
- composite `(actor_id, inserted_at DESC) WHERE actor_id IS NOT NULL`
- GIN `payload jsonb_path_ops`
- GIN `context jsonb_path_ops`

### RLS

- **INSERT** — `authenticated` users can insert rows where `actor_id = auth.uid()` or `actor_id IS NULL`.
- **SELECT** — `authenticated` users with `profiles.is_employee = true` can read. App code never reads from analytics in normal flows.
- `service_role` has SELECT on all analytics tables (for admin endpoints / Inngest workers).

### Schema notes

- **No FKs on payload IDs** — events are immutable; referenced entities may be deleted later.
- **JSONB for flexibility** — `payload` and `context` can hold anything event-specific.
- **`ON DELETE SET NULL` on actor_id** — preserves events even if a user is deleted.
- **App role is INSERT-only** — prevents accidental coupling where app code starts depending on analytics rows.

Migration: `db_migrations/0046_create_analytics.sql`.

---

## Querying Analytics

Run these via the Supabase MCP (`mcp__claude_ai_Supabase__execute_sql`) against project `soebpfvyoorstmbimrmj`, or in the Supabase SQL editor.

### Basic queries

```sql
-- Last 20 events
SELECT event_type, payload, context, inserted_at
FROM analytics.events
ORDER BY inserted_at DESC
LIMIT 20;

-- Event counts by day
SELECT date(inserted_at) AS day, event_type, count(*)
FROM analytics.events
WHERE inserted_at > now() - interval '14 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- Events for a specific user
SELECT event_type, payload, inserted_at
FROM analytics.events
WHERE actor_id = (
  SELECT id FROM public.profiles WHERE email = 'kyle@monumentlabs.io'
)
ORDER BY inserted_at DESC
LIMIT 50;
```

### Activation funnel

```sql
-- Signup → first journal submission
WITH signups AS (
  SELECT actor_id, min(inserted_at) AS signed_up_at
  FROM analytics.events
  WHERE event_type = 'user_signed_up'
  GROUP BY actor_id
),
first_entry AS (
  SELECT actor_id, min(inserted_at) AS first_submitted_at
  FROM analytics.events
  WHERE event_type = 'journal_entry_submitted'
  GROUP BY actor_id
)
SELECT
  count(*)                                            AS signed_up,
  count(f.actor_id)                                   AS submitted_at_least_one,
  round(100.0 * count(f.actor_id) / nullif(count(*), 0), 1) AS conversion_pct,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM f.first_submitted_at - s.signed_up_at)) AS median_seconds_to_first_entry
FROM signups s
LEFT JOIN first_entry f USING (actor_id);
```

### Power-user signal

```sql
-- Users who submitted multiple entries AND uploaded evidence AND created an export
SELECT p.email,
       count(*) FILTER (WHERE event_type = 'journal_entry_submitted') AS entries,
       count(*) FILTER (WHERE event_type = 'evidence_uploaded')       AS evidence,
       count(*) FILTER (WHERE event_type = 'export_created')          AS exports
FROM analytics.events e
JOIN public.profiles p ON p.id = e.actor_id
GROUP BY p.email
HAVING count(*) FILTER (WHERE event_type = 'journal_entry_submitted') >= 3
   AND count(*) FILTER (WHERE event_type = 'evidence_uploaded') >= 1
   AND count(*) FILTER (WHERE event_type = 'export_created') >= 1
ORDER BY entries DESC;
```

### User journey

```sql
-- Full action sequence for a user in the last 24h
SELECT event_type, payload, context->>'source' AS source, inserted_at
FROM analytics.events
WHERE actor_id = '<user-uuid>'
  AND inserted_at > now() - interval '24 hours'
ORDER BY inserted_at;
```

### Joining with production tables

```sql
-- Cross-reference journal_entry_submitted events with the actual journal_entries
-- to see how many made it through extraction.
SELECT j.status,
       count(*) AS entries,
       avg(extract(epoch FROM j.processed_at - j.created_at)) AS avg_processing_seconds
FROM analytics.events e
JOIN public.journal_entries j ON j.id = (e.payload->>'journalEntryId')::uuid
WHERE e.event_type = 'journal_entry_submitted'
GROUP BY j.status;
```

Useful `public.*` joins:

- `profiles` — user details (email, full name, plan, `is_employee`)
- `journal_entries` — entry status and processing timestamps
- `events` — extracted timeline events
- `evidence` — evidence files
- `exports` — generated court-ready documents
- `subscriptions` — billing tier (`free` / `alpha` / `starter` / `pro` / `enterprise`)

---

## Generating Insights

This data is designed for AI-assisted analysis. The primary workflow is asking questions and investigating directly in SQL via Supabase MCP — not building dashboards.

### Questions worth investigating

**Activation & engagement**

- Are new users actually doing anything after signup?
- How long does it take from `user_signed_up` to `journal_entry_submitted`?
- Who are the power users, and what's different about their first session?

**Product health**

- Where do journal submissions die? (`journal_entry_submitted` count vs. `journal_entries.status = 'completed'` count)
- Are evidence uploads working across all `source_type`s, or do photos vs. emails behave differently?
- Are people who upload evidence more likely to create exports?

**Revenue / conversion**

- Do free-tier users hit limits before upgrading? (Cross-reference `journalEntriesRemaining` exhaustion with `billing_upgrade_requested` if/when we add it.)
- What's the activity profile of paying users vs. free users?

**Support signals**

- Are there clusters of `evidence_uploaded` followed by `journal_entry_submitted` failures? (Quality-of-input signal.)
- Do users return to `/journal/new` repeatedly without submitting? (Friction signal.)

### Investigation patterns

- **Cohort comparison** — "Compare behavior of users who signed up this week vs. last month."
- **Funnel analysis** — "What percentage of users who open `/journal/new` actually submit an entry within 10 minutes?"
- **Anomaly detection** — "Are there spikes in `journal_entry_submitted` followed by extraction failures in `journal_entries.status`?"
- **Temporal analysis** — "How does usage vary by day of week or time of day?"
- **Correlation analysis** — "Do users who upload evidence early submit more entries overall?"

---

## Best Practices

### Do

- Log business-meaningful events (user actions, outcomes).
- Include relevant IDs (journal entry, evidence, export, case).
- Track meaningful metrics in payload (sizes, counts, durations).
- Use consistent names — pick `{entity}_{action}`, stick with it.
- Log at intent boundaries (frontend) **and** effect boundaries (backend) for important flows.

### Don't

- Log sensitive content (event text, evidence file contents, child names, opposing-party identifiers).
- Log high-frequency events (every keystroke, mouse moves, scroll positions).
- Block UX waiting for analytics — the composable is fire-and-forget for a reason.
- Mix naming styles. No camelCase, no kebab-case, no PascalCase.
- Include free-text user content in payloads — use lengths, hashes, or booleans (`hasAnnotation: true`) instead.

This is especially important for Daylight: journal entries and evidence often contain custody-case details that should never end up in an analytics row.

---

## Testing & Debugging

### Verify in dev

In development, failed analytics calls log to the console:

```text
[analytics] failed to log event: journal_entry_submitted Error: ...
[analytics] backend log failed: evidence_uploaded { ... }
```

### Manual smoke test

1. Log in as `kyle@monumentlabs.io` (alpha tier, `is_employee = true`, so reads work).
2. Navigate to `/journal/new` → expect `journal_new_opened`.
3. Submit a short entry → expect `journal_entry_submitted`.
4. Upload an evidence file at `/evidence` → expect `evidence_uploaded`.
5. Create an export at `/exports/new` → expect `export_created`.
6. Run:

   ```sql
   SELECT event_type, payload, inserted_at
   FROM analytics.events
   ORDER BY inserted_at DESC
   LIMIT 10;
   ```

### Validate event types

The `/api/analytics` endpoint validates `event_type` matches `^[a-z][a-z0-9_]*$`:

```ts
'journal_entry_submitted' // ✅
'evidence_uploaded'       // ✅
'JournalEntrySubmitted'   // ❌ 400
'evidence-uploaded'       // ❌ 400
```

---

## Performance Considerations

### Fire-and-forget on the client

```ts
// The composable doesn't await - $fetch is started and the failure handler
// catches errors silently in production.
logEvent('journal_new_opened')
```

### Server-side: never blocks the main request

`logAnalyticsEvent` wraps the RPC call in try/catch, so failures only appear in the server console:

```ts
// Safe to await - even on RPC failure, the main request continues.
await logAnalyticsEvent(event, 'journal_entry_submitted', { ... })
return { journalEntryId, jobId }
```

If you ever need a hot path to *not* pay the network round-trip, drop the `await` and prefix with `void`. Most handlers can afford the few ms.

---

## Adding New Events

### Checklist

1. Pick a name: `{entity}_{action}` in snake_case.
2. Decide client vs. server: intent → client, effect → server. Big flows often want both.
3. Define payload fields — keep them small and PII-free.
4. Add the event to the **Event Catalog** above.
5. Wire the call site (`useAnalytics().logEvent(...)` or `logAnalyticsEvent(event, ...)`).
6. Smoke-test in dev: trigger the action, query `analytics.events`.

### High-value events to add next

These are not yet wired up but would be especially useful:

- **`onboarding_completed`** (Backend, `api/profile.patch.ts` when `onboarding_completed_at` is set) — payload: `userId`, `secondsFromSignup`.
- **`recording_started`** (Frontend, `pages/journal/new.vue`) — payload: `step` (`event` | `evidence`).
- **`recording_stopped`** (Frontend) — payload: `durationSeconds`, `wasSubmitted`.
- **`extraction_completed`** (Inngest worker) — payload: `journalEntryId`, `durationMs`, `eventsCreated`, `evidenceMentions`, `success`.
- **`extraction_failed`** (Inngest worker) — payload: `journalEntryId`, `errorMessage`, `errorStage`.
- **`evidence_processed`** (Inngest worker) — payload: `evidenceId`, `sourceType`, `extractionDurationMs`, `success`.
- **`billing_upgrade_requested`** (Frontend, `pages/billing.vue`) — payload: `fromPlan`, `toPlan`, `source`.
- **`subscription_activated`** (Backend, `api/billing/webhook.post.ts`) — payload: `userId`, `planTier`, `stripeSubscriptionId`.
- **`subscription_canceled`** (Backend) — payload: `userId`, `planTier`, `cancelAtPeriodEnd`.
- **`bug_report_submitted`** (Backend, `api/support/bug-report.post.ts`) — payload: `bugReportId`, `category`.
- **`case_field_edited`** (Frontend) — payload: `field`, `hadPreviousValue`.

### Example: adding a new event

```ts
// Frontend intent
const { logEvent } = useAnalytics()
logEvent('recording_started', { step: state.value.step })

// Backend effect (e.g. Inngest worker, via service-role client)
await supabase.schema('analytics').rpc('log_event', {
  p_event_type: 'extraction_completed',
  p_actor_id: userId,
  p_payload: {
    journalEntryId,
    durationMs: Date.now() - startedAt,
    eventsCreated: events.length,
    evidenceMentions: mentions.length
  },
  p_context: { source: 'inngest_worker' }
})
```

---

## Related Files

- `db_migrations/0046_create_analytics.sql` — schema, RLS, RPC, auth triggers, grants
- `src/server/utils/analytics.ts` — `logAnalyticsEvent` server util
- `src/server/api/analytics.post.ts` — POST endpoint that fronts the RPC for client events
- `src/app/composables/useAnalytics.ts` — `useAnalytics()` composable

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Nuxt Frontend                              │
│                                                                    │
│   ┌──────────────────┐                                             │
│   │ useAnalytics()   │ ← single composable for all client events   │
│   └────────┬─────────┘                                             │
│            │ POST /api/analytics                                   │
│            ▼                                                       │
│   ┌──────────────────┐                                             │
│   │ analytics.post.ts│ ← validates + enriches + calls RPC          │
│   └────────┬─────────┘                                             │
└────────────┼───────────────────────────────────────────────────────┘
             │
             │ RPC: analytics.log_event
             ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Supabase Postgres                            │
│                                                                    │
│   ┌──────────────────────────────────────────────────────────┐     │
│   │                  analytics.events                        │     │
│   │  (append-only, no updates, no deletes)                   │     │
│   └──────────────────────────────────────────────────────────┘     │
│                                                                    │
│   Backend handlers call logAnalyticsEvent(event, ...) ────────────►│
│   Inngest workers call supabase.schema('analytics').rpc(...) ─────►│
│   Auth triggers (auth.users / auth.sessions) ─────────────────────►│
└────────────────────────────────────────────────────────────────────┘
```

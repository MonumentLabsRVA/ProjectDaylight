# Journal gap-fill runbook

Pattern for reconstructing journal coverage when a case has source
evidence (e.g. OFW messages, emails) inside a window but no journal
entries dated in that window.

## When to use this

- A user reports — or analytics surface — that journal coverage drops
  off for a period while messages or other evidence still exist.
- A user wants to backfill prior history into Daylight after onboarding
  (their lived events predate their account).

Do NOT use this to invent events. Every entry must be traceable to
specific source evidence the user provided.

## Process

1. **Identify the gap.** Query `journal_entries` for the case ordered
   by `reference_date`. Compare with the date range covered by the
   case's evidence (`messages.sent_at`, etc.).

2. **Draft entries from source evidence.** For each day or coherent
   incident in the gap, write a first-person entry that:
   - Reads in the user's voice (use prior journal entries as a style
     anchor — Daylight's extraction pipeline is calibrated to first-
     person narrative, not third-person summary).
   - References specific source artifacts (message dates, attachment
     names) so an extraction pass can re-link evidence later.
   - Has a `referenceDate` (the date the event occurred, not the date
     the entry is being written).

3. **Submit through the production API**, not directly to the DB. This
   ensures the same OpenAI extraction, tagging, and event-creation
   pipeline runs as it would for a normal entry — so the backfilled
   entries are indistinguishable from organic ones in retrieval.

## Auth pattern: posting as another user

`/api/journal/submit` requires a bearer token. To mint one for a target
user without their password, use the Supabase admin API:

```js
import { createClient } from '@supabase/supabase-js'

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)
const anon  = createClient(SUPABASE_URL, SUPABASE_KEY)

const { data: link } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: TARGET_EMAIL,
})

const { data: sess } = await anon.auth.verifyOtp({
  token_hash: link.properties.hashed_token,
  type: 'magiclink',
})

const accessToken = sess.session.access_token
```

Then POST each entry:

```js
await fetch(`${PROD_URL}/api/journal/submit`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    eventText,
    referenceDate,            // YYYY-MM-DD in user's tz
    timezone: 'America/...',
    caseId,
    evidenceIds: [],          // optional; extraction will re-link
  }),
})
```

## Operational notes

- **Throttle.** Each submit kicks off an OpenAI extraction job. Sleep
  ~800ms between calls to avoid bunching the queue.
- **Idempotency.** Submits are not idempotent. If you re-run, you'll
  create duplicate journal entries. Save the response IDs and dedupe
  at the entry layer if you need to retry.
- **Attachments.** Leave `evidenceIds` empty on backfill — attaching a
  specific message to a backfilled entry is brittle. The extraction
  pass will draw broadly from case evidence at retrieval time anyway.
- **Audit trail.** Capture the response body (`journalEntryId`,
  `jobId`) for every submit. If a downstream extraction fails, those
  IDs are how you find the orphaned entry.

## Don't

- Don't write directly to `journal_entries` — you'll skip extraction
  and the entry will be inert in chat retrieval.
- Don't skip `referenceDate` and rely on `created_at` — the timeline
  view sorts on `reference_date`, and a gap-fill entry with today's
  `created_at` and no `reference_date` will land at the wrong place.
- Don't run this against a user's account without their explicit
  consent. The admin API doesn't ask the target user for permission;
  treat it as you would any other privileged auth path.

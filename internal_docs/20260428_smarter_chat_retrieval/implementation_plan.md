# Smarter Chat Retrieval — Implementation Plan

**Created:** April 28, 2026
**Status:** Code Complete — pending (1) apply migrations 0053 + 0054 in Supabase SQL editor, (2) regen `database.types.ts`, (3) end-to-end smoke test, (4) backfill existing imports.
**Context:** Plan 02's case-scoped chat agent shipped 2026-04-27. In real use it formulates bad searches — passing the user's full paraphrased question (e.g. *"Ms Katy family account refused"*) as a single FTS string, which under `websearch_to_tsquery` ANDs every stem and almost never hits real OFW prose. Even when it works, it flips through individual messages instead of seeing the conversation as a unit. This plan fixes both problems.

**Goal:** The chat agent (a) knows how to formulate searches that match how messages actually read, and (b) reaches first for a thread-level summary layer instead of word-matching across every individual message.

**Scope:**
- New `message_threads` table populated on OFW ingest with one summary row per `(case_id, thread_id)`.
- New Inngest function `thread-summarization` fanned out from `ofw-ingest`, plus a backfill trigger for existing imports.
- New chat tool `search_threads` that ranks threads by query + filters and returns compact summaries.
- Tightened tool descriptions on `search_messages` / `find_contradictions` so the schema itself nudges the agent to decompose queries.
- System prompt section "How to search this case" with worked examples.
- Companion reference doc `chat_retrieval.md` capturing the retrieval philosophy so future tool upgrades stay consistent.

**Not in scope:** vector search, message-level summaries, attorney-side workspace (Plan 03), event-extraction-from-messages (Plan 01 Phase 5), evals codification.

---

## Current State

### What exists

- `src/server/utils/chatTools.ts` — 8 tools incl. `search_messages` (FTS via `websearch_to_tsquery`), `search_events`, `get_message` (with thread context), `find_contradictions` (keyword over messages).
- `src/server/utils/chatPrompt.ts` — dual-mode persona; says nothing about *how* to formulate queries.
- `src/server/inngest/functions/ofw-ingest.ts` — 4 steps, terminates after `finalize`. `result_summary` already includes `thread_count`, `senders`, `dateRange`.
- `src/server/inngest/functions/journal-extraction.ts` — precedent for OpenAI Responses API + Zod-structured extraction inside Inngest. Reuse its shape verbatim.
- `db_migrations/0050_ofw_messages.sql` — `messages` table with `thread_id text` + `idx_messages_thread (case_id, thread_id, sent_at)` already in place.
- `src/server/utils/citations.ts` — `CitationRegistry` accumulates record ids surfaced this turn; `sanitizeMessageCitations` strips invented ones. New thread tool plugs into this same registry.

### What changes

- New table `message_threads` with columns: `id`, `case_id`, `evidence_id`, `thread_id`, `subject`, `participants` (text[]), `message_count`, `first_sent_at`, `last_sent_at`, `summary` (text, ~1 paragraph), `tone` (enum), `flags` (text[]), `search_anchors` (jsonb: `{ proper_nouns, topics, dates, numbers }`), `model`, `summary_version` (int), `created_at`, `updated_at`. Owner-only RLS via `cases.user_id`. FTS index on `summary`.
- New Inngest function `thread-summarization` (event `messages/thread.summarize_requested`). Loads all messages for a thread, calls `gpt-5.4-mini` Responses API with structured output, upserts the row.
- `ofw-ingest` finalize step fans out one summarize event per *new* thread (and any thread whose count changed since last run).
- `chatTools.ts` adds `search_threads` and `get_thread`. `search_messages` description rewritten ("use 1–3 distinctive keywords, not full sentences"). Same nudge in `find_contradictions`.
- `chatPrompt.ts` adds a "How to search this case" section pointing at threads first.
- New companion doc `internal_docs/20260428_smarter_chat_retrieval/chat_retrieval.md`.

### What stays

- `messages` table, `evidence` flow, OFW parser (`ofw-parser.ts`), Plan 02's citation post-validation, journal extraction, evals fixtures from Plan 02 Phase 4. The dual-mode persona language is untouched — only an additive section.

---

## Architecture

```
OFW upload → existing ofw-ingest pipeline
              parse-pdf → upsert-messages → finalize
                                                │
                                                ├─ identify changed threads (new or msg_count delta)
                                                └─ inngest.send(messages/thread.summarize_requested) × N

                  thread-summarization (per thread, max 30 in-flight via concurrency cap)
                    1. load messages for (case_id, thread_id)
                    2. gpt-5.4-mini Responses API w/ ThreadSummarySchema
                    3. upsert message_threads row

Chat turn (evidence mode)
  search_threads(query?, from?, to?, tone?, flags?, sender?)
    → up to 10 thread summaries with id, subject, dates, participants, summary, anchors
  get_thread(id)
    → full summary + chronological message list (id, sent_at, sender, subject, body preview)
  search_messages / get_message → unchanged, used for drill-down only
```

---

## Sprint Breakdown

### Sprint 1: Schema + types — `message_threads`
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** Land the table, RLS, indexes, and regenerated types so subsequent sprints have something to write to.
**Estimated effort:** ~1.5 hours

#### Tasks
- 1.1 Migration `0053_message_threads.sql` (mirror `0050_ofw_messages.sql` shape)
  - File: `db_migrations/0053_message_threads.sql`
  - Columns per "What changes" above. `tone` as a Postgres enum `thread_tone` with values `cooperative, neutral, tense, hostile, mixed, unclear`. `flags` as `text[]` (free-form for v1; we tighten the controlled vocab in the prompt).
  - Unique index on `(case_id, thread_id)`. Foreign keys: `case_id → cases`, `evidence_id → evidence` (nullable — a thread can span imports if we ever support that, but v1 always populates it from the originating import).
  - GIN FTS index on `to_tsvector('english', coalesce(summary,'') || ' ' || coalesce(subject,'') || ' ' || array_to_string(coalesce(participants,'{}'),' '))`. We explicitly include subject + participants so a query for a name hits the thread without needing JSON path indexing.
  - Btree on `(case_id, last_sent_at desc)` for the default thread listing.
  - RLS: single `FOR ALL` policy `message_threads_owner_via_case` exactly like `messages`.
  - Audit trigger: skip. Thread summaries regenerate freely; not a primary-source artifact.
  - `summary_version` defaults `1`. Bumped manually when we change the prompt schema and want a backfill.
- 1.2 Regenerate `src/types/database.types.ts`
  - Standard `npx supabase gen types typescript ...` flow this project uses; commit alongside the migration.
- 1.3 Add a thin server util `src/server/utils/threads.ts`
  - Two helpers: `summarizeThreadMissing(supabase, caseId)` returns `(thread_id, message_count)[]` for threads in `messages` that have no row in `message_threads` *or* whose `message_count` differs. Used by Sprint 2's fan-out and Sprint 5's backfill.
  - Pure SQL via supabase-js — no LLM here.

#### Verification
- [ ] Migration applies cleanly against the prod DB twice (idempotency).
- [ ] `select * from message_threads limit 0` returns expected columns.
- [ ] RLS: a user with only test-account access cannot select threads belonging to another user's case (existing pattern; copy the test from `0050_ofw_messages.sql` follow-up).
- [ ] `database.types.ts` includes `message_threads` and the `thread_tone` enum.

---

### Sprint 2: Thread summarization Inngest function
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** Given a `(case_id, thread_id)`, produce a structured summary and upsert it. Wired to `ofw-ingest` so new uploads auto-populate; works manually too for backfill.
**Estimated effort:** ~3 hours

#### Tasks
- 2.1 Define the event + schema in `src/server/inngest/functions/thread-summarization.ts`
  - File: `src/server/inngest/functions/thread-summarization.ts`
  - Event: `messages/thread.summarize_requested` with `{ caseId, userId, evidenceId, threadId }`.
  - Use `process.env.SUPABASE_URL` / `SUPABASE_SECRET_KEY` directly per the Inngest convention already in `journal-extraction.ts` and `ofw-ingest.ts`.
- 2.2 `ThreadSummarySchema` (Zod) — see `chat_retrieval.md` for the field-by-field rationale.

  ```ts
  const ThreadSummarySchema = z.object({
    summary: z.string().describe(
      'One paragraph, plain English, 80–180 words. ' +
      'What the thread is about and how it resolves (or doesn\'t). ' +
      'Name participants by role, not by tone-loaded labels.'
    ),
    tone: z.enum(['cooperative','neutral','tense','hostile','mixed']),
    flags: z.array(z.enum([
      'schedule_violation',
      'gatekeeping',
      'child_welfare_concern',
      'agreement_reference',
      'financial_dispute',
      'medical_decision',
      'school_decision',
      'safety_concern',
      'communication_breakdown',
      'positive_coparenting'
    ])),
    search_anchors: z.object({
      proper_nouns: z.array(z.string()).max(12).describe(
        'People, schools, providers, places named in the thread. ' +
        'Verbatim spelling — these are what the agent will keyword-search later.'
      ),
      topics: z.array(z.string()).max(8).describe(
        'Concrete topics in the thread (e.g. "after-school pickup", "tuition payment"). ' +
        '2–4 word noun phrases. Lowercase. No editorial labels like "drama".'
      ),
      dates_mentioned: z.array(z.string()).max(8).describe('ISO dates referenced in the thread bodies, not the timestamps.'),
      numbers: z.array(z.string()).max(6).describe('Dollar amounts, durations, counts that appear in the bodies.')
    })
  })
  ```
- 2.3 5-step Inngest function (mirror `journal-extraction`'s shape)
  - `load-thread`: pull all messages for `(case_id, thread_id)` ordered by `sent_at asc`. Compute `participants` (sorted unique senders ∪ recipients), `message_count`, `first_sent_at`, `last_sent_at`, `subject` (most common subject in the thread).
  - `summarize`: build the prompt (see below), call `openai.responses.parse()` with `model: 'gpt-5.4-mini'`, `reasoning: { effort: 'low' }`, `text: { format: zodTextFormat(ThreadSummarySchema, 'summary') }`. Pass the full thread body — these are short. Cap at the first ~40 messages of the thread if a thread ever exceeds that (head + tail later if it matters).
  - `upsert`: write to `message_threads` with `onConflict: 'case_id,thread_id'`. Include `model: 'gpt-5.4-mini'`, `summary_version: 1`.
  - Errors: structured retries (max 2). On final failure, log to `console.error` — no `jobs` row to update; this fans out from a parent ingest job.
- 2.4 Prompt (~30 lines, lives in the function file). Key requirements, drawn from `chat_retrieval.md`:
  - Identify participants by role ("the user", "the co-parent", "child's school"), not by name in the summary text. Names belong in `proper_nouns`.
  - "Tone" judges the thread's overall conversational temperature, not who's in the right.
  - "Flags" are descriptive, not adjudicative. `gatekeeping` means a request to share information about the child was refused or sidestepped, not "X is gatekeeping."
  - Anchor extraction is for retrieval, not narrative — extract nouns the user is likely to *type* later when looking for this thread.
  - Refusals/safety: never name the other parent; never speculate about intent; mirror Plan 02's persona.
- 2.5 Wire fan-out from `ofw-ingest` `finalize` step
  - File: `src/server/inngest/functions/ofw-ingest.ts`
  - After `finalize`, add a 6th step `enqueue-thread-summaries` that calls `summarizeThreadMissing(supabase, caseId)` and emits one `messages/thread.summarize_requested` event per result. Use `inngest.send([...])` with the array form so they fan out as separate function runs (which Inngest concurrency-limits per the function's config).
  - Add `concurrency: { limit: 5 }` to the new function so a 100-thread import doesn't blast the OpenAI rate limit.
- 2.6 Register the function
  - File: `src/server/inngest/functions/index.ts` and `src/server/api/inngest.ts`
  - Add `threadSummarizationFunction` to both.

#### Verification
- [ ] Manually emit one event via the Inngest dev UI for a known `(case_id, thread_id)`. Row appears in `message_threads` with all fields populated, `summary` reads like a person wrote it, anchors contain proper nouns from the bodies (verify by spot-check).
- [ ] Re-running the same event upserts (no duplicate rows). `updated_at` advances.
- [ ] Upload a fresh OFW PDF in dev. Within ~60 s of `ofw-ingest` completing, every `(case_id, thread_id)` has a corresponding `message_threads` row.
- [ ] Cost sanity: log token usage on each run. ~330-message export with ~30 threads should land under $0.15 total.

---

### Sprint 3: `search_threads` + `get_thread` tools
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** Give the chat agent a thread-first retrieval surface and update existing tool descriptions to nudge better queries.
**Estimated effort:** ~2 hours

#### Tasks
- 3.1 Add `search_threads` to `src/server/utils/chatTools.ts`
  - Description (verbatim is fine; this is the agent-facing prose):
    > Search thread summaries for the active case. **Start here for any "what happened with X" question** — threads aggregate the whole conversation so you don't have to read every message. Returns up to 10 threads with summary + search anchors. Use 1–3 distinctive keywords (a name, a topic, a date), not a full sentence. Cite a thread's first message via `[message:<id>]` once you've drilled in. To read individual messages in a thread, call `get_thread`.
  - Input schema:
    ```ts
    z.object({
      query: z.string().optional().describe('1–3 keywords. Names, topics, dates. NOT a full sentence.'),
      from: z.string().optional(),
      to: z.string().optional(),
      tones: z.array(z.enum(['cooperative','neutral','tense','hostile','mixed'])).optional(),
      flags: z.array(z.string()).optional().describe('e.g. ["gatekeeping","schedule_violation"]'),
      participant: z.string().optional().describe('Filter to threads involving a participant — partial match.')
    })
    ```
  - Implementation: build a query against `message_threads` filtered by `case_id`, `last_sent_at` range, `tone in`, `flags && array[...]`, `participants` ilike. For `query`, use Postgres FTS with `websearch_to_tsquery` against the same tsvector the index covers; otherwise order by `last_sent_at desc`. Cap at 11, return 10 + `truncated` flag.
  - Return shape: `{ items: [{ id, threadId, subject, summary, tone, flags, participants, messageCount, firstSentAt, lastSentAt, anchors: { proper_nouns, topics, dates_mentioned, numbers } }], count, truncated }`.
  - Citation registry: register the `id` (thread row id). Plan 02's citation token is `[thread:<id>]` — extend `citations.ts` to recognize this third token.
- 3.2 Add `get_thread` tool
  - Description: "Fetch a single thread summary plus its messages chronologically. Use after `search_threads` finds a candidate."
  - Input: `{ id: string }` (thread row id).
  - Implementation: read the `message_threads` row, then fetch `messages` for `(case_id, thread_id)` ordered by `sent_at`. Cap at 50 messages with body previews; log a `truncated` flag if more.
  - Register every message id in the citation registry so the agent can cite specific messages without doing another tool call.
- 3.3 Tighten `search_messages` description
  - File: `src/server/utils/chatTools.ts`
  - Replace existing description with:
    > Free-text search across **individual** OFW messages. Prefer `search_threads` first — it's faster and richer. Use this when you already know the thread or you're looking for a one-off message. Query rules: 1–3 distinctive keywords (a name, a place, a single uncommon noun). DO NOT pass a full sentence or the user's paraphrase — Postgres ANDs every stem and you'll get zero hits.
- 3.4 Tighten `find_contradictions` description
  - Same nudge: "If you have a thread context already, prefer reading the thread end-to-end via `get_thread` before reaching for keyword retrieval."
- 3.5 Extend `citations.ts`
  - File: `src/server/utils/citations.ts`
  - Add `thread` to the recognized citation token regex. Same registry semantics as `event` / `message` / `journal`.

#### Verification
- [ ] Unit-style smoke: in the chat UI, ask *"What happened with the after-school pickup?"* — agent should hit `search_threads` first, get matching threads, and answer with a summary that cites `[thread:<id>]` and one or two `[message:<id>]` from inside that thread.
- [ ] Ask *"Did he ever talk about money?"* — `search_threads` with `flags: ["financial_dispute"]` or query `"money"` returns relevant threads.
- [ ] Citation guardrail still strips invented thread ids (extend the existing test in `citations.test.ts` with a `[thread:bogus]` case).

---

### Sprint 4: System prompt + reference doc
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** Codify retrieval philosophy in both the system prompt (operational) and a reference doc (so the next agent upgrade doesn't re-litigate).
**Estimated effort:** ~1 hour

#### Tasks
- 4.1 Write `chat_retrieval.md` companion (this folder)
  - File: `internal_docs/20260428_smarter_chat_retrieval/chat_retrieval.md`
  - Captures: the OFW message shape, why FTS-on-paraphrase fails, the keyword discipline, the thread-first strategy, the search-anchor extraction philosophy, worked good/bad query examples.
- 4.2 Add "How to search this case" section to `chatPrompt.ts`
  - File: `src/server/utils/chatPrompt.ts`
  - Inserted after "Tool use rules", before "Tone". Keep it tight (~15 lines) so it doesn't bloat the prompt:
    > **How to search this case (evidence mode):**
    > 1. **Threads first.** For "what happened with X" or "did he say anything about Y" questions, call `search_threads` before anything else. Threads hold the full conversation summary, tone, and named search anchors.
    > 2. **Decompose, don't paraphrase.** Tools take *keywords*, not the user's question. The user asked *"did Ms Katy refuse to take the family account?"* — search `"Katy"` or `"family account"`, not the full string. Postgres ANDs every word; long queries find nothing.
    > 3. **Use names, places, distinctive nouns.** Names are gold ("Ms Katy", "Wilson Elementary"). Topics work ("pickup", "tuition"). Common verbs ("said", "refused") and pronouns are noise — skip them.
    > 4. **Drill in once you have a thread.** `get_thread` returns the chronological message list. Read it before keyword-searching individual messages.
    > 5. **Two retries, then ask.** If two reasonable searches return nothing, tell the user what you tried and ask if they remember a date, name, or distinctive word.
- 4.3 Manual eval pass
  - Re-run the Plan 02 eval set in the chat UI: support-mode prompts unchanged in behavior, evidence-mode prompts now use `search_threads` first when appropriate, the Ms Katy-style query yields a real answer (or a clean "I don't have data" — never an FTS-zero-hit dead end).

#### Verification
- [ ] Open `/chat`, ask *"Did Ms Katy ever refuse to take the family account?"*. Agent calls `search_threads` with a short query, finds the relevant thread (or honestly reports nothing), cites correctly.
- [ ] Open `/chat`, ask a support-mode prompt ("today was hard"). Agent does *not* call `search_threads` (or anything) on the first turn. Mode detection unchanged.
- [ ] System prompt section is reachable without breaking anything in `buildSystemPromptFromCase` (no new ctx fields needed).

---

### Sprint 5: Backfill + ops
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** Populate `message_threads` for OFW imports that landed before this plan shipped, and document how to re-run if the schema changes.
**Estimated effort:** ~30 minutes

#### Tasks
- 5.1 One-shot backfill endpoint `src/server/api/internal/backfill-thread-summaries.post.ts`
  - Internal-only (gated by the same admin check the existing `internal/` endpoints use; copy the pattern).
  - For each case the caller has access to (or, with an admin flag, all cases): call `summarizeThreadMissing(supabase, caseId)` and fan out events. Returns `{ enqueued: N }`.
- 5.2 Note re-run procedure in `chat_retrieval.md`
  - When `summary_version` is bumped, drop matching rows and re-run the backfill. (No automated cascade — this is a hand-on-the-wheel operation.)

#### Verification
- [ ] Hit the endpoint locally for the test case. New `message_threads` rows appear within a minute or two.
- [ ] Re-run is idempotent (same upsert path).

---

## Reference Docs

- `chat_retrieval.md` (this folder) — the retrieval philosophy. Read before touching `chatTools.ts` or the chat system prompt in the future.

## Environment / Config Changes

None. Reuses existing `OPENAI_API_KEY`, `SUPABASE_*`, and Inngest wiring.

## What's Deferred / Out of Scope

- Vector search / embeddings. Term + thread retrieval is the bet; revisit only if quality is bad after this ships.
- Message-level summaries. Threads are the unit; per-message summaries add cost without obvious win.
- LLM-judge contradiction detection. Stays a Plan 04 concern.
- Eval automation. Manual passes for now; codify when the eval set hits 15+ items.
- Cross-case thread search. Out of scope for the entire chat product.

## Decisions locked 2026-04-28

1. **Re-upload diffing.** When a new OFW upload arrives, the ingest pipeline diffs threads against existing `message_threads` rows for the case. Three buckets:
   - **Match + grow** — same `thread_id` slug, message count went up. Re-summarize (covered already by Sprint 2's "msg_count delta" check).
   - **Match + same** — no-op.
   - **Brand new thread_id** — summarize fresh.
   - **Drift detected** — if more than 50% of the *previous* import's threads have no match in the new import, the new upload looks like a substantively different case file. Surface a warning to the user before fanning out summaries: "This upload looks different from your previous one. Continue importing as-is?". UI is a confirm dialog on `/evidence`; backend tags the job with `pending_user_confirmation` and waits. Sprint 2 implements the diff; Sprint 6 (new — see below) implements the user-confirmation surface.

2. **Tone enum.** Five values: `cooperative, neutral, tense, hostile, mixed`. Merging `mixed`/`unclear` into `mixed` per the user's call.

3. **No prior threads table.** Confirmed by grep of `db_migrations/`: `thread_id` is just a `text` column on `messages` populated by the OFW parser from subject lines. New `message_threads` table is correct. Linking key: `(case_id, thread_id)` unique.

---

### Sprint 6: Re-upload diff + user confirmation
**Status:** Code Complete (pending migration apply + types regen)
**Goal:** When an OFW upload looks like a substantively different case file from the previous one, pause for user confirmation before clobbering the thread layer.
**Estimated effort:** ~1.5 hours

#### Tasks
- 6.1 Diff helper in `src/server/utils/threads.ts`
  - `diffThreadsForUpload(supabase, caseId, evidenceId)` returns `{ existing: number, newInUpload: number, overlapping: number, driftRatio: number }`. Drift = `1 - overlapping / max(existing, 1)`.
- 6.2 Wire into `ofw-ingest`'s new `enqueue-thread-summaries` step
  - File: `src/server/inngest/functions/ofw-ingest.ts`
  - Compute drift. If `driftRatio > 0.5` AND `existing > 0` (i.e. the case already had threads), update the parent `jobs` row to `status='pending_confirmation'` with `result_summary.drift = { existing, newInUpload, overlapping }` and *do not* fan out summaries yet. Otherwise fan out as planned.
- 6.3 Confirmation endpoint
  - File: `src/server/api/internal/confirm-ofw-import.post.ts`
  - Body: `{ jobId, decision: 'continue' | 'cancel' }`. On `continue`, sets job back to `processing` and re-emits `messages/thread.summarize_requested` for the unprocessed threads. On `cancel`, deletes the new evidence row + its messages (cascade) and marks the job `cancelled`.
- 6.4 UI surface on `/evidence`
  - File: `src/app/pages/evidence/index.vue` (or wherever the OFW job watcher lives)
  - When `useJobs()` sees a `pending_confirmation` ofw_ingest job, render a `UAlert` with the drift stats and two buttons (Continue / Cancel). Hits the endpoint above.

#### Verification
- [ ] Re-upload the same fixture: drift ratio low (overlapping ~= existing), summaries fan out without prompting.
- [ ] Upload a *different* case fixture in dev: drift > 50%, job sits at `pending_confirmation`, UI shows the prompt, Continue resumes summarization, Cancel removes the new rows.

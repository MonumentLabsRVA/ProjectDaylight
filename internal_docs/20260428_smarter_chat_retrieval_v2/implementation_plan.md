# Smarter Chat Retrieval v2 — Semantic Robustness

**Created:** April 28, 2026
**Status:** Complete — all 4 sprints shipped 2026-04-28.
**Context:** v1 (this morning) added a thread-summary layer + `search_threads` tool with the doctrine "decompose the user's question into keywords." It works when the user types literal terms that appear in the message bodies. It falls over the moment the user describes a *behavior* the corpus doesn't name — e.g. *"Show me an instance where Mari withheld Josie"*. The word "withhold" appears nowhere; the underlying behavior (refused transitions, unilateral schedule changes) lives in summaries flagged `gatekeeping` / `schedule_violation`. Agent searched `Mari Josie`, `Josie pickup`, `Josie withheld` — all 0 hits — and gave up.

**Goal:** Three classes of question all return useful, cited answers from `/chat`:
1. **Named-entity queries** — *"find some where Ms Katy was referenced"* (currently 0 thread hits despite Katy being in `proper_nouns` of many threads).
2. **Semantic/behavioral queries** — *"show me where Mari withheld Josie"*, *"where was he hostile"*, *"money disagreements"*.
3. **Date / number queries** — already work; don't regress.

**Scope:**
- Fix a real indexing bug: `search_anchors.proper_nouns` and `.topics` are not in the `summary_fts` tsvector, so names that the prompt told the LLM to *only* put in anchors are unreachable via FTS.
- Backfill thread summaries for the user's case that never got summarized (`gkjohns@gmail.com` → `830cf878-...`, 0 of 192 threads summarized).
- Build a small offline eval harness over a handful of known-good queries, run multiple retrieval methods through it, pick the winner empirically rather than by argument.
- Add at least one new retrieval surface (likely an LLM-ranked-all-summaries tool, the user's own suggestion) for queries where keyword search structurally cannot win.
- Update `chatPrompt.ts` to teach the agent when to reach for which tool, including a small "intent → flag" cheat sheet.

**Not in scope:** vector embeddings on summaries (still deferred; this plan should make it unnecessary), per-message summaries, vector store / file_search, Plan 03's collaborator surface.

---

## Current State

### What Exists
- `db_migrations/0053_message_threads.sql` — `message_threads` table + `summary_fts` STORED tsvector covering `summary || subject || participants` (note: anchors NOT included). 192 rows on case `3035f234-...`, 0 on `830cf878-...`.
- `src/server/utils/chatTools.ts` — 10 tools incl. `search_threads`, `get_thread`. `search_threads` does `q.textSearch('summary_fts', query, { config: 'english', type: 'websearch' })` plus tone/flags/participant filters and date range.
- `src/server/utils/chatPrompt.ts` — has the "How to search this case" section: threads first, decompose, names beat verbs, two strikes ask. No "intent→flag" mapping.
- `src/server/inngest/functions/thread-summarization.ts` — `gpt-5.4-mini` Responses API + Zod, prompt explicitly instructs the model NOT to use participant names in the summary text — names go in `search_anchors.proper_nouns` only.
- `src/server/api/internal/backfill-thread-summaries.post.ts` — admin-gated; `{ caseId }` or `{ allCases: true }` or no body (caller's cases). Inngest fan-out, idempotent.
- `src/server/api/chats/[id].post.ts` — `streamText` from Vercel AI SDK, `gpt-5.4-mini`, `reasoningEffort: 'low'`, `stopWhen: stepCountIs(5)`. Tools come from `createCaseTools`.

### What Changes
- `summary_fts` tsvector helper widens to include `search_anchors->'proper_nouns'` and `search_anchors->'topics'`. Migration 0057.
- New tool `find_relevant_threads(question)` — takes the user's natural-language question, loads all thread summaries for the case, calls `gpt-5.4-mini` to rank top N with a short relevance reason. Used when the agent judges keyword search unlikely to work.
- `chatPrompt.ts` "How to search this case" gets two additions: (a) when to switch from `search_threads` → `find_relevant_threads`, (b) intent→flag cheat sheet.
- Backfill run for `830cf878-...` (data fix, not code).
- New offline eval harness: `scripts/eval-chat-retrieval.ts`. Runs each candidate method against a fixed query set, prints a comparison table.

### What Stays
- `messages`, `events`, `journal_entries`, `evidence` flow. The OFW parser, the summarization Inngest function, the citation registry, the support-mode/evidence-mode persona, the `gpt-5.4-mini` model choice for the chat agent. The tone enum, the flag vocabulary, and the summary prompt's "use roles, not names" rule (it's still good guidance — we just need names reachable through the *anchor* path the prompt already promised).

---

## Architecture

```
Chat turn
  agent reads user's message
   │
   ├─ keyword-style question ("Ms Katy", "$340", "school transfer")
   │     → search_threads(query)                  [now hits anchors too]
   │     → get_thread(id) → cite
   │
   └─ semantic / behavioral question ("withheld Josie", "hostile", "money")
         → find_relevant_threads(question)         [NEW]
              loads all message_threads rows for case
              gpt-5.4-mini ranks top 5 with one-line reasons
         → get_thread(id) → cite

Offline eval harness (one-shot script, not in prod path)
  query set × { method A, method B, ... } → table of hits / cited ids / latency
```

---

## Sprint Breakdown

### Sprint 1: Fix the FTS hole + backfill the orphan case
**Status:** Complete
**Estimated effort:** ~45 min
**Goal:** Existing `search_threads` becomes structurally correct (anchors searchable) and the user can actually test it on their own account's case.

#### Tasks
- 1.1 Migration `0057_message_threads_fts_anchors.sql`
  - File: `db_migrations/0057_message_threads_fts_anchors.sql`
  - Replace `message_threads_fts` to include the anchor JSON arrays. New body:
    ```sql
    CREATE OR REPLACE FUNCTION message_threads_fts(
      p_summary text, p_subject text, p_participants text[], p_anchors jsonb
    )
    RETURNS tsvector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$
      SELECT to_tsvector(
        'english'::regconfig,
        coalesce(p_summary,'') || ' ' ||
        coalesce(p_subject,'') || ' ' ||
        array_to_string(coalesce(p_participants,'{}'::text[]),' ') || ' ' ||
        coalesce(jsonb_array_to_text(p_anchors->'proper_nouns'), '') || ' ' ||
        coalesce(jsonb_array_to_text(p_anchors->'topics'), '')
      );
    $$;
    ```
    Add a small helper `jsonb_array_to_text(jsonb) returns text` that joins string-array elements with spaces (returns '' on null/non-array).
  - Drop the existing generated column + index, recreate using the 4-arg helper. (Cannot ALTER a STORED generated expression in place — drop + add. Index recreated automatically? No — recreate explicitly.)
  - Idempotent guards on every CREATE / DROP.
- 1.2 Apply via `mcp__supabase__apply_migration`. Verify with a quick FTS query on the existing case:
  ```sql
  SELECT count(*) FROM message_threads
  WHERE case_id = '3035f234-...'
    AND summary_fts @@ websearch_to_tsquery('english', 'Katy');
  ```
  Expect ≥ 5 (currently returns 2; ground truth is 30+ threads have Katy in anchors).
- 1.3 Regenerate `src/types/database.types.ts` only if shape changed (the generated column type didn't, so probably skip — but verify).
- 1.4 Backfill the gkjohns case via the existing endpoint. Two paths, pick the one that's easiest from the harness:
  - Hit `POST /api/internal/backfill-thread-summaries` with body `{ "caseId": "830cf878-cf26-444c-b07b-d761f5c6c682" }` while logged in as an employee (use Playwright to grab the cookie if needed).
  - Or, since the Supabase MCP is in scope, send the Inngest events directly (less robust — the endpoint already does the right diff via `summarizeThreadMissing`).
  - Wait until `select count(*) from message_threads where case_id = '830cf878-...';` reaches ≥ 150 (some threads may legitimately have 0 messages and skip).

#### Verification
- [x] FTS hits jump on `Katy` query for case `3035f234-...`: **2 → 11** (5.5x).
- [x] `message_threads` populated for case `830cf878-...`: **0 → 192**.
- [x] No regression — existing 192 rows on case `3035f234-...` still searchable on words that already worked ("transition" still 20 hits).
- [x] Index plan confirmed using GIN `idx_message_threads_fts` (Bitmap Index Scan).

#### Notes
- The Sprint 1.4 backfill was done via a one-off script (`scripts/backfill-threads-direct.mjs`) that bypassed Inngest in dev — service-key client + direct OpenAI calls, concurrency 5. Took 102s for 163 threads. Script deleted after the run; the production path stays Inngest-fanned-from-`ofw-ingest`.

---

### Sprint 2: Offline eval harness + first head-to-head
**Status:** Complete — see "Results" below.
**Estimated effort:** ~1.5 hours
**Goal:** A script that takes a list of (caseId, question, expectedThreadIdsOrTags) and runs each method, prints a comparison. Used to pick the winner before any agent-facing changes.

#### Tasks
- 2.1 Eval set
  - File: `scripts/eval-chat-retrieval.ts`
  - Hard-coded query set (5 items):
    1. *Q1*: `case=830cf878, question="Show me an instance where Mari withheld Josie"` — expect threads flagged `gatekeeping` or `schedule_violation` involving Josie pickup/transition.
    2. *Q2*: `case=830cf878, question="find some where Ms Katy was referenced"` — expect threads with `Katy` in `proper_nouns`.
    3. *Q3*: `case=830cf878, question="medical decisions we disagreed on"` — expect threads flagged `medical_decision` with tense/hostile tone.
    4. *Q4*: `case=830cf878, question="Mari daycare payment conflict"` — expect threads flagged `financial_dispute` mentioning daycare.
    5. *Q5*: `case=3035f234, question="show me hostile threads"` — sanity check the existing tone filter still works.
  - "Expected" is loose — for each, write down the heuristic that says a returned thread is plausibly relevant (flag set OR keyword in summary OR specific known thread_id we eyeballed). Codify the rubric in the script so it's reproducible.
- 2.2 Methods
  - Method A: **plain `search_threads`** (post-Sprint-1 FTS fix). Pass the question through verbatim — same as the agent does today. This is the baseline.
  - Method B: **search_threads with naive keyword extraction** — strip stop words, take 1–3 distinctive nouns. Closest to what the agent's prompt is currently telling it to do; we want to confirm whether *prompt* alone is enough or whether tool semantics matter.
  - Method C: **`find_relevant_threads`** — load all summaries for the case, send to `gpt-5.4-mini` (low effort) with the user's question + a "rank the most relevant N threads, give a 1-line reason each" instruction. Returns top 5.
  - (If time / cheap) Method D: **flag classifier** — small LLM call that maps the question to {flags, tones} and runs `search_threads` with those filters only. Cheaper than C; tests whether structured filtering alone is enough.
- 2.3 Output
  - For each (Q, method): print `count`, the top 3 returned `thread_id`s with subject, the rubric pass/fail, latency, est cost.
  - Save raw JSON to `internal_docs/20260428_smarter_chat_retrieval_v2/eval_results.json` for the plan record.
- 2.4 Run + record findings inline in this plan under Sprint 2 — replace this paragraph with a results table.

#### Verification
- [x] Script runs end-to-end without manual intervention.
- [x] Each method produces results for each query.
- [x] We can answer: "Which method wins on Q1 (semantic), Q2 (named entity), Q3 (medical disagreement)?" with numbers, not vibes.
- [x] Decision recorded — see below.

#### Results

```
method           Q1_withhold     Q2_ms_katy      Q3_medical      Q4_daycare      Q5_hostile
------           -----------     ----------      ----------      ----------      ----------
plain_fts        0/0  P=0.00     0/0  P=0.00     1/1  P=1.00     0/0  P=0.00     0/0  P=0.00     ~100ms
naive_keywords   0/0  P=0.00     2/2  P=1.00     1/1  P=1.00     3/3  P=1.00     4/4  P=1.00     ~115ms
llm_rank_all     4/5  P=0.80     5/5  P=1.00     5/5  P=1.00     4/4  P=1.00     5/5  P=1.00     ~3400ms (~$0.017/call)
flag_planner     4/5  P=0.80     0/0  P=0.00     1/1  P=1.00     5/5  P=1.00     0/0  P=0.00     ~1640ms
```

Headlines:
- `plain_fts` (the agent's current default — pass the user's question verbatim) is the worst path: only Q3 returns anything. This is the failure mode the user saw in production.
- `naive_keywords` is surprisingly strong on 4/5. Misses Q1 because "withheld" has no keyword anchor in the corpus. Confirms that the existing prompt rule ("decompose, don't paraphrase") is correct *if the agent actually follows it* — which after Sprint 1's FTS-anchor fix it now has reason to.
- `llm_rank_all` is the only method that solves Q1 and is the most reliable across the board (5/5 hit, only Q1 weak). ~3.4 s and ~$0.017/call. Acceptable tax for the queries keyword search structurally can't answer.
- `flag_planner` looked promising but produced confidently-wrong filters twice (Q2: bolted on `tones=["neutral"]` and zeroed out the right answer; Q5: said `tones=["hostile"]` when the case has zero `hostile`-toned threads, only `tense`). Cheap to call but the over-filtering bugs aren't worth shipping behind.

**Decision:** ship two retrieval surfaces.
1. Trust `search_threads` (now FTS-anchor-fixed) as the keyword path. The existing "How to search" prompt already pushes the agent toward keyword decomposition; on the eval queries that admit keywords (Q2–Q5) keyword search hits cleanly.
2. Add `find_relevant_threads(question)` as the semantic fallback. Used when keywords don't apply (Q1) or the agent hit a 0-result search and the question is intent-shaped. Cap thread count at 300 with a deterministic recency-prioritized truncation; over that, log a warning and ship the tool description that says "for very large cases, the most-recent 300 threads are scanned — narrow with a date range." Out of scope for v1, since both prod cases are 192.
3. Do NOT ship `flag_planner` as a tool. Instead, fold its insight into the prompt: a small "intent → flag" cheat sheet so the agent can apply tones/flags itself without a separate LLM call.

---

### Sprint 3: Wire the winner + prompt updates
**Status:** Complete
**Estimated effort:** ~1 hour
**Goal:** Whichever method(s) won Sprint 2 are live in `/chat` with prompt nudges that route the agent to them.

#### Tasks
- 3.1 If Method C (or D) won, add it as a tool in `chatTools.ts`.
  - For C: `find_relevant_threads({ question: string })`.
    - Loads `id, thread_id, subject, summary, tone, flags, participants, search_anchors, message_count, last_sent_at` for the case (cap: 300 rows; if a case ever exceeds, fall back to the most recent 300 — log if hit).
    - Builds a single LLM call: system prompt = "You rank threads by relevance to a custody-case question. Output JSON { matches: [{ id, reason }] }, max 5, ordered by relevance. If none plausibly match, return empty list."; user content = question + JSON-serialized thread cards.
    - Use `gpt-5.4-mini`, `reasoning: { effort: 'low' }`, structured output via `zodTextFormat`. Returns the matched threads as `{ id, subject, summary, flags, tone, reason }`. Cap at 5.
    - Registers each `id` in the `CitationRegistry` so `[thread:<id>]` survives the post-validation strip.
    - Returns `{ items, count, model, totalScanned }`.
  - For D (if picked): `plan_search({ question })` returning `{ keywords, flags, tones, participant?, dateRange? }`. The agent then uses those in `search_threads`. Slightly more verbose but cheaper.
- 3.2 `chatPrompt.ts` — under "How to search this case", add:
  > **When to use `find_relevant_threads` vs `search_threads`:**
  > - User asked something concrete (a name, a place, a number, a date)? → `search_threads(query="<noun>")`. Fast, precise.
  > - User described a *behavior* or *pattern* with no obvious keyword in the corpus? ("withholding the child", "hostile messages", "the times he was nice", "money disagreements") → `find_relevant_threads(question="<original question>")`. The model will read summaries and pick.
  > - When in doubt: try `search_threads` first; if it returns 0 or all-irrelevant, escalate to `find_relevant_threads` — that's the second strike before asking the user.
  >
  > **Intent → flag cheat sheet** (use these in `search_threads(flags=[...])` when the question maps cleanly):
  > - "withhold the child", "kept her", "wouldn't let me" → `gatekeeping`, `schedule_violation`
  > - "missed pickup", "late drop-off", "schedule changed" → `schedule_violation`
  > - "money", "expenses", "tuition", "support payment" → `financial_dispute`
  > - "doctor", "medication", "diagnosis" → `medical_decision`
  > - "school", "teacher", "IEP", "preschool" → `school_decision`
  > - "safety", "dangerous", "drinking" → `safety_concern`
  > - "hostile", "fight" → tone filter `tones: ["hostile","tense"]`
  > - "good co-parenting", "we agreed", "smooth" → `positive_coparenting`
- 3.3 Bump `stepCountIs(5)` to `stepCountIs(8)` in `chats/[id].post.ts` if (and only if) Sprint 2 showed cases where a useful agent path takes >5 tool calls (typical: search → find_relevant → get_thread → search_messages → answer). Otherwise leave it.

#### Verification
- [x] `npx nuxi typecheck` clean for the changed files (chatTools.ts, chatPrompt.ts, chats/[id].post.ts). Pre-existing errors elsewhere are unrelated.
- [x] Q1 `/chat` test: agent ran `search_threads` (0 hits) then escalated to `find_relevant_threads` (5 hits, including one explicitly noting "Mari accused the user of withholding Josie") and cited a thread + 3 messages.
- [x] Q2 `/chat` test: agent ran a single `search_threads(query="Katy")` → 10 thread hits, cited 5 distinct threads.
- [x] Q3 `/chat` test: agent ran 3 `search_threads` calls all with `flags=["medical_decision"]` (cheat sheet applied), cited 6 threads with concrete disagreement detail.
- [x] Support-mode regression test: "today was really hard, can we just talk?" → 0 tool calls, soft listening reply ("Of course. I'm here with you. You don't have to make it neat...").

#### Side-fix discovered during smoke testing

The `participant` arg on `search_threads` did `q.contains('participants', [args.participant])` which is exact text-array containment. The agent kept passing `participant: "Katy"` or `"Mari"` (i.e. partial names) and zeroing out otherwise-good searches. Removed the `participant` field from the schema entirely — proper-noun retrieval is now covered by the FTS-indexed `search_anchors.proper_nouns`, which is the right path. Also updated the `query` description to nudge the agent toward using names there.

---

### Sprint 4: End-to-end smoke test through the actual UI
**Status:** Complete (folded into Sprint 3 verification — Playwright login + Q1/Q2/Q3 + support-mode pass).
**Estimated effort:** ~30 min
**Goal:** Validate the full chain (browser → API → tools → DB → response) for the failing query, not just the code.

#### Tasks
- 4.1 Start dev server (`npm run dev` from `src/`). Wait for ready.
- 4.2 Playwright login as `kyle@monumentlabs.io` / `monumentlabs` (per AGENTS.md). Navigate to `/chat`, switch to the case `830cf878-...` if it isn't active.
- 4.3 Send Q1 *"Show me an instance where Mari withheld Josie"*. Capture the response, check:
  - At least one tool call to `search_threads` or `find_relevant_threads`.
  - At least one cited `[thread:<id>]` or `[message:<id>]` that resolves to a real row.
  - The cited thread is plausibly about gatekeeping / schedule violations involving Josie.
- 4.4 Send Q2 *"find some where Ms Katy was referenced"*. Confirm `search_threads` returns ≥ 3 threads now.
- 4.5 Send Q3 *"any medical decisions we disagreed on?"*. Confirm flag-driven path or semantic path returns relevant threads.
- 4.6 Cleanup any Playwright screenshots under `.playwright-mcp/` before reporting done.

#### Verification
- [ ] Q1, Q2, Q3 all return cited answers. Screenshots captured during the run, then deleted.
- [ ] No "I couldn't find a record" dead ends on these three.
- [ ] Note (in this plan) any query that *still* fails — that's the input for the next iteration.

---

## Reference Docs

- `internal_docs/20260428_smarter_chat_retrieval/chat_retrieval.md` — v1 retrieval philosophy. Still authoritative; this plan extends the "How to search" section, doesn't replace it.
- This plan supersedes nothing in v1; it's an addendum.

## Environment / Config Changes

None.

## What's Deferred / Out of Scope

- Vector embeddings on summaries. The bet is still term + LLM-rank covers the long tail; revisit only if Method C wins Sprint 2 but leaves obvious gaps.
- Per-message summaries / per-message classification. Threads are still the unit.
- Eval automation in CI. Sprint 2's harness is hand-run; codify when the eval set hits 15+ items.
- A user-facing "I'm not sure what you meant — did you mean A or B?" disambiguation step. Worth doing eventually; out of scope here.
- **Expanding thread metadata extraction (resolution status, initiator, severity, etc.).** Discussed 2026-04-28: threads already carry more structured retrieval surface than events do (`tone`, `flags[10 values]`, `participants[]`, `search_anchors{proper_nouns, topics, dates_mentioned, numbers}`). Once `find_relevant_threads` ships as the semantic fallback, the LLM reads prose directly — adding more controlled-vocab flags upfront has diminishing returns and risks confusing the agent about which tags are searchable. Add only when real chat usage reveals a recurring query class that neither flag-filtering nor semantic ranking handles well.

## Open Questions

1. For the migration in Sprint 1: do we hold the FTS index temporarily as we drop + recreate the generated column, or accept a brief window of un-indexed scans? On 192 rows it's irrelevant; just dropping and recreating is fine. Flagging in case prod ever has 100k+ rows.
2. Sprint 3 prompt cheat-sheet — is it worth making this a *data structure* (like a JSON the prompt is rendered from) so the eval harness and the prompt can share a single source of truth? Probably overkill for v1; revisit if the cheat sheet grows beyond ~10 entries.

# Chat Retrieval — How the Daylight chat agent looks things up

> Read before changing `src/server/utils/chatTools.ts` or the system prompt's tool-use section. This is the design rationale that the code can't tell you on its own.

## Why we don't use vector search

Embeddings are a tax — index pipeline, model dependency, vendor lock, opaque relevance. For the kind of retrieval Daylight does, term-based retrieval is *better*, not just cheaper:

- OFW messages are short, conversational, and full of distinctive nouns: names ("Ms Katy"), places ("Wilson Elementary"), amounts ("$340"), dates. These are the literal handles a user reaches for when they want to find a thread again. Lexical match is what they want.
- Custody disputes hinge on specifics. "What did he say about the school transfer?" — the user wants the message that says *"school"* and *"transfer"*, not a vector-cluster of school-adjacent moods.
- The corpus is small per case (hundreds, occasionally low thousands of messages). Postgres FTS + a thread summary layer is plenty.

The bet: **term retrieval over a structured summary layer beats vector search over raw bodies for this product.** If we're wrong we add embeddings as a fallback later. We don't lead with them.

## The failure mode this plan fixes

Plan 02 shipped `search_messages(query)` that takes a free-text string and runs `websearch_to_tsquery('english', query)` against `body`. `websearch_to_tsquery` ANDs every token. So when the agent — coming off a user prompt like *"did Ms Katy ever refuse to take the family account?"* — passes the user's paraphrase verbatim, the underlying query becomes `Ms & Katy & family & account & refused`, which requires **every** stem to appear in a single message body. Real OFW messages don't read like the user's mental summary; they say *"Katy from the school called about the account today"* or *"told them we'd handle it"*. Zero hits, agent says "I don't have data," user is unhappy.

Two failures stacked:
1. **The agent doesn't know how to formulate searches** — nothing in the system prompt tells it that the query parameter takes keywords, not sentences.
2. **The retrieval surface is wrong-grained** — even with good keywords, you're hunting individual messages when the right unit is the thread.

## The retrieval philosophy

Three layers, agent reaches for them in this order:

```
search_threads   → "find the conversation"      (default first move)
get_thread       → "read the conversation"      (after picking one)
search_messages  → "find one specific message"  (drill-in only)
```

The agent's job in evidence mode is to *answer the user* with citations. The fastest path is almost always: pick a thread, read the summary, drill in on a couple of messages, cite. Hunting word-by-word across the full message corpus should be a last resort.

## What goes in a thread summary

Every thread gets one structured row in `message_threads`. The fields exist for retrieval, not for narrative. Each one earns its place by being something a user would type or filter on later.

| Field | Why it's there |
|---|---|
| `summary` (paragraph) | The agent can read this and answer without re-fetching every message. ~80–180 words. Names participants by role ("the user", "the co-parent") so the prose doesn't repeat info already in `participants`. |
| `tone` (enum) | Lets the agent answer "show me the tense conversations" without semantic guessing. Five values: `cooperative, neutral, tense, hostile, mixed` (`mixed` covers both genuinely mixed and unclear cases). |
| `flags` (text[]) | Controlled vocab of things-that-matter-in-custody. Lets the agent filter on patterns ("show me the schedule violations") without re-running classification each turn. |
| `participants` (text[]) | Who's in the thread. ilike-searchable. |
| `message_count`, `first_sent_at`, `last_sent_at` | Volume + temporal anchors. |
| `search_anchors.proper_nouns` | Names, schools, providers, places. **These are the words the user will actually search for.** Preserve the spelling that appears in the bodies. |
| `search_anchors.topics` | Concrete topics ("after-school pickup", "tuition payment"), 2–4 word noun phrases, lowercase. Not editorial labels like "drama." |
| `search_anchors.dates_mentioned` | ISO dates referenced *in the bodies*, not the message timestamps — e.g. "the pickup on the 14th" → `2025-09-14`. |
| `search_anchors.numbers` | Dollar amounts, durations, counts. Often the single most distinctive token in a thread. |

`search_anchors` is the killer feature here. The summary writes prose; the anchors are the index into it. When the agent searches `"Katy"` or `"$340"` it's hitting the anchors, not guessing about word order.

## What goes in `flags`

Controlled vocabulary, descriptive (not adjudicative). The agent applies these at summary time, the chat agent filters on them at retrieval time:

| Flag | Trigger |
|---|---|
| `schedule_violation` | A custody schedule was missed, late, or unilaterally changed. |
| `gatekeeping` | A request for information about the child was refused or sidestepped, or access was withheld. |
| `child_welfare_concern` | Concrete concern about safety, health, supervision, emotional state. |
| `agreement_reference` | Either party cites the custody order, parenting plan, or court agreement. |
| `financial_dispute` | Money — support, expenses, reimbursements, school payments. |
| `medical_decision` | Doctor visits, medications, diagnoses, treatment decisions. |
| `school_decision` | School choice, enrollment, conferences, IEPs, disciplinary issues. |
| `safety_concern` | Allegation or description of physical danger, substance use around the child, supervision lapse. |
| `communication_breakdown` | Repeated unanswered messages, stonewalling, immediate hostility. |
| `positive_coparenting` | Cooperative resolution, gracious handoff, shared decision arrived at without conflict. Track these too. |

Flag rules:
- Multiple flags allowed.
- A flag is descriptive of the *thread*, not a verdict on either parent.
- `gatekeeping` describes the *act* (info refused), not the actor's identity. The summary text says what happened; the flag is the index.

## How the agent should formulate searches

**Decompose, don't paraphrase.** The user says *"did he ever say anything about the school transfer?"* The agent searches:

| User said | Agent searches |
|---|---|
| "did he ever say anything about the school transfer" | `school transfer` (or just `transfer` if school is in every thread) |
| "Ms Katy refused to take the family account" | `Katy` |
| "we had that fight about the $340 reimbursement" | `340` or `reimbursement` |
| "the late pickups in March" | `search_threads` with `query: "pickup"` and `from: "2026-03-01", to: "2026-03-31"` |
| "what happened the night Josie was upset" | `search_threads(query: "Josie")` then `get_thread` and read |

Rules of thumb:
- **1–3 keywords.** More than three and you're paraphrasing.
- **Distinctive nouns beat verbs.** "Refused" is everywhere; "Katy" is once. Search the rare token.
- **Names always work.** If the user used a name, search the name first.
- **Numbers are gold.** "$340", "20 minutes", "page 4" — these are unique enough that one hit is usually the right hit.
- **Date filters > date keywords.** "March 14" goes in `from`/`to`, not in the query string.
- **Two strikes, ask.** Two reasonable searches that return nothing → tell the user what you tried and ask for a date, name, or distinctive word. Don't keep guessing.

## How the agent should drill in

Once `search_threads` returns 1–3 plausible threads, **read the summary first**. Most factual questions are answerable from the summary alone. Only call `get_thread` when:

- The user asks for a direct quote.
- The summary is ambiguous and the answer hinges on a specific message.
- The user wants chronology ("what was said first?").

Citation discipline (unchanged from Plan 02):
- Cite specific messages via `[message:<id>]`.
- Cite a whole thread via `[thread:<id>]` (new — token added in this plan).
- Never invent ids. The citation guardrail strips invented ones, but the prompt asks the agent not to write them in the first place.

## Maintaining summaries

- New OFW upload → `ofw-ingest` fans out one summarize event per *new* `(case_id, thread_id)` and any thread whose `message_count` changed.
- Re-running the same event is an upsert, not an insert. Cheap, idempotent.
- `summary_version` (int on the row) tracks prompt-schema generation. When we change the schema in a way that should regenerate everything, bump the constant in `thread-summarization.ts` and run the backfill endpoint.

## Backfill

`POST /api/internal/backfill-thread-summaries` — admin-gated. For each case the caller can access, finds threads in `messages` that have no row in `message_threads` (or whose `message_count` differs), enqueues one Inngest event per. Returns `{ enqueued: N }`.

Run this:
- Once after Sprint 2 ships (against existing imports).
- Whenever `summary_version` bumps and you want to regenerate everything (drop matching rows first, then run).

## Anti-patterns to avoid

- **Don't add a "smartness" layer on top of `search_messages`.** The fix is upstream (thread summaries) and at the agent's prompt, not in the tool implementation.
- **Don't pre-classify messages.** The thread is the unit. Per-message classification is more expensive and less useful.
- **Don't let the summary become editorial.** "Mom is being unreasonable" never appears in a summary. Tone goes in the enum; flags are descriptive; the prose names actions, not motives.
- **Don't add a "confidence score" field yet.** It would mostly be 1.0 from a strong model and the chat agent can't do anything useful with it. Add when there's a real consumer.
- **Don't index search anchors as JSONB paths.** The FTS index already covers `summary || subject || participants`; the anchor proper-nouns mostly appear in the summary text too. If queries get slow we revisit. Premature for v1.

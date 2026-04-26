# Plan 01 — OFW Ingest

## Goal

A Daylight user uploads an Our Family Wizard "Message Report" PDF and within 60 seconds sees every message rendered on their case timeline alongside their journal entries, with sender, timestamp, subject, body, and attachments preserved. Messages become first-class evidence: searchable, exportable, citable in PDF outputs, and queryable by the chat agent (Plan 02).

## Why this is the moat

Every contested custody case in the US that uses court-mandated co-parenting communication generates an OFW export. OFW has ~250k paying users, court-ordered in most family courts. The export PDF is structurally messy (nested thread history, page-break duplication, ambiguous reply boundaries). Sift's parser already solves this, deterministically, without LLM cost. Once messages live alongside Daylight's existing voice/journal/screenshot evidence, the case timeline goes from "what I remembered to write down" to "the full record." No competitor has this.

## What ships

A new evidence type `ofw_export` with its own ingest pipeline. Messages stored as their own table (`messages`) joined to a case. Timeline renders events + messages chronologically. Existing PDF exports include messages.

## Architecture

```
Upload (.pdf) → /api/evidence/ofw → store file → Inngest job → ofw-parser.ts
  → messages[] → upsert to messages table
  → optional: extract events from messages (deferred, see Phase 3)
  → broadcast realtime update → timeline UI rerenders
```

## Source of the parser — use the standalone

There are **two** existing OFW parsers in the workspace. The standalone is the better lift:

| Source | Path | Lines | Notes |
|---|---|---|---|
| **Standalone parser (use this)** | `Workspace/ofw-parser/server/utils/ofw-parser.ts` | 376 | Single file. Tight 6-step pipeline. Returns a rich `OFWParseResult` with metadata block (totalMessages, reportExpected, numberedMessages, threadCount, dateRange, senders) already populated — exactly what Plan 04 needs for pattern stats. Public API: `parseOFWPdf(pdfData: Uint8Array, filename: string)`. Has a working multipart upload endpoint at `Workspace/ofw-parser/server/api/parse.post.ts` worth lifting too. |
| Sift's parser | `Sift/src/server/utils/ofw-parser.ts` | 696 | Same algorithm but coupled to Sift's `SiftDocument` abstraction. Useful as a reference for accumulated dedup edge cases against tricky exports. Don't lift this one wholesale. |

The standalone has been validated on a real contested-custody export: **1,271 messages across 180 threads**, parsed deterministically, no LLM cost. See `https://www.monumentlabs.io/blog/how-ai-turned-15-hours-of-legal-review-into-15-minutes` for the case study.

What this means for Phase 1 below:
- **Lift `Workspace/ofw-parser/server/utils/ofw-parser.ts` verbatim** into `src/server/utils/ofw-parser.ts`. No translation needed — the output shape (`OFWMessage`, `OFWParseResult`) is already cleaner than what we'd design from scratch.
- Lift the multipart endpoint pattern from `parse.post.ts` (it's 18 lines) as the basis for Phase 2's `POST /api/evidence/ofw`.
- Skip the `SiftDocument` translation step that the original draft of this plan called for. There's no `SiftDocument` to adapt to here.
- Pin `pdfjs-dist@^5.5.207` (matches the standalone's package.json).

## Phases

### Phase 1 — Parser lift (~half a day, the standalone is plug-and-play)

1. Copy `Workspace/ofw-parser/server/utils/ofw-parser.ts` into `src/server/utils/ofw-parser.ts`. The file is self-contained — no other deps to drag in.
2. Add `"pdfjs-dist": "^5.5.207"` to Daylight's `package.json` (same version the standalone pins; this avoids PDF.js worker version drift).
3. Add a unit test against a known-good OFW export fixture. Save the fixture under `src/server/utils/__fixtures__/ofw_sample.pdf` and gitignore it. Test should assert at minimum: total message count, sender list, date range, and that all `messageNumber` fields populated by the parser match the `messageNumber` markers in the source.

**Done when:** `npm test` parses the fixture and returns the expected `OFWParseResult` shape. The parser is already battle-tested against a 1,271-message real export — this phase is just rehosting it.

### Phase 2 — Storage + ingest pipeline (2–3 days)

1. **DB migration** (`db_migrations/0XX_ofw_messages.sql`):
   - New table `messages`:
     ```
     id uuid pk
     case_id uuid fk → cases
     evidence_id uuid fk → evidence (the source PDF)
     sent_at timestamptz not null
     sender text not null
     recipient text not null
     subject text
     body text not null
     attachments jsonb default '[]'
     thread_id text  -- derived from subject normalization (parser's `threadId`)
     message_number int  -- "Message X of Y" position (parser's `messageNumber`)
     first_viewed_at timestamptz  -- parser's `firstViewed`
     word_count int  -- parser populates this for free; useful for filters and stats
     created_at timestamptz default now()
     ```
   - Index `(case_id, sent_at desc)` and `(case_id, sender)`.
   - RLS: same policy as `events` — owner-only via `case_members`.
2. Add `'ofw_export'` to the `evidence_source_type` enum.
3. **Inngest function** `process-ofw-export.ts`:
   - Trigger: `evidence/ofw_export.uploaded`
   - Steps: download from storage → call `parseOFW(pdfBuffer)` → upsert messages in batch → emit `case/ofw.ingested` for downstream listeners.
   - Idempotent on `(case_id, evidence_id)` — cached per Kyle's bulk-processing rule. Re-uploading the same file does not double-insert and costs nothing (no LLM in this pipeline).
4. **API endpoint** `POST /api/evidence/ofw` — accepts the PDF, stores it, creates the `evidence` row with `type='ofw_export'`, fires the Inngest event, returns the evidence id.
5. **API endpoint** `GET /api/messages` — case-scoped list with filters (sender, date range, search).

**Done when:** uploading a PDF on a dev case results in N messages in the table within 60s, idempotent on re-upload.

### Phase 3 — Timeline + UI surface (2–3 days)

1. New page `src/app/pages/messages/index.vue` — list view with filters (date range, sender, full-text search), virtualized scroll.
2. New page `src/app/pages/messages/[id].vue` — single message view with thread context (other messages in same `thread_id`, sorted by `sent_at`).
3. **Timeline integration** (`src/app/pages/timeline.vue`):
   - Extend `TimelineEvent` to include `message` discriminator.
   - Adapt `/api/timeline` to UNION events + messages with a unified shape.
   - Add filter chip "Messages" alongside existing event-type filters.
   - Message rows render with a distinct visual treatment (chat-bubble icon, sender as bold).
4. **Upload flow** — add an "Import OFW Export" tile to `/evidence` and to onboarding step 3. Drag-and-drop PDF, 50MB cap (matches the `ofw-parser` constraints; bigger reports rare).
5. **Empty state** on timeline gets a CTA: "Have an Our Family Wizard account? Import your messages."

**Done when:** a user can upload a PDF in the onboarding flow and see their messages on the timeline before finishing setup.

### Phase 4 — Export integration (1 day)

1. Court-ready PDF exports (`/exports/new`) gain a "Include OFW messages" toggle, default on.
2. Message rendering in the PDF: chronological, sender bolded, attachment names listed. Thread grouping is optional — first ship flat chronological.
3. Each message gets a stable footnote-style citation `[OFW msg #N, sent YYYY-MM-DD HH:MM]` so opposing counsel can verify against the original report.

**Done when:** a generated PDF includes ingested messages in the timeline section with citations.

### Phase 5 — Optional: event extraction from messages (deferred)

Promote message *content* into structured events ("late pickup," "schedule change request," "medical decision") using the existing journal-extraction prompt, adapted. This is the LLM tier — keep it deferred behind a flag until Phases 1–4 prove out. When it ships, gate behind a per-case "Run extraction on messages" action so we don't burn LLM budget automatically.

## Risks

- **PDF.js worker setup in Nuxt server context** — Sift solved this; lift their config verbatim. Do not improvise.
- **Message dedup edge cases** — OFW thread view duplicates content across "Message X of Y" entries. The parser handles this, but write a regression test for any export Kyle has that previously caused issues.
- **Storage costs** — OFW exports can be 50–200MB. Use Supabase Storage with a per-case cap (1GB free tier, paid tiers from there). Don't store raw PDFs in the messages table.
- **PII in fixtures** — never commit a real OFW export. Use a synthetic one for tests.

## Out of scope (this plan)

- Other co-parenting platforms (TalkingParents, AppClose, Custody X Change). Lift the loader pattern when we get there; OFW alone covers ~70% of court-mandated cases.
- Real-time OFW sync (no public API exists; export is the only path).
- Editing messages. Source-of-truth is the import; users annotate via separate evidence rows.

## Definition of done for the plan

User uploads OFW PDF → sees messages in timeline → exports a court PDF that includes them → re-uploading the same PDF does nothing wasteful.

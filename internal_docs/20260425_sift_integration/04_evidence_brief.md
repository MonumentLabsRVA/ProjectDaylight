# Plan 04 — Evidence Brief for Firms

## The pitch in one sentence

A local family-law attorney drops in a client's OFW export (and any supplemental texts/screenshots), and ninety seconds later downloads a court-ready exhibit packet — chronologically organized, indexed by theme, contradiction-flagged, line-numbered, foundation-ready, branded with the firm's letterhead.

This is the highest-leverage product surface Daylight can ship for the firm side. Rationale: see `research_local_firm_pain_points.md`. GTM that surrounds it: `gtm_local_firms.md`.

## Goal

Replace the 4–8 hours of paralegal exhibit prep that happens before every contested family-law hearing with a one-button operation that produces a better artifact than the manual one.

The standard for "better" is concrete and externally validated:
- Chronologically ordered within categorized sections
- Each message line-numbered with stable citations (`[Ex. A, ln 47]`)
- Contradictions and pattern violations flagged with cross-references
- Foundation paragraph generated for each thread (sender, timestamp source, authentication method)
- Cover summary with case overview, pattern findings, and exhibit index
- Firm letterhead and case caption applied
- Exportable as PDF or DOCX (DOCX matters — many courts still require Word for filings)

If a paralegal looks at the output and says *"this is what I would have produced after six hours,"* it ships.

## Why this — and why for firms specifically

This is the firm-buyer version of what Plans 01–03 enable for parents. The same OFW parser (Plan 01) and chat agent (Plan 02) that serve the parent-side product can be repurposed to serve the firm-side product, with a different output surface and a different buyer.

The differences from Plan 03 (Attorney Share Workspace) are important:
- **Plan 03**: parent invites attorney → attorney lands in parent's case. Two-sided, parent must pay, viral GTM.
- **Plan 04 (this plan)**: firm uploads OFW directly → firm gets brief. One-sided buyer (the firm), parent doesn't need to be a Daylight user, direct sales motion.

Both can coexist. Plan 03 is the bottom-up GTM. Plan 04 is the top-down GTM.

## What ships

A new product surface at `firm.daylight.legal` (or `daylight.legal/firm`) with:
- Firm onboarding (firm name, letterhead upload, case caption template)
- Per-case workspace (client name, case number, jurisdiction, hearing date)
- OFW import (Plan 01's parser — the standalone at `Workspace/ofw-parser/server/utils/ofw-parser.ts`, already validated on 1,271 messages from a real contested case)
- Brief generator with theme controls and citation format
- PDF + DOCX export
- Per-case billing via Stripe

## Proven pipeline shape (use this, don't redesign)

The Monument Labs blog post [*"How AI turned 15 hours of legal review into 15 minutes"*](https://www.monumentlabs.io/blog/how-ai-turned-15-hours-of-legal-review-into-15-minutes) walks through a working three-phase pipeline that produced this exact artifact in a real contested-custody case. Plan 04 should mirror it:

| Phase | What it does | Cost benchmark from the case study |
|---|---|---|
| **1. Parse** | OFW PDF → 1,271 structured messages → 180 thematic threads. The standalone parser already does this. Deterministic. No LLM cost. | $0 |
| **2. AI evidence matching** | LLM receives the parsed JSON + the discovery question (or the brief request). Performs targeted iterative search: filter by timeframe, scan subject lines, pull relevant threads, extract exact quotes with message numbers. | < $5 in API for the entire 1,271-message case |
| **3. Report assembly** | Outputs: chronological timelines with citations, pattern analysis across weeks, direct quotes with OFW message numbers, thread summaries capturing multi-message arcs, response time analysis from `sent`/`firstViewed` timestamps. | Bundled into Phase 2 spend |

**Why this shape works** (per the case study):
- The dataset is bounded — fits comfortably in context windows
- The task is **search-and-match, not credibility judgment** — agents are reliable in this regime
- Parsing creates queryable structure first; the LLM never operates on raw PDF text
- Human attorney retains review authority over every citation

**The 15-hour → 15-minute claim** breaks down to: $150/hr × 15 hours = $2,250 manual paralegal cost, replaced with < $5 in API and ~15 minutes of runtime. **450× cost reduction.** This is the single most important number in the entire firm-side GTM — it's the headline of every CLE talk and demo.

**Implementation note on the LLM choice:** the case study used Claude (via Claude Code as the agentic runtime). Plan 04 should default to OpenAI for parity with the rest of Daylight's stack (`openai ^6.9.1` is already a dep). The pipeline is model-agnostic — the prompt design and the JSON-in/JSON-out contracts matter more than the vendor.

## Phases

### Phase 1 — Firm account model + per-case workspace (3–4 days)

Minimal data model. A firm is a user with a `firm_account` record holding letterhead and brand defaults. A case is a `firm_case` row scoped to a firm, with the same internal structure as the parent-side `cases` (events, messages, evidence) but a different ownership model.

**DB migration** (`db_migrations/0XX_firm_accounts.sql`):
```sql
create table firm_accounts (
  id uuid pk default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_name text not null,
  attorney_name text,
  bar_number text,
  letterhead_url text,                 -- supabase storage path
  default_case_caption text,
  brand_color text default '#000000',
  created_at timestamptz default now()
);

create table firm_cases (
  id uuid pk default gen_random_uuid(),
  firm_account_id uuid not null references firm_accounts(id) on delete cascade,
  client_name text not null,
  case_number text,
  jurisdiction text,
  opposing_party text,
  hearing_date date,
  status text default 'active',
  created_at timestamptz default now()
);
create index on firm_cases (firm_account_id, created_at desc);
```

Reuse `messages` and `events` tables but extend the FK to allow either `case_id` (parent case) or `firm_case_id` (firm case). RLS scopes to the firm account's user.

**Pages** (under `src/app/pages/firm/`):
- `firm/onboarding.vue` — firm details + letterhead upload
- `firm/index.vue` — case roster
- `firm/cases/new.vue` — start a case
- `firm/cases/[id].vue` — case workspace (timeline, messages, briefs)

**Done when:** an attorney can sign up, configure firm details, create a case, and see an empty case workspace.

### Phase 2 — OFW import wired to firm cases (1–2 days)

Reuse Plan 01's OFW parser entirely. Add a thin endpoint `POST /api/firm/cases/:id/ofw` that mirrors the parent-side `/api/evidence/ofw` but writes against `firm_case_id` instead of `case_id`. Same Inngest pipeline. Same parser. Same dedup.

**Done when:** attorney uploads PDF to a firm case, sees N parsed messages in the case workspace within 60 seconds.

### Phase 3 — Brief generation pipeline (4–6 days, the heart of the plan)

This is where the actual product lives. Pipeline:

1. **Categorize messages** — LLM-light pass classifying each message into one of `~10` family-law-relevant themes (schedule disputes, pickup conflicts, communication failures, financial coordination, child welfare, third-party intrusions, contradictory statements, school/medical decisions, denigration, other). Keep deterministic-first per Sift's pattern: regex/keyword filters first, LLM for residual ambiguous cases.
2. **Detect contradictions** — for each thematic cluster, run a contradiction detector that surfaces pairs of messages where the same sender stated incompatible positions, with cited line references. Output: structured contradictions list.
3. **Surface patterns** — count-based summary across categories: "12 communication failures over 90 days, peaking in March," "5 schedule changes initiated by [name]," etc. Standard descriptive stats from message metadata, no LLM needed.
4. **Generate foundation paragraphs** — one per cluster. Template: *"This collection of messages was extracted from an Our Family Wizard Message Report dated [X], obtained via [client/attorney/court order]. Messages are preserved in OFW's authenticated format. Senders are [X] and [Y]. The full thread is reproduced below in chronological order with line numbers for citation."* Stable. Templated. Lawyer-reviewable.
5. **Render to PDF + DOCX** — sectioned document with:
   - Cover page (firm letterhead, case caption, hearing date, exhibit index)
   - Pattern summary
   - One section per theme: foundation paragraph, then messages chronologically with line numbers
   - Contradictions appendix with cross-references
   - Source attribution (date of OFW export, total messages parsed)

For PDF/DOCX rendering: Daylight already has a PDF generator (`src/app/utils/generate-pdf.ts` is in the in-flight changes from main). Extend it. For DOCX, add `docx` (the npm package) — used by editors-room and others.

**Done when:** uploading a real (anonymized) OFW export produces a PDF that a paralegal validates as "I would have done this in 6 hours and it would have looked like this."

### Phase 4 — Brief customization controls (2 days)

Attorneys want control. Surface:
- Theme toggles (include/exclude each category)
- Date range filter
- Sender filter (sometimes the brief is one-sided — only one parent's messages)
- Tone-of-coverage selector: "factual" (default) vs. "pattern-emphasis" vs. "contradiction-emphasis"
- Citation format (some jurisdictions prefer `[Ex. A, ln 47]`, others prefer `[OFW msg #14]`)
- Letterhead toggle (some attorneys generate without firm branding for internal review first)

Each generation re-runs the pipeline against cached parser output (per Kyle's idempotency rule) — so iterating on settings is cheap.

**Done when:** an attorney can regenerate a brief with different settings in under 10 seconds.

### Phase 5 — Per-case billing via Stripe (1–2 days)

Pricing (see GTM doc for rationale):
- $99 per brief (one-off, no subscription)
- OR firm subscription $499/mo for unlimited briefs (1 attorney) / $999/mo (2–5 attorneys)

Implementation: Stripe Checkout per generated brief. Briefs are watermarked "DRAFT — NOT FOR FILING" until paid. After payment, watermark drops and DOCX/PDF are downloadable.

**Done when:** attorney can generate, preview (watermarked), pay $99, and download clean files in one flow.

### Phase 6 — Internal "Brief Sandbox" lab in /internal (0.5 days)

Add a working version of the planned "OFW Parser sandbox" lab from Plan 01's placeholder, scoped to the firm pipeline:
- Drop in a sample OFW PDF
- See the parsed messages
- Step through categorization → contradictions → patterns → foundation
- Render preview brief

Useful for evals, demos, and debugging without going through full firm onboarding.

## Open product questions

1. **Should the parent get a copy?** If the firm is the buyer and the parent isn't a Daylight user, do we offer the parent free read-only access to the brief their attorney generated about their case? Probably yes — it's a quiet acquisition channel and aligns with the "transparency" message. But it has to be opt-in by the firm.
2. **Bates numbering vs. line numbering?** Some jurisdictions use Bates. We default to line numbers per the most common practitioner guidance, but should expose Bates as an option for litigation-heavy firms.
3. **Multi-jurisdictional citation format.** Real but deferrable. Default to a sensible neutral format; let attorneys override.
4. **PII handling.** OFW briefs contain sensitive content about minors. Storage + retention policy must be conservative. Default: 90-day retention on briefs, attorney can extend or delete on demand. Delete on subscription cancellation.

## Risks

- **Quality bar is non-negotiable.** A bad brief in court is worse than no brief — it embarrasses the attorney and kills referrals. The eval bar before turning this on for paying customers is "5 paralegals validate 5 different cases as production-quality." Don't ship before that.
- **Hallucinated citations.** Same risk as Plan 02. Mitigation: every cited message id is validated against the parser's output; any unmatched citation strips from the brief and logs an error.
- **Branding screws.** Letterhead PDFs come in 1000 variations. Ship a small set of supported templates first (top-banner, side-banner, plain). Reject PDFs that don't fit and ask the attorney to send a clean version. Don't let template diversity become the bottleneck.
- **Authentication / chain-of-custody.** Daylight's brief is an organized presentation of OFW's authenticated data. The attorney is responsible for laying foundation in court. Make this clear in the cover sheet language: *"This document organizes records from OFW's authenticated message report. Authentication of the underlying OFW report is the responsibility of counsel."*

## Out of scope (this plan)

- Drafting the motion the brief attaches to (Paxton AI's territory).
- Practice management features (Aparti / Clio / MyCase territory).
- E-filing integration.
- Multi-source ingestion beyond OFW (texts, emails, screenshots) — that lands in Phase 7 once the OFW workflow is proven. Note: TextEvidence already does raw SMS exhibits; Daylight can integrate via paste/upload but shouldn't reinvent.
- Attorney-to-attorney sharing (deferred until firms ask for it).

## Definition of done

A local family-law attorney we don't know personally signs up, uploads a real OFW export, gets a brief back, files it in court, and tells one other attorney about us. That's the chain. When that happens, this plan has shipped.

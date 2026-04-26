# Plan 04 — Evidence Brief for Firms

## The pitch in one sentence

A local family-law attorney drops in a client's OFW export (and any supplemental texts/screenshots), and ninety seconds later downloads a court-ready exhibit packet — chronologically organized, indexed by theme, contradiction-flagged, line-numbered, foundation-ready, branded with the firm's letterhead.

This is the highest-leverage product surface Daylight can ship for the firm side. Rationale: see `research_local_firm_pain_points.md`. GTM that surrounds it: `gtm_local_firms.md`.

## Depends on

- **Plan 00** (case scoping) — firm cases are case-scoped resources just like parent cases.
- **Plan 01** (OFW parser + messages table) — same parser, same `messages` table.
- *Optionally* Plan 02 (chat) for the firm-side investigation surface, but this plan ships independently.

## Goal

Replace the 4–8 hours of paralegal exhibit prep that happens before every contested family-law hearing with a one-button operation that produces a better artifact than the manual one.

The standard for "better" is concrete and externally validated:
- Chronologically ordered within categorized sections
- Each message line-numbered with stable citations (`[Ex. A, ln 47]`)
- Contradictions and pattern violations flagged with cross-references
- Foundation paragraph generated for each thread (sender, timestamp source, authentication method)
- Cover summary with case overview, pattern findings, exhibit index
- Firm letterhead and case caption applied
- Exportable as PDF or DOCX (DOCX matters — many courts still require Word for filings)

If a paralegal looks at the output and says *"this is what I would have produced after six hours,"* it ships.

## Why this — and why for firms

This is the firm-buyer version of what Plans 01–03 enable for parents. The same OFW parser (Plan 01) and chat agent (Plan 02) that serve the parent-side product can be repurposed to serve the firm-side product, with a different output surface and a different buyer.

Plan 03 vs. Plan 04:
- **Plan 03**: parent invites attorney → attorney lands in parent's case. Two-sided, parent pays, viral GTM.
- **Plan 04** (this plan): firm uploads OFW directly → firm gets brief. One-sided buyer (the firm), parent doesn't need to be a Daylight user, direct sales motion.

Both can coexist. Plan 03 is bottom-up GTM. Plan 04 is top-down GTM.

## What ships

A new product surface at `/firm/*` (subdomain `firm.daylight.legal` is deferred — see "Routing" below). Includes:

- Firm onboarding (firm name, letterhead upload, case caption template)
- Per-firm-case workspace (client name, case number, jurisdiction, hearing date)
- OFW import (Plan 01's parser, same pipeline)
- Brief generator with theme controls and citation format
- PDF + DOCX export
- Per-case billing via Stripe

## Routing

Stay on a single Nuxt app. Use `/firm/*` route prefix with a dedicated `firm` layout. The subdomain split (`firm.daylight.legal`) can come later by attaching a route rule in `nuxt.config.ts` once the firm side stands on its own. Building two Nuxt apps now is gratuitous infra; the prefix gets us 95% of the value.

A user can have a parent-side identity (regular case owner) AND a firm identity simultaneously — they're the same `auth.users.id`. The routing differs based on the active surface, not the identity. The case switcher (Plan 00) extends to also list firm cases when the user has a `firm_accounts` record; visual treatment differs (firm cases get a briefcase icon prefix).

## Phases

### Phase 1 — Firm account model + per-firm-case workspace (~3 days)

#### 1a. Schema decision: extend `cases`, do NOT add `firm_cases`

The original 04_evidence_brief draft proposed a separate `firm_cases` table with an "either-or" FK on `messages`. Polymorphic FKs with CHECK constraints are awkward in Postgres and force every read query to branch.

Better: extend the existing `cases` table with a `kind` column and a nullable `firm_account_id`. This keeps `messages.case_id`, `events.case_id`, etc. pointing to one place. RLS can branch cleanly on `kind`.

#### 1b. Migration `0052_firm_accounts.sql`

```sql
begin;

create table firm_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  firm_name text not null,
  attorney_name text,
  bar_number text,
  letterhead_url text,           -- supabase storage path (daylight-files/firm/{userId}/letterhead.pdf)
  default_case_caption text,
  brand_color text default '#0F172A',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index uniq_firm_accounts_user on firm_accounts (user_id);
alter table firm_accounts enable row level security;
create policy firm_accounts_owner on firm_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger firm_accounts_set_updated_at
  before update on firm_accounts
  for each row execute function set_updated_at();

-- Extend cases.
alter table cases add column kind text not null default 'parent_case'
  check (kind in ('parent_case','firm_case'));
alter table cases add column firm_account_id uuid references firm_accounts(id) on delete cascade;
alter table cases add column client_name text;        -- firm cases only
alter table cases add column hearing_date date;       -- firm cases (also see existing next_court_date)
create index idx_cases_firm on cases (firm_account_id) where firm_account_id is not null;

-- Constraint: firm cases must have a firm_account_id; parent cases must not.
alter table cases add constraint cases_kind_consistency check (
  (kind = 'parent_case' and firm_account_id is null)
  or (kind = 'firm_case' and firm_account_id is not null)
);

-- RLS: cases owner is either user_id (parent) or the firm account's user_id (firm).
-- Existing policies key on cases.user_id; that's already the firm account's user_id since
-- the firm case row has user_id = firm_accounts.user_id (we set it that way on insert).
-- No policy change required if we always populate cases.user_id consistently.

commit;
```

**Insert convention for firm cases:** `cases.user_id = firm_accounts.user_id`, `cases.firm_account_id = firm.id`, `cases.kind = 'firm_case'`. This way the existing case-ownership RLS Just Works, and the case switcher (Plan 00) can list both kinds with a single query.

`messages`, `events`, `evidence`, `journal_entries` need no schema changes — they already reference `cases(id)`. The brief generator queries by `case_id`; it doesn't care whether the case is parent or firm.

#### 1c. Pages

Under `src/app/pages/firm/`:

| Page | Purpose |
|---|---|
| `firm/onboarding.vue` | One-page form: firm name, attorney name, bar number, letterhead upload, default caption. Submits to `POST /api/firm/account`. |
| `firm/index.vue` | Case roster — list of `cases` where `kind='firm_case'` for the user's firm. |
| `firm/cases/new.vue` | Start a firm case: client name, case number, jurisdiction, opposing party, hearing date. |
| `firm/cases/[id].vue` | Case workspace: timeline view, messages list, brief generator. Shares components with parent-side where sensible (timeline, messages list) but uses a `firm` layout. |

Layout: `src/app/layouts/firm.vue` mirrors `default.vue` but with firm-flavored chrome (different header, different sidebar items: Cases / Templates / Settings / Billing). Reuse `CaseSwitcher` from Plan 00, scoped to firm cases.

Endpoints:
- `POST /api/firm/account` — create or update firm_accounts record
- `GET /api/firm/account` — return the user's firm account (404 if none — `firm/index.vue` redirects to onboarding in that case)
- `POST /api/firm/cases` — create a firm case
- `GET /api/firm/cases` — list firm cases

**Done when:** an attorney can sign up, complete firm onboarding, create a firm case, and see an empty case workspace.

### Phase 2 — OFW import wired to firm cases (~1 day)

Reuse Plan 01's parser entirely. Reuse the existing `evidence-ofw-upload.post.ts` endpoint — it accepts a `caseId` and doesn't care whether the case is parent or firm, since RLS gates access via `cases.user_id`.

The only adjustment: in firm-case workflows, the case is created *before* the OFW upload (Phase 1 onboarding). The upload UI on `firm/cases/[id].vue` uses the existing endpoint with the firm case's id.

**Done when:** attorney uploads an OFW PDF to a firm case, sees N parsed messages in the case workspace within 60 seconds.

### Phase 3 — Brief generation pipeline (~5 days, the heart of the plan)

Pipeline shape (adapted from the [Monument Labs case study](https://www.monumentlabs.io/blog/how-ai-turned-15-hours-of-legal-review-into-15-minutes) — proven on 1,271 messages, < $5 in API spend):

```
Brief generation request: { caseId, settings }
  ↓
1. Load all messages for caseId (sorted by sent_at)
2. Categorize messages — deterministic-first, LLM-residual
3. Detect contradictions per cluster — LLM judge over candidate pairs
4. Compute pattern stats — pure SQL
5. Generate foundation paragraphs — templated
6. Render to PDF + DOCX
  ↓
Returns { briefId, status: 'completed' | 'failed' }
```

#### 3a. Inngest function `generate-brief`

Mirrors `journal-extraction.ts` and `ofw-ingest.ts` patterns. Steps:

| Step | What it does |
|---|---|
| `mark-processing` | Update `briefs.status = 'processing'` |
| `categorize-messages` | Classify each message into ~10 themes. Regex/keyword filters first; LLM only on residual ambiguous cases. |
| `detect-contradictions` | For each cluster, surface candidate pairs via keyword similarity, then LLM-judge each pair (~$0.001 per pair with `gpt-5.4-mini`). Output: structured contradictions list. |
| `compute-patterns` | Pure SQL. Counts by category, response-time stats, sender breakdown, peaks. |
| `generate-foundation` | One templated paragraph per cluster. No LLM needed. |
| `render-pdf` | Extends `src/app/utils/generate-pdf.ts`. |
| `render-docx` | Uses `docx` npm package. |
| `finalize` | Update `briefs.status = 'completed'`, `pdf_url`, `docx_url`, watermarked unless paid. |

Briefs table — migration `0053_briefs.sql`:

```sql
create type brief_theme as enum (
  'schedule_disputes','pickup_conflicts','communication_failures',
  'financial_coordination','child_welfare','third_party_intrusions',
  'contradictory_statements','school_medical_decisions','denigration','other'
);

create table briefs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  settings jsonb not null default '{}'::jsonb,        -- themes, date_range, sender_filter, tone, citation_format
  result jsonb,                                       -- pattern stats, contradiction counts, theme buckets
  pdf_storage_path text,
  docx_storage_path text,
  paid_at timestamptz,                                -- when watermark drops
  stripe_payment_intent_id text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_briefs_case on briefs (case_id, created_at desc);
alter table briefs enable row level security;
create policy briefs_owner_all on briefs
  for all using (user_can_access_case(case_id))
  with check (user_can_access_case(case_id));
create trigger briefs_set_updated_at
  before update on briefs for each row execute function set_updated_at();
```

#### 3b. Categorization

Deterministic rules first (lifted from Sift's pattern):

```ts
const RULES: Record<string, RegExp[]> = {
  schedule_disputes: [/pick.?up/i, /drop.?off/i, /late/i, /missed/i, /\bswap\b/i],
  pickup_conflicts: [/pick.?up/i, /pickup/i, /not (there|present|home)/i],
  communication_failures: [/no response/i, /didn'?t reply/i, /never told/i],
  // ... etc
}

function ruleClassify(message: Message): brief_theme[] {
  const matches: brief_theme[] = []
  for (const [theme, patterns] of Object.entries(RULES)) {
    if (patterns.some(p => p.test(message.subject ?? '') || p.test(message.body))) {
      matches.push(theme as brief_theme)
    }
  }
  return matches
}
```

Messages with zero matches go to a residual batch; one LLM call classifies the batch (cheap, batched). Messages can carry multiple themes.

#### 3c. Contradiction detection

Per cluster:
1. Group messages by sender within the cluster.
2. Take pairs of messages by the same sender stating something about the same theme.
3. Generate candidate pairs by keyword overlap (top 50 candidates per cluster).
4. LLM judge: prompt receives both messages, returns `{ contradictory: bool, summary: string }`.
5. Keep contradictions with confidence above threshold; cross-reference message ids in the brief.

This is the only LLM-heavy step. Cap candidate pairs per cluster to bound spend.

#### 3d. Citation format

Settings include:
- `citation_format: 'line_number' | 'msg_number' | 'bates'`
- `letterhead: boolean`
- `tone: 'factual' | 'pattern_emphasis' | 'contradiction_emphasis'`
- `themes: brief_theme[]` (which to include)
- `date_from`, `date_to`
- `senders: string[]` (filter)

Each generation re-runs against cached parser output (idempotency rule). Iterating settings is cheap because we don't re-parse the PDF or re-classify (results cached on the `briefs.result` JSONB).

#### 3e. PDF + DOCX rendering

PDF: extend `src/app/utils/generate-pdf.ts`. Add `renderBriefPdf(brief, messages, settings)`. Sectioned doc:
1. Cover page (firm letterhead, case caption, hearing date, exhibit index)
2. Pattern summary (bar chart + counts)
3. One section per theme: foundation paragraph, then messages chronologically with line numbers
4. Contradictions appendix with cross-references
5. Source attribution (date of OFW export, total messages parsed)

DOCX: `docx` npm package. Mirror the section structure, output to storage, return URL. Same cache key as the PDF — don't re-render unless settings change.

Both files watermarked "DRAFT — NOT FOR FILING" until `briefs.paid_at` is set. Watermark applied at render-time.

**Done when:** uploading a real (anonymized) OFW export produces a PDF + DOCX that a paralegal validates as "I would have done this in 6 hours and it would have looked like this."

### Phase 4 — Brief customization controls (~2 days)

UI on `firm/cases/[id].vue` for brief settings:
- Theme toggles (chips, multi-select)
- Date range picker
- Sender filter (multi-select from parsed senders)
- Tone-of-coverage selector
- Citation format dropdown
- Letterhead toggle

Each generation re-runs the pipeline against cached parser output. Iterating settings = cheap (no re-parse, re-categorize only the categorize step on settings change).

**Done when:** an attorney can regenerate a brief with different settings in under 10 seconds.

### Phase 5 — Per-case billing via Stripe (~1.5 days)

Pricing (see `gtm_local_firms.md` for rationale):
- $99 per brief (one-off)
- OR firm subscription $499/mo for unlimited briefs (1 attorney) / $999/mo (2–5 attorneys)

#### 5a. Implementation

Stripe Checkout flow keyed on `briefs.id`:

| Endpoint | Behavior |
|---|---|
| `POST /api/firm/briefs/:id/checkout` | Creates a Stripe Checkout session for the $99 one-off. Returns the URL. Client redirects. |
| `POST /api/firm/subscriptions/checkout` | Existing subscription pattern (reuse), but new price IDs for the firm tier. |
| Stripe webhook (existing handler) | On `payment_intent.succeeded`: set `briefs.paid_at`, store `stripe_payment_intent_id`, re-render briefs without watermark. |

#### 5b. Watermark handling

Cleanest implementation: render twice. The pipeline always produces the watermarked version up-front (so the attorney can preview). On payment, an Inngest event `brief/paid` triggers a re-render without the watermark; the new file replaces the old in storage.

Storage paths:
- `daylight-files/firm/{userId}/briefs/{briefId}/draft.pdf`
- `daylight-files/firm/{userId}/briefs/{briefId}/final.pdf`

The `briefs.pdf_storage_path` points to whichever is the current version. Same for DOCX.

**Done when:** attorney can generate, preview (watermarked), pay $99, and download clean files in one flow.

### Phase 6 — Internal "Brief Sandbox" lab (~0.5 days)

Add to `src/app/pages/internal/index.vue` a working sandbox:
- Drop in a sample OFW PDF
- See the parsed messages
- Step through categorization → contradictions → patterns → foundation
- Render a preview brief

Useful for evals, demos, debugging — and a fast loop on prompt tuning without going through full firm onboarding.

## Quality bar before launch

The eval bar before turning this on for paying customers: **5 paralegals validate 5 different cases as production-quality.** Concretely:

- Provide each paralegal an anonymized OFW export they haven't seen.
- They write a brief manually (timed) and we generate one with Daylight.
- Blind comparison: which is "production-quality"?
- 5/5 must rate Daylight's output ≥ "I would file this with light edits."

Document the evals in `internal_docs/20260425_sift_integration/brief_evals/` with anonymized fixtures.

## Open product questions

1. **Should the parent get a copy?** If the firm is the buyer and the parent isn't a Daylight user, do we offer the parent free read-only access to the brief their attorney generated? Probably yes — it aligns with the transparency message and is a quiet acquisition channel — but opt-in by the firm.
2. **Bates numbering vs. line numbering?** Default to line numbers (most common), expose Bates as an option.
3. **PII handling.** Briefs contain sensitive content about minors. Default 90-day retention; attorney can extend or delete on demand. Delete on subscription cancellation.
4. **Multi-jurisdictional citation format.** Real but deferrable. Default to a sensible neutral format; let attorneys override.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Quality bar non-negotiable.** A bad brief in court is worse than no brief. | Don't ship until the 5/5 eval bar is met. Watermark draft outputs prominently. |
| **Hallucinated citations.** | Same risk as Plan 02. Every cited message id is validated against the parser's output post-render; any unmatched citation strips and logs an error. |
| **Letterhead chaos.** Letterhead PDFs come in 1000 variations. | Ship a small set of supported templates first (top-banner, side-banner, plain). Reject PDFs that don't fit and ask the attorney to send a clean version. Don't let template diversity become the bottleneck. |
| **Authentication / chain-of-custody.** | Cover-sheet language: *"This document organizes records from OFW's authenticated message report. Authentication of the underlying OFW report is the responsibility of counsel."* The attorney lays foundation in court. |
| **DOCX rendering bugs in legal-edit pipelines.** Some firms run macros on imports. | Generate clean docx (no embedded styles, no macros). Test against Word for Mac, Word Online, Google Docs import. |
| **Bill at the wrong moment.** Watermarked DRAFT is downloadable; some attorneys may try to file the draft. | Watermark prominent on every page (not just header). Cover sheet says "DRAFT — NOT FOR FILING." Filename includes "DRAFT". |

## Out of scope

- Drafting the motion the brief attaches to (Paxton AI's territory).
- Practice management features (Aparti / Clio / MyCase territory).
- E-filing integration.
- Multi-source ingestion beyond OFW (texts, emails, screenshots) — Phase 7 once the OFW workflow is proven.
- Attorney-to-attorney sharing.
- Subdomain split (`firm.daylight.legal`) — defer until the firm side is its own product.

## Definition of done

A local family-law attorney we don't know personally signs up, uploads a real OFW export, gets a brief back, files it in court, and tells one other attorney about us. That's the chain.

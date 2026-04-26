# Internal Docs

Planning docs, specs, research, and after-actions for Daylight. Folders are dated
(`YYYYMMDD_slug/`) so they sort chronologically.

New plan? Create `YYYYMMDD_slug/implementation_plan.md` (or a `README.md` index
when the push spans multiple plans, like `20260425_sift_integration/`). Keep
specs, research, and after-action notes in the same folder.

## Reference (living docs)

| Path | What it is |
|------|------------|
| `openai_usage.md` | Cheat-sheet for OpenAI SDK + AI SDK patterns used in this repo. Mirror of `~/claude-ops/conventions/openai_usage.md` — that one is canonical. |
| `analytics_guide.md` | Analytics event taxonomy and logging framework. |
| `vision_doc.md` | Project vision and strategy. |
| `founder_custody_experience.md` | Lived-experience reflection that informs product direction (esp. OFW ingest). |
| `voice_extraction_schema.md` | Schema for what gets extracted from voice notes. |
| `evidence_communications_schema.md` | Schema for text/email/screenshot evidence. |
| `auth_fix_reference.md` | Supabase auth pattern reference (JWT `sub` vs `id`, cookie config). |

## Shipped & historical plans

| Folder | What it covers |
|--------|----------------|
| `20251201_mvp_roadmap/` | Pre-launch polish roadmap for the law-firm-ready MVP. |
| `20251202_branding_analysis/` | Branding & naming research (v1 + v2 reframe). |
| `20251202_background_jobs/` | Inngest integration: basics, implementation proposal, dev-server experience. |
| `20251202_journal_entry_pivot/` | UI/UX pivot from event-first to journal-first. |
| `20251203_ai_extraction_improvement/` | 4-phase AI extraction improvement plan + prod safety analysis. |

## In progress

| Folder | Status |
|--------|--------|
| `20260425_sift_integration/` | Multi-plan push: OFW ingest, chat-over-evidence, attorney share, evidence brief. See folder README. |

## Reports

`reports/` holds one-off analytical writeups (cohort reviews, funnel retros,
"what happened with X?"). See `reports/README.md` for the genre and when to
write one.

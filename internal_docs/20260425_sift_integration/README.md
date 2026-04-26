# Sift Integration — Daylight v2 Push

**Date:** 2026-04-25 (rewritten 2026-04-26)
**Branch:** `plan/sift-integration-rewrite`
**Status:** Plans only. Each ships independently behind a flag once Plan 00 is in.

## Why

Daylight, ClearLine, and Sift are three repos pursuing the same thesis: turn the chaos of a custody case into court-ready evidence. They were never meant to ship as three products. This push consolidates the highest-leverage pieces from Sift and AIR-Bot into Daylight so the user-facing app gets:

1. **OFW message ingestion** — the moat. Every contested custody case in the US generates Our Family Wizard exports; nobody else has this productized.
2. **Conversational investigation over evidence** — "show me every late pickup since March," "summarize the medical decisions we disagreed on."
3. **Attorney share workspace** — the thinnest possible v0 of the law-firm side. Turns paying parents into a referral channel into family-law firms.
4. **Evidence brief generator (firm-side)** — top-down GTM motion: firms upload an OFW export, get a court-ready exhibit packet.

Together these shift Daylight from "voice journal for parents" to "the case workspace your attorney also wants you to use."

## What changed in this rewrite (2026-04-26)

The original plans (commit a77bfd0) sketched the four ideas but assumed primitives the codebase doesn't have. After deep-reading the codebase, several alignment kinks would have caused runtime errors or design churn mid-implementation:

- **Every plan assumed `case_id` foreign keys** on events / evidence / journal entries. Today those tables are `user_id`-scoped only; the `cases` table (since migration 0010) is metadata-only. → Added **Plan 00** to migrate this once, cleanly, before anything else.
- **The bucket name** is `daylight-files`, not `evidence`. Plans referenced both — fixed.
- **The journal flow** lives at `/api/journal/submit`, not `/api/journal`. Inngest event payloads now match what `journal-extraction.ts` actually receives.
- **The auth helper** is `requireUserId(event, supabase)` — every new endpoint uses it instead of inventing a parallel pattern.
- **`find_contradictions`** originally said "vector + keyword retrieval." There is no vector store. Re-spec'd as keyword retrieval that returns *candidates* the agent must caveat.
- **Email infrastructure** is missing. Plan 03 now starts with a Phase 0 to add Resend before the invite flow needs it.
- **The firm side** originally proposed a parallel `firm_cases` table with polymorphic FKs on `messages`. Re-spec'd as a `kind` column on the existing `cases` table — every downstream query stays simple.
- **Citation hallucination** was a noted risk but the validation step wasn't specified. Now lives in `src/server/utils/citations.ts` with an explicit post-stream validation pass.
- **The case selector** in the sidebar was out-of-scope; folded into Plan 00 since it's the natural home for the new "active case" concept and lifts cleanly from the [`nuxt-ui-templates/dashboard`](https://github.com/nuxt-ui-templates/dashboard) `TeamsMenu` component already used by the layout chrome.

The old plans are in git history; nothing is lost.

## Plans in this folder

- [`00_case_scoping_refactor.md`](./00_case_scoping_refactor.md) — **prereq.** Adds `case_id` to events / evidence / journal_entries, backfills, plus a sidebar case switcher modeled on the dashboard template's `TeamsMenu`. ~1 day. Removes a class of footguns from every other plan.
- [`01_ofw_ingest.md`](./01_ofw_ingest.md) — port the standalone OFW PDF parser, add a `messages` table + `ofw_export` evidence type, render messages on the timeline alongside events.
- [`02_chat_over_evidence.md`](./02_chat_over_evidence.md) — port AIR-Bot's chat plumbing (Vercel AI SDK + tool-calling + streaming UI + chats table) and wire it to Daylight's evidence model. Includes the citation validation pass.
- [`03_attorney_share_workspace.md`](./03_attorney_share_workspace.md) — invite an attorney to a case as a read-only collaborator. Smallest possible step toward the two-sided product. Includes Resend email infrastructure as Phase 0.
- [`04_evidence_brief.md`](./04_evidence_brief.md) — firm-side product. OFW → categorized + contradiction-flagged exhibit packet (PDF + DOCX). Per-brief or subscription billing.
- [`gtm_plan.md`](./gtm_plan.md) — go-to-market plan (unchanged).
- [`gtm_local_firms.md`](./gtm_local_firms.md) — local-firm GTM plan (unchanged).
- [`research_local_firm_pain_points.md`](./research_local_firm_pain_points.md) — discovery research (unchanged).

## Sequencing

```
            ┌── 01 OFW ingest ──┐
00 ────────┤                    ├── 02 Chat over evidence ──┐
prereq     │                    │                          ├── ship together
            └────────────────────┘                          ┘
                                                            │
                                                  03 Attorney share (B2C-viral)
                                                            │
                                                  04 Evidence brief (B2B-direct)
```

Plan 00 is the gate. Plans 01 and 02 unlock parent-side value. Plans 03 and 04 are parallel paths into the law-firm market — viral (parent invites attorney) and direct (firm signs up). Each plan is independently shippable behind a flag once Plan 00 is live.

Every plan documents its own "Depends on" line at the top so the dependency graph is local to each file.

## Source repos to lift from

| What | From repo | Path |
|---|---|---|
| **OFW PDF parser** (standalone, 376 lines, validated on a 1,271-message real case) | `ofw-parser` | `server/utils/ofw-parser.ts` |
| OFW upload endpoint reference | `ofw-parser` | `server/api/parse.post.ts` |
| OFW PDF parser (alt — Sift's, 696 lines, useful only for tricky-export edge cases) | `Sift` | `src/server/utils/ofw-parser.ts` |
| Chats table + serializer | `AIR-Bot` | `dashboard/server/utils/chats.ts` |
| Chat tool factories | `AIR-Bot` | `dashboard/server/utils/chatTools.ts` |
| Chat HTTP endpoints | `AIR-Bot` | `dashboard/server/api/chats.{post,get}.ts`, `chats/[id].{post,get,delete}.ts` |
| Chat list & detail pages | `AIR-Bot` | `dashboard/app/pages/chat/{index,[id]}.vue` |
| `MessageContent` renderer | `AIR-Bot` | `dashboard/app/components/chat/MessageContent.vue` |
| `TeamsMenu` (model for `CaseSwitcher`) | `nuxt-ui-templates/dashboard` | `app/components/TeamsMenu.vue` |

Treat all source repos as **read-only references**. Lift code; do not symlink. Daylight needs to own its copy.

## Proof point

A working three-phase pipeline (parse → AI evidence matching → report) has already been demonstrated on a real contested-custody case: 1,271 messages across 180 threads, 15 hours of paralegal review compressed to 15 minutes, < $5 in API cost. See [*"How AI turned 15 hours of legal review into 15 minutes"*](https://www.monumentlabs.io/blog/how-ai-turned-15-hours-of-legal-review-into-15-minutes). Plan 04 productizes this exact pipeline.

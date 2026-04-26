# Sift Integration — Daylight v2 Push

**Date:** 2026-04-25
**Branch:** `feat/sift-integration-plans`
**Status:** Plans only. Each plan ships independently behind a flag.

## Why

Daylight, ClearLine, and Sift are three repos pursuing the same thesis: turn the chaos of a custody case into court-ready evidence. They were never meant to ship as three products. This push consolidates the highest-leverage pieces from Sift and AIR-Bot into Daylight so the user-facing app gets:

1. **OFW message ingestion** — the moat. Every contested custody case in the US generates Our Family Wizard exports; nobody else has this productized.
2. **Conversational investigation over their own evidence** — "show me every late pickup since March," "find contradictions between his messages and the schedule," "summarize the medical decisions we disagreed on."
3. **Attorney share workspace** — the thinnest possible v0 of the law-firm side. Turns paying parents into a referral channel into family law firms.

Together they convert Daylight from "voice journal for parents" to "the case workspace your attorney also wants you to use."

## Plans in this folder

- [`01_ofw_ingest.md`](./01_ofw_ingest.md) — port Sift's OFW PDF parser, add a new evidence-source type, render messages on the timeline alongside events.
- [`02_chat_over_evidence.md`](./02_chat_over_evidence.md) — port AIR-Bot's chat apparatus (Vercel AI SDK + tool-calling + streaming UI + chats table) and wire it to Daylight's data model.
- [`03_attorney_share_workspace.md`](./03_attorney_share_workspace.md) — invite an attorney to a case as a read-only collaborator. Smallest possible step toward the two-sided product.
- [`gtm_plan.md`](./gtm_plan.md) — go-to-market plan for the resulting product.

## Sequencing

Plan 01 unlocks the moat. Plan 02 makes the moat useful. Plan 03 unlocks the GTM motion. Recommended order is the file order. Each is independently shippable.

## Source repos to lift from

| What | From repo | Path |
|---|---|---|
| **OFW PDF parser (use this — standalone, 376 lines, battle-tested on 1,271-message real case)** | `ofw-parser` | `server/utils/ofw-parser.ts` |
| OFW upload endpoint reference | `ofw-parser` | `server/api/parse.post.ts` |
| OFW PDF parser (alt — Sift's, 696 lines, useful only as a reference for tricky-export edge cases) | `Sift` | `src/server/utils/ofw-parser.ts` |
| Chats table + serializer | `AIR-Bot` | `dashboard/server/utils/chats.ts` |
| Chat tool factories | `AIR-Bot` | `dashboard/server/utils/chatTools.ts` |
| Chat HTTP endpoints | `AIR-Bot` | `dashboard/server/api/chats.{post,get}.ts`, `chats/[id].{post,get,delete}.ts` |
| Chat list & detail pages | `AIR-Bot` | `dashboard/app/pages/chat/{index,[id]}.vue` |
| `MessageContent` renderer | `AIR-Bot` | `dashboard/app/components/chat/MessageContent.vue` |

Treat all source repos as **read-only references**. Lift code, do not symlink. Daylight needs to own its copy.

## Proof point

A working three-phase pipeline (parse → AI evidence matching → report) has already been demonstrated on a real contested-custody case: 1,271 messages across 180 threads, 15 hours of paralegal review compressed to 15 minutes, < $5 in API cost. See [*"How AI turned 15 hours of legal review into 15 minutes"*](https://www.monumentlabs.io/blog/how-ai-turned-15-hours-of-legal-review-into-15-minutes). Plan 04 productizes this exact pipeline.

# Daylight — Go-to-Market Plan

**Date:** 2026-04-25
**Author:** Monument Labs
**Audience:** Internal — founder + close advisors

---

## TL;DR

Daylight already has the consumer-side product. After the Sift integration push (OFW ingest, chat-over-evidence, attorney share), Daylight becomes the only family-law evidence workspace with (a) a live OFW parser, (b) cited conversational investigation, and (c) a built-in attorney share moment. The GTM is a two-wedge motion: capture self-represented and represented parents through SEO + community channels, and use the attorney-share moment to land the law-firm side without a separate sales motion. The 90-day goal is **50 paying parents and 3 paying firms.**

---

## Positioning

> Daylight is where a parent in a custody case turns chaos into evidence — a private, court-ready record built from voice notes, screenshots, and Our Family Wizard messages, that their attorney can also use.

What we are not:
- Not legal advice.
- Not a co-parenting communication app (OFW is the incumbent; we read its data, we don't replace it).
- Not a generic family organizer (Cozi, OurHome).
- Not a divorce platform (Hello Divorce, Wevorce).

The wedge sentence we want every visitor and every attorney to internalize: **"Upload your OFW export, see your case organized in 60 seconds, free."**

---

## Two ICPs, one product

### ICP 1 — Self-represented or represented parent in active custody

**Who:** Parent, 30–55, in or anticipating a custody dispute. Court-ordered to use OFW or similar. Has been keeping notes in Notes app, Google Doc, or nothing. Has a pile of screenshots. Searches for help at 2 AM.

**Pain:** Their attorney bills hourly to organize the chaos, or they're self-represented and drowning. They don't trust the other parent's recall or honesty. They are afraid of forgetting something that matters.

**JTBD:** "Help me show up to court with the truth in order, so I don't lose time with my kid because I couldn't keep up with paperwork."

**Pricing:**
- **Free:** Voice journal, manual events, 1 OFW preview (analyzes but doesn't persist messages).
- **Personal $19/mo:** Full OFW import, full timeline, AI chat, 5GB.
- **Personal Pro $39/mo or $149 case-prep one-time:** Court-ready PDFs, unlimited storage, attorney share, priority extraction.

### ICP 2 — Solo / small family-law firm (1–10 attorneys)

**Who:** Family law attorney at a small firm. Spends billable hours organizing chaotic client evidence. Has 20–80 active cases. Knows the big-firm tools (Clio, MyCase) and finds them overbuilt for evidence work specifically.

**Pain:** Clients arrive with disorganized evidence. The attorney's paralegal spends 4–8 hours per case prepping for hearings. The firm can't bill for that prep at full rate. Clients in crisis text the attorney's personal cell at 11 PM.

**JTBD:** "Cut 6 hours of evidence-prep work per case, and give my clients a place to dump their chaos that doesn't end up in my inbox."

**Pricing:**
- **Firm $149/seat/mo:** Per-attorney access to client cases, branded PDF exports, request-an-export workflow.
- **Firm Pro $299/seat/mo (later):** Multi-case dashboard, client roster, intake automation, custom export templates.

---

## Wedge sequence

The order matters. Each step lowers the cost of the next one.

### Wedge 1 — Free OFW analyzer (acquisition)

A landing page at `daylight.legal/ofw` that lets anyone upload an OFW PDF and get a 1-page analysis: total messages, response-time stats by sender, missed-message flags, top topics, sample contradictions. No account required for the preview; gated by email to download the full report. Backed by the same parser as Plan 01.

This is the SEO + paid-search hook. Search intent is real and unmet — "OFW message export," "Our Family Wizard PDF analysis," "custody messages organize" all currently return generic divorce content.

**Conversion target:** 8% of free uploads convert to paid trial within 7 days.

### Wedge 2 — Paid personal account (monetization)

Standard freemium ladder. Voice journal + manual capture is the free hook; OFW import + AI chat + court PDFs are paid.

**Conversion lever:** the chat agent (Plan 02) is the moment users feel the magic. The first time it answers "show every late pickup in March" with cited evidence, retention jumps. Make it the second-screen experience after first OFW import.

### Wedge 3 — Attorney share (firm acquisition, no sales motion)

Plan 03 ships invite-my-attorney. Every paying parent who's represented hits a CTA in the first export flow: "Send this to your attorney." The attorney lands in the case, learns the product, and is asked at the bottom of their second visit: "Want to use this with another client?"

This is the path to firm revenue **without a sales team**. We measure success as: how many attorneys come in via 2+ different parents within 30 days. That's our buying-signal metric.

### Wedge 4 — Direct firm sales (only after Wedge 3 produces signal)

After 5+ firms show up via Wedge 3, build a slim outbound motion. Targets are family-law firms in Virginia first (existing network, easier intros), then DC/MD, then state-by-state.

**Channel:** state family-law section meetings (CLE talks), Virginia Bar Family Law Section, county-level family law associations. Kyle's veteran + Marine background opens doors with veteran-spouse attorneys; Daylight has a natural angle for military-divorce cases (frequent custody disputes, OFW-mandated, deployment-related schedule chaos).

---

## Channels

### Organic search (priority 1)

Target the query stack:
- "OFW message export analysis"
- "Our Family Wizard download messages PDF"
- "custody journal app"
- "evidence for custody hearing"
- "court-admissible custody log"
- "custody documentation app"
- "co-parenting evidence organizer"

10 cornerstone articles in 90 days, written in human voice (not AI-voice — see `~/claude-ops/conventions/`). Each links to the free OFW analyzer.

### Communities (priority 2)

- /r/Custody, /r/Divorce, /r/Coparenting, /r/Divorce_Men, /r/SingleMothers — be useful first; founder voice; never spam.
- Facebook groups: "Coparenting Communication," "High Conflict Divorce," military-spouse divorce groups.
- TikTok / Instagram: low-volume founder content. One short video per week showing a real-world workflow ("here's how I'd organize three months of OFW messages in 90 seconds"). The product itself is the demo.

### Paid search (priority 3, after organic baseline)

Google Ads on the high-intent terms above. Budget cap $1.5k/mo to start. Only turn on once the free OFW analyzer is converting at 6%+.

### Attorney channels (priority 4, asynchronous with Wedge 3)

- 1 CLE talk in Q3 — Virginia Bar Family Law Section. "Modernizing Evidence Workflows in Custody Cases."
- Quiet outreach to 20 family-law attorneys in Kyle's network for the v0 attorney share pilot.
- Veteran-attorney + military-divorce-attorney angle — defensible niche, real network.

### What we are not doing

- No paid LinkedIn ads (too expensive for this stage).
- No conferences with a booth.
- No content partnerships with divorce influencers (brand risk).
- No "AI for lawyers" generic positioning — we are family-law specific.

---

## Pricing rationale

| Tier | Price | What it costs us | What we test |
|---|---|---|---|
| Free | $0 | ~$0.05 per OFW preview | Acquisition rate |
| Personal | $19/mo | ~$2 LLM + storage | Magic-moment conversion |
| Personal Pro | $39/mo or $149 one-time | ~$4 LLM | Court-prep willingness to pay |
| Firm | $149/seat/mo | ~$8 LLM | Attorney perceived value |

Personal Pro **one-time pricing is intentional**. Many users have a single hearing and don't want a subscription. $149 is below the "small line item" threshold for someone facing $5k+ in legal fees. Bet: one-time payers are the better acquisition channel — they tell their attorney, who becomes the firm seat.

---

## 90-day plan

### Days 1–30

- Ship Plan 01 (OFW ingest) end-to-end behind a flag.
- Ship the free OFW analyzer landing page (uses Plan 01's parser, no account required).
- Publish 4 cornerstone SEO articles.
- Recruit 10 beta parents from /r/Custody and Facebook groups; get 5 paid.
- Recruit 3 friendly attorneys from Kyle's network for the share-workspace pilot.
- **Success bar:** 100 free OFW analyses run, 10 paid signups, 1 attorney has used the workspace.

### Days 31–60

- Ship Plan 02 (chat over evidence) behind a flag, then to all paid users.
- Publish 4 more cornerstone articles.
- Begin paid Google Ads with $750/mo budget.
- Ship Plan 03 (attorney share) to all paid users.
- **Success bar:** 25 paid parents, 5 attorneys active in the workspace, 1 firm has seen 2+ clients arrive with Daylight.

### Days 61–90

- Open paid firm tier, $149/seat/mo, to the 5 active attorneys at a 50% pilot discount.
- First CLE talk pitch submitted (target Q3 Virginia Bar event).
- Expand SEO content to 12 articles total.
- Decide raise vs. bootstrap based on traction (target gates: $3k MRR, 2 paid firms, 3+ inbound attorney inquiries).
- **Success bar:** 50 paying parents, 3 paying firms, $4k MRR.

---

## Success metrics (read these weekly)

| Metric | Target by day 90 | Source |
|---|---|---|
| Free OFW analyses run | 600 | landing page analytics |
| Paid parents | 50 | Stripe |
| Paid firms | 3 | Stripe |
| MRR | $4,000 | Stripe |
| Free → paid conversion (7-day) | 8% | analytics |
| Attorneys invited via share flow | 30 | `case_collaborators` table |
| Attorneys accepting invite | 18 | same |
| Firms with 2+ clients on Daylight | 2 | derived from case_collaborators |

If we hit the parent number but miss the firm number, the GTM is working but Plan 03 is undercooked — invest there.
If we hit the firm number but miss the parent number, the GTM is working but the consumer wedge is undercooked — invest in SEO + free analyzer.
If we miss both, the moat isn't sharp enough — go back to product.

---

## What could kill this

- **OFW changes their export format.** Mitigation: write parser tolerantly, monitor parse-failure rate weekly, have Sift's parser-test pipeline running in CI against a corpus of real exports.
- **A big legal-tech incumbent ships an OFW parser.** Possible but unlikely — Lawhive, EvenUp, Supio are all in adjacent verticals. Watch quarterly.
- **Privilege / confidentiality concerns scare off attorneys.** Mitigation: get a family-law attorney to bless our disclosures before Plan 03 launch.
- **Consumer churn after the case ends.** Real risk — most users have a 6-12 month case window. Acceptable. The one-time Pro pricing is designed for this; LTV math should assume short windows.
- **Brand association with "AI for divorce" goes badly.** Be careful with marketing voice. We are evidence software, not a divorce app. Never use the word "divorce" in primary positioning.

---

## Open questions for Kyle

1. Are we comfortable framing this as evidence software (not legal-tech, not divorce-tech)? The category positioning is load-bearing for the next 12 months.
2. Is the firm wedge a Monument Labs offering or a Daylight company offering? If the latter, pricing and brand decisions need to start now.
3. How do you feel about the military-divorce niche as the firm-side beachhead given your Marine background? It's a strong wedge but commits you to a specific community.

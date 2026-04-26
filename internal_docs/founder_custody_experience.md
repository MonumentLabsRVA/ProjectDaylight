# Daylight: From Lived Experience to Product Direction

*A reflection on what custody documentation actually demands of a parent — and how that shapes what Daylight should be.*

---

## Why this document exists

Daylight wasn't conceived in a vacuum. It came out of a real custody process — the kind that turns ordinary parents into amateur paralegals overnight. This document captures the texture of that experience, with enough remove to be useful as product input, and connects it to where the product is heading next: specifically, ingesting and indexing OurFamilyWizard (OFW) message archives so the parent — and their AI agent — can reason over them alongside their journal entries.

The goal here isn't a personal narrative. It's a translation layer: turning lived friction into product specifications.

---

## The shape of the experience

A contested custody situation produces a strange kind of cognitive load. The parent is still doing the parenting — pickups, bedtimes, lunch packing, doctor's appointments — while simultaneously running what amounts to a low-grade litigation operation. Both jobs are full-time. Neither pauses for the other.

A few things stand out about how that load actually feels day-to-day:

**The volume is relentless.** Co-parent communications stack up fast. A single month can produce hundreds of OFW messages. Some are scheduling, some are operational ("she has a runny nose, gave her Tylenol at 2pm"), some are passive-aggressive, and a small handful are actually legally significant. None of them are labeled. They all live in the same inbox.

**The signal-to-noise ratio is brutal.** The single sentence that matters in a discovery response, or the one offhand admission that contradicts a sworn statement, is buried in three months of mundane logistics. Finding it later requires either an extraordinary memory or an enormous amount of scrolling.

**Memory is not reliable.** Under stress, with a toddler, working full-time, and sleeping poorly, the parent's recall of "when did that thing happen?" gets fuzzy fast. Did she say that in October or November? Was that before or after the move-out conversation? The brain does not file these things neatly when they're happening. They blur.

**The legal system runs on chronology.** Every filing, every attorney conversation, every guardian ad litem question, every mediator framing — all of it requires a timeline. Dates, sequences, "what came first." The parent has to reconstruct this on demand, often under pressure, often from memory plus a chaotic mix of texts, OFW threads, emails, and screenshots.

**Lawyers and GALs need synthesis, not raw data.** Handing an attorney a 400-message OFW export is not helpful. They charge by the hour. What they actually need is "here are the three threads where the other parent contradicted herself on the schedule, with timestamps." Producing that synthesis is the parent's job. It's also the parent's bottleneck.

**Forms are everywhere.** GAL information sheets. Custody questionnaires. Discovery responses. Each one asks for narrative answers grounded in specific dates, incidents, and patterns. Each one is a separate exercise in pulling from the same underlying record. A parent who can't quickly query their own life ends up either underdocumenting (weakening their case) or overproducing (irrelevant content that dilutes the strong stuff).

**Patterns matter more than incidents.** A single late pickup is nothing. Six late pickups in a quarter is a pattern. A handful of contradictory statements about schedule preferences over six months is a pattern. The legal weight lives in the aggregate, not the individual data points. But aggregating requires either obsessive manual tracking or a system that does it for you.

**Emotional tax is the real cost.** Re-reading hostile messages to find a fact is its own kind of harm. Every search through the archive is a small re-exposure to the worst version of the relationship. The parent ends up avoiding the archive precisely when they need it most.

---

## What current tools get wrong

OFW and its peers (Talking Parents, AppClose, Custody X Change) are built around the assumption that the hard problem is *capture* — getting communications into a court-admissible format. That problem is solved.

The hard problem now is *retrieval and reasoning over what's already been captured.* And on that front, the existing tools are surprisingly primitive:

- Search is keyword-based, often clunky, and doesn't understand semantics ("when did she change her mind about the Tuesday handoff?" is not a keyword query)
- There's no concept of pattern detection across messages
- There's no synthesis layer — you can read messages, but you can't ask questions about them
- Journal features and message archives don't talk to each other; they're separate data silos
- Nothing flags contradictions or pulls related threads together
- Nothing helps prepare for a specific upcoming event (a hearing, a GAL interview, a mediation session)

The parent ends up doing all of this manually. With AI tools that didn't exist three years ago, they shouldn't have to.

---

## How this maps to Daylight's mission

Daylight's positioning has been: *bring order to chaos when parents are at their lowest cognitive capacity.* Voice-first capture, AI extraction, court-ready output. That positioning still holds — but the lived experience above suggests the center of gravity should shift.

The product's mission can be sharpened to:

> **Daylight is the system of record and the reasoning layer for a parent's custody case. It captures what happens, indexes everything that has been said, and lets the parent — and their lawyer — ask real questions and get real answers.**

A few implications fall out of this framing:

**Capture is necessary but not sufficient.** Voice notes and screenshots and journal entries are inputs to the reasoning layer. They're not the product. The product is what you can do with them once they're indexed.

**The journal isn't the only data source.** OFW messages, text threads with the co-parent, emails about the child, calendar entries, and uploaded documents are all part of the same case record. Treating them as separate buckets is the mistake the existing tools make. Daylight should treat them as one corpus.

**The agent is the interface.** A parent shouldn't have to learn a query language or filter system. They should be able to ask "what did she say about Thanksgiving in October?" and get an answer, with citations back to the source messages. The agent does the retrieval; the parent does the thinking.

**Patterns and contradictions should be surfaced, not searched for.** The system should proactively notice things — "her position on the bedtime routine has shifted three times in two months" — and present them, rather than waiting for the parent to ask.

**Output should be drafted, not authored.** When it's time to fill out a GAL information sheet or respond to discovery, the agent should be able to produce a strong first draft pulling from the indexed corpus, with sources. The parent edits and approves; they don't start from a blank page.

---

## OFW parsing and chat-over-messages: the case for it

Adding OFW message ingestion is the right next move, and the lived experience above is the strongest argument for it. Here's the logic, structured:

### What changes when OFW messages are indexed alongside journal entries

The journal, on its own, is a one-sided record. It captures what the parent observed, voice-noted, or wrote down. That's valuable, but it's incomplete. The other half of the case record is the actual co-parent communications — the things the other party put in writing, on a court-admissible platform. Indexing both into a single corpus turns the journal from "my notes" into "my full case file."

Once that's done, the agent can answer questions that span both:

- "What did I write in my journal the day after she sent the message about pickup times being too rigid?"
- "Show me every time she's used the word 'unsafe' in OFW, with the surrounding context."
- "What was her stated reason for the schedule change in February, and how does that compare to what she said in March?"
- "Pull together everything related to the daycare decision — journal entries, OFW threads, and any uploaded emails."

These aren't keyword searches. They're synthesis tasks. They're what a paralegal would do if the parent could afford one. The agent over the indexed corpus is, functionally, that paralegal.

### What the technical shape probably looks like

Without going deep into implementation, the rough architecture:

- An OFW import flow that accepts the standard PDF or text export and parses it into structured records (sender, recipient, timestamp, subject, body, attachments)
- The same indexing pipeline that handles journal entries — semantic embeddings plus structured metadata
- A unified retrieval layer that the agent queries across all sources, with each result tagged by source type
- An agent loop that can iterate on a question, pulling related context as needed, and surfacing citations in its responses
- Optional: a passive layer that periodically scans the corpus for patterns (frequency shifts, contradictions, gap detection) and surfaces them as suggested topics for the parent to review

The parent's experience of all of this should be one input — natural language — and one output — clear answers with sources. Everything else lives behind the curtain.

### What this unlocks downstream

Once the corpus is indexed and queryable, a lot of the other features Daylight has discussed get easier:

- **Form drafting** (GAL sheets, discovery responses, custody questionnaires) becomes a templated agent task that pulls from the corpus
- **Hearing prep** becomes a conversation: "we have a temporary orders hearing on Thursday, what should I review?"
- **Attorney handoffs** become exports of pre-synthesized briefs rather than raw data dumps
- **Pattern alerts** (late pickups, contradicted statements, shifting positions) come from running standing queries against the corpus on a schedule
- **Cross-case reasoning** becomes possible — the same architecture works whether the case is custody, landlord-tenant, employment, or anything else where a non-lawyer needs to make sense of a paper trail

The OFW import is the wedge. The reasoning layer is the platform.

---

## What this changes about positioning

Daylight has been positioned against OFW and the other co-parenting apps as "the AI layer the existing tools don't have." That's still true, but the OFW ingestion changes the relationship. Daylight is no longer just adjacent to OFW — it's the layer on top of OFW that makes OFW's data actually usable.

That's a stronger position. It also opens up a clearer message to the parent:

> Keep using OFW for communication. Use Daylight to actually understand what's in it.

That framing avoids picking a fight with the entrenched player and instead sells Daylight as the missing piece of the workflow. Most parents in active disputes are already on OFW, often by court order. They don't need to switch tools. They need a tool that makes the one they already use work harder.

---

## Things the experience surfaced that Daylight doesn't address yet

Documentation and reasoning are the core of the product, and they should stay the core. But the process exposed a number of other pain points that fall outside the current scope. Some of these are real adjacent opportunities. Some are warnings about feature creep. Worth naming all of them so the choice is conscious.

**The attorney is a black box.** Most of the friction in a custody case isn't actually with the co-parent — it's with the parent's own legal representation. Lawyers don't return emails. Strategy questions get vague answers. The parent doesn't know what's happening between hearings, or what their attorney is doing with the information they've been sent. Weekly summary documents to counsel become a coping mechanism. There's a real product here in the form of "structured client-to-attorney communication" — pre-formatted briefs, status dashboards, action item tracking — but it changes Daylight from a parent-facing tool to a two-sided platform, which is a different business.

**The first attorney is often the wrong one.** The parent typically picks an attorney before they understand the case. By the time they realize the attorney is underqualified for high-conflict work, they've lost months and significant retainer money. There's no easy way to evaluate fit upfront. A version of this is solvable — checklists, reference questions, red flag detection — but it bumps into the unauthorized practice of law line and probably needs to live as content rather than product.

**Financial entanglement is its own war.** Custody is one front. The shared finances are another, often equally bitter, and the two get tangled on a daily basis (who paid for what, who owes whom, whose card is on the daycare account). Tracking expenses, reconciling shared accounts, and producing a clean financial record for disclosure is a real and separate workload. Daylight currently doesn't touch this. There are accounting tools and there are co-parenting tools, but nothing bridges them well.

**Logistics under stress.** Move-out coordination, lease handoffs, contractor disputes, household goods division, utility transfers — all of this happens during the worst weeks of the parent's life and creates its own paper trail of documented obligations and broken agreements. The pattern is the same as the custody pattern (decisions made under pressure, contradictions to find later, scheduling to coordinate) but the domain is different. A "logistics during separation" mode would be useful but would dilute the product's focus on the child.

**Emotional regulation in the moment.** When a hostile message arrives at 11pm, the parent's first draft response is almost always a mistake. They need a tool that helps them pause, draft, redraft, and not send something they'll regret. Daylight currently focuses on retrospective reasoning — what did happen — but a real adjacent product is prospective: what should I send, what tone, what to leave out. (DivorceX is already doing this, more on that below.)

**Real-time decision support during exchanges.** Custody handoffs are flashpoints. Knowing in the moment whether to engage, document, or de-escalate is a learned skill, and the parent learns it the hard way. A tool that's actually useful during the exchange — not just for after-the-fact documentation — could be valuable, but it requires the kind of confidence and ground-truth understanding that AI systems don't reliably have yet.

**Mental health and isolation.** This is the hardest gap to address and the one Daylight should probably stay out of. The process is genuinely isolating. The parent loses friends who don't know how to react, family members who minimize what's happening, and time for the relationships they have left. Therapy helps. Peer support helps. AI does not, except as a momentary sounding board, and trying to position Daylight as emotional support is the fastest way to undermine its credibility as a serious tool. The right move is to know where to refer out, not to try to absorb that function.

**Children's experience.** The kid is going through this too, and the existing custody tooling barely registers their presence as anything other than a logistics object. There's a product space here for child-facing or child-aware tools (age-appropriate explanations, transition planning, stability anchors) but it's a separate product, not a Daylight feature.

**Discovery production.** When discovery requests come in, the parent has to produce responsive documents from across their entire digital life. Sorting through years of texts, emails, photos, and screenshots to find what's responsive (and what's privileged, and what's irrelevant) is a substantial undertaking. Daylight indexes the parent's case record but not their general digital life. Bridging that gap — privilege tagging, responsive flagging, redaction support — is a real adjacency, and probably more interesting on the attorney side of the product than the parent side.

**Post-resolution.** Most custody products assume an active dispute. What happens after the order is entered? The pattern continues: noncompliance, modifications, new disputes, contempt motions. Daylight is well-positioned to keep being useful here, but the messaging and pricing have been built for the active-dispute moment. Maintaining the user past the trial date is its own design problem.

---

## Potential directions

A non-exhaustive list of where the product could plausibly go, ordered roughly by how aligned each is with the current core. Treat this as a menu, not a roadmap.

**Adjacent expansions of the corpus** *(highest alignment)*. After OFW, the obvious next sources are: SMS/iMessage exports, email forwarding (already on the roadmap), text exports from TalkingParents and AppClose, and forwarded screenshots from any other channel. Each one extends the case record without changing the product's center of gravity.

**Form drafting and discovery support.** Once the corpus is indexed, GAL information sheets, discovery responses, custody questionnaires, and financial disclosure narratives become templated drafting tasks. This is high-value, defensible, and a natural extension of the reasoning layer.

**Hearing prep mode.** A focused interface for the days leading up to a hearing or mediation: review key threads, draft talking points, surface the strongest evidence for specific claims, generate exhibit summaries. Could be a premium one-time package rather than a subscription tier.

**Attorney-facing companion.** A version of Daylight pitched to attorneys as a way to receive structured case updates from clients. Lower price point, distribution through the attorney channel, and a clean handoff from the parent's account. Risk: changes the business model from B2C to B2B2C, with all the complexity that implies.

**Pre-litigation positioning.** The earliest user is the parent who hasn't filed yet but knows it's coming. They need to start documenting *before* OFW exists, before there's an attorney, before there's a structure. A simpler "start your record" entry point — voice notes, journal, photo upload, eventual export — could capture users earlier in the funnel and make the eventual upgrade to full Daylight obvious.

**Pattern alerts and scheduled reasoning.** Standing queries that run against the corpus on a schedule and surface things to the parent: shifts in tone, frequency changes, new contradictions, gaps in documentation. Push, not pull. Most documentation tools require the user to ask. This product could notice and tell.

**The B2B play to family law firms.** A version of Daylight licensed to firms, with attorney dashboards, client portals, and case-level analytics. This is the path to recurring contract revenue but also the path to becoming a different company. The current Aparti, Filevine, Smokeball, and Clio direction shows what this looks like, and they're well-funded.

**Adjacent verticals.** Landlord-tenant disputes, employment cases, contested estate matters, small claims — anywhere a non-lawyer needs to make sense of a long paper trail to a non-trivial legal outcome. The architecture transfers. The brand and positioning don't, easily.

---

## Competitive landscape

The custody and divorce tech space has shifted significantly in the last year. AI-native entrants are appearing, the incumbents are starting to add AI features, and the firm-side and consumer-side markets are converging in interesting ways. Worth looking at both sides.

### Consumer-facing tools

**OurFamilyWizard.** The dominant incumbent. Court-ordered in many jurisdictions. Messaging, calendar, expense tracking, journal. Pricing around $120-180/year. The data Daylight wants to ingest. Their AI features so far have been minor (tone alerts, basic summaries). They have the user base and the court relationships but are not moving fast on AI. This is the moat for Daylight: OFW is the system of record, Daylight is the reasoning layer. As long as OFW doesn't seriously invest in semantic search and synthesis over their own data, the gap remains exploitable.

**TalkingParents.** Number two in the space. Has rolled out a "Sentiment Scanner + Writing Assist" feature that scans messages for tone before sending and rewrites for de-escalation. This is the most aggressive AI move from the incumbents so far. It's prospective (helps you write) rather than retrospective (helps you reason over what's been written), so it doesn't directly compete with the OFW-ingest play, but it does suggest the incumbents are starting to wake up.

**AppClose.** Free tier with paid premium. Court-trusted. Free accounts for survivors of domestic violence and military discounts. Strong on community trust, weak on AI. Not a direct competitor; more a complement.

**DivorceX.** This is the most relevant new entrant. Explicitly AI-native, positioned for high-conflict cases. Their pitch is essentially: draft calmer messages, document incidents, get next-step guidance, and translate legal documents to plain English. The overlap with Daylight is significant on the documentation and pattern-tracking side, and they've moved faster on the messaging-assist angle. They don't appear to be ingesting OFW archives or building a reasoning layer over the corpus, which is the wedge. But they're worth watching closely — same user, same insight, different product surface.

**LeLo.** Older client-driven case prep app. Journal, document storage, attorney portal. Has been around since 2016, hasn't kept pace with AI. More a reference point for what the early version of this category looked like.

**CustodyXChange, Custody Junction, 2Houses, Cozi, Coparently, Cent, coParenter.** Various flavors of calendar plus expenses plus messaging. None are AI-native. None are positioned for high-conflict use specifically. These are commodity utility apps; they fill out the long tail of the market but don't shape it.

**Bliss Divorce, ODR.com.** AI-mediation plays — different problem (resolving the divorce), different user (couples seeking settlement). Adjacent rather than competitive.

**The takeaway on the consumer side.** The space has one entrenched incumbent (OFW), one credible challenger (TalkingParents), a long tail of utility apps, and exactly one AI-native competitor (DivorceX) that overlaps with Daylight's core. The OFW ingestion play is differentiated and defensible because nobody else is doing it; the messaging-assist play is already taken and getting crowded. Daylight should lean into the wedge.

### Family law firm-facing tools

**Paxton AI.** Direct competitor on the firm side. Family-law-specific. Drafts parenting plans, child support motions, settlement agreements. Analyzes financial disclosures, custody evaluations, and communication logs. Reports 50-70% reduction in drafting time. This is the most directly relevant firm tool, and they're moving fast.

**Aparti.** Family-law-purpose-built practice management. Document automation, financial disclosure prep, client intake, court-form compliance. Positioning explicitly against general practice management (Clio, MyCase) on the grounds that family law has unique workflow demands. This is a credible category-builder on the firm side.

**Smokeball / Archie AI.** General legal practice management with AI assistant. Family law is one practice area among many. Strong on integration and security, weaker on family-law-specific workflows.

**Clio Duo.** Clio is the dominant general-practice tool; Duo is their AI layer. Document summaries, issue spotting, suggested responses. Family law attorneys use Clio heavily, but the AI features aren't tailored for family law specifically.

**MyCase, Filevine.** Other general practice management tools with various AI features. Filevine is moving aggressively on the AI-native pitch but is broad rather than family-law-specific.

**Harvey, CoCounsel, Lexis+ AI, Westlaw Precision, Spellbook.** General legal AI tools. Mostly used for research and drafting, not case management. Not direct competitors but part of the ambient stack a family law attorney is using.

**The takeaway on the firm side.** The firm market is more competitive and more capital-intensive. Paxton and Aparti are moving fast on family-law-specific AI, and the general practice management tools are adding AI features that are good enough for most firms. Entering this market means competing for the attorney's seat budget against well-funded incumbents. Probably a longer-term play, and potentially better entered via a B2B2C wedge — Daylight's parent-side product, sold to firms as a way to get better-organized clients, rather than a direct case management tool.

### Where Daylight actually competes

Layered against this map, Daylight's most defensible position is a specific one:

> **The AI reasoning layer over the parent's full case record — primarily their OFW archive and journal, eventually more — sold direct to the parent in active dispute, with attorney-facing features as a downstream expansion.**

That position avoids direct collision with:
- OFW (Daylight uses their data, doesn't replace them)
- DivorceX (different surface — retrospective reasoning vs. prospective drafting; both can coexist in a parent's stack)
- Paxton/Aparti (firm tools, not parent tools)
- Clio/Smokeball/Filevine (general practice management, not parent-side)

It does collide with:
- A future, more aggressive OFW that builds AI search over its own data
- A future DivorceX that adds OFW ingestion and a reasoning layer
- Whoever builds the obvious thing if Daylight moves slowly

The window for this wedge is real, but it's not unlimited.

---

## Risks and things to think through

A few things worth holding in mind as this gets built:

**Privacy and data sensitivity.** OFW messages are some of the most sensitive content a parent has. The handling, encryption, and access model needs to be considered carefully — both for the user's protection and because this is the kind of data where any breach is catastrophic for trust.

**Court admissibility.** The OFW export itself is admissible. Anything Daylight produces from it (summaries, syntheses, agent responses) is not, and shouldn't be presented as such. The agent's output is for the parent's and attorney's reasoning, not for the record. That distinction has to be clear in the UI.

**Hallucination and over-confidence.** An agent answering custody questions has to be conservative. Citations to source messages aren't a nice-to-have, they're a hard requirement. Every claim the agent makes should be traceable back to a specific message or journal entry.

**Emotional re-exposure.** Returning a parent to hostile messages — even for legitimate retrieval — has real cost. The agent's responses should default to summarizing rather than quoting verbatim, with the option to drill down only when the parent asks for it. Default to lower exposure, not higher.

**Scope creep.** The temptation will be to add more sources (text imports, email parsers, voicemail transcription, social media exports). Each new source compounds the value, but each one also adds parsing complexity and edge cases. OFW first. Get that right. Then expand.

---

## Closing

The case for OFW parsing and chat-over-messages isn't a feature decision — it's a recognition that the current product captures input but doesn't yet help the parent reason over it. The lived experience of going through this process is, more than anything, an experience of being unable to retrieve and synthesize one's own life on demand.

A custody case is, mechanically, a question of: what happened, when, in what order, and what does it mean? Every existing tool helps with the first part. Daylight, if built right, is the first one that helps with all four.
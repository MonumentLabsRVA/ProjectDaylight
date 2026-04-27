# Daylight: Top-of-Funnel Ad Launch Plan

A working plan for launching paid acquisition for Daylight, the voice-first custody documentation app. The goal here is to **ship one channel fast**, learn from real data, and avoid getting stuck in strategy.

---

## TL;DR

1. Launch **Google Search** ads only. Ignore everything else for now.
2. Create a **dedicated Daylight Google Ads account** (separate from Monument Labs).
3. Build a **paid-traffic landing page** that mirrors ad copy and converts on one action.
4. Run **$30/day for 14 days**, then evaluate.
5. Have **Claude Code do as much of the implementation as possible** — landing page, conversion tracking, copy variants.

---

## Why Google Search first

The audience already knows they have a problem. People in custody disputes are actively typing things like:

- "how to document custody violations"
- "OurFamilyWizard alternative"
- "co-parenting documentation app"
- "evidence for custody hearing"
- "best app for custody journal"

This is bottom-funnel intent. You don't have to convince anyone the problem exists — you just have to show up and convert. Reddit and TikTok both have great audiences but require creative iteration. Search just needs decent ad copy and a landing page that works.

---

## Account structure

### Use your monumentlabs.io email, but a separate Ads account

You don't need a whole new Google identity. The thing that has to be separate is the **Google Ads account** (with its own conversion data, audiences, billing) — not the Google login. One Google account (e.g. `kyle@monumentlabs.io`) can own and manage multiple Ads accounts.

**Setup:**

- Sign in to [ads.google.com](https://ads.google.com) with your existing `kyle@monumentlabs.io` Google account.
- Create a **new Ads account** specifically for Daylight. Name it something like "Daylight" or "Daylight - daylight.legal" so it's clear in the account switcher.
- Add billing (can be the same card as Monument; it's tracked separately per account).
- Install GA4 on `daylight.legal` as its own GA4 property (separate from any Monument Labs GA4 property).
- Link the Daylight GA4 property ↔ Daylight Ads account so conversion data flows back for smart bidding.

**Why this matters even though it feels like extra work:**

- Conversion history is the most valuable asset in an ads account — it trains smart bidding. You want Daylight's bidder learning Daylight's user, not getting confused by Monument experiments.
- If Daylight ever spins out, gets sold, or hits the point where someone else runs marketing, the entire account hands off cleanly.
- Reporting stays sane.

**Optional, recommended later:** Set up a Google Ads **Manager Account (MCC)** under your Monument email and link both Monument and Daylight Ads accounts under it. That way you have one login that sees all your client/product accounts in a tree. Not needed on day one — just know it's the clean structure once you have 2+ Ads accounts.

> **Note on `gcloud`:** `gcloud` is for Google Cloud Platform (Compute, Storage, BigQuery, etc.) — it does **not** manage Google Ads. Google Ads has its own API, but for launching one campaign the **web UI is faster** than scripting. Don't sink time into the Google Ads API for this. Claude Code handles everything *around* the ads (landing page, tracking, analytics, copy); the campaign itself gets clicked together in the Ads UI in about 30 minutes.

---

## The landing page

The current `daylight.legal` homepage is solid for organic / referral / partner traffic — it has nav, an attorney section, a security deep-link, and footers. That's the right call for a homepage. But paid traffic needs its own page that does **one thing**: convert a person who just clicked an ad about custody documentation into a signup.

### Core principle: message match

Whatever the ad headline says, the landing page H1 says almost word-for-word. If the ad says "Document custody incidents in seconds," the H1 says "Document custody incidents in seconds." Mismatched messages tank both quality score and conversion rate.

### What the homepage already gets right (reuse these)

The homepage's existing assets are strong and should be ported into the paid landing page wholesale:

- **The voice → timeline → export visual sequence** (the Marcus / late-pickup example). This is your single best conversion asset. Lead with it.
- **The "Custody case timeline & evidence summary" mock document.** This is the artifact this audience desperately wants to see — show it.
- **The three-step explainer** ("Talk into your phone → We transcribe and extract → Export when needed"). Clean, ports directly.
- **The security trio** (Encrypted, Your data stays yours, Backed up daily). Keep all three. This audience is rightfully paranoid.

### What the paid page should change vs. the homepage

- **Strip the global nav.** Paid landing pages have no escape hatches. Logo only, no links out.
- **Strip the footer down** to legal essentials (Privacy, Terms, Security) — required for Google Ads compliance, but no help/about/sitemap.
- **Drop the attorney section.** That's a different audience. Paid search traffic is the parent in the dispute, not the lawyer. Cut it.
- **One CTA, one verb.** The current page has "Start documenting free," "Try it now," "Generate your timeline," "Partner with us," "Start documenting." Pick one for paid — recommend "Start documenting free" — and use it everywhere.
- **Headline that matches ad copy.** The current "Just talk. We handle the rest." is good brand copy but weak for paid intent. Paid headline should be problem-named, not poetic. See variants below.

### Page structure for `/document` (or whatever route)

1. **Hero:** Problem-named H1, one-line subhead, primary CTA, hero visual (port the timeline mock from homepage).
2. **The 3-step explainer** (port from homepage).
3. **The voice → timeline visual** (the Marcus example — port from homepage).
4. **The court-ready export mock** (port from homepage).
5. **Security trio** (port from homepage).
6. **Final CTA** repeating the first.

That's it. Six sections. No attorney pitch, no nav, no extras.

### Testimonial — skip it for now

Don't include a testimonial on the paid landing page. Reasons:

- The audience is sophisticated and skeptical. They've been lied to. A founder-written quote attributed to a fake name is the kind of thing this audience clocks immediately, and the downside is bigger than the upside.
- The product visuals (the timeline mock, the export PDF) are doing more credibility work than a testimonial would.
- When you have a real beta user willing to be quoted (even with first name + city only), drop it in then. Until then, the page is stronger without.

If you want one piece of social proof in the meantime, the existing homepage trust badges ("Bank-level encryption • Attorney recommended • Admissible evidence") work — just port the strip into the paid page under the hero CTA.

---

## What Claude Code should build

Hand this section to Claude Code directly. The Daylight site is on Nuxt (per the existing stack), so this should slot in cleanly.

### 1. New landing page route

- Add a route like `/document` or `/get-started` (whatever fits the existing site's URL convention).
- Build the page as a single component, sections in the order above.
- Strip the global nav and footer for this route only — paid landing pages should have no escape hatches.
- Reuse existing design tokens / components where they exist; don't redesign from scratch.

### 2. Conversion tracking

- Install GA4 if it's not already there.
- Define **one** conversion event — likely `signup_completed` or `first_dictation` or whatever maps to actual product activation. Don't track button clicks as conversions; smart bidding optimizes toward whatever you tell it is success.
- Link GA4 to the Daylight Google Ads account.
- Add the Google Ads conversion tag to fire on the same event.
- Verify the event fires correctly in GA4 DebugView before launching ads. This is the #1 thing people get wrong.

### 3. Three landing page copy variants

For A/B testing later. Three different headlines, same page structure:

- **Variant A (problem-named):** "Document custody incidents the way courts expect."
- **Variant B (workflow-named):** "Talk it out. Daylight builds your custody timeline."
- **Variant C (competitor-aware):** "A simpler alternative to OurFamilyWizard."

Don't launch all three at once — pick one for week 1, swap if the first one underperforms.

### 4. Pre-launch QA checklist

Before any ad spend:

- Page loads in under 2 seconds on mobile (most paid traffic is mobile).
- CTA button works on mobile and desktop.
- Conversion event verified firing in GA4 DebugView.
- Page renders cleanly without auth / nothing broken if the user lands cold.
- Privacy policy and terms links exist somewhere accessible (Google Ads requires this).
- A real human (not Kyle) clicks through the flow once and reports friction.

---

## Campaign structure (build in Google Ads UI)

### One campaign, three ad groups

**Campaign:** Daylight - Search - US
- Network: Search only (turn OFF Search Partners and Display Network)
- Bidding: Maximize Conversions (let smart bidding learn — it needs the conversion event from step 2 above to be working)
- Budget: $30/day
- Locations: US, English
- Negative keywords starter list: free, jobs, lyrics, definition, meaning, wikipedia

**Ad group 1: Competitor terms**
- Keywords: `ourfamilywizard alternative`, `talkingparents alternative`, `appclose alternative`, `coparenter alternative`, `[brand] vs [brand]` variants
- These convert highest because intent is razor sharp.

**Ad group 2: Problem-aware**
- Keywords: `how to document custody violations`, `custody documentation app`, `co parenting journal app`, `evidence for custody case`, `track custody exchanges`
- Bigger volume, slightly lower intent, still strong.

**Ad group 3: Branded** (only if Daylight has any organic search volume yet)
- Keywords: `daylight app`, `daylight custody`
- Cheap, defends your brand from competitors bidding on it.

### Ad copy (3 variants per ad group, Google rotates)

Headlines (30 char max each, 3+ per ad):
- Document Custody Incidents
- Voice-First Custody Journal
- Court-Ready Timelines
- Talk It Out, We Handle Rest
- Built For Custody Disputes

Descriptions (90 char max, 2+ per ad):
- Dictate what happened on the drive home. Daylight builds a timestamped, court-ready timeline.
- The simpler alternative to OurFamilyWizard. Voice-first. Private. Built for high-conflict custody.

Final URL: the new `/document` (or whatever) landing page route.

---

## Budget and timeline

- **Day 1–3:** Account setup, page build, conversion tracking verified.
- **Day 4:** Launch at $30/day.
- **Day 4–7:** Don't touch anything. Smart bidding needs ~7 days minimum to learn.
- **Day 8–14:** First evaluation. Look at: cost per signup, which ad group is pulling, which keywords are wasting money. Add negatives.
- **Day 14:** Decision point — kill, scale, or iterate landing page copy.

**Total spend for the test:** ~$420 over 14 days. Cheap learning.

---

## What success looks like

After 14 days you should know:

- Whether paid Google Search can acquire Daylight users at a cost that's sustainable (define your max acceptable CAC before launch — even a rough number).
- Which ad group has the cleanest intent (probably competitor terms).
- Whether the landing page converts at >2% (industry-decent for cold paid traffic).

If conversion rate is below 1%, the problem is the page, not the ads. Fix the page before adding spend or new channels.

If conversion rate is fine but CPCs are too high, that's a bid strategy or audience problem — solvable.

---

## What NOT to do

- Don't launch Meta, Reddit, or TikTok at the same time. One channel, real signal.
- Don't write 50 keywords per ad group. Start tight, expand from search term reports.
- Don't build per-keyword landing pages on day one. One solid page first.
- Don't pause the campaign after 3 days because the numbers look weird. Smart bidding needs time.
- Don't track button clicks as conversions. Track real activation.

---

## Pre-flight checklist for Kyle

Resolved:

- [x] Activation event: signup at `/auth/signup` (live, no waitlist gate).
- [x] Privacy Policy live at `/privacy`. Terms of Service live at `/terms`. Security page at `/security`. Google Ads approval should be straightforward.
- [x] Domain `daylight.legal` is live with strong product visuals already built.

Still to do before launch:

- [ ] Sign in to ads.google.com with `kyle@monumentlabs.io`, create a new Ads account named "Daylight", add billing.
- [ ] Decide max acceptable CAC ballpark (so you know what success means at day 14). Even a rough number — $30? $75? — anchors the evaluation.
- [ ] Decide the conversion event Claude Code should fire on: signup completion, or a deeper activation event like first voice note recorded. Recommendation: **signup completion** for the first 14 days (cheaper, faster signal), then tighten to a deeper event once you have volume.

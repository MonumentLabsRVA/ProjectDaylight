# Cohort review: 26 users, the March 6 spike, and 2 real activations

**Date:** 2026-04-25
**Question:** "Holy shit I have a bunch of users? Have they done anything? How many? Did they come all at once?"
**Author:** Kyle + Claude

## TL;DR

- **26 users in the database, but only 23 are external** (2 are Kyle's, 1 is a test). Effectively no consistent acquisition channel — signups are bursty, not flowing.
- **One traffic event drove most of it:** 18 of the 23 external signups landed in a 4.5-hour window on Friday March 6, 2026. Almost certainly a single social share to a parenting community (Reddit, TikTok, or Facebook).
- **2 of the 23 actually used the product the way it's designed.** Both are mothers in active custody disputes — pure ICP — and both bounced after roughly 36 hours of high-quality use. The product matched them; the re-engagement didn't exist.
- **Origin couldn't be reconstructed from the database** — referrer/UTM was never captured. Now wired (commit `047b652`). The next traffic event will be attributable.

## What we looked at

- `auth.users` — signup timestamps, raw_user_meta_data (provider, email_verified), confirmed_at, last_sign_in_at
- `public.profiles`, `public.cases`, `public.events`, `public.journal_entries`, `public.evidence`, `public.action_items`, `public.exports`, `public.subscriptions`, `public.bug_reports` — per-user activity counts and content
- `analytics.events` — exists per migration `0046_create_analytics`, but only 5 rows total. Effectively uninstrumented for the period under review.
- Email-domain composition and auth provider mix (email vs. Google OAuth)
- `public.cases.jurisdiction_state` for geographic spread
- Free-text in `public.journal_entries.event_text` to read what users actually wrote

## What we found

### 1. Signups across the period are sparse and lumpy

Every signup, by day:

| Day            | Count | Notes                                                 |
|----------------|-------|-------------------------------------------------------|
| 2025-11-22     | 1     | gkjohns@gmail.com — Kyle                              |
| 2025-11-24     | 1     | kyle@monumentlabs.io — Kyle                           |
| 2025-11-26     | 1     | test-registration-123@monumentlabs.io — internal test |
| 2025-12-22     | 1     | external                                              |
| 2026-01-13     | 1     | mailinator throwaway                                  |
| 2026-02-13     | 1     | muhaos throwaway, but holds an active subscription    |
| **2026-03-06** | **18**| **the spike**                                         |
| 2026-03-07     | 1     | external                                              |
| 2026-03-13     | 1     | external                                              |
| ...            | 0     | **nothing in the 6 weeks since**                      |

There has been no sustained acquisition flow. There has been one event.

### 2. The March 6 spike has a specific signature

Eighteen signups in 4 hours and 31 minutes — first at 12:33pm Eastern, last at 5:04pm Eastern. Friday afternoon.

- **Auth provider:** 17 of 18 used the email/password form. Only 1 used "Continue with Google." This is the opposite of a tech-audience cohort.
- **Email-domain mix:** gmail, yahoo, aol, icloud, outlook — consumer/parent demographic, not a SaaS or developer crowd.
- **Geography (from cases.jurisdiction_state where set):** Texas, Illinois, Virginia(?), Henrico, mixed others. Not concentrated in Richmond — this was not an AIRRVA / local-network share.
- **Gender skew:** of those who created cases and identified `your_role`, all said "Mother."

That signature — Friday afternoon, mom-skewed inboxes, national, no tech bias, all-female-presenting — is textbook organic share into a parenting community. The leading candidates: Reddit (`r/CustodyIssues`, `r/SingleMoms`, `r/Divorce_Men`, `r/breakingmom`), TikTok, or a Facebook group post. Not a tech blog, not paid (paid would be smeared across days).

### 3. The activation funnel is brutal

Of the 23 external signups (excluding Kyle x2 and the internal test):

| Stage                                   | Count | %    |
|-----------------------------------------|-------|------|
| Registered                              | 23    | 100% |
| Confirmed email & signed in at least once | 12  | 52%  |
| Created a case                          | 9     | 39%  |
| Logged at least one event               | 3     | 13%  |
| Used the journal/evidence flow as designed | 2  | 9%   |

Eleven users registered and never came back after the email confirmation. Seven created a case (so, finished onboarding) and then bounced before logging anything. The product gets users to the "fill out your case" screen and loses most of them there.

### 4. The two real activations are pure ICP, and both bounced after ~36 hours

**Victoria B. — Illinois, divorce + custody, court date in 18 days at signup**

- Signed up via Google OAuth at 2:44pm Central on March 6
- Created her case 3 minutes later. Mother of a 10-year-old daughter, lives with her exclusively. Co-parent listed as "Mother" with the role goals "Our child is scared of [co-parent] / [co-parent] is abusive to me and our child / Our child is best with me."
- Set `next_court_date = 2026-03-24` — real, near-term urgency
- Wrote 6 journal entries across March 6–7. Specific, dated narratives: a morning argument over the daughter wanting to text the co-parent, a school-day timeline, an evening agitation episode, a precise medication routine (Propranolol 7pm; Clonidine + Fluoxetine + Vitamin D 9:30pm), a household errand with receipt
- Uploaded 3 photos as evidence (one was a receipt)
- 11 events extracted, 4 action items generated
- **Last sign-in: March 7, 6:46pm Eastern.** Never returned. Court date came and went without her exporting anything.

**Katie A. — Texas, custody only, "Final hearing / trial" stage**

- Email signup at 3:38pm Central on March 6
- Came back the same evening to fill out her case. Mother of a 6-month-old daughter
- First journal entry: a 1,342-character narrative dumping months of context — references to Our Family Wizard (OFW), prior allegations against the biological father, recordings, feeding concerns, exchange-handoff conflict
- Came back the next day to log a specific exchange incident with 2 photos
- 12 events extracted, 9 evidence items requested, 9 action items generated by the AI (police call logs, court-doc retrieval, OFW message exports, recording preservation — a real evidence-collection checklist)
- **Last sign-in: March 7, 12:17pm Central.** Never returned.

Both wrote *real* narratives — not "test test test." Both used domain-specific language (OFW, exchange handoff, temporary orders). Both got the AI extraction working. The product fit. Nothing pulled them back.

### 5. One subscription is suspicious

Three subscriptions exist. Two are Kyle's. The third is `rodaxa7319@muhaos.com` — a disposable-mail domain. Highly likely to be a stranded Stripe test charge from when subscription billing was being wired up, not a paying customer. Worth confirming against Stripe.

### 6. The acquisition data was not in the system

Searches across `auth.users.raw_user_meta_data`, `auth.users.raw_app_meta_data`, `analytics.events`, and `bug_reports.user_agent` found no referrer, no UTM, no landing path. The `analytics.events` table exists and has `user_signed_up` triggers wired, but only carries 5 rows total — the table predates real instrumentation.

This means the question "where did the March 6 cohort come from?" is not directly answerable from the database. It can only be answered by asking Kyle's network, or by waiting for the next spike with the new instrumentation.

## What it means

Three things, in priority order.

**The product fits the ICP that found it.** Both real activations are mothers in active, near-term custody disputes who used the voice/journal flow, uploaded photos, and got back AI-extracted events with action items. They didn't bounce because of mismatch — they bounced because *nothing was there to pull them back*. There is no day-2 email, no "your timeline is ready" notification, no nudge before a court date, no anything. The product earned their first 30 minutes; nothing earned their next 30.

**Acquisition has been an event, not a flow.** Six months in, the only meaningful traffic was one social share by an unknown someone on a Friday afternoon. The funnel can't improve until the top of it has steady volume — and the top can't have steady volume until there's an instrumented landing page worth driving traffic to. The Sift-integration push (Plan 01: free OFW analyzer) is the right answer to this gap.

**The instrumentation gap was the most expensive blind spot.** Every report from now on will have to acknowledge this March 6 cohort as "origin unknown." Closing the gap (now done) is cheap. Not closing it for the *next* spike would be malpractice.

## Recommendations

Ranked by what to do first.

### A. Email Victoria and Katie individually

- **What:** Send a personal, short note to each. "You signed up X weeks ago, I noticed you logged Y. I'm the founder. Want to chat?"
- **Why:** Two hand-warm leads in pure ICP. Either a one-line reply illuminates why they bounced (unblocking re-engagement work), or there's no reply, which is also signal. The marginal cost is 10 minutes.
- **Effort:** 30 minutes total, including drafting and sending.

### B. Wire a 24h re-engagement email after first event

- **What:** When a user logs their first event, queue an email for 24 hours later: "Your timeline is ready — here's what we extracted from yesterday's entries." Plain text, founder-from address.
- **Why:** Closes the loop on the most painful finding. The product earned 36 hours of attention from both real users; nothing pulled them back for hour 37. This is the highest-leverage change available without acquiring a single new user.
- **Effort:** ~half a day. Inngest scheduled function + a templated email.

### C. Confirm the muhaos subscription against Stripe

- **What:** Look up `rodaxa7319@muhaos.com` in Stripe. If it's a stranded test charge, refund/cancel and remove the row. If it's a real customer, the user is signaling something interesting — write a follow-up note.
- **Why:** Either way, it shouldn't sit in the data muddying analyses. And the second possibility is a real lead.
- **Effort:** 5 minutes.

### D. Ask the network about March 6

- **What:** Ask Andrea, Will, and Kyle's broader social network if anyone posted/shared a Daylight link on Friday March 6. If yes, that's the channel to nurture; if no, accept that someone outside your network found the product shareable on their own.
- **Why:** The cohort signature points to a parenting subreddit, TikTok, or Facebook group. Even an anonymous tip (someone saying "my friend posted it on r/X") narrows the search to a single subreddit's mod-DM away.
- **Effort:** 15 minutes of messaging.

### E. (Done) First-touch attribution capture

- **What:** Plugin captures `referrer`, `utm_*`, landing path, user-agent on first visit; flushes to `analytics.events` as a `signup_attribution` event after sign-in.
- **Why:** Closes the instrumentation gap so this exact report doesn't have to be written with "origin unknown" as a footnote next time.
- **Effort:** Already done — commit `047b652`, fixed in `cfba3b2`.

## Open questions

- **Where did March 6 actually come from?** Best answered by Recommendation D. If that fails, the new instrumentation will catch the next event but won't resolve this one. Acceptable.
- **Did Victoria's March 24 court date end up needing the export feature she didn't generate?** Worth asking in the outreach (Recommendation A). If yes — that's a critical path failure and should drive a flow-design change.
- **What happened to the 7 who created a case but logged zero events?** Was the case-creation form too long? Did they hit a bug? Was the value prop unclear after creating the case? Worth a session-replay tool (PostHog / FullStory) on future cohorts — the database alone can't tell us.
- **Why did Katie commit to a 1,342-character first journal entry?** That kind of input volume is rare for first-time-product use. If the prompt or empty state cued it, that's a pattern worth replicating. If it was self-driven, she's an outlier — but also the closest thing this product has to a power-user testimonial.

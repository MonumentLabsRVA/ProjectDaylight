# Top-of-Funnel Ads Sprint — Implementation Plan

**Created:** April 27, 2026
**Status:** Not Started
**Context:** First paid acquisition test for Daylight. We're launching one channel (Google Search) on a $30/day × 14-day budget. The code work is everything around the ads: a dedicated paid-traffic landing page, GA4 + Google Ads conversion tracking, and three swappable headline variants for week-2 iteration. See `launch_vision.md` for the full strategy doc.

**Goal:** Ship a `/document` paid landing page with conversion tracking verified in GA4 DebugView, so Kyle can launch the Google Search campaign on day 4.

**Scope:**
- **In:** New paid-traffic landing page route, extraction of homepage demo components into reusable pieces, paid-landing layout with no nav escape hatches, GA4 install, `signup_completed` conversion event wired client-side, three headline variants, mobile perf and QA checklist.
- **Out:** Google Ads UI campaign building (Kyle does this in the web UI in ~30 min), MCC setup, Meta/Reddit/TikTok, per-keyword landing pages, A/B testing infrastructure, testimonials.

---

## Current State

### What Exists

- **Homepage** at [src/app/pages/index.vue](src/app/pages/index.vue) with all the visual assets the paid page needs:
  - Hero phone mockup component → [src/app/components/home/HomeHeroPhoneMockup.vue](src/app/components/home/HomeHeroPhoneMockup.vue)
  - Court-ready document preview component → [src/app/components/home/HomeCourtDocumentPreview.vue](src/app/components/home/HomeCourtDocumentPreview.vue)
  - 3-step explainer (inline, lines 387–408)
  - Voice-to-timeline animated demo with Marcus example (inline, lines 411–520)
  - Screenshot OCR / AI extraction animated demo (inline, lines 523–681)
  - Security trio (inline, lines 770–821)
  - Trust badges strip (inline, lines 304–318)
- **Landing layout** at [src/app/layouts/landing.vue](src/app/layouts/landing.vue) — has full nav (logo, color mode, log in, get started) and footer with Help/Privacy/Terms/Security links. Right call for the homepage; wrong shape for paid traffic.
- **Legal pages live:** [/privacy](src/app/pages/privacy.vue), [/terms](src/app/pages/terms.vue), [/security](src/app/pages/security.vue) — all required for Google Ads approval.
- **Signup flow** at [src/app/pages/auth/signup.vue](src/app/pages/auth/signup.vue) — Supabase auth, email + password, no waitlist gate. The redirect target after successful signup is where the conversion event needs to fire.
- **Internal analytics** via `useAnalytics()` composable logs to Supabase `analytics.events` (see [internal_docs/analytics_guide.md](internal_docs/analytics_guide.md)). User signup is auto-logged by a DB trigger as `user_signed_up`. This stays untouched — GA4 is additive, not a replacement.
- **Vercel Analytics** already installed and wired in [src/app/app.vue](src/app/app.vue) and [src/app/error.vue](src/app/error.vue).

### What Changes

- New `paid-landing` layout (logo-only header, legal-only footer).
- New page at `/document` using the new layout and ported components.
- Demo blocks (3-step explainer, voice-to-timeline, screenshot OCR demo, security trio, trust badges) extracted from `index.vue` into reusable components under `src/app/components/landing/` — homepage refactored to use them so we don't fork visuals.
- GA4 (gtag.js) installed via Nuxt config, with a measurement-id env var.
- `signup_completed` GA4 event fires on successful signup, in addition to the existing Supabase `user_signed_up` row.
- Documented Google Ads conversion tag snippet (Kyle pastes the conversion ID once it's created in the Ads UI on day 1).
- Three headline variants (problem-named / workflow-named / competitor-aware) selectable via a single constant.

### What Stays

- Homepage (`/`) keeps its current layout, copy, attorney section, and full nav. Paid traffic gets a different page; organic and partner traffic keeps what already works.
- Existing `useAnalytics()` Supabase pipeline is untouched. GA4 runs alongside it.
- Auth flow is untouched. The signup page stays at `/auth/signup` and the conversion event fires post-redirect, not on form submit.

---

## Sprint Breakdown

### Sprint 1: Extract demo components from homepage — Foundational [Not Started]
**Goal:** Pull the four reusable visual blocks out of `index.vue` into standalone components so the paid landing page composes them instead of copy-pasting markup. Homepage rendering must be byte-identical after the refactor.
**Estimated effort:** 2–3 hours

#### Tasks
- 1.1 Create `src/app/components/landing/` directory.
- 1.2 Extract the 3-step explainer (`index.vue` lines 387–408) into `LandingThreeStepExplainer.vue`. Move the `steps` array data into the component.
- 1.3 Extract the voice-to-timeline demo (lines 411–520, plus all `voiceTranscript`, `extractedEvents`, `waveformBars`, animation logic in `<script setup>`) into `LandingVoiceToTimelineDemo.vue`. Component owns its own animation lifecycle.
- 1.4 Extract the screenshot OCR demo (lines 523–681, plus `evidenceScreenshot`, `aiExtractionSteps`, `extractedEvidence`, animation logic) into `LandingScreenshotDemo.vue`.
- 1.5 Extract the security trio (lines 770–821) into `LandingSecurityTrio.vue`. Accept a prop for whether to show the "Learn more about our security" link (homepage = yes, paid page = no).
- 1.6 Extract the trust badges strip (lines 304–318) into `LandingTrustBadges.vue`.
- 1.7 Refactor `index.vue` to use the new components. Delete the inline markup and now-dead refs / animation code from its `<script setup>`.

#### Verification
- [ ] `npm run dev` boots cleanly.
- [ ] Open `/` in browser via Playwright MCP — homepage renders identically (hero, 3-step, voice demo, screenshot demo, court doc preview, attorney section, security trio, final CTA).
- [ ] Voice demo and screenshot demo animations still play on page load.
- [ ] Take a screenshot in light and dark mode to confirm parity.
- [ ] `npm run typecheck` passes.

---

### Sprint 2: Build the `/document` paid landing page [Not Started]
**Goal:** New paid-traffic landing page composed from the Sprint 1 components, on a stripped-down layout with no nav escape hatches. Single CTA, problem-named headline (Variant A as default).
**Estimated effort:** 2–3 hours

#### Tasks
- 2.1 Create `src/app/layouts/paid-landing.vue` based on the existing `landing.vue` but:
  - Header: logo + wordmark only. No log-in button, no color-mode button, no get-started button.
  - Footer: legal-only — Privacy, Terms, Security. No Help/FAQ. No "Made by Monument Labs" credit (cuts an outbound link; reduces escape hatches).
  - Keep the fixed-header backdrop blur for visual consistency.
- 2.2 Create `src/app/pages/document.vue` with `definePageMeta({ layout: 'paid-landing' })`.
- 2.3 Compose the page in this exact order (per launch_vision.md "Page structure"):
  1. **Hero** — problem-named H1 (Variant A: "Document custody incidents the way courts expect."), one-line subhead, single primary CTA "Start documenting free" → `/auth/signup`, hero visual using `HomeHeroPhoneMockup`. Trust badges strip below CTA.
  2. **3-step explainer** — `LandingThreeStepExplainer`.
  3. **Voice → timeline demo** — `LandingVoiceToTimelineDemo`.
  4. **Court-ready export mock** — reuse `HomeCourtDocumentPreview` as-is.
  5. **Security trio** — `LandingSecurityTrio` with `:show-learn-more="false"` (no escape hatch to `/security`; legal access is via footer).
  6. **Final CTA** — repeats the Variant A headline shorter and the same "Start documenting free" button.
- 2.4 Define a single `HEADLINE_VARIANT` constant at the top of `document.vue` (or in a small `app/composables/useLandingVariant.ts`) so swapping variants in week 2 is a one-line change. Variants from launch_vision.md:
  - A (default): problem-named — `"Document custody incidents the way courts expect."`
  - B: workflow-named — `"Talk it out. Daylight builds your custody timeline."`
  - C: competitor-aware — `"A simpler alternative to OurFamilyWizard."`
  Subheads paired to each variant; CTA is identical across all three.
- 2.5 Set page-specific SEO: `useHead({ title: 'Daylight — Document Custody Incidents' })`, set `<meta name="robots" content="noindex,nofollow">` so the paid page doesn't compete with the homepage in organic search.

#### Verification
- [ ] Navigate to `/document` via Playwright MCP. Page renders all six sections in order.
- [ ] No nav links visible in header except the Daylight logo (which goes to `/`, acceptable).
- [ ] Footer shows Privacy / Terms / Security only.
- [ ] Single CTA "Start documenting free" appears in hero and final CTA. No "Try it now," "Generate your timeline," etc.
- [ ] Hero H1 matches the active variant.
- [ ] Click CTA → lands on `/auth/signup`.
- [ ] Take screenshots at desktop (1280px) and mobile (375px) widths, light + dark mode.
- [ ] `<meta name="robots" content="noindex,nofollow">` present in the rendered HTML.
- [ ] `npm run typecheck` passes.

---

### Sprint 3: GA4 + Google Ads conversion tracking [Not Started]
**Goal:** GA4 installed and firing `page_view` automatically. Custom `signup_completed` event fires once on successful signup. Google Ads conversion tag stub in place so Kyle can drop in the conversion ID after creating it in the Ads UI.
**Estimated effort:** 2 hours

#### Tasks
- 3.1 Add env vars to [src/.env.example](src/.env.example):
  - `NUXT_PUBLIC_GA4_MEASUREMENT_ID=` (e.g. `G-XXXXXXXXXX`)
  - `NUXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID=` (e.g. `AW-XXXXXXXXX`)
  - `NUXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL=` (filled in after Ads UI setup on day 1)
- 3.2 Wire `runtimeConfig.public` for those vars in [src/nuxt.config.ts](src/nuxt.config.ts).
- 3.3 Inject the gtag.js snippet via the `app.head.script` block in `nuxt.config.ts`. Guard on `process.env.NUXT_PUBLIC_GA4_MEASUREMENT_ID` so dev without the var doesn't 404 a tag fetch. Pull the snippet inline rather than adding a heavy module — one async script + one inline init is enough for what we need.
- 3.4 Create `src/app/composables/useGtag.ts` with:
  - `trackEvent(name, params?)` — calls `window.gtag('event', name, params)` if gtag is loaded, no-ops otherwise.
  - `trackConversion()` — fires the Google Ads conversion event (`gtag('event', 'conversion', { send_to: 'AW-.../...' })`), reads IDs from `useRuntimeConfig().public`. No-ops if conversion label is empty.
- 3.5 Fire `signup_completed` on the redirect target after successful signup. Find where `signup.vue` redirects on success and add the event there (or, if the redirect target is a known route like `/onboarding` or `/home`, fire on mount of that route guarded by a query param like `?from=signup`). Whichever pattern is cleanest given the existing flow — don't fire inside the form-submit handler since smart bidding wants the actual completion, not an intent signal. Fire `trackEvent('signup_completed')` AND `trackConversion()`.
- 3.6 Document the Google Ads conversion tag setup in a new short doc `internal_docs/20260427_ads_sprint/conversion_tracking_setup.md` — what Kyle pastes where after creating the conversion in the Ads UI.

#### Verification
- [ ] With env vars set locally, load `/document` → Network tab shows request to `googletagmanager.com/gtag/js`.
- [ ] Open GA4 DebugView (after Kyle wires the GA4 property). Refresh `/document` — `page_view` appears.
- [ ] Run signup with a throwaway email → `signup_completed` event appears in DebugView.
- [ ] Without env vars set, dev server runs cleanly with no console errors and no gtag requests.
- [ ] `npm run typecheck` passes.

---

### Sprint 4: Pre-launch QA, mobile perf, variant swap dry run [Not Started]
**Goal:** Hit every item in launch_vision.md's "Pre-launch QA checklist." Confirm variant-swap is a one-line change. Hand off a green checklist to Kyle.
**Estimated effort:** 1–2 hours

#### Tasks
- 4.1 Mobile perf — load `/document` in Playwright MCP at 375px width with throttling-equivalent expectations. Measure: time to interactive, total JS, image weight. Target: under 2s on a reasonable 4G profile. If we miss, identify the heaviest culprit (likely the animated demo components — defer their animation start with `requestIdleCallback` or visibility-trigger if needed).
- 4.2 Confirm CTA works on mobile and desktop via Playwright click test on both viewports.
- 4.3 Confirm `signup_completed` fires correctly in GA4 DebugView (re-run with a real test email; this is the #1 thing the launch_vision flags as "what people get wrong").
- 4.4 Verify Privacy / Terms / Security links resolve (200, not 404) from the paid-landing footer. These are required for Google Ads approval.
- 4.5 Cold-load test: open `/document` in an incognito window with no auth. Page should render with no JS errors, no auth redirects, no broken images.
- 4.6 Variant swap dry run — change the `HEADLINE_VARIANT` constant to B, confirm the H1 + subhead update everywhere they appear (hero + final CTA), revert.
- 4.7 Update `launch_vision.md` "Pre-flight checklist for Kyle" to mark the code-side items complete.

#### Verification
- [ ] Mobile load test passes (<2s on 4G profile, or document the regression with a fix path).
- [ ] CTA clicks on both viewports route to `/auth/signup`.
- [ ] Conversion event verified in GA4 DebugView one more time, end-to-end.
- [ ] All footer links 200.
- [ ] Cold load: zero console errors, zero network 4xx/5xx aside from expected analytics failures if env vars unset.
- [ ] Variant swap takes <30 seconds to flip.

---

## Reference Docs

- [launch_vision.md](internal_docs/20260427_ads_sprint/launch_vision.md) — full strategy and the source of truth for copy, structure, and budget. This plan is the code-side execution.
- [analytics_guide.md](internal_docs/analytics_guide.md) — existing internal Supabase-based analytics. GA4 runs alongside, not instead.
- `conversion_tracking_setup.md` (created in Sprint 3) — what Kyle pastes where after creating the Google Ads conversion.

## Environment / Config Changes

| Variable | Required | Description |
|----------|----------|-------------|
| `NUXT_PUBLIC_GA4_MEASUREMENT_ID` | Yes (prod) | GA4 measurement ID, e.g. `G-XXXXXXXXXX`. From the GA4 property created for daylight.legal. |
| `NUXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID` | Yes (prod) | Google Ads account conversion ID, e.g. `AW-XXXXXXXXX`. From the new Daylight Ads account. |
| `NUXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` | Yes (prod) | Per-conversion label, set after creating the `signup_completed` conversion in the Ads UI. |

Without these, the page still renders and `signup_completed` is still logged to Supabase via the existing pipeline — only GA4 / Google Ads tracking is no-op.

## What's Deferred / Out of Scope

- **Google Ads UI work** — Kyle creates the Ads account, billing, GA4 property, conversion definition, campaign, ad groups, and ad copy in the web UI. ~30 min of clicking, per launch_vision.md.
- **MCC (Manager Account)** — recommended later when there are 2+ Ads accounts, not needed day 1.
- **A/B testing infrastructure** — variant swap is a code change for now. If we ship two more channels later, revisit.
- **Per-keyword landing pages** — one solid page first.
- **Testimonials** — explicitly skipped per launch_vision (no fake quotes; product visuals carry credibility).
- **Meta / Reddit / TikTok** — one channel, real signal.
- **Replacing the Supabase analytics pipeline** — GA4 is for smart bidding; internal analytics is for product analysis. They don't compete.

## Open Questions

1. **Where exactly does signup redirect on success?** Need to confirm during Sprint 3 — is it `/onboarding`, `/home`, or somewhere else? This determines where `trackConversion()` fires. Best guess from the page list: `/onboarding`.
2. **Should `/document` be added to `sitemap.xml` and `robots.txt`?** Recommendation: noindex + exclude from sitemap. Paid traffic doesn't want the page competing with the homepage organically. Confirming this in Sprint 2's Task 2.5.

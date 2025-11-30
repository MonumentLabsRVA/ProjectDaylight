# Project Daylight - Launch-Focused Roadmap

*Last Updated: November 30, 2024*

**Goal: Launch in 2-3 weeks with current features + great experience**

---

## Current Status

### ✅ What's Working
- Voice capture → transcription → event extraction → timeline
- Evidence upload and management (with image storage)
- Markdown + PDF export with real data
- Timeline view with filtering
- Basic dashboard with stats
- OCR for uploaded images
- Image evidence preview and full-size viewer
- Evidence-event linking (viewing associations)
- Professional landing page with hero, demos, and CTAs
- Brand identity (logo, favicon, color scheme)
- Legal pages (Terms of Service, Privacy Policy)
- Email + Google OAuth signup
- **Stripe payments** (checkout, portal, webhooks, subscription management)
- **Full billing page** (plan display, upgrade/downgrade, alpha tier)
- **9-step onboarding wizard** (how it works, case setup, goals, risk factors)

### 🔥 What Needs Work
- ~~**CRITICAL:** All API routes fail in production (work in dev)~~ **FIXED! ✅**
- ~~Manual auth header passing everywhere (poor DX)~~ **FIXED! ✅**
- ~~Need to apply auth fix pattern to remaining API routes~~ **FIXED! ✅**
- ~~Landing page needs work~~ **FIXED! ✅**
- ~~No branding/polish~~ **FIXED! ✅**
- ~~No payments/subscriptions~~ **FIXED! ✅**
- ~~No onboarding tutorial for new users~~ **FIXED! ✅**
- ~~**Feature gating for free vs paid tiers**~~ **FIXED! ✅**
- Mobile responsiveness tested → fixes identified (see Priority 6)
- Error handling needs polish
- No monitoring/analytics yet

---

## PHASE 1: Critical Fixes (Week 1)
*"Make it actually work in production"*

### ✅ Priority 0: Fix Production API/Auth - **COMPLETE**
**THE BLOCKER - SOLVED!**

- [x] **Fixed production deployment**
  - Root cause identified: Wrong JWT field (`user.id` vs `user.sub`)
  - Fixed cookie passing using `useFetch` with `useRequestHeaders(['cookie'])`
  - Added proper Supabase config to `nuxt.config.ts`
  
- [x] **Auth fixes implemented:**
  1. ✅ Added proper Supabase config to `nuxt.config.ts`:
     - `cookieOptions` for session handling
     - `clientOptions` with PKCE flow
     - Correct domain/sameSite for production
  2. ✅ Fixed backend to use `user?.sub` (JWT standard)
  3. ✅ Fixed frontend to pass cookies with `useFetch`
  4. ✅ Created client plugin for session management

- [x] **Pattern applied to all remaining routes & pages:**
  - Backend: Use `user?.sub || user?.id` for user ID
  - Frontend: Use `useFetch` with `useRequestHeaders(['cookie'])`
  - Verified in production for home, timeline, evidence, and case routes after fixing `tslib` runtime issue on Vercel

**Success:** User can record voice note in production → see it in timeline ✅

---

## PHASE 2: Launch Essentials (Week 2)
*"Make it worth paying for"*

### ✅ Priority 1: Image Evidence Storage - COMPLETE
**Persist and surface original images for both OCR-backed and simple photo evidence**

- [x] **Supabase Storage + RLS**
  - Enable/configure the evidence image bucket in Supabase
  - Set up RLS policies so users can only access their own images (per-user folders in `daylight-files`)
  - Use signed URLs for reading images from the frontend
 
- [x] **Persist image files alongside OCR/LLM data**
  - When image evidence is created, store the original image file (whether or not OCR is needed)
  - Save the storage path/URL on the evidence record
  - Ensure existing OCR extraction flow continues to work unchanged for documents that benefit from it
  - For "simple" photo evidence (e.g. pictures of injuries, locations), let the LLM generate an optional short description instead of running full OCR
  
- [x] **UI support for viewing and using stored images**
  - Show image preview/thumbnail on the evidence page
  - Allow opening a full-size image viewer from evidence and/or timeline views
  - Make it clear when an evidence item has an attached image vs. text-only OCR vs. image + LLM description
  - Make it easy to associate image-only evidence with events (full association UX is covered in Priority 2, but UI should not assume OCR is always present)
  
**Success:** ✅ User can upload an image as evidence → app stores it securely in Supabase → user can view that image later from the evidence UI and, whether it's OCR-backed or just a photo with an LLM description, associate it with relevant events.

### 🔄 Priority 2: Evidence-Event Association - COMPLETE
**Connect evidence to timeline events for context**

- [x] **Database schema updates**
  - Create junction table for evidence-event relationships (many-to-many) ✅ `event_evidence` table
  - Add proper foreign keys and RLS policies ✅
  - Migration for new relationship structure ✅
  
- [x] **Event detail page enhancements**
  - Display all evidence associated with an event ✅
  - Quick link to view each piece of evidence ✅
  - Show evidence thumbnails in event card ✅
  
- [x] **Evidence detail page enhancements**
  - Show all events associated with this evidence ✅
  - Timeline context for when evidence was captured vs. events ✅
  
**Success:** ✅ User can link a photo to multiple events → see photo when viewing event → see events when viewing photo (association happens automatically during event extraction, manual add/remove deferred to post-launch)

### ✅ Priority 3: Payments & Billing - COMPLETE
- [x] **Stripe integration**
  - Subscription checkout ($49/month, $495/year)
  - Stripe Customer Portal for payment management
  - Webhook handling for subscription lifecycle
  - Cancel/resume flow via portal
  - Promotion codes supported
  
- [x] **Billing page**
  - Current plan display with status badges
  - Monthly/yearly billing toggle (17% savings on yearly)
  - Upgrade flow with Stripe Checkout
  - "Manage Billing" button to Stripe Portal
  - Free/Alpha/Pro/Counsel (coming soon) plan tiers
  - Alpha tier for early partners (all features, no cost)

### ✅ Priority 4: Landing Page & Branding - COMPLETE
- [x] **Professional landing page**
  - Compelling hero: "Just talk. We handle the rest."
  - 3-step "How it works" section
  - Live demos (voice-to-timeline, evidence extraction animations)
  - Court-ready document preview section
  - "For Attorneys" section with benefits
  - Trust indicators (bank-level encryption, attorney recommended)
  - Clear CTAs: "Start documenting free"
  
- [x] **Brand identity**
  - Consistent color scheme throughout app (Sky blue primary, gray neutral)
  - Professional logo (Nuxt-inspired with bite mark)
  - Complete favicon set (SVG, ICO, PNG 96x96, Apple Touch Icon)
  - Web manifest for PWA support
  - SEO metadata (Open Graph, Twitter cards, Schema.org structured data)
  - [ ] Email templates for auth/billing (deferred)

### ✅ Priority 5: Onboarding & First Experience - COMPLETE
- [x] **Smooth signup flow**
  - Email/password or Google OAuth ✅
  - Immediate access after signup ✅
  - [ ] Welcome email with getting started tips (deferred to post-launch)
  
- [x] **First-use experience**
  - Full 9-step onboarding wizard ✅
  - "How it works" tutorial explaining Journal → AI → Timeline → Export flow ✅
  - Case setup with role, children, other parent info ✅
  - Goals and risk factor identification ✅
  - Middleware integration to redirect new users to onboarding ✅
  - Skip option for users who want to explore first ✅
  - Completion celebration with next steps ✅

---

## PHASE 3: Polish & Launch Prep (Current Phase)
*"Make it feel professional"*

### Priority 6: Feature Gating & Critical Polish ← **ACTIVE**

- [x] **Feature gating (LAUNCH BLOCKER)** ✅
  - [x] Create `useSubscription` composable for tier checks
  - [x] Enforce Free tier limits: 5 journal entries, 10 evidence uploads
  - [x] Gate Pro-only features: exports, AI insights
  - [x] Add upgrade prompts where features are locked
  - [x] API-level enforcement (not just UI)

- [x] **Mobile responsiveness** ← **COMPLETED Nov 30**
  - [x] Home/Dashboard - ✅ looks good
  - [x] Onboarding wizard - ✅ looks amazing
  - [x] Individual export page - ✅ looks good
  - [x] **Capture flow**
    - [x] Fix 3 pills at top (Describe/Evidence/Review) - black text on dark pills
    - [x] Change pills to `variant="outline"` or use lighter fill with proper contrast
  - [x] **Timeline**
    - [x] Secondary header bar is crowded, search bar squeezed
    - [x] Convert to scrollable toolbar with mobile-friendly layout
    - [x] Add scroll indicator icon if content overflows
  - [x] **Evidence list**
    - [x] Search + selector in header crowd out page title
    - [x] Move search/selector to secondary toolbar
    - [x] Cleaner, more minimal list item design
    - [x] Render image thumbnails for evidence items that have them
    - [x] Remove full borders on tiles, use `USeparator` instead
  - [x] **Exports list**
    - [x] Show fewer table columns on small screens
    - [x] Clip/truncate data in table cells for mobile readability
    - [x] Stripped-down view showing only key info on small screens
  - [x] **Billing page**
    - [x] Combine top 2 cards ("Pro Plan" + "You're on Pro!") into single card
    - [x] Outline plan details in one consolidated card
    - [x] Dev-only tier selector already visible (in ClientOnly wrapper)
  - [x] **Floating "Record" FAB for mobile** ✅
    - Sticky button (bottom-right) for instant voice capture
    - One tap to start recording → navigates to journal entry
    - Show on all authenticated pages (hidden on landing/auth and journal/new)
  
- [ ] **Dashboard loading UX (skeleton states)**
  - [ ] Pages render immediately with `USkeleton` placeholders
  - [ ] Data pops in after fetch completes (no blank screens)
  - [ ] Apply to: Home/Dashboard, Timeline, Journal list, Evidence list, Exports list
  - [ ] Consistent skeleton patterns across all data-heavy pages

- [ ] **Error handling**
  - [ ] Review API error responses for user-friendliness
  - [ ] Add fallback states for API failures
  - [ ] Ensure loading states are consistent
  - [ ] Handle network errors gracefully
  - [ ] Add retry mechanisms where appropriate
  
- [ ] **Performance**
  - [ ] Review bundle size (target <500kb initial load)
  - [ ] Lazy load heavy components (export, evidence viewer)
  - [ ] Optimize images (landing page)
  - [ ] Add appropriate caching headers

### Priority 7: Production Readiness
- [ ] **Monitoring & Analytics**
  - [ ] Set up Sentry for error tracking
  - [ ] Set up Posthog for analytics
  - [ ] Add conversion tracking (signup → onboarding → first capture → paid)
  - [ ] Create monitoring dashboard
  
- [ ] **Support infrastructure**
  - [ ] Create FAQ/Help page
  - [ ] Verify support email works (hello@monumentlabs.io)
  - [ ] Add simple bug report mechanism
  - [ ] Document common troubleshooting steps
  
- [x] **Legal requirements**
  - ✅ Terms of Service
  - ✅ Privacy Policy
  - [ ] Cookie consent (if needed - likely not required for US-focused launch)
  - [x] Data deletion process (manual via support email for now)

---

## LAUNCH CHECKLIST

### Pre-Launch Testing (Week 1)
- [ ] Full user journey in production (signup → onboarding → capture → export)
- [x] Feature gating works correctly (Free limits enforced, Pro unlocks) ✅
- [ ] Payment flow end-to-end (test mode → live mode)
- [ ] Mobile testing on real devices (iPhone Safari, Android Chrome)
- [ ] Verify all Vercel environment variables are production-ready
- [ ] Test Stripe webhook in production environment

### Launch Day Prep (Week 2)
- [ ] Monitoring dashboard ready (Sentry + Posthog)
- [ ] Support email monitored (hello@monumentlabs.io)
- [ ] Stripe switched to live mode with production API keys
- [ ] Team available for hotfixes (first 48 hours critical)
- [ ] Backup/rollback plan documented

### Success Metrics (First Month)
- [ ] 10 trial signups in first week
- [ ] 3 conversions to paid in first month
- [ ] <5% error rate in production
- [ ] <3s page load times
- [ ] Zero critical bugs reported

---

## POST-LAUNCH: Future Enhancements
*After we have paying customers and validated product-market fit*

### Month 2-3
- [ ] AI Chat interface (natural language queries)
- [ ] Direct camera capture for photos
- [ ] Email forwarding for evidence
- [ ] Advanced search/filtering

### Month 4-6
- [ ] Pattern detection & insights
- [ ] Attorney collaboration features
- [ ] Calendar integration
- [ ] Multi-language support

### Month 6+
- [ ] Mobile native apps
- [ ] Voice speaker identification
- [ ] Court filing integration
- [ ] HIPAA compliance

---

## Development Philosophy for Launch

### Do's ✅
- Ship with bugs rather than not ship
- Focus on core value: capture → timeline → export
- Make payment easy
- Polish what users see most

### Don'ts ❌
- Add new features before launch
- Perfect the codebase
- Over-engineer solutions
- Wait for perfect conditions

### Remember
**Goal: Get 10 paying customers in first month, not build perfect product**

Every day without paying customers is a day without validation. Launch lean, iterate based on real feedback.

---

## NEXT 2 WEEKS: Launch Sprint

### Week 1 (Nov 29 - Dec 6): Polish & Testing

**Priority: Make it bulletproof on all devices**

1. **Feature Gating (CRITICAL for launch)** ✅ **COMPLETE**
   - [x] Create `useSubscription` composable to check user's plan tier
   - [x] Define tier limits:
     - **Free:** 5 journal entries, 10 evidence uploads, basic timeline, no exports
     - **Pro/Alpha:** Unlimited everything, AI features, exports, priority support
   - [x] Gate features in UI:
     - [x] Journal entry creation (show limit, upgrade prompt)
     - [x] Evidence uploads (show limit, upgrade prompt)
     - [x] Export generation (Pro only)
     - [x] AI insights/patterns (Pro only)
   - [x] Gate features in API:
     - [x] `/api/capture/save-events` - check entry count before allowing new entries
     - [x] `/api/evidence-upload` - check evidence count before allowing uploads
     - [x] `/api/exports` - require Pro tier
   - [x] Create upgrade prompt component (reusable)
   - [x] Add "Upgrade to Pro" CTAs where features are locked
   - [ ] Test: Free user hits limit → sees upgrade prompt → upgrades → feature unlocks

2. **Mobile Responsiveness (Priority 6)** ← **COMPLETED Nov 30**
   - [x] Home/Dashboard - ✅ looks good
   - [x] Onboarding wizard - ✅ looks amazing
   - [x] Individual export page - ✅ looks good
   - [x] **Capture flow:** Fixed pills with outline variant and proper contrast
   - [x] **Timeline:** Redesigned toolbar with scrollable filters and mobile-friendly search
   - [x] **Evidence list:** Moved search/selector to secondary toolbar; cleaner list design with thumbnails and USeparator
   - [x] **Exports list:** Responsive columns - show fewer on mobile, truncate data for readability
   - [x] **Billing page:** Consolidated status cards into one; tier selector already working
   - [x] **Floating "Record" FAB** ✅ - sticky button for quick voice capture on mobile

3. **Dashboard Loading UX**
   - [ ] Add `USkeleton` placeholders to all data-heavy pages
   - [ ] Pages render immediately, data pops in after fetch
   - [ ] Apply to: Home, Timeline, Journal, Evidence, Exports
   - [ ] No more blank/white screens while loading

4. **Error Handling Polish**
   - [ ] Review all API error responses for user-friendly messages
   - [ ] Add fallback states for failures
   - [ ] Handle offline/network error gracefully

5. **Full User Journey Testing**
   - [ ] Test: Signup → Onboarding → First capture → Timeline → Export
   - [ ] Test: Payment flow end-to-end (Stripe test mode)
   - [ ] Test: All auth flows (email, Google OAuth, password reset)
   - [ ] Test: Free tier limits → upgrade flow → unlocked features
   - [ ] Document any bugs found

### Week 2 (Dec 7 - Dec 13): Production Readiness

**Priority: Launch infrastructure**

1. **Monitoring & Analytics (Priority 7)**
   - [ ] Set up Sentry for error tracking
   - [ ] Set up Posthog for basic analytics
   - [ ] Add conversion tracking (signup → paid)
   - [ ] Create simple dashboard for key metrics

2. **Support Infrastructure**
   - [ ] Create FAQ/Help page with common questions
   - [ ] Set up support email (hello@monumentlabs.io already exists)
   - [ ] Add bug report mechanism (email or simple form)

3. **Final Launch Prep**
   - [ ] Configure Stripe for production (real API keys)
   - [ ] Set up Stripe webhook endpoint for production
   - [ ] Final production smoke test
   - [ ] Prepare launch announcement

---

## Phase 2 Status Summary

| Priority | Item | Status |
|----------|------|--------|
| 1 | Image Evidence Storage | ✅ Complete |
| 2 | Evidence-Event Association | ✅ Complete |
| 3 | Payments & Billing (Infrastructure) | ✅ Complete |
| 4 | Landing Page & Branding | ✅ Complete |
| 5 | Onboarding & First Experience | ✅ Complete |
| 6 | **Feature Gating (Free vs Paid)** | ✅ Complete |

**✅ Phase 2 is complete! Ready to move on to mobile testing and production readiness.**

---

*Last thought: The core product is complete. Voice → Timeline → Export works. Payment infrastructure is ready. Onboarding guides new users. **Feature gating is now complete** - Free tier limits enforced (5 journal entries, 10 evidence uploads, no exports) with upgrade prompts throughout. **Mobile responsiveness complete (Nov 30)** - All pages now mobile-friendly: Capture flow pills fixed with outline variant, Timeline has scrollable toolbar, Evidence list has cleaner design with thumbnails and separators, Exports list shows fewer columns on mobile, Billing cards consolidated. **Floating Record FAB complete (Nov 30)** - Mobile-only FAB in bottom-right for quick voice capture access. Next: Dashboard loading UX (skeleton states) and error handling polish.*
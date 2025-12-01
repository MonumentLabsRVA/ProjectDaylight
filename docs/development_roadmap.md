# Project Daylight - MVP Launch Roadmap

*Last Updated: December 1, 2025*

**Goal: Launch polished MVP for law firms to offer their clients**

---

## Executive Summary

The core product is **functionally complete**. Voice capture → timeline → export works end-to-end. Payments, onboarding, and support infrastructure are in place. 

**Remaining work is polish** — hiding technical metadata from users, improving empty states, and ensuring a professional experience for law firm clients.

---

## Current Status: Ready for Polish Pass

### ✅ Core Features Complete
- Voice capture → transcription → event extraction → timeline
- Evidence upload with image storage and OCR
- Court-ready PDF exports with timeline data
- Timeline view with filtering by date, type, and search
- Journal entries with event extraction
- Evidence-event linking (automatic)
- Image preview and full-size viewer

### ✅ Business Infrastructure Complete
- Stripe payments (checkout, portal, webhooks)
- Subscription tiers: Free (5 entries, 10 uploads) / Pro ($49/mo) / Alpha
- Feature gating enforced at API and UI level
- 9-step onboarding wizard

### ✅ User Experience Complete
- Professional landing page
- Brand identity (logo, favicons, colors)
- Mobile responsive design
- Floating record FAB for mobile
- Help & FAQ page
- User feedback/bug report system

### ✅ Legal & Support Complete
- Terms of Service
- Privacy Policy
- Security page
- Help page with FAQs
- Bug report submission system

---

## MVP POLISH SPRINT

### 🚨 Priority 1: Editable Transcription (IMMEDIATE FIX)

Users need to easily edit transcribed audio after recording.

- [ ] Replace current transcription display with a single free-form text box
- [ ] User can optionally populate with transcription, or type directly
- [ ] All content should be directly editable inline
- [ ] Simple, clean UI — just a text area they can modify before submitting

**Why immediate:** Current flow is confusing. Users should feel in control of what gets recorded.

### 🎯 Priority 2: Background Extraction Jobs

Run extraction jobs asynchronously so users aren't stuck waiting. May require external worker service (e.g., Inngest, QStash, or similar) for serverless environment.

- [ ] Move extraction processing to a background worker
- [ ] Worker updates job status in database (pending → processing → complete)
- [ ] On submission: show toast confirming "You're all set! Results will be ready in ~30 seconds"
- [ ] On completion: push toast notification with clickable link to the journal entry
- [ ] Handle failure case gracefully with error toast

**Why important:** Current synchronous flow blocks the user. Background processing improves perceived speed and lets users continue working.

### 🎯 Priority 3: Hide Technical Metadata from Users (1-2 days)

Users are seeing developer-facing information that creates confusion and looks unprofessional.

**Event Detail Page** (`/event/[id].vue`):
- [ ] Remove "Metadata" card showing Event ID, Timestamp Precision, Created/Updated dates
- [ ] Simplify delete modal text (remove database/cascade explanations)
- [ ] Keep only user-relevant info: type, title, description, date, location, participants, evidence

**Evidence Detail Page** (`/evidence/[id].vue`):
- [ ] Remove "Metadata" card showing Evidence ID, Source Type, Created/Updated dates
- [ ] Remove "Storage Path" and "File Type (mimeType)" display
- [ ] Simplify delete modal text
- [ ] Keep only: name, type, summary, tags, image preview, related events

**Evidence List Page** (`/evidence/index.vue`):
- [ ] Remove developer text: "Central library of your uploaded evidence..."

**Home Page** (`/home.vue`):
- [ ] Consider hiding or simplifying status badges (draft/processing/review/completed)
- [ ] Users don't need to know internal processing states

### 🎯 Priority 4: Empty State Polish (1 day)

First impressions matter. New law firm clients will see empty states first.

- [ ] Review all empty states for tone and helpfulness
- [ ] Ensure empty states guide users to take action
- [ ] Consider adding illustration or icon for visual appeal
- [ ] Pages to check: Timeline, Journal, Evidence, Exports, Home

### 🎯 Priority 5: Copy & Tone Review (1 day)

Ensure all user-facing text is professional and appropriate for legal use case.

- [ ] Review button labels, headings, and descriptions
- [ ] Remove any casual/developer language
- [ ] Ensure consistency in terminology (e.g., "journal entry" vs "capture")
- [ ] Check error messages are helpful, not technical

### 🎯 Priority 6: Loading States (1 day)

Professional feel requires smooth loading experience.

- [ ] Add skeleton loaders to remaining pages without them
- [ ] Ensure no blank white screens during data fetch
- [ ] Pages: Home dashboard stats, exports list, billing

---

## NICE-TO-HAVE (Post-MVP)

### Error Handling Polish
- [ ] Review API error responses for user-friendliness
- [ ] Add fallback states for API failures
- [ ] Handle network errors gracefully

### Performance
- [ ] Review bundle size
- [ ] Lazy load heavy components
- [ ] Optimize landing page images

### Monitoring & Analytics
- [ ] Sentry for error tracking
- [ ] Posthog for usage analytics
- [ ] Conversion tracking (signup → paid)

### Future Features (Month 2+)
- AI Chat interface for querying timeline
- Direct camera capture
- Email forwarding for evidence
- Pattern detection & insights
- Attorney collaboration features
- Mobile native apps

---

## COMPLETED WORK

### Phase 1: Core Fixes ✅
- Fixed production API/auth issues
- Cookie-based auth with proper JWT handling
- All routes working in production

### Phase 2: Launch Essentials ✅
- Image evidence storage with Supabase
- Evidence-event linking
- Stripe payments & billing page
- Landing page & branding
- Onboarding wizard

### Phase 3: Polish ✅
- Feature gating (Free vs Pro limits)
- Mobile responsiveness (all pages)
- Floating Record FAB
- Support infrastructure (Help & FAQ, bug reports)

---

## Launch Checklist

### Pre-Launch
- [x] Full user journey works (signup → onboarding → capture → export)
- [x] Feature gating works (Free limits enforced, Pro unlocks)
- [x] Payment flow end-to-end
- [x] Mobile tested on real devices
- [x] Stripe in live mode
- [ ] **Editable transcription (immediate fix)**
- [ ] **UI polish pass complete (hide metadata)**
- [ ] **Empty states reviewed**
- [ ] **Copy tone checked**

### Launch Day
- [ ] Support email monitored (hello@monumentlabs.io)
- [ ] Team available for hotfixes (first 48 hours)

### Success Metrics (First Month)
- [ ] 3 law firms onboarded
- [ ] 10+ active users via law firm referrals
- [ ] <5% error rate in production
- [ ] Zero critical bugs reported

---

## Development Philosophy

### For MVP Launch
- **Hide complexity** — users don't need UUIDs, timestamps, or database details
- **Guide the user** — empty states should prompt action
- **Professional tone** — this is for legal proceedings, not a casual app
- **Ship fast** — polish what users see, defer what they don't

### Don'ts
- Don't add new features before launch
- Don't over-engineer solutions
- Don't show technical metadata to users
- Don't wait for perfect — ship and iterate

---

*The product works. Now make it look like it was built for lawyers and their clients, not developers.*

# Project Daylight - Product Vision & Strategy

*Last Updated: November 2024*
*Revised: November 2024 - Updated terminology from "captures" to "journal entries"*

---

## Executive Summary

**Project Daylight** (working name) is an AI-powered evidence and timeline platform designed specifically for parents navigating high-stakes family court situations. It transforms the chaos of divorce, custody disputes, and co-parenting conflicts into clear, court-ready documentation through effortless journaling, automatic organization, and intelligent analysis.

### Core Value Proposition
> "Transform exhausted scribbles into court-ready evidence."

### Mission
To bring clarity, order, and insight to parents navigating family court, enabling them to focus on their children rather than paperwork.

---

## The Problem

### Emotional Reality
Parents in custody battles are:
- Exhausted from carrying both parenting and litigation burdens
- Terrified of missing critical evidence
- Overwhelmed by documentation requirements
- Anxious about court perceptions
- Operating at cognitive capacity while emotionally depleted

### Functional Reality
Current solutions fail because:
- Co-parenting apps focus on communication, not evidence
- Note-taking apps lack legal structure
- Lawyers need organized timelines parents can't produce
- Evidence lives scattered across texts, emails, photos, calendars
- No tool connects daily parenting to legal narrative

### Market Gap
**Nobody is building for the exhausted parent who needs a system, not sympathy.**

---

## Product Philosophy

### 1. Zero Friction Journaling
*"If it requires effort, it won't get documented."*
- Voice journal entries while driving
- Attach screenshots with a tap
- Write quick entries when voice isn't convenient

### 2. Automatic Intelligence
*"The AI is your paralegal, not your therapist."*
- Extract events from rambling voice notes
- OCR and parse screenshots instantly
- Tag patterns without asking

### 3. Proactive Insights
*"Tell me what matters before I know to ask."*
- Surface contradictions automatically
- Identify documentation gaps
- Predict what judges focus on

### 4. Court-Ready Output
*"From chaos to credible in one click."*
- Generate timeline PDFs
- Package evidence exhibits
- Create GAL response packets

### 5. Calm Neutrality
*"This is about truth, not taking sides."*
- No emotional language
- No "winning" or "losing"
- Just facts, organized

---

## Design Principles

### Visual Approach
- **Minimal and clean** - Focus on content, not chrome
- **Monochrome base** - Gray scale with semantic colors for status only
- **Standard components** - Use shadcn/ui defaults, don't overthink
- **Information density** - Show more data, less decoration
- **Professional feel** - This is serious software for serious situations

### Interface Guidelines
- No custom fonts or fancy animations
- Clear hierarchy through size and weight
- Generous white space for breathing room
- Status through color: Green (positive), Red (incident), Blue (info)
- Mobile-first but desktop-capable

---

## MVP Product Structure

### Core User Journey

```
Chaos → Journal → Structure → Insight → Output
```

### 1. Journal Entry Layer

The **Journal Entry** is the primary unit of user input in Daylight. It represents a narrative moment—what happened, when it happened, and optionally, supporting evidence. Journal entries are the raw material that gets processed into structured timeline events.

**Voice Journal Entry** (Home Screen Hero)
- Single tap to voice record
- Auto-transcribe with timestamp
- AI extracts structured events from natural speech
- Background processing

**Written Journal Entry**
- Quick text input for when voice isn't convenient
- Reference date picker for "when did this happen"
- Attach evidence inline

**Evidence Attachment**
- Attach screenshots, photos, documents to any journal entry
- Add annotations explaining what each piece shows
- AI analyzes evidence and incorporates into event extraction

**Email Forwarding** (Future)
- Unique inbox per user
- Parse sender, date, content
- Extract attachments
- Auto-create journal entry from email

**Calendar Sync** (Future)
- Pull custody schedule
- Import parenting events
- Auto-document activities

### 2. Timeline View

**Unified Timeline**
- Chronological event stream
- Color coding by type
- Expandable detail cards
- Filter by date range

**Event Types:**
- 🟢 Positive Parenting (green)
- 🔴 Incidents (red)
- 🔵 Medical (blue)
- 🟡 School (yellow)
- 🟣 Communication (purple)
- ⚫ Legal/Court (black)

**Smart Grouping:**
- Daily summaries
- Weekly patterns
- Monthly reports

### 3. Evidence Repository

**Document Library**
- All original sources
- Full-text search
- Tag management
- Quick preview

**Evidence Linking**
- Connect docs to events
- Build exhibit chains
- Track contradictions

### 4. AI Interpreter

**Natural Language Queries:**
- "What happened last Tuesday?"
- "Show me all medical decisions"
- "Find contradictions about bedtime"
- "Summarize my involvement this month"

**Proactive Insights:**
- Pattern detection
- Gap analysis
- Risk alerts
- Preparation suggestions

### 5. Export Center

**One-Click Reports:**
- Full chronological timeline
- Incident summary
- Positive parenting narrative
- GAL response packet
- Exhibit list with attachments

**Formats:**
- PDF (court-ready)
- Word (attorney edits)
- CSV (data export)
- Shared link (read-only)

---

## User Interface Hierarchy

### Mobile-First Views

**1. Home Screen**
```
[Header: Date | Settings]
[New Journal Entry Button]
[Today's Summary Card]
[Recent Events List]
[Bottom Nav: Home | Journal | Timeline | Evidence | Export]
```

**2. Timeline Screen**
```
[Filter Bar: Date Range | Type | Person]
[Timeline Events - Infinite Scroll]
  - Time stamp
  - Event card with border color
  - Attachments indicator
[Floating Add Button]
```

**3. Evidence Screen**
```
[Search Bar]
[Filter Pills: Photos | Texts | Emails | Documents]
[Grid/List Toggle]
[Evidence Items with Previews]
```

**4. Interpreter Screen**
```
[Suggested Questions]
[Chat-like Interface]
[Response Cards with Citations]
[Follow-up Suggestions]
```

**5. Export Screen**
```
[Quick Exports Section]
  - Last 30 Days PDF
  - Full Timeline
  - Incident Report
[Custom Report Builder]
[Sharing Options]
```

---

## Information Architecture

### Data Model (Conceptual)

**Journal Entry**
- The primary input unit—a user's narrative about what happened
- Event text (voice transcript or written description)
- Reference date (when the events occurred)
- Processing status (draft → processing → review → completed)
- Extraction result (structured events extracted by AI)
- Attached evidence items

**Event** (extracted from Journal Entries)
- Timestamp
- Type (positive/incident/medical/etc)
- Description
- Participants
- Location (optional)
- Evidence links
- AI-generated tags
- Source journal entry reference

**Evidence**
- Source type (text/email/photo/document)
- Original content
- Extracted text (OCR/AI analysis)
- User annotation (context provided by user)
- Metadata
- Event associations
- Journal entry associations

**Insight**
- Query
- Response
- Evidence citations
- Confidence score
- Timestamp

### Privacy & Security Principles
- End-to-end encryption for sensitive data
- No sharing between accounts
- HIPAA-compliant infrastructure
- Attorney-client privilege respect
- Data portability guaranteed

---

## Go-to-Market Strategy

### Target Segments

**Primary:** Parents in Active Custody Disputes
- Highest pain point
- Willing to pay immediately
- Clear ROI (legal fees saved)

**Secondary:** Proactive Divorced Parents
- Ongoing documentation needs
- Lower urgency but longer LTV
- Word-of-mouth potential

**Tertiary:** Family Law Attorneys
- Recommend to all clients
- Reduce their workload
- Professional credibility

### Pricing Strategy

**Trial:** 7-day full access

**Target Pricing:** $49-99/month
- Find the sweet spot through testing
- High enough to signal value
- Low enough for stressed parents

**Emergency Package:** One-time high ticket
- "Court date tomorrow" offering
- Complete organization service
- Premium for urgency

### Distribution

**Direct to Consumer:**
- SEO: "custody documentation app"
- Reddit: Legal advice, divorce, custody subs
- Facebook: Single parent groups
- Local: Richmond family court pilot

**Professional Channel:**
- Attorney partnerships
- GAL training programs
- Mediation centers
- Court clerk referrals

---

## Success Metrics

### User Success
- Time from chaos to first export: <24 hours
- Journal entries per week: >5 (yielding 20+ structured events)
- Documentation completeness: >80%

### Business Success
- Trial to paid conversion: >40%
- Monthly churn: <5%
- NPS: >50
- Payback period: <3 months

### Impact Metrics
- Hours saved per user per month: 10+
- Legal fee reduction: $1000+
- Custody outcomes improved: Track testimonials

---

## Competitive Positioning

### We Are NOT:
- ❌ Another co-parenting app (OurFamilyWizard, Talking Parents)
- ❌ A communication tool (focus on evidence, not messaging)
- ❌ Emotional support (we organize, not comfort)
- ❌ Legal advice (we prepare, not advise)

### We ARE:
- ✅ The first AI-native evidence platform
- ✅ A cognitive prosthetic for overwhelmed parents
- ✅ The bridge between daily life and legal requirements
- ✅ Automated paralegal-quality organization

---

## Development Principles

### Technical Philosophy
- **Mobile-first:** Most journaling happens on phones
- **Offline-capable:** Court happens in dead zones
- **AI-powered:** Every interaction should feel magical
- **Privacy-first:** This is sensitive data

### Quality Bar
- **Performance:** Every action <200ms
- **Reliability:** 99.9% uptime
- **Accuracy:** AI extraction >95% accurate
- **Security:** Bank-level encryption

---

## Roadmap & Future Directions

### Next 3 Months: Core MVP
- **Month 1:** Journal + Timeline
  - Voice journal entries with transcription
  - Written journal entries with date picker
  - Evidence attachment to journal entries
  - AI extraction of structured events from entries
  - Basic chronological timeline
  - Simple PDF export
  
- **Month 2:** Intelligence Layer
  - AI event extraction refinement
  - Pattern recognition on real user data
  - Basic contradiction detection
  - Evidence linking (events ↔ evidence ↔ journal entries)
  
- **Month 3:** Market Entry
  - Payment processing
  - Onboarding flow
  - First 100 paying users
  - Attorney feedback loop

### Months 4-6: Product-Market Fit
- Refine based on user feedback
- Optimize AI accuracy
- Add advanced export templates
- Build attorney referral program
- Scale to 500 paying users

### Months 7-12: Revenue Stability
- Target $50K MRR
- Launch affiliate program
- State-specific templates
- API for attorney tools
- Mobile app optimization

### Potential Future Directions
*These are possibilities, not commitments:*

- **Legal Integration:** Direct filing with court systems
- **Attorney Marketplace:** Connect with family law specialists
- **Document Generation:** Automated legal document drafting
- **Multi-party Access:** Shared workspace for legal teams
- **Insurance Products:** Documentation insurance for custody cases

The focus remains on achieving sustainable revenue through the core evidence management platform before expanding.

---

## Why This Wins

1. **Solving a screaming pain point** - Parents lose custody over poor documentation
2. **Defensible moat** - AI trained on real custody patterns
3. **High willingness to pay** - Stakes couldn't be higher
4. **Viral loops** - Attorneys recommend to all clients
5. **Mission-driven** - Genuinely helps children by helping parents

---

## Immediate Next Steps

### Now
- [x] Journal entry creation flow (voice + text input)
- [x] Evidence attachment to journal entries
- [x] AI extraction of structured events from journal entries
- [ ] Tighten the Export center around real data (timeline + evidence + journal entries)

### Next
- [ ] Add a simple AI interpreter surface (chat-style UI) on top of stored timeline + evidence
- [ ] Start limited testing with a small group of real users (3–10) and refine flows
- [ ] Journal entry history view with filtering and search

---

*"In the chaos of custody battles, Project Daylight brings clarity."*
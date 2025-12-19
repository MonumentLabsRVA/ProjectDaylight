# AI Extraction Improvements

This document outlines targeted improvements to the journal entry extraction system to make it more effective for family law custody cases, with jurisdiction-specific guidance starting with Virginia.

## Background

The current extraction system has solid fundamentals but is optimized for generic family law rather than what state-specific courts actually weight in custody decisions. These improvements will make the system more valuable for users in active custody disputes.

## Files to Modify

- `src/server/api/capture/extract-events.post.ts` - Real-time extraction endpoint
- `src/server/inngest/functions/journal-extraction.ts` - Background job extraction
- `src/app/types/index.d.ts` - Type definitions (if needed)
- New: `src/server/utils/state-guidance.ts` - State-specific legal guidance

---

## 1. Reframe Event Types

### Current Implementation

```typescript
z.enum(['incident', 'positive', 'medical', 'school', 'communication', 'legal'])
```

This lumps too much together. "Positive parenting" covers both "emptied dishwasher" and "read books together at bedtime for 30 minutes"—those aren't equivalent in terms of court relevance.

### Proposed Implementation

```typescript
z.enum([
  'parenting_time',      // Actual engaged time with child (reading, playing, activities)
  'caregiving',          // Meals, baths, bedtime routines, medical care
  'household',           // Chores, maintenance, logistics
  'coparent_conflict',   // Disputes, violations, hostility between parents
  'gatekeeping',         // Interference, withholding info, alienating language
  'communication',       // Neutral coordination (scheduling, logistics)
  'medical',             // Medical appointments, health decisions, medications
  'school',              // School events, homework, academic matters
  'legal'                // Court filings, attorney communications, legal proceedings
])
```

### Why This Matters

Courts distinguish between:
- **Engaged parenting** (quality time) vs **household tasks** (chores)
- **Neutral co-parent communication** vs **conflict/gatekeeping**
- Evidence of active alienation behaviors needs explicit categorization

### Implementation Notes

- [ ] Update `EventSchema` type enum in both files
- [ ] Update database `events.type` enum (migration required)
- [ ] Consider backward compatibility: map old types → new types for existing data
- [ ] Update any UI that displays/filters by event type

---

## 2. Add Gatekeeping Detection to System Prompt

### Current State

The system prompt doesn't specifically call out gatekeeping behaviors, which are critical in custody disputes.

### Add to Rules Section

```
- Flag "gatekeeping" behaviors explicitly: schedule interference, withholding information 
  (medical, school, location), controlling access to child's belongings, alienating 
  language to or about the other parent in child's presence, unilateral decisions about 
  child's schedule/activities.
```

### What Qualifies as Gatekeeping

| Behavior | Example |
|----------|---------|
| Schedule interference | Not returning child on time, changing pickup locations without notice |
| Withholding information | Not sharing report cards, doctor visit results, school events |
| Controlling access to belongings | Refusing to send child's clothes, toys, medications |
| Alienating language | Negative comments about other parent in child's presence |
| Unilateral decisions | Enrolling in activities, changing doctors without consultation |

---

## 3. Add Child Statements Field

### Proposed Schema Addition

```typescript
child_statements: z.array(z.object({
  statement: z.string().describe('Direct quote or paraphrased statement from the child'),
  context: z.string().describe('When and where the statement was made'),
  concerning: z.boolean().describe('Whether this statement indicates alienation, coaching, or distress')
})).describe('Direct quotes or paraphrased statements from the child')
```

### Why This Matters

Child statements can be powerful evidence of:
- **Alienation** - Child saying things that mirror the other parent's language
- **Coaching** - Child asking questions or making statements beyond their understanding
- **Confusion** - Child unsure of custody arrangements (e.g., "are you taking me to daddy's house?" when they live with daddy)

### Database Consideration

May need a new `child_statements` table or store as JSONB in `events.metadata`:

```sql
-- Option A: New table
CREATE TABLE child_statements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  statement text NOT NULL,
  context text,
  is_concerning boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Option B: JSONB in events table (simpler)
-- Store in events.metadata field
```

---

## 4. Strengthen Pattern Detection Prompt

### Current State

The `patterns_noted` field exists but the model isn't guided on what patterns matter for custody cases.

### Add to System Prompt

```
- Note patterns relevant to custody: 
  - Repeated schedule violations (late pickups, early dropoffs, missed exchanges)
  - Consistent failure to communicate about child's welfare
  - Escalating hostility in co-parent interactions
  - Delegation of parenting to third parties (new partners, grandparents doing primary care)
  - Disruption of child's routine (bedtime, meals, activities)
  - Withholding of medical or school information
  - Pattern of unilateral decision-making
```

### Implementation

Update `patterns_noted` to be more structured:

```typescript
patterns_noted: z.array(z.object({
  pattern_type: z.enum([
    'schedule_violation',
    'communication_failure', 
    'escalating_hostility',
    'delegation_of_parenting',
    'routine_disruption',
    'information_withholding',
    'unilateral_decisions'
  ]),
  description: z.string(),
  frequency: z.enum(['first_time', 'recurring', 'chronic']).nullable()
}))
```

---

## 5. Add Co-Parent Communication Tone Analysis

### Proposed Schema Addition

```typescript
coparent_interaction: z.object({
  your_tone: z.enum(['neutral', 'cooperative', 'defensive', 'hostile']).nullable(),
  their_tone: z.enum(['neutral', 'cooperative', 'defensive', 'hostile']).nullable(),
  your_response_appropriate: z.boolean().nullable().describe('Whether the user\'s response was appropriate to the situation')
}).nullable().describe('Analysis of co-parent interaction tone when applicable')
```

### Why This Matters

Courts review communication records (OFW, texts, emails). Demonstrating that one party consistently stays measured while the other escalates is powerful evidence. This field helps the user:

1. Document the other parent's escalating behavior
2. Get feedback on their own communication (self-improvement)
3. Build a pattern of evidence showing restraint

### Usage

Only populate when the event involves direct co-parent communication. Set to `null` for events that don't involve interaction with the co-parent.

---

## 6. Fix Welfare Impact Schema

### Current Implementation

```typescript
welfare_impact: z.enum(['none', 'minor', 'moderate', 'significant', 'positive', 'unknown'])
```

This conflates severity with direction. Something can be "significantly positive" or "moderately negative."

### Proposed Implementation

```typescript
welfare_impact: z.object({
  category: z.enum([
    'routine',      // Daily routines, schedules
    'emotional',    // Emotional wellbeing, stress, anxiety
    'medical',      // Physical health, medical care
    'educational',  // School, learning, development
    'social',       // Friendships, activities, extracurriculars
    'safety',       // Physical safety, supervision
    'none'          // No impact on child welfare
  ]),
  direction: z.enum(['positive', 'negative', 'neutral']),
  severity: z.enum(['minimal', 'moderate', 'significant']).nullable()
}).describe('Impact on child welfare with category, direction, and severity')
```

### Database Migration

Update `events` table:

```sql
-- Add new columns
ALTER TABLE events 
  ADD COLUMN welfare_category text,
  ADD COLUMN welfare_direction text,
  ADD COLUMN welfare_severity text;

-- Migrate existing data
UPDATE events SET 
  welfare_direction = CASE 
    WHEN welfare_impact = 'positive' THEN 'positive'
    WHEN welfare_impact = 'none' THEN 'neutral'
    WHEN welfare_impact = 'unknown' THEN 'neutral'
    ELSE 'negative'
  END,
  welfare_severity = CASE 
    WHEN welfare_impact = 'minor' THEN 'minimal'
    WHEN welfare_impact = 'moderate' THEN 'moderate'
    WHEN welfare_impact = 'significant' THEN 'significant'
    ELSE NULL
  END;

-- Eventually drop old column
ALTER TABLE events DROP COLUMN welfare_impact;
```

---

## 7. State-Specific Legal Guidance

### Architecture

Create a new utility file `src/server/utils/state-guidance.ts` that provides jurisdiction-specific context for the LLM.

```typescript
// src/server/utils/state-guidance.ts

interface StateGuidance {
  state: string
  statute: string
  standard: string
  keyFactors: string[]
  promptGuidance: string
}

export const STATE_CUSTODY_GUIDANCE: Record<string, StateGuidance> = {
  'Virginia': {
    state: 'Virginia',
    statute: 'VA Code § 20-124.3',
    standard: 'best interests of the child',
    keyFactors: [
      'Each parent\'s role in caregiving (who handles daily care, medical appointments, school)',
      'Willingness to support the child\'s relationship with the other parent',
      'Ability to maintain a close and continuing relationship with the child',
      'Child\'s reasonable preference (if of appropriate age and maturity)',
      'History of family abuse',
      'Each parent\'s ability to resolve disputes',
      'Propensity of each parent to support the child\'s contact with the other parent'
    ],
    promptGuidance: `Virginia courts apply the "best interests of the child" standard under VA Code § 20-124.3. 
Key factors weighted heavily:
- Each parent's role in daily caregiving (who handles meals, bedtime, medical care, school involvement)
- Willingness to support the child's relationship with the other parent (evidence of gatekeeping is damaging)
- Ability to maintain a close and continuing relationship with the child
- Each parent's ability to resolve disputes without conflict
- History of family abuse (if applicable)

Document events that speak to these specific factors. J&DR courts specifically look for patterns of behavior, not isolated incidents.`
  },

  // Add more states as needed
  'California': {
    state: 'California',
    statute: 'Family Code § 3011',
    standard: 'best interest of the child',
    keyFactors: [
      'Health, safety, and welfare of the child',
      'History of abuse by one parent',
      'Nature and amount of contact with both parents',
      'Habitual or continual use of alcohol or drugs'
    ],
    promptGuidance: `California courts apply Family Code § 3011 for custody determinations.
Key considerations:
- Health, safety, and welfare of the child
- Any history of abuse by one parent against the child or other parent
- The nature and amount of contact with both parents
- Any habitual or continual illegal use of controlled substances or alcohol

Document events related to these factors specifically.`
  },

  // Default/generic guidance when state is unknown or not yet implemented
  '_default': {
    state: 'Unknown',
    statute: 'General family law principles',
    standard: 'best interests of the child',
    keyFactors: [
      'Each parent\'s caregiving role',
      'Stability and continuity',
      'Co-parenting ability',
      'Child\'s needs and preferences'
    ],
    promptGuidance: `Courts generally apply a "best interests of the child" standard. 
Key factors typically include:
- Each parent's role in caregiving
- Stability and continuity in the child's life
- Parents' ability to co-parent effectively
- Child's physical and emotional needs

Document events that demonstrate your involvement and any concerning behaviors by the other party.`
  }
}

export function getStateGuidance(jurisdictionState: string | null | undefined): StateGuidance {
  if (!jurisdictionState) {
    return STATE_CUSTODY_GUIDANCE['_default']
  }

  // Normalize state name (handle abbreviations)
  const normalized = normalizeStateName(jurisdictionState)
  
  return STATE_CUSTODY_GUIDANCE[normalized] || STATE_CUSTODY_GUIDANCE['_default']
}

function normalizeStateName(input: string): string {
  const abbrevMap: Record<string, string> = {
    'VA': 'Virginia',
    'CA': 'California',
    'TX': 'Texas',
    'NY': 'New York',
    'FL': 'Florida',
    // Add more as guidance is added
  }

  const trimmed = input.trim()
  
  // Check if it's an abbreviation
  if (abbrevMap[trimmed.toUpperCase()]) {
    return abbrevMap[trimmed.toUpperCase()]
  }
  
  // Title case the input
  return trimmed.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
```

### Integration in Extraction

When building the system prompt, inject state-specific guidance:

```typescript
// In extract-events.post.ts and journal-extraction.ts

import { getStateGuidance } from '~/server/utils/state-guidance'

// When building caseContext...
if (caseRow?.jurisdiction_state) {
  const guidance = getStateGuidance(caseRow.jurisdiction_state)
  
  // Add to system prompt
  if (guidance.state !== 'Unknown') {
    lines.push('')
    lines.push('JURISDICTION-SPECIFIC GUIDANCE:')
    lines.push(guidance.promptGuidance)
  }
}
```

---

## Schema Comparison: Current vs Proposed

### Current Extraction Schema

```
extraction
├── events[]
│   ├── type: 'incident' | 'positive' | 'medical' | 'school' | 'communication' | 'legal'
│   ├── title: string
│   ├── description: string
│   ├── primary_timestamp: string | null (ISO-8601)
│   ├── timestamp_precision: 'exact' | 'day' | 'approximate' | 'unknown'
│   ├── duration_minutes: number | null
│   ├── location: string | null
│   ├── participants
│   │   ├── primary: ('co-parent' | 'child' | 'self' | 'other')[]
│   │   ├── witnesses: string[]
│   │   └── professionals: string[]
│   ├── child_involved: boolean
│   ├── evidence_mentioned[]
│   │   ├── type: 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other'
│   │   ├── description: string
│   │   └── status: 'have' | 'need_to_get' | 'need_to_create'
│   ├── patterns_noted: string[]  ← unstructured strings
│   └── custody_relevance
│       ├── agreement_violation: boolean | null
│       ├── safety_concern: boolean | null
│       └── welfare_impact: 'none' | 'minor' | 'moderate' | 'significant' | 'positive' | 'unknown'
│
├── action_items[]
│   ├── priority: 'urgent' | 'high' | 'normal' | 'low'
│   ├── type: 'document' | 'contact' | 'file' | 'obtain' | 'other'
│   ├── description: string
│   └── deadline: string | null
│
└── metadata
    ├── extraction_confidence: number | null
    └── ambiguities: string[]
```

### Proposed Extraction Schema

```
extraction
├── events[]
│   ├── type: 'parenting_time' | 'caregiving' | 'household' | 'coparent_conflict' | 
│   │         'gatekeeping' | 'communication' | 'medical' | 'school' | 'legal'
│   │         ↑ More granular types separating positive parenting from chores,
│   │           and conflict from gatekeeping behaviors
│   │
│   ├── title: string
│   ├── description: string
│   ├── primary_timestamp: string | null
│   ├── timestamp_precision: 'exact' | 'day' | 'approximate' | 'unknown'
│   ├── duration_minutes: number | null
│   ├── location: string | null
│   ├── participants
│   │   ├── primary: ('co-parent' | 'child' | 'self' | 'other')[]
│   │   ├── witnesses: string[]
│   │   └── professionals: string[]
│   ├── child_involved: boolean
│   ├── evidence_mentioned[]
│   │   ├── type: 'text' | 'email' | 'photo' | 'document' | 'recording' | 'other'
│   │   ├── description: string
│   │   └── status: 'have' | 'need_to_get' | 'need_to_create'
│   │
│   ├── ✨ child_statements[] ← NEW
│   │   ├── statement: string (direct quote or paraphrase)
│   │   ├── context: string (when/where said)
│   │   └── concerning: boolean (alienation/coaching/distress indicator)
│   │
│   ├── ✨ coparent_interaction ← NEW (nullable, only for co-parent events)
│   │   ├── your_tone: 'neutral' | 'cooperative' | 'defensive' | 'hostile' | null
│   │   ├── their_tone: 'neutral' | 'cooperative' | 'defensive' | 'hostile' | null
│   │   └── your_response_appropriate: boolean | null
│   │
│   ├── ✨ patterns_noted[] ← RESTRUCTURED (was string[], now objects)
│   │   ├── pattern_type: 'schedule_violation' | 'communication_failure' | 
│   │   │                 'escalating_hostility' | 'delegation_of_parenting' |
│   │   │                 'routine_disruption' | 'information_withholding' | 
│   │   │                 'unilateral_decisions'
│   │   ├── description: string
│   │   └── frequency: 'first_time' | 'recurring' | 'chronic' | null
│   │
│   └── custody_relevance
│       ├── agreement_violation: boolean | null
│       ├── safety_concern: boolean | null
│       └── ✨ welfare_impact ← RESTRUCTURED (was enum, now object)
│           ├── category: 'routine' | 'emotional' | 'medical' | 'educational' | 
│           │             'social' | 'safety' | 'none'
│           ├── direction: 'positive' | 'negative' | 'neutral'
│           └── severity: 'minimal' | 'moderate' | 'significant' | null
│
├── action_items[] (unchanged)
│   ├── priority: 'urgent' | 'high' | 'normal' | 'low'
│   ├── type: 'document' | 'contact' | 'file' | 'obtain' | 'other'
│   ├── description: string
│   └── deadline: string | null
│
└── metadata (unchanged)
    ├── extraction_confidence: number | null
    └── ambiguities: string[]
```

### Summary of Changes

| Field | Current | Proposed |
|-------|---------|----------|
| `type` | 6 generic types | 9 custody-specific types |
| `child_statements` | ❌ Not captured | ✅ Array of quotes with context |
| `coparent_interaction` | ❌ Not captured | ✅ Tone analysis for both parties |
| `patterns_noted` | Simple string array | Structured with type + frequency |
| `welfare_impact` | Single enum mixing direction/severity | Object with category, direction, severity |

### Event Type Mapping (Old → New)

| Old Type | Maps To | What Changed |
|----------|---------|--------------|
| `positive` | `parenting_time` | Quality engaged time (reading, playing) |
| `positive` | `caregiving` | Daily care (meals, baths, bedtime) |
| `positive` | `household` | Chores, logistics (less court-relevant) |
| `incident` | `coparent_conflict` | Disputes, hostility |
| *(new)* | `gatekeeping` | Interference, withholding, alienation |
| `communication` | `communication` | Neutral coordination (unchanged) |
| `medical` | `medical` | Unchanged |
| `school` | `school` | Unchanged |
| `legal` | `legal` | Unchanged |

---

## Implementation Plan (4 Phases)

### Phase 1: Database Schema Changes
**Goal:** Prepare the database for new extraction features without breaking existing data.

- [x] **1.1** Create migration `0039_extraction_event_types_v2.sql`
  - [x] Add `type_v2` column to events table (text, nullable)
  - [x] Add CHECK constraint for valid new types
  - [x] Keep existing `type` column intact

- [x] **1.2** Create migration `0040_welfare_impact_restructure.sql`
  - [x] Add `welfare_category` column (text, nullable)
  - [x] Add `welfare_direction` column (text, nullable)
  - [x] Add `welfare_severity` column (text, nullable)
  - [x] Keep existing `welfare_impact` column intact

- [x] **1.3** Create migration `0041_child_statements_coparent.sql`
  - [x] Add `child_statements` column (jsonb, default '[]')
  - [x] Add `coparent_interaction` column (jsonb, nullable)
  - [x] Add `patterns_noted_v2` column (jsonb, default '[]')

- [x] **1.4** Run all migrations in dev environment
- [x] **1.5** Verify existing data is unaffected

---

### Phase 2: State Guidance Utility
**Goal:** Create jurisdiction-specific legal guidance system.

- [x] **2.1** Create `src/server/utils/state-guidance.ts`
  - [x] Define `StateGuidance` interface
  - [x] Implement Virginia guidance (VA Code § 20-124.3)
  - [x] Implement California guidance (Family Code § 3011)
  - [x] Implement `_default` fallback guidance
  - [x] Create `getStateGuidance()` function
  - [x] Create `normalizeStateName()` helper (handle abbreviations)

- [x] **2.2** Add state abbreviation mappings
  - [x] VA, CA, TX, NY, FL, PA minimum
  - [x] Title case normalization for full names

- [x] **2.3** Write unit tests for state guidance
  - [x] Test abbreviation normalization
  - [x] Test fallback to default
  - [x] Test Virginia-specific guidance retrieval

---

### Phase 3: Extraction Code Updates
**Goal:** Update extraction logic with new schemas and improved prompts.

#### 3A: Schema Updates (TypeScript/Zod)

- [x] **3.1** Update `EventSchema` type enum in `extract-events.post.ts`
  ```
  Old: incident, positive, medical, school, communication, legal
  New: parenting_time, caregiving, household, coparent_conflict, 
       gatekeeping, communication, medical, school, legal
  ```

- [x] **3.2** Add `child_statements` field to schema
  - [x] Array of objects with statement, context, concerning

- [x] **3.3** Add `coparent_interaction` field to schema
  - [x] your_tone, their_tone, your_response_appropriate

- [x] **3.4** Restructure `welfare_impact` to object format
  - [x] category, direction, severity

- [x] **3.5** Update `patterns_noted` to structured format (optional)
  - [x] pattern_type enum, description, frequency

- [x] **3.6** Mirror all schema changes in `journal-extraction.ts`

#### 3B: System Prompt Improvements

- [x] **3.7** Add gatekeeping detection rules to system prompt
  - [x] Schedule interference examples
  - [x] Withholding information examples
  - [x] Alienating language examples
  - [x] Unilateral decision examples

- [x] **3.8** Add pattern detection guidance to system prompt
  - [x] Schedule violations
  - [x] Communication failures
  - [x] Escalating hostility
  - [x] Delegation of parenting
  - [x] Routine disruption

- [x] **3.9** Integrate state guidance into extraction
  - [x] Import `getStateGuidance` in both extraction files
  - [x] Inject jurisdiction-specific prompt when case has state
  - [x] Test with Virginia jurisdiction case (ready for manual verification)

#### 3C: Database Write Updates

- [x] **3.10** Update event insert/update logic
  - [x] Write to new columns (type_v2, welfare_category, etc.)
  - [x] Dual-write to legacy columns for backward compat
  - [x] Handle child_statements and coparent_interaction JSONB

- [x] **3.11** Update TypeScript types in `src/app/types/`
  - [x] Add new event type union
  - [x] Add WelfareImpact interface
  - [x] Add ChildStatement interface
  - [x] Add CoparentInteraction interface

---

### Phase 4: UI, Testing & Rollout
**Goal:** Update UI components and verify everything works end-to-end.

#### 4A: UI Updates

- [x] **4.1** Update event type display/filtering
  - [x] Map new types to display labels
  - [x] Update any type badges/icons
  - [x] Handle both old and new types during transition

- [x] **4.2** Update event detail view
  - [x] Display child statements when present
  - [x] Display coparent interaction analysis
  - [x] Display structured welfare impact

- [x] **4.3** Update timeline/list views
  - [x] Filter by new event types
  - [x] Group appropriately

#### 4B: Testing Protocol

- [ ] **4.4** Test Case 1: Simple entry (baseline)
  - [ ] Verify minimal output, null/empty new fields
  - [ ] No over-extraction

- [ ] **4.5** Test Case 2: Complex multi-event entry
  - [ ] Multiple event types extracted
  - [ ] Child statements captured
  - [ ] Coparent tone analysis present
  - [ ] Pattern detection working
  - [ ] Response time < 30s

- [ ] **4.6** Test Case 3: Long narrative (2000+ words)
  - [ ] Completes without timeout
  - [ ] Quality consistent throughout
  - [ ] No hallucinations

- [ ] **4.7** Test Case 4: Edge cases
  - [ ] Entry with no custody-relevant content
  - [ ] Entry with only positive parenting
  - [ ] Entry with multiple child statements
  - [ ] Entry with extensive co-parent communication

- [ ] **4.8** Backward compatibility verification
  - [ ] Old events display correctly
  - [ ] Old event types map to new system
  - [ ] No data corruption

#### 4C: Data Migration (Post-Verification)

- [ ] **4.9** Create backfill migration for existing events
  - [ ] Map old type → type_v2
  - [ ] Map old welfare_impact → new columns
  - [ ] Run in batches to avoid locks

- [ ] **4.10** Verify backfill completed correctly
- [x] **4.11** Update application to read from new columns with fallback

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Database Schema | ✅ Completed | |
| 2. State Guidance | ✅ Completed | Implemented utility, abbreviation handling, and basic tests |
| 3. Extraction Code | ✅ Completed | Schemas, prompts, DB writes, and types updated |
| 4. UI & Testing | 🚧 In Progress | Phase 4A UI updates implemented; testing & backfill pending |

---

## Example: Before and After

### User Input

> "Yesterday Mari brought Josie back an hour late again. When I asked why, she said 'you're not her only parent you know.' Josie seemed tired and said 'mommy said we could stay up late because she doesn't have stupid rules like you.' I kept calm and just said 'okay, let's get you ready for bed.'"

### Current Extraction

```json
{
  "type": "incident",
  "title": "Late custody exchange",
  "description": "Co-parent returned child an hour late...",
  "custody_relevance": {
    "agreement_violation": true,
    "welfare_impact": "minor"
  }
}
```

### Improved Extraction

```json
{
  "type": "gatekeeping",
  "title": "Late custody exchange with alienating language",
  "description": "Co-parent returned child one hour late. When questioned, co-parent responded defensively...",
  "child_statements": [
    {
      "statement": "mommy said we could stay up late because she doesn't have stupid rules like you",
      "context": "Upon return from late custody exchange",
      "concerning": true
    }
  ],
  "coparent_interaction": {
    "your_tone": "neutral",
    "their_tone": "defensive", 
    "your_response_appropriate": true
  },
  "welfare_impact": {
    "category": "routine",
    "direction": "negative",
    "severity": "minimal"
  },
  "patterns_noted": [
    {
      "pattern_type": "schedule_violation",
      "description": "Repeated late returns from custody exchanges",
      "frequency": "recurring"
    }
  ],
  "custody_relevance": {
    "agreement_violation": true,
    "safety_concern": false
  }
}
```

---

## Future State Guidance Expansion

Priority order for adding state guidance:

1. **Virginia** ✓ (Initial implementation)
2. **Texas** - Large population, community property state
3. **California** - Large population, different legal framework
4. **Florida** - Large population, specific relocation laws
5. **New York** - Distinct court system structure
6. **Pennsylvania** - Common, different custody factors

Each state addition requires:
- Research of specific statutes
- Understanding of how courts weight factors differently
- Consultation with family law resources for that state

---

## Testing Strategy: Model Capacity & Complex Extractions

### Concern

Adding multiple new schema fields (child_statements, coparent_interaction, structured patterns, welfare_impact object) plus state-specific guidance significantly increases the prompt size and expected output complexity. We need to ensure the model doesn't:

1. **Truncate or omit fields** when overwhelmed
2. **Hallucinate** to fill required fields
3. **Degrade quality** on core extraction when distracted by new fields
4. **Hit token limits** on longer journal entries

### Testing Protocol

#### Test Case 1: Simple Entry (Baseline)
> "Picked up Josie from school today. She was happy to see me."

**Verify:** Model doesn't over-extract. Should produce minimal output with most new fields as `null` or empty arrays.

#### Test Case 2: Complex Multi-Event Entry
> "This weekend was rough. Friday night Mari was 45 minutes late for pickup again - third time this month. When I called to ask where she was, she didn't answer. Josie was upset and said 'mommy always forgets about me.' Saturday we did homework together for 2 hours, then went to her soccer game. She scored a goal! Sunday morning Mari called demanding I bring Josie back early because 'something came up' - turned out she wanted to take her to her boyfriend's family BBQ without telling me. When I said no per the custody agreement, she said 'you're always trying to control everything' and hung up. Josie overheard and asked 'why does mommy get so mad at you?'"

**Verify:**
- [ ] Multiple events extracted (gatekeeping, parenting_time, school, coparent_conflict)
- [ ] Child statements captured with correct context
- [ ] Coparent interaction tone analysis present for relevant events
- [ ] Pattern detection identifies recurring schedule violations
- [ ] No fields truncated or missing
- [ ] Response time acceptable (< 30s)

#### Test Case 3: Long Narrative (Token Stress Test)
Create a 2000+ word journal entry covering a full week of events.

**Verify:**
- [ ] Model completes without timeout
- [ ] Quality remains consistent throughout
- [ ] All mentioned events captured
- [ ] No obvious hallucinations

#### Test Case 4: Edge Cases
- Entry with NO custody-relevant content (just "went to grocery store")
- Entry that's entirely about positive parenting (no conflict)
- Entry with multiple child statements
- Entry with extensive co-parent communication back-and-forth

### Mitigation Strategies

If testing reveals model overload:

1. **Make new fields optional** - Use `.optional()` or `.nullable()` liberally so model can skip when not relevant
2. **Split extraction into passes** - First pass: core events. Second pass: enrich with tone/patterns/statements
3. **Increase model tier** - Move from gpt-4o-mini to gpt-4o for complex entries
4. **Adaptive prompting** - Shorter system prompt for simple entries, full prompt for complex
5. **Field prioritization** - Instruct model which fields are "nice to have" vs "critical"

### Acceptance Criteria

- [ ] All test cases pass without truncation
- [ ] Average extraction time < 15s for typical entries
- [ ] Complex entries complete in < 45s
- [ ] No regression in core extraction quality (type, title, description, timestamp)
- [ ] New fields populated accurately when relevant, empty/null when not

---

## Backward Compatibility & Data Migration

### Principle

**No existing user data should be corrupted or invalidated.** Old events must remain queryable and displayable even if they use legacy schema values.

### Strategy: Additive Schema Changes

Instead of replacing columns, **add new columns alongside old ones** and deprecate gradually.

#### Event Types Migration

```sql
-- Phase 1: Add new type column, keep old
ALTER TABLE events ADD COLUMN type_v2 text;

-- Phase 2: Backfill with mapping
UPDATE events SET type_v2 = CASE type
  WHEN 'incident' THEN 'coparent_conflict'  -- Best guess mapping
  WHEN 'positive' THEN 'parenting_time'     -- May need manual review
  WHEN 'medical' THEN 'medical'
  WHEN 'school' THEN 'school'
  WHEN 'communication' THEN 'communication'
  WHEN 'legal' THEN 'legal'
  ELSE type
END
WHERE type_v2 IS NULL;

-- Phase 3: Application reads type_v2 with fallback to type
-- Phase 4: After verification period, drop old column (optional)
```

#### Welfare Impact Migration

```sql
-- Add new columns
ALTER TABLE events 
  ADD COLUMN welfare_category text,
  ADD COLUMN welfare_direction text,
  ADD COLUMN welfare_severity text;

-- Backfill from legacy enum
UPDATE events SET 
  welfare_category = 'routine',  -- Safe default
  welfare_direction = CASE welfare_impact
    WHEN 'positive' THEN 'positive'
    WHEN 'none' THEN 'neutral'
    WHEN 'unknown' THEN 'neutral'
    ELSE 'negative'
  END,
  welfare_severity = CASE welfare_impact
    WHEN 'minor' THEN 'minimal'
    WHEN 'moderate' THEN 'moderate'  
    WHEN 'significant' THEN 'significant'
    ELSE NULL
  END
WHERE welfare_category IS NULL;

-- Keep welfare_impact column for reads, stop writing to it
```

### Application-Level Compatibility

#### Reading Events (Backward Compatible)

```typescript
function normalizeEvent(dbEvent: DatabaseEvent): NormalizedEvent {
  return {
    // Use new field if present, fall back to old
    type: dbEvent.type_v2 || mapLegacyType(dbEvent.type),
    
    // Welfare impact: prefer new structured format
    welfare: dbEvent.welfare_category ? {
      category: dbEvent.welfare_category,
      direction: dbEvent.welfare_direction,
      severity: dbEvent.welfare_severity
    } : mapLegacyWelfare(dbEvent.welfare_impact),
    
    // New fields: default to null/empty for old events
    child_statements: dbEvent.child_statements || [],
    coparent_interaction: dbEvent.coparent_interaction || null,
    
    // ... rest of fields
  }
}

function mapLegacyType(oldType: string): string {
  const mapping: Record<string, string> = {
    'incident': 'coparent_conflict',
    'positive': 'parenting_time',
    // Keep medical, school, communication, legal as-is
  }
  return mapping[oldType] || oldType
}

function mapLegacyWelfare(oldValue: string | null) {
  if (!oldValue || oldValue === 'unknown') {
    return { category: 'none', direction: 'neutral', severity: null }
  }
  if (oldValue === 'positive') {
    return { category: 'routine', direction: 'positive', severity: 'moderate' }
  }
  // minor/moderate/significant were all negative
  return {
    category: 'routine',
    direction: 'negative', 
    severity: oldValue === 'minor' ? 'minimal' : oldValue
  }
}
```

#### Writing Events (New Schema Only)

New extractions always write to new columns. Old columns can be populated for compatibility during transition:

```typescript
async function saveEvent(event: ExtractedEvent) {
  await supabase.from('events').insert({
    // New fields
    type_v2: event.type,
    welfare_category: event.welfare_impact.category,
    welfare_direction: event.welfare_impact.direction,
    welfare_severity: event.welfare_impact.severity,
    child_statements: event.child_statements,
    coparent_interaction: event.coparent_interaction,
    
    // Legacy fields (for backward compat during transition)
    type: mapNewToLegacyType(event.type),
    welfare_impact: mapNewToLegacyWelfare(event.welfare_impact),
    
    // ... other fields
  })
}
```

### UI Compatibility

1. **Event type filters** - Support both old and new types during transition
2. **Event display** - Render based on normalized data, not raw DB values
3. **Timeline view** - Group by normalized types
4. **Exports** - Include both legacy and new fields for completeness

### Migration Timeline

| Phase | Duration | Actions |
|-------|----------|---------|
| 1. Schema Addition | Day 1 | Add new columns, no data changes |
| 2. Dual Write | Week 1-2 | New extractions populate both old and new columns |
| 3. Backfill | Week 2 | Run migration to populate new columns for existing events |
| 4. Read Migration | Week 3-4 | Application reads from new columns with fallback |
| 5. Deprecation | Month 2+ | Remove writes to old columns, keep for reads |
| 6. Cleanup | Month 3+ | Optional: drop old columns after verification |

### Rollback Plan

If issues arise:
1. New columns can be ignored (application falls back to old)
2. No destructive changes until Phase 6
3. Backfill can be re-run with corrected mappings

---

## Notes

- These changes improve extraction quality but don't change the fundamental architecture
- State guidance should be reviewed by legal professionals before production use
- Consider adding a disclaimer that the app doesn't provide legal advice
- The system learns patterns across a user's entries; individual extractions compound over time


# Journal Entry as Prime Unit: UI/UX Pivot

## Executive Summary

We've restructured Daylight's information architecture to make **journal entries** the primary unit of user interaction, replacing the previous event-centric model. This pivot acknowledges that users think in narratives, not isolated events, and need to document their experiences as they happen—with AI extracting structured data afterward.

## The Problem We Solved

### Before: Event-First Approach
- Users had to mentally parse their experiences into discrete "events"
- The "Capture" flow felt transactional and technical
- Evidence was attached to individual events, creating fragmentation
- Users had to decide upfront what constituted an "event" worth recording

### After: Journal-First Approach
- Users write naturally about what happened, as they would in a diary
- Evidence attaches to the full narrative context
- AI extracts multiple events from a single journal entry
- The mental model matches how people actually think about their day

## Information Architecture Changes

### Primary Navigation Restructure

```
Before:
- Home
- Case
- Journal (flat)
- Capture (separate)
- Timeline
- Evidence
- Export

After:
- Home
- Case
- Journal (nested)
  ├── New entry
  └── All entries
- Timeline
- Evidence
- Export
```

### Route Changes

| Old Route | New Route | Purpose |
|-----------|-----------|---------|
| `/capture` | `/journal/new` | Create new journal entry |
| `/journal` | `/journal` | View all journal entries |
| N/A | `/journal/{id}` | View specific journal entry |

*Note: `/capture` now redirects to `/journal/new` for backward compatibility*

## User Flow Improvements

### Creating Content

**Old Flow:**
1. Navigate to "Capture"
2. Record/type an event
3. Add evidence
4. Extract events
5. "Save to Timeline"

**New Flow:**
1. Navigate to "Journal" → "New entry"
2. Record/type what happened
3. Add evidence
4. Extract events
5. "Save Entry"
6. View saved journal entry with attached evidence and extracted events

### Mental Model Shift

The new flow acknowledges that users:
- Think in **stories**, not data points
- Want to **preserve their original narrative** alongside extracted events
- Need to see evidence in context of the full story
- Benefit from having a **single source of truth** (the journal entry) that generates multiple data points (events)

## UI Copy Changes

### Button Labels
- "Save to Timeline" → "Save Entry"
- "Capture Event" → "New Journal Entry"
- "Quick capture" → "Quick capture" (kept familiar, but routes to journal)
- "Record event" → "New entry"

### Page Titles
- "Capture Event" → "New Journal Entry"
- "Capture" (sidebar) → "Journal" (with nested items)

### Empty States
- Timeline: "Record event" → "New entry"
- Journal: "Write First Entry" (more approachable than "Capture First Event")

## Technical Implementation

### Component Reuse
- The entire capture flow was preserved and moved to `/journal/new.vue`
- Minimal code changes—mostly copy updates and route adjustments
- Backend already supported this model via the `captures` table

### Data Model Alignment
The pivot aligns better with the existing database schema:
```
captures (journal entries)
  ├── capture_evidence (evidence attached to entries)
  └── events (extracted from entries)
      └── event_evidence (evidence linked to specific events)
```

### API Response Enhancement
- Save endpoint now returns `captureId` alongside event IDs
- Enables immediate navigation to the created journal entry
- Preserves backward compatibility for any external integrations

## Benefits for Users

### Cognitive Load Reduction
- No need to categorize while emotional or stressed
- Write first, structure later
- Natural storytelling instead of form-filling

### Better Context Preservation
- Original narrative preserved alongside extracted data
- Evidence viewed in full context
- Easier to understand situations months later

### Improved Discoverability
- Journal entries are browsable by date
- Each entry shows its extracted events
- Evidence is accessible from both journal and timeline views

### Legal Documentation Advantages
- Contemporaneous notes (the journal) are powerful legal evidence
- Shows authentic voice and emotional state
- AI extraction provides structure without losing authenticity

## Migration Considerations

### For Existing Users
- Old `/capture` route redirects seamlessly
- Existing captures already appear in `/journal`
- No data migration needed—the model already supported this

### For Documentation
- Update onboarding flows to introduce journal concept
- Emphasize "write naturally, AI organizes" in marketing
- Train support on new terminology

## Future Enhancements

### Potential Features
1. **Journal Templates**: Pre-structured entries for common scenarios
2. **Voice-to-Journal**: Direct transcription with minimal UI
3. **Daily Digest**: Prompt users to journal at optimal times
4. **Journal Search**: Full-text search across entries
5. **Mood Tracking**: Optional emotional indicators on entries

### AI Improvements
1. Better event extraction from longer narratives
2. Automatic evidence suggestions from journal content
3. Pattern detection across multiple journal entries
4. Suggested tags based on content

## Success Metrics

### User Engagement
- Track average journal entry length (expecting increase)
- Monitor completion rate of new entry flow
- Measure time from entry creation to save

### Content Quality
- Events per journal entry (multiple events = richer content)
- Evidence attachment rate
- Return rate to view/edit journal entries

### User Satisfaction
- Survey on mental model alignment
- Support ticket themes (expecting fewer "how do I..." questions)
- User retention after first journal entry

## Conclusion

This pivot from event-centric to journal-centric design better serves users in high-stress situations who need to document complex interpersonal dynamics. By allowing natural narrative capture with AI-powered structure extraction, we're meeting users where they are emotionally and cognitively, rather than forcing them into a data-entry mindset during difficult moments.

The journal-first approach is not just a UI change—it's a fundamental acknowledgment that **human experiences are stories first, data second**.

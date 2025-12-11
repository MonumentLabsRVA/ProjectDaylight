# Production Safety Analysis: AI Extraction Improvements

**Branch:** `feature/ai-extraction-improvements`  
**Date:** December 7, 2024  
**Status:** ✅ SAFE TO IMPLEMENT

---

## Executive Summary

**SAFE TO PROCEED** - The implementation plan is designed with backward compatibility as a core principle. All schema changes are **additive only** (new columns, no deletions), and the approach uses dual-write during transition periods.

### Key Safety Guarantees

1. ✅ **No breaking database changes** - All new columns are nullable or have defaults
2. ✅ **Inngest function isolation** - Functions are versioned by code, not by external config
3. ✅ **Backward compatible reads** - Application will handle both old and new schema formats
4. ✅ **No data loss** - Old data remains intact and queryable

---

## Database Schema Safety

### Current Production Schema

Based on migration `0001_initial_schema.sql`:

```sql
-- Current enum types
CREATE TYPE event_type AS ENUM (
  'incident', 'positive', 'medical', 'school', 'communication', 'legal'
);

CREATE TYPE welfare_impact AS ENUM (
  'none', 'minor', 'moderate', 'significant', 'positive', 'unknown'
);

-- Current events table structure
CREATE TABLE public.events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  recording_id uuid,
  type event_type NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  primary_timestamp timestamptz,
  timestamp_precision timestamp_precision NOT NULL DEFAULT 'unknown',
  duration_minutes integer,
  location text,
  child_involved boolean NOT NULL DEFAULT false,
  
  -- Custody relevance
  agreement_violation boolean,
  safety_concern boolean,
  welfare_impact welfare_impact NOT NULL DEFAULT 'unknown',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Proposed Changes (Phase 1)

All changes are **ADDITIVE ONLY**:

```sql
-- Migration 0039_extraction_event_types_v2.sql
-- Add new column alongside existing type column (NOT replacing it)
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS type_v2 text;

-- Migration 0040_welfare_impact_restructure.sql  
-- Add new columns alongside existing welfare_impact column
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS welfare_category text,
  ADD COLUMN IF NOT EXISTS welfare_direction text,
  ADD COLUMN IF NOT EXISTS welfare_severity text;

-- Migration 0041_child_statements_coparent.sql
-- Add completely new columns (no conflict with existing data)
ALTER TABLE public.events 
  ADD COLUMN IF NOT EXISTS child_statements jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS coparent_interaction jsonb,
  ADD COLUMN IF NOT EXISTS patterns_noted_v2 jsonb DEFAULT '[]'::jsonb;
```

### Why This Is Safe

1. **No column deletions** - Old columns (`type`, `welfare_impact`) remain untouched
2. **Nullable or defaulted** - All new columns have defaults or allow NULL
3. **Existing data unaffected** - Old events continue to work with old schema
4. **No enum modifications** - We're NOT altering the existing `event_type` or `welfare_impact` enums
5. **Gradual migration** - Application reads from new columns with fallback to old

---

## Inngest Function Safety

### How Inngest Works

```typescript
// src/server/inngest/client.ts
export const inngest = new Inngest({
  id: 'daylight',  // Static app identifier
})
```

Inngest functions are:
- **Defined in code** (not external config)
- **Versioned by deployment** (when you deploy new code, new function version goes live)
- **Not registered separately** - They're exported and auto-registered via the Inngest endpoint

### Current Inngest Setup

```typescript
// src/server/inngest/functions/index.ts
export { testJob } from './test-job'
export { journalExtractionFunction } from './journal-extraction'
```

Only 2 functions currently registered:
1. `test-job` (development testing)
2. `journal-extraction` (the one we're modifying)

### Why Inngest Won't Break

**On your feature branch:**
- When you modify `journal-extraction.ts` with new schemas
- The changes are **local to your branch**
- Inngest serves functions from **whatever code is currently deployed**
- Your branch code is NOT deployed to production

**Key Point:** Inngest doesn't have a separate "schema registry" that could get out of sync. The function definition IS the schema.

**When you merge to main:**
- The new extraction schema goes live
- Database already has new columns (from migrations run earlier)
- Old events still readable (backward compat code handles both formats)
- New extractions write to new columns

### Rollback Safety

If something goes wrong after merge:
1. Revert the code deployment (rolls back to old extraction logic)
2. Database changes are non-destructive (both old and new columns exist)
3. Old code can still read/write using original columns
4. No data corruption possible

---

## Implementation Phase Safety Analysis

### Phase 1: Database Schema Changes

**Risk Level:** 🟢 **LOW**

**Why Safe:**
- All `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` are idempotent
- New columns are nullable or have defaults
- No foreign key constraints being added that could fail
- Can be run on production without downtime
- Can be run on feature branch database without affecting main

**Testing Strategy:**
1. Run migrations on a separate Supabase branch (if using branching)
2. Verify existing queries still work
3. Insert test event with old schema → should succeed
4. Insert test event with new schema → should succeed

**Rollback:** N/A - additive changes don't need rollback, they can stay unused

---

### Phase 2: State Guidance Utility

**Risk Level:** 🟢 **ZERO RISK**

**Why Safe:**
- Pure TypeScript utility file
- No database interaction
- No external dependencies
- Only used within extraction functions (not exposed to UI)
- Can be fully tested in isolation

**Testing:**
- Unit tests for state normalization
- Verify Virginia guidance content
- Test fallback to default

---

### Phase 3: Extraction Code Updates

**Risk Level:** 🟡 **MEDIUM** (mitigated by testing)

**Changes:**
- Update Zod schemas in `extract-events.post.ts` and `journal-extraction.ts`
- Update system prompts with new guidance
- Modify database write logic to populate new columns

**Why Manageable:**
- Changes are within the same 2 files that already work
- Zod validation catches schema errors at compile time
- OpenAI Responses API enforces schema compliance
- Can be tested end-to-end in development before merge

**Testing Protocol:**
- Run extraction with simple entry → verify minimal output
- Run extraction with complex entry → verify new fields populated
- Run extraction with very long entry → verify no timeout
- Check database → verify both old and new columns populated correctly

**Rollback:** Code revert (database remains safe with dual columns)

---

### Phase 4: UI & Testing

**Risk Level:** 🟢 **LOW**

**Changes:**
- Update event type display
- Show new fields (child statements, coparent interaction)
- Update filters

**Why Safe:**
- UI changes don't affect backend or data integrity
- Can use feature flags if needed
- Backward compatible reads (handles both old and new event formats)

**Testing:**
- Verify old events display correctly
- Verify new events display correctly
- Test filtering by event type (both old and new)

---

## Branch Development Workflow

### Recommended Approach

```bash
# You're already on feature/ai-extraction-improvements
git checkout feature/ai-extraction-improvements

# Option A: Use Supabase branching (RECOMMENDED)
# Creates isolated database for feature work
supabase branches create feature-extraction --no-persistent

# Run migrations on feature branch
supabase db push --db-url <branch-connection-string>

# Develop and test against feature branch database
# Main production database is completely isolated

# When ready to merge:
# 1. Merge to main
# 2. Run migrations on production
# 3. Deploy code
```

### Option B: Local Development Only

If not using Supabase branching:

```bash
# Work on feature branch
# Test extraction locally (doesn't touch production DB)
# Migrations are just SQL files (not executed until you run them)

# When ready:
# 1. Manually run migrations on production (via Supabase dashboard)
# 2. Merge to main
# 3. Deploy
```

---

## Potential Risks & Mitigations

### Risk 1: Model Over-Extraction

**Issue:** New fields might cause the model to hallucinate or over-extract.

**Mitigation:**
- Make new fields `.nullable()` or `.optional()` in Zod schema
- Add explicit prompt guidance: "Leave fields empty if not present"
- Test with simple entries to verify model doesn't fill unnecessary fields

**Rollback:** Adjust prompts, redeploy (no database changes needed)

---

### Risk 2: Increased Extraction Time

**Issue:** More complex schema might slow down extractions.

**Mitigation:**
- Monitor response times in development
- Compare gpt-5-mini vs gpt-5 performance
- Set reasonable timeouts
- Test with 2000+ word entries

**Rollback:** Simplify schema, redeploy

---

### Risk 3: Database Column Bloat

**Issue:** Adding many new columns.

**Mitigation:**
- JSONB columns (`child_statements`, `coparent_interaction`) are space-efficient when NULL
- Text columns (`type_v2`, `welfare_*`) are minimal overhead
- PostgreSQL handles NULL columns efficiently

**Long-term:** After 2-3 months, can optionally migrate old events and drop legacy columns

---

### Risk 4: Type Mapping Ambiguity

**Issue:** Mapping old types → new types during transition.

**Mitigation:**
- Document clear mapping logic:
  - `positive` → `parenting_time` (default)
  - `incident` → `coparent_conflict` (default)
- Dual-write during transition (write both old and new)
- Application reads from `type_v2` with fallback to `type`

**Rollback:** Change mapping logic in code, redeploy

---

## Pre-Merge Checklist

Before merging `feature/ai-extraction-improvements` to `main`:

### Code Quality
- [ ] All Zod schemas validated
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] No console.log statements left in production code

### Database
- [ ] Migration files are idempotent (use `IF NOT EXISTS`)
- [ ] Migrations run successfully in dev/staging
- [ ] Verified existing events still queryable
- [ ] Verified new events can be inserted

### Extraction Testing
- [ ] Simple entry test passed
- [ ] Complex multi-event entry test passed
- [ ] Long narrative (2000+ words) test passed
- [ ] Edge case tests passed
- [ ] Response time < 30s for typical entries

### Backward Compatibility
- [ ] Application reads old events correctly
- [ ] Application reads new events correctly
- [ ] Filtering works for both old and new types
- [ ] Timeline displays both formats

### Documentation
- [ ] Migration instructions documented
- [ ] State guidance reviewed (Virginia law references)
- [ ] Rollback procedure documented

---

## Deployment Plan

### 1. Pre-Deployment

```bash
# Ensure feature branch is up to date with main
git checkout feature/ai-extraction-improvements
git merge main
git push origin feature/ai-extraction-improvements
```

### 2. Run Migrations

**Option A: Via Supabase Dashboard**
1. Navigate to SQL Editor
2. Run migration 0039 (event types v2)
3. Verify: `SELECT type_v2 FROM events LIMIT 1;` (should return NULL for existing)
4. Run migration 0040 (welfare impact)
5. Run migration 0041 (child statements)

**Option B: Via Supabase CLI**
```bash
supabase db push
```

### 3. Merge to Main

```bash
git checkout main
git merge feature/ai-extraction-improvements
git push origin main
```

### 4. Deploy

Deployment happens automatically via CI/CD (or manual deploy if configured).

### 5. Monitor

- Check Inngest dashboard for successful extractions
- Monitor error rates
- Check extraction response times
- Verify new fields being populated correctly

---

## Rollback Procedure

### If Issues Detected After Deployment

**Step 1: Revert Code**
```bash
git revert <merge-commit-hash>
git push origin main
```

**Step 2: Verify**
- Old extraction logic is active
- Old events still work
- New extractions use old schema

**Step 3: Database State**
- New columns remain in database (harmless, just unused)
- All data remains intact
- Can retry deployment after fixing issues

---

## Conclusion

✅ **SAFE TO IMPLEMENT**

The implementation plan follows industry best practices:
- Additive schema changes only
- Backward compatibility at every layer
- Graceful degradation
- Clear rollback path
- No vendor lock-in risks (Inngest functions are code-based)

The biggest risk is extraction quality (model behavior), not infrastructure breakage. Model issues can be fixed with prompt adjustments and redeployment without touching the database.

**Recommended Next Steps:**
1. Create Supabase branch for isolated testing
2. Implement Phase 1 (migrations) on feature branch
3. Test thoroughly in isolated environment
4. Proceed with Phases 2-4
5. Merge to main when all tests pass

---

**Questions or Concerns?** This analysis covers the architectural safety. Functional correctness (extraction quality) requires testing against real-world journal entries.

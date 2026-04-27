# Plan 00 — Case Scoping Refactor (prereq)

> **✅ Shipped 2026-04-26.** Migrations `0047_case_scoping.sql` + `0048_profiles_active_case.sql` are live. `getActiveCaseId` / `requireCaseAccess` exist in `src/server/utils/cases.ts`. `CaseSwitcher` is wired into the sidebar. Every read/write endpoint scopes by case. Verification logged in [`migration_verification.md`](./migration_verification.md). One deviation from this plan: active case lives on `profiles.active_case_id` (DB column with cookie-less fallback) rather than the `daylight_active_case` cookie originally specced — see the **State in DB, not cookie** memory note in `MEMORY.md`.

## Why this exists

Plans 01–04 all assume resources (messages, chats, events, evidence, journal entries) can be scoped to a `case`. The current schema scopes everything to `user_id` only. The `cases` table (migration 0010) is metadata-only — no other table FKs to it. `journal-extraction.ts:303-329` already silently picks "the user's most recent case" for context, which works while everyone has one case but is the wrong primitive to keep building on.

Plans 01–04 will all hit the same wall otherwise. Doing one small, careful refactor now removes a class of footguns from each downstream plan:

- Plan 01's `messages.case_id` FK is meaningful only if siblings (events, evidence, journal_entries) are also case-scoped — otherwise timeline UNION across user-scoped events and case-scoped messages diverge as soon as a user has 2+ cases.
- Plan 02's `chats.case_id` and chat tools assume "this case's events/messages/journal entries" is a queryable set.
- Plan 03's `case_collaborators` RLS extension assumes events/evidence/journal_entries are filterable by case, otherwise the attorney sees the entire user history.
- Plan 04's firm side reuses `messages` and `events` against `firm_case_id` — the polymorphism only works cleanly if a `case_id`-equivalent already exists everywhere.

This plan is small. ~1 day of careful work. It is the only thing in this push that touches existing tables, so it goes first and lands as its own commit.

## What does NOT change

- `user_id` stays on every table. RLS still keys off `user_id`. Existing endpoints keep working without code changes the moment after the migration runs.
- `cases.user_id` does not change semantics. A case still belongs to exactly one owner.
- The user-visible app behaves identically by default. The active case is the most recent one unless the user explicitly switches.

## What DOES change in the UI (small)

A case switcher in the sidebar header. Modeled on the `TeamsMenu` component in [`nuxt-ui-templates/dashboard`](https://github.com/nuxt-ui-templates/dashboard) — `UDashboardSidebar`'s `#header` slot currently renders the `AppLogoIcon` + "Daylight" wordmark; we replace that with a `CaseSwitcher` that fits the same visual footprint (collapsed/expanded states, ring-default styling). The switcher:

- Lists the user's cases (label = `cases.title`).
- Highlights the active one with a checkmark.
- Has a "New case" entry at the bottom that pops the existing `/case` create modal.
- When the user picks a different case, sets the `daylight_active_case` cookie and refreshes the route.

Active-case state lives in a cookie so the server can read it from the request:

```ts
// src/app/composables/useActiveCase.ts
export const useActiveCase = () => useCookie<string | null>('daylight_active_case', {
  sameSite: 'lax',
  secure: true,
  maxAge: 60 * 60 * 24 * 365 // 1 year
})
```

`getActiveCaseId` (Phase 2 below) reads this cookie on the server, falls back to the user's most-recent case if missing or pointing to a deleted/foreign case.

## Phase 1 — Schema migration (`0047_case_scoping.sql`)

Single migration. Idempotent backfill. Nullable column → backfill → NOT NULL.

```sql
-- 0047_case_scoping.sql

begin;

-- 1. Ensure every user with any user-scoped resource has at least one case row.
--    Use a deterministic title so re-runs are idempotent.
insert into cases (user_id, title)
select distinct user_id, 'My case'
from (
  select user_id from events
  union select user_id from evidence
  union select user_id from journal_entries
  union select user_id from action_items
  union select user_id from evidence_mentions
) sub
where not exists (
  select 1 from cases c where c.user_id = sub.user_id
);

-- 2. Add nullable case_id to each table that should be case-scoped.
alter table events             add column case_id uuid references cases(id) on delete cascade;
alter table evidence           add column case_id uuid references cases(id) on delete cascade;
alter table journal_entries    add column case_id uuid references cases(id) on delete cascade;
alter table action_items       add column case_id uuid references cases(id) on delete cascade;
alter table evidence_mentions  add column case_id uuid references cases(id) on delete cascade;

-- 3. Backfill: assign every existing row to the user's most-recently-created case.
--    Done as a single UPDATE per table, joined to a CTE picking one case per user.
with primary_case as (
  select distinct on (user_id) user_id, id as case_id
  from cases
  order by user_id, created_at desc
)
update events e set case_id = pc.case_id
from primary_case pc
where e.user_id = pc.user_id and e.case_id is null;

with primary_case as (
  select distinct on (user_id) user_id, id as case_id
  from cases order by user_id, created_at desc
)
update evidence ev set case_id = pc.case_id
from primary_case pc
where ev.user_id = pc.user_id and ev.case_id is null;

with primary_case as (
  select distinct on (user_id) user_id, id as case_id
  from cases order by user_id, created_at desc
)
update journal_entries je set case_id = pc.case_id
from primary_case pc
where je.user_id = pc.user_id and je.case_id is null;

with primary_case as (
  select distinct on (user_id) user_id, id as case_id
  from cases order by user_id, created_at desc
)
update action_items ai set case_id = pc.case_id
from primary_case pc
where ai.user_id = pc.user_id and ai.case_id is null;

with primary_case as (
  select distinct on (user_id) user_id, id as case_id
  from cases order by user_id, created_at desc
)
update evidence_mentions em set case_id = pc.case_id
from primary_case pc
where em.user_id = pc.user_id and em.case_id is null;

-- 4. Lock it down. Every existing row has a case_id; new rows must too.
alter table events            alter column case_id set not null;
alter table evidence          alter column case_id set not null;
alter table journal_entries   alter column case_id set not null;
-- action_items.case_id stays nullable (some action items aren't tied to a case yet).
-- evidence_mentions.case_id stays nullable for the same reason.

-- 5. Indexes. Every case-scoped query goes through these.
create index idx_events_case_id_timestamp     on events            (case_id, primary_timestamp desc nulls last);
create index idx_evidence_case_id_created     on evidence          (case_id, created_at desc);
create index idx_journal_entries_case_id      on journal_entries   (case_id, created_at desc);
create index idx_action_items_case_id_status  on action_items      (case_id, status, deadline nulls last);

-- 6. RLS — owner-only access via cases.user_id (no semantic change in single-user world,
--    but this is the join Plan 03 will extend with case_collaborators).
--    The existing user_id-keyed policies stay in place; we add equivalent case-keyed
--    policies so future code can rely on either path.

-- Example for `events`. Replicate for evidence, journal_entries, action_items,
-- evidence_mentions. Keep existing user_id policies untouched until Plan 03 swaps them.

create policy events_select_via_case on events
  for select using (
    exists (select 1 from cases c where c.id = events.case_id and c.user_id = auth.uid())
  );

-- (Plan 03 will replace these with policies that also grant access to case_collaborators.)

commit;
```

**Verification queries** (run after the migration, save output to `internal_docs/20260425_sift_integration/migration_verification.md`):

```sql
-- Should return 0 rows on every table.
select count(*) as null_case_ids from events            where case_id is null;
select count(*) as null_case_ids from evidence          where case_id is null;
select count(*) as null_case_ids from journal_entries   where case_id is null;

-- Sanity: case ownership matches resource ownership for every existing row.
select count(*) as mismatched from events e
  join cases c on c.id = e.case_id where c.user_id <> e.user_id;
-- Repeat for evidence, journal_entries, action_items, evidence_mentions.
```

## Phase 2 — Type generation + active-case helper

1. Regenerate `src/app/types/database.types.ts` from the new schema. (`supabase gen types typescript ...`)

2. Add `src/server/utils/cases.ts`:

   ```ts
   import type { H3Event } from 'h3'
   import type { SupabaseClient } from '@supabase/supabase-js'
   import type { Database } from '~/types/database.types'

   const COOKIE = 'daylight_active_case'

   /**
    * Resolve the active case id for the current request.
    * Order: explicit override (arg) → cookie → user's most-recent case.
    * If the cookie points to a case the user can't access, falls back silently.
    */
   export async function getActiveCaseId(
     event: H3Event,
     supabase: SupabaseClient<Database>,
     userId: string,
     override?: string
   ): Promise<string> {
     const candidate = override ?? getCookie(event, COOKIE) ?? null

     if (candidate) {
       const { data } = await supabase
         .from('cases')
         .select('id')
         .eq('id', candidate)
         .eq('user_id', userId)
         .maybeSingle()
       if (data) return data.id
       // cookie was stale; fall through to most-recent
     }

     const { data, error } = await supabase
       .from('cases')
       .select('id')
       .eq('user_id', userId)
       .order('created_at', { ascending: false })
       .limit(1)
       .maybeSingle()

     if (error) throw createError({ statusCode: 500, statusMessage: error.message })
     if (!data) throw createError({ statusCode: 404, statusMessage: 'No case for user' })
     return data.id
   }

   export async function requireCaseAccess(
     supabase: SupabaseClient<Database>,
     userId: string,
     caseId: string
   ): Promise<void> {
     const { data, error } = await supabase
       .from('cases')
       .select('id')
       .eq('id', caseId)
       .eq('user_id', userId)
       .maybeSingle()
     if (error) throw createError({ statusCode: 500, statusMessage: error.message })
     if (!data) throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
   }
   ```

   These cover 100% of the case-resolution code that Plans 01–04 need on the parent side. Plan 03 will extend `requireCaseAccess` to also accept collaborators (i.e. accept-on-`case_collaborators` membership in addition to ownership).

3. Migrate the `cases` query inside `journal-extraction.ts:303-329` to call a service-side equivalent that takes a `caseId` (passed from the API caller via the Inngest event). No more "most recent case" lookup at extraction time — the journal entry's `case_id` is the source of truth.

## Phase 2.5 — Sidebar case switcher

Reference: [`nuxt-ui-templates/dashboard`](https://github.com/nuxt-ui-templates/dashboard) — `app/components/TeamsMenu.vue`. Lift the structure (`UDropdownMenu` + collapsed/expanded button, avatar circle in collapsed mode, label + chevron in expanded). Replace the team list with cases.

Files to add / change:

| File | Change |
|---|---|
| `src/app/components/CaseSwitcher.vue` | New. Modeled on the template's `TeamsMenu`. Props: `collapsed: boolean`. Emits nothing; sets the cookie and calls `reloadNuxtApp` to re-fetch case-scoped data. |
| `src/app/composables/useActiveCase.ts` | New. The `useCookie` wrapper above + a `useCases()` composable that fetches `/api/cases` once. |
| `src/server/api/cases/index.get.ts` | New. Returns `[{ id, title, isActive }]` for the user. (Currently `case.ts` is a single-case GET keyed on most-recent — keep it for backwards compat for now, plan a rename in Phase 4 cleanup.) |
| `src/server/api/cases/active.post.ts` | New. Body `{ caseId }`. Verifies access via `requireCaseAccess`, sets the cookie. Returns 204. The cookie is also settable client-side via `useActiveCase()` for snappier UX; the endpoint is the SSR-safe path. |
| `src/app/layouts/default.vue` | Replace the existing `#header` block (`AppLogoIcon` + "Daylight" wordmark) with `<CaseSwitcher :collapsed="collapsed" />`. Keep the logo *inside* `CaseSwitcher` as the icon to the left of the case title — preserves brand presence. |

The collapsed-state visual: small square with the logo icon (matches today's collapsed look). The expanded-state visual: logo icon, then a dropdown trigger showing the active case's title with a chevron, sized to the existing header footprint.

**Done when:** the sidebar header shows the active case title; clicking it pops a list of all the user's cases; selecting a different one updates the cookie and the case-scoped pages refresh.

## Phase 3 — Wire `case_id` through the existing write paths

Edit list. Every one of these is a 1–3 line change.

| File | Change |
|---|---|
| `src/server/api/journal/submit.post.ts` | Resolve `caseId = await getActiveCaseId(supabase, userId)`. Insert `case_id` on the new `journal_entries` row. Pass `caseId` in the Inngest event payload. |
| `src/server/inngest/functions/journal-extraction.ts` | Accept `caseId` from event data. Read `caseRow` by id (no more `order('created_at') limit 1`). Insert `case_id` on every event/action_item/evidence_mention. |
| `src/server/api/evidence-upload.post.ts` | Resolve `caseId`. Insert `case_id` on the new `evidence` row. |
| `src/server/api/timeline.ts` | Filter by `case_id` (default = active case). Accept optional `?caseId=` query param for future multi-case UI; ignore for now. |
| `src/server/api/journal.ts` | Filter by `case_id` (default = active case). |
| `src/server/api/evidence.ts` | Filter by `case_id` (default = active case). |
| `src/server/api/exports/*` | Filter by `case_id`. The `metadata.case_title` already exists; align with `cases.title`. |
| `src/server/api/insights.ts`, `src/server/api/home.ts` | Filter by `case_id`. |

The user-visible behavior does not change: each user has one active case, and that case is the most recent one. The change is purely structural — every read and write now specifies the case explicitly.

## Phase 4 — Tests + smoke

- Add `src/server/utils/cases.test.ts` covering: missing case throws 404; multiple cases returns most recent.
- Manually smoke-test: create a journal entry, upload evidence, generate an export. Verify each new row has `case_id` set in the DB.
- Re-run Phase 1 verification queries — should still return 0 mismatches.

## Risks

- **Stale TS types.** If `database.types.ts` is not regenerated, TypeScript will not see the new `case_id` column and writes will silently drop it. Regenerate before any edits to API routes.
- **Audit log churn.** The audit trigger logs every UPDATE during backfill (5 tables × however many rows). One-time noise; document it in the verification doc.
- **`recording_id` is still on `events`.** Untouched by this migration. Continues to be a deprecated column; remove in a separate cleanup migration after Plan 01 lands.
- **Concurrent writes during migration.** Run during low-traffic window. The migration is fast (one UPDATE per table, indexed by `user_id`), but the NOT NULL ALTER takes a brief lock.

## Out of scope

- Multi-case UI (case picker, switching active case). Defer until a real user has two cases.
- Migrating `voice_recordings.case_id` (table is deprecated; do not touch).
- RLS overhaul to remove the legacy `user_id` policies. Keep both policy paths until Plan 03 explicitly replaces them.
- Renaming columns (`primary_timestamp` → `occurred_at`, `recording_id` → removal). Separate cleanup pass.

## Definition of done

1. `0047_case_scoping.sql` has been run against staging and prod.
2. Verification queries return 0 mismatches on every table.
3. Every API route that writes events/evidence/journal_entries sets `case_id`.
4. `journal-extraction.ts` reads case context by `case_id` from the event payload, not by user-most-recent lookup.
5. `getActiveCaseId` and `requireCaseAccess` exist and are imported by every endpoint that needs them.
6. The app behaves identically from the user's perspective.

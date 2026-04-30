# Test Users — Implementation Plan

**Created:** April 29, 2026
**Status:** Not Started
**Context:** We need a fast, repeatable way to create throwaway accounts inside Daylight to exercise the onboarding flow and any other "what does the new-user experience look like right now?" path. project-margin already has a polished version of this (employee-only dev-tools page that mints a Supabase auth user, returns a magic link, lists existing test users, and supports cascading delete). Recreating it here.

**Goal:** An employee-gated `/internal/test-users` page in Daylight that creates a fresh Supabase user on demand, returns a magic link to sign in as them (or switch sessions in-place), lists/deletes test users, and cleanly removes their data.

**Scope:**
- New `is_test_user` column on `profiles`
- Five `/api/internal/test-users/*` endpoints (create, list, login-link, delete one, bulk delete)
- One `/internal/test-users` Vue page mirroring project-margin's UI, nested under the existing `/internal` employee section
- Sidebar: convert the existing employee-only `Internal` link into a parent with children `Overview` (`/internal`) and `Test users` (`/internal/test-users`)
- New `employee` middleware (DB-driven, no `NODE_ENV` bypass) applied to the new page
- Cascade-delete utility scoped to Daylight's user-owned tables (cases, events, evidence, journal_entries, message_threads, messages, etc.)

**Non-goals:**
- Seeding fake case/event data into a test user (out of scope; the point is to test onboarding, which starts blank)
- Test-user impersonation without a real session (we use real magic links)
- Any prod-facing surface — `/dev-tools` is gated behind `is_employee`

---

## Current State

### What Exists

- **Auth**: `@nuxtjs/supabase` with email+password and Google OAuth. Magic links are not currently used in the user flow but Supabase admin API supports `generateLink({ type: 'magiclink' })` regardless.
- **Service-role pattern**: `src/server/api/billing/webhook.post.ts` uses `createClient<Database>(supabaseUrl, supabaseServiceKey)` directly. We'll mirror that.
- **Employee gate (existing)**: `profiles.is_employee BOOLEAN` added in `db_migrations/0031_employee_flag_and_subscription_rls.sql`. Used today by `src/server/api/dev/set-tier.post.ts` — but that endpoint short-circuits with `NODE_ENV === 'development'`, which we will **not** copy. The new endpoints check `is_employee = true` only.
- **Onboarding**: `src/app/pages/onboarding.vue` (9-step wizard), gated on `profiles.onboarding_completed_at IS NULL` via `useProfile().needsOnboarding`. Brand-new accounts hit this on first login — exactly what we want test users to walk through.
- **User-owned tables** (need cascade delete coverage): `profiles`, `cases`, `events`, `evidence`, `journal_entries`, `chats`, `message_threads`, `messages`, `subscriptions`, `bug_reports`, `audit_logs`. Many of these have `ON DELETE CASCADE` from `auth.users`; the cleanup util will rely on that and only clean up rows that don't cascade.

### What Changes

- New migration `0059_profiles_is_test_user.sql`
- New folder `src/server/api/internal/test-users/` with 5 route files
- New `src/server/utils/test-user-deletion.ts`
- New `src/app/pages/dev-tools.vue`
- New `src/app/middleware/employee.ts` (page guard)

### What Stays

- Existing auth flow, onboarding wizard, RLS policies — all untouched.
- `dev/set-tier.post.ts` is left alone (separate feature). We do not refactor its `NODE_ENV` bypass as part of this push.

---

## Architecture

```
Employee browser
   │
   ▼
/dev-tools (Vue page, employee middleware)
   │  fetch
   ▼
/api/internal/test-users/*  ── employee gate ──▶  service-role Supabase client
                                                       │
                                                       ▼
                                            auth.admin.createUser
                                            auth.admin.generateLink
                                            auth.admin.deleteUser
                                            profiles upsert / select / delete
                                            (+ cascade cleanup of non-cascading tables)
```

**Authentication contract on every endpoint:**
1. `serverSupabaseUser(event)` → caller's auth user
2. `serverSupabaseClient(event)` → query their profile
3. Reject if `profile.is_employee !== true` (single source of truth — no env shortcut)
4. Only after that, instantiate the service-role client for the privileged operation

---

## Sprint Breakdown

### Sprint 1: Schema + cascade-delete utility — Foundational
**Status:** [Complete]
**Deviation:** Cascade utility ended up tiny — only `jobs` lacks `ON DELETE CASCADE` on `user_id`. Everything else (events, evidence, journal_entries, cases, messages, chats, etc.) cascades from `auth.users` automatically. Util is now: `delete jobs by user_id` → `auth.admin.deleteUser`. Also added a small shared `service-client.ts` helper for the service-role pattern (extracted because Sprint 2 has 5 endpoints that would otherwise duplicate the snippet).
**Goal:** DB has `is_test_user` flag and we have a single utility that knows how to wipe a user's data.
**Estimated effort:** 1 hour

#### Tasks
- 1.1 Migration `db_migrations/0059_profiles_is_test_user.sql`
  - `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN DEFAULT false;`
  - `COMMENT ON COLUMN public.profiles.is_test_user IS 'Marks throwaway accounts created from the /dev-tools page for onboarding/QA testing.';`
  - `CREATE INDEX IF NOT EXISTS profiles_is_test_user_idx ON public.profiles (is_test_user) WHERE is_test_user = true;` (partial index — listing is rare and selective)
- 1.2 Run the migration via Supabase MCP (`apply_migration`) — verify column exists.
- 1.3 Confirm Kyle's prod profile has `is_employee = true` (it does, per migration 0031). No data change needed.
- 1.4 New file `src/server/utils/test-user-deletion.ts`
  - Export `async function deleteTestUserCascade(serviceClient, userId): Promise<void>`
  - Order: delete rows in tables that do NOT cascade from `auth.users`, then call `auth.admin.deleteUser(userId)` to let the rest cascade.
  - Audit each user-table FK to `auth.users` / `profiles` and only manually delete the ones missing `ON DELETE CASCADE`. (Cases → events/evidence/journal cascade by `case_id`. Profiles cascade from auth.users. Messages chain through threads → cases. Bug reports may not — check.)
  - Log each step. Throw on hard failures; tolerate "row not found" gracefully.

#### Verification
- [ ] Migration applies cleanly against local + remote DB
- [ ] `select column_name from information_schema.columns where table_name='profiles' and column_name='is_test_user'` returns one row
- [ ] No RLS policy changes (the column is queried only via service role)
- [ ] Type check passes

---

### Sprint 2: Internal API — five endpoints
**Status:** [Complete]
**Deviations:** Regenerated `database.types.ts` via Supabase MCP after migration so `is_test_user` is a first-class typed column (no `as any`). All 5 endpoints typecheck clean. `create.post.ts` falls back from `@daylight-test.local` to `@daylight-test.test` if Supabase rejects the primary domain, and best-effort cleans up the auth user if profile upsert fails.
**Goal:** All test-user lifecycle operations callable from the server, employee-gated.
**Estimated effort:** 2 hours

#### Tasks
- 2.1 `src/server/api/internal/test-users/create.post.ts`
  - Verify employee
  - Generate `email = test+${Date.now()}@daylightlegal.test` (use a domain we control or `.test` to avoid Supabase email validator surprises — confirm during sprint)
  - `serviceClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { is_test_user: true, created_by, created_at } })`
  - Upsert `profiles` row with `is_test_user: true`, `email`, `full_name: 'Test User ' + ts` — leave `onboarding_completed_at` null so onboarding fires.
  - `serviceClient.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent('/home')}` } })`
  - Return `{ userId, email, magicLink }`

- 2.2 `src/server/api/internal/test-users/index.get.ts`
  - Verify employee
  - `from('profiles').select('id, email, full_name, created_at, onboarding_completed_at').eq('is_test_user', true).order('created_at', desc)`
  - Optionally join case count via a single follow-up query: `from('cases').select('user_id, count').in('user_id', ids)` (or simple per-user count if small).
  - Return array of `{ id, email, full_name, created_at, onboarding_completed_at, case_count }`

- 2.3 `src/server/api/internal/test-users/[id]/login-link.post.ts`
  - Verify employee + verify target row has `is_test_user = true` (defense-in-depth so this can never mint a magic link for a real user)
  - `auth.admin.generateLink({ type: 'magiclink', email, ... })`
  - Return `{ magicLink }`

- 2.4 `src/server/api/internal/test-users/[id]/index.delete.ts`
  - Verify employee + target is test user
  - Call `deleteTestUserCascade(serviceClient, id)`
  - Return `{ success: true }`

- 2.5 `src/server/api/internal/test-users/bulk-delete.post.ts`
  - Verify employee
  - Body: `{ ids?: string[] }` (if omitted, fetch all `is_test_user = true` IDs)
  - Loop with `deleteTestUserCascade`, collect successes/failures
  - Return `{ matched, deleted, failed: [{ id, error }] }`

#### Verification
- [ ] Calling create as a non-employee returns 403
- [ ] Calling create as Kyle returns `{ userId, email, magicLink }` and a row appears in `profiles` with `is_test_user = true`
- [ ] List endpoint returns the new user
- [ ] Login-link refuses for a non-test-user id
- [ ] Delete removes the auth.users row, the profile row, and any related rows
- [ ] Type check passes
- [ ] Curl/`http` test of each endpoint logged into `verification/samples/`

---

### Sprint 3: Test-users page + employee middleware + sidebar
**Status:** [Complete]
**Deviation:** `employee` middleware throws 404 (not redirect to `/home`) — matches the inline pattern already in `internal/index.vue`, and avoids advertising internal routes to non-employees. Sidebar `Internal` becomes a parent with `defaultOpen: route.path.startsWith('/internal')` so the section auto-expands when you're already inside it.
**Goal:** Employee-only `/internal/test-users` page wires the API into a usable UI, reachable from the sidebar.
**Estimated effort:** 2 hours

#### Tasks
- 3.1 `src/app/middleware/employee.ts`
  - Fetch the caller's profile from the server (e.g. `$fetch('/api/profile')`) and redirect to `/home` (or `throw createError 404` for parity with `/internal/index.vue`) if `is_employee !== true`.
  - Single DB-driven check, no env bypass.

- 3.2 `src/app/pages/internal/test-users.vue`
  - `definePageMeta({ middleware: ['employee'] })`
  - Two primary actions:
    - **Create & copy link** — calls create, copies `magicLink` to clipboard, toasts "Link copied — open in incognito to test onboarding"
    - **Create & switch** — calls create, then `window.location.href = magicLink` (signs current employee out, signs in as test user)
  - Table of existing test users with columns: email, created, onboarding done?, actions
  - Per-row actions: copy login link, switch to user, delete
  - Bulk action: "Delete all test users" with a confirm modal showing match count
  - Match the existing `/internal/index.vue` chrome — `UDashboardPanel`, `UDashboardNavbar`, `UCard`, `UTable`, `UModal`, etc.

- 3.3 Sidebar: in `src/app/layouts/default.vue`, convert the current single `Internal` link (line ~128-136) into a parent menu item with children:
  - `Overview` → `/internal`
  - `Test users` → `/internal/test-users`
  - Keeps the employee-only conditional that's already there.

#### Verification (browser, via Playwright MCP)
- [x] Logged in as Kyle, sidebar shows `Internal → Test users`; `/internal/test-users` renders the empty list
- [x] Click "Create & copy link" → toast appears, list refreshes with one row, clipboard contains a `magiclink` URL
- [x] Open the magic link in a clean (no Kyle cookie) browser context → lands authenticated as the test user → onboarding wizard renders (see `verification/screenshots/09_magic_link_onboarding.png`)
- [x] Click delete on the row → confirm modal → row disappears, `auth.users` and `profiles` rows are gone
- [x] Logged in as a non-employee account (Kyle's `is_employee` flipped to false), `/internal/test-users` returns 404
- [x] Screenshots in `verification/screenshots/`, API samples in `verification/samples/`

---

### Sprint 4 (post-verification): Magic link sign-in fixes
**Status:** [Complete]
**Goal:** Make the magic link actually sign the test user in and land them on `/onboarding`.

End-to-end browser verification surfaced two real bugs the unit tests didn't catch. Both are fixed in `fix(test-users): make magic link land on /auth/confirm` (commit `002801c`):

1. **`/auth/confirm` ignored the magic-link URL hash.** The page only handled the PKCE `?code=` flow. Magic links from `auth.admin.generateLink({ type: 'magiclink' })` return `#access_token=…&refresh_token=…&type=magiclink` in the URL hash, so the page now also reads the hash and calls `supabase.auth.setSession({ access_token, refresh_token })` before letting the `watchEffect(user, …)` redirect fire. Also honors a `?next=` query param for forward-compat. Mirrors how project-margin's `confirm.vue` does it.
2. **`redirect_to` query string broke the Supabase Auth allowlist match.** We were sending `…/auth/confirm?next=/home`, but Supabase's redirect URL allowlist matches by **strict equality** (unless a `*` wildcard is present in the entry). The allowlist had `…/auth/confirm` with no query string, so it didn't match, Supabase silently fell back to the bare Site URL (`https://www.daylight.legal`), and the magic link landed users on the marketing landing page with the auth tokens orphaned in the URL hash. Fixed by dropping the query string from `redirect_to` in `create.post.ts` and `[id]/login-link.post.ts`; the confirm page defaults to `/home` anyway.

**End-to-end verification (live, against local dev):** logged in as Kyle, created test user via the API, cleared cookies, navigated to the magic link, landed on `/auth/confirm` with the hash, page parsed the hash and called `setSession`, watchEffect fired, redirected to `/home`, the global auth middleware detected `onboarding_completed_at IS NULL` and forwarded to `/onboarding`. Test user `test+1777510659485@daylight-test.local` saw step 1 of the wizard (the same flow a real new user gets).

**Known minor wrinkle (not blocking, not fixed in this sprint):** the "Switch to user" button (and "Create & switch") use the same magic link, but in the current browser. `setSession` updates the Supabase JS client in-memory, but the Nuxt module's auth cookie isn't immediately rewritten, so the **server** keeps seeing the previous user (Kyle) until a hard reload. Workaround for now: copy the link and open in incognito. Proper fix would be to force a `window.location.reload()` after `setSession` in the confirm page, or to clear cookies + setSession + reload from the "Switch" handler in `test-users.vue`.

---

## Reference

### Source files in project-margin (reference, do not import)

| File | Purpose |
|------|---------|
| `src/server/api/internal/test-users/create.post.ts` | Create + magic link |
| `src/server/api/internal/test-users/index.get.ts` | List |
| `src/server/api/internal/test-users/[id]/login-link.post.ts` | Re-issue magic link |
| `src/server/api/internal/test-users/[id]/index.delete.ts` | Single delete |
| `src/server/api/internal/test-users/bulk-delete.post.ts` | Bulk delete |
| `src/server/utils/test-user-deletion.ts` | Cascade order |
| `src/app/pages/app/dev-tools.vue` | UI |
| `src/app/middleware/employee.ts` | Page guard |

### Environment / Config

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | yes | already set |
| `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) | yes | already set |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | yes | already set, used by billing webhook |

No new env vars.

---

## What's Deferred / Out of Scope

- **Seeding fake data into test users.** The whole point is to land them in fresh-account onboarding. If we later want a "create test user with a populated case" button, that's a follow-up.
- **Soft-delete / recovery.** Deletion is hard.
- **Rate limiting.** Employee-only feature, not exposed.
- **Refactoring `dev/set-tier.post.ts`** to also rely solely on `is_employee` — separate cleanup, flagged for later.

---

## Resolved Questions

1. **Email domain for test users.** Test users do not need to be deliverable. Use a fake throwaway domain — `test+${ts}@daylight-test.local`. Falls back to `.test` TLD if Supabase rejects `.local` during sprint 2.
2. **Sidebar entry point.** `Internal → Test users` child item, employee-gated using the existing `isInternalUser` computed in `default.vue`.

---

## Verification Artifact

Per the `implementation-plan` skill's Phase 5, before `/acp`:
- Build `internal_docs/20260429_test_users/verification/index.html` with screenshots from sprint 3 + sample API outputs from sprint 2's curl tests.
- Move keeper screenshots to `verification/screenshots/`. Delete the rest.

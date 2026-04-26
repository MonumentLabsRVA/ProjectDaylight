# Plan 03 — Attorney Share Workspace

## Goal

A Daylight user can invite their attorney to a case as a read-only collaborator. The attorney accepts via email, lands in a clean firm-flavored view of the case (timeline, OFW messages, journal, exports, chat), and can request specific outputs (a date-range PDF, a contradiction report) without the parent doing more work.

This is the smallest possible v0 of the law-firm side. It is not ClearLine. It is the wedge that turns every paying parent into a referral channel for their attorney's firm.

## Depends on

- **Plan 00** (case scoping). RLS extension for collaborators only makes sense when resources are case-scoped.
- **Plan 01** is recommended (an attorney browsing a case without OFW messages sees a thin product).
- **Plan 02** is recommended but optional (attorney chat is a Phase 3 feature; the rest of the plan ships without chat).

## Why this matters more than the feature implies

Two-sided products are how vertical legal AI gets fundable in 2026 (see `gtm_plan.md`). The current motion is single-sided B2C. Adding a one-click "invite my lawyer" shifts the conversation:

1. **Attorney sees value firsthand.** They land in a workspace where every claim is cite-backed and every PDF export is print-ready. They learn the product on a case they're already being paid to handle.
2. **Each paying parent becomes top-of-funnel for their firm.** Attorneys are incentivized to ask "would the rest of my clients use this?"
3. **Firm-side billing.** Some firms will pay for attorney seats once one or two clients show up with Daylight-organized evidence. Plan 04 productizes this; Plan 03 *learns whether the share moment converts.*

## What does NOT ship in v0

- No firm/org accounts. An attorney is just a user with read-only access to a specific case.
- No firm-wide dashboard, client roster, or white-labeling.
- No collaborative editing of evidence. Read-only + comment + request.
- No attorney billing. They use the product free in v0.

## Phase 0 — Email infrastructure (~0.5 days)

Daylight has no email-sending infra today. Plan 03 needs invite emails (and Plan 03 Phase 2 adds the "your attorney requested an export" notification). Pick once, use everywhere.

**Pick: Resend.** Reasons: simplest API, generous free tier, good Vue/Nuxt examples, native domain auth. (Postmark works equally well; Resend wins on developer ergonomics. If the user has a strong Postmark preference, swap before this plan starts.)

Add:

| Item | Where |
|---|---|
| `RESEND_API_KEY` | `.env`, `.env.example`, `nuxt.config.ts` `runtimeConfig` (private) |
| `EMAIL_FROM` | `.env` (default `Daylight <hello@daylight.legal>` — verify domain before sending) |
| `src/server/utils/email.ts` | New. Wraps Resend SDK with two helpers: `sendEmail({ to, subject, html, text })` and `renderTemplate(name, vars)` reading from `src/server/email/templates/`. |
| `src/server/email/templates/invite.html` + `.txt` | New. Plain HTML, no marketing footer, one CTA. Subject: "{ParentName} invited you to a Daylight case." |
| `src/server/email/templates/export-requested.html` + `.txt` | New. Notifies the parent that the attorney requested an export. |

**Domain verification.** Verify the sending domain (`daylight.legal`) in Resend before any emails go out. SPF + DKIM + DMARC. Document the verification in `internal_docs/20260425_sift_integration/migration_verification.md`.

**Done when:** a server-side test endpoint can send a Hello-world email through Resend to a personal address, and inbound DKIM passes.

## Phase 1 — Data model + invite flow (~2 days)

#### 1a. Migration `0050_case_collaborators.sql`

```sql
begin;

create table case_collaborators (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,  -- null until accepted
  role text not null check (role in ('attorney_readonly')),
  invite_token text not null,                                  -- random; only present until accepted
  invited_by uuid not null references auth.users(id) on delete cascade,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz                                       -- soft delete; preserves audit
);

create unique index uniq_collab_case_email
  on case_collaborators (case_id, lower(email))
  where revoked_at is null;

create unique index uniq_collab_token on case_collaborators (invite_token);
create index idx_collab_case on case_collaborators (case_id);
create index idx_collab_user on case_collaborators (user_id) where user_id is not null;

alter table case_collaborators enable row level security;

-- Owner can manage collaborators for their cases.
create policy collab_owner_all on case_collaborators
  for all using (
    exists (select 1 from cases c where c.id = case_collaborators.case_id and c.user_id = auth.uid())
  ) with check (
    exists (select 1 from cases c where c.id = case_collaborators.case_id and c.user_id = auth.uid())
  );

-- Collaborator can read their own row.
create policy collab_self_select on case_collaborators
  for select using (user_id = auth.uid() and revoked_at is null and accepted_at is not null);

-- Helper function: does the current user have access to this case?
-- Used by the RLS overhaul below to keep policies short.
create or replace function user_can_access_case(check_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cases where id = check_case_id and user_id = auth.uid()
  ) or exists (
    select 1 from case_collaborators
    where case_id = check_case_id
      and user_id = auth.uid()
      and accepted_at is not null
      and revoked_at is null
  );
$$;

-- Replace the case-scoped SELECT policies on case-scoped tables to use the helper.
-- Owner-only modify policies stay as they are (no-write for collaborators).

drop policy if exists events_select_via_case on events;
create policy events_select_collab on events
  for select using (user_can_access_case(case_id));

drop policy if exists messages_owner_select on messages;
create policy messages_select_collab on messages
  for select using (user_can_access_case(case_id));

-- Same pattern for: evidence, journal_entries, action_items, evidence_mentions, chats, exports.
-- Each gets a `<table>_select_collab` SELECT policy using user_can_access_case(case_id).
-- Existing INSERT/UPDATE/DELETE policies stay restricted to owners.

commit;
```

`user_can_access_case` is the linchpin — it consolidates "owner OR accepted collaborator" into one SQL function so policies stay readable. `security definer` lets the function read `case_collaborators` regardless of the caller's RLS posture (the function body is the access check itself).

#### 1b. Endpoints

| Method + Path | Behavior |
|---|---|
| `POST /api/cases/:id/invite` | Body `{ email, role: 'attorney_readonly' }`. Owner-only. Generates `invite_token` (32-byte URL-safe random). Inserts `case_collaborators` row. Sends invite email via Resend. Returns `{ collaboratorId }`. |
| `GET /api/cases/:id/collaborators` | Owner-only. Lists collaborators with status (`invited`, `accepted`, `revoked`) and `last_seen_at`. |
| `DELETE /api/cases/:id/collaborators/:collabId` | Owner-only. Sets `revoked_at = now()`. Audit log captures who/when. |
| `GET /api/invites/:token` | Public (rate-limited). Returns `{ caseTitle, inviterName, status }` for the invite landing page. Don't leak case content. |
| `POST /api/invites/:token/accept` | Authed. Sets `accepted_at = now()`, `user_id = auth.uid()`. If the email on the invite differs from the logged-in user's email, reject. Returns `{ caseId }` so the client can redirect. |

The invite-acceptance flow:
1. Attorney clicks email link → `/invite/:token` page.
2. If not logged in, redirect to `/auth/signup` (with the token preserved as a query param). After signup, return to `/invite/:token`.
3. The page fetches `GET /api/invites/:token`, shows a confirmation card.
4. Attorney clicks "Accept" → `POST /api/invites/:token/accept` → redirect to `/case` (which now resolves to the shared case via the cookie set by the accept endpoint).

#### 1c. Email content

`src/server/email/templates/invite.html`:

> **Subject:** {ParentName} invited you to a Daylight case
>
> {ParentName} added you as a collaborator on their custody documentation in Daylight.
>
> You'll have read-only access to their timeline, messages, and exports. They can revoke access at any time.
>
> [Accept invitation] → {InviteUrl}
>
> Daylight is a documentation tool. Communication through Daylight is not privileged. If you have questions about confidentiality, contact your client directly.

Plain HTML. No images, no tracking pixels (lawyers' filters are aggressive). `text` version mirrors the HTML.

**Done when:** owner clicks "Invite my attorney" → enters email → attorney receives a clean invite → accepts → lands in read-only case workspace.

## Phase 2 — Attorney UX (~2 days)

#### 2a. Role detection

A logged-in user opening `/case` (or any case-scoped page) needs to know their role on the active case: owner or collaborator. Add `src/app/composables/useCaseRole.ts`:

```ts
export const useCaseRole = () => {
  const role = useState<'owner' | 'collaborator' | null>('case-role', () => null)
  // Hydrated by /api/case (already exists) which now returns { role: 'owner' | 'collaborator' }.
  return role
}
```

Update `/api/case` (existing endpoint) to return the role in addition to case data.

#### 2b. Read-only banner + route guards

In `src/app/layouts/default.vue`:
- If `role === 'collaborator'`, show a top banner: "You're viewing as a collaborator. Read-only access. {revokedAt? 'Access revoked.'}"
- Route-level guard middleware `src/app/middleware/owner-only.ts`: if `role === 'collaborator'`, redirect `/journal/new`, `/capture`, `/evidence/upload` (and any write surfaces) back to `/case` with a toast "Read-only mode."

Pages that need the guard (declared via `definePageMeta({ middleware: 'owner-only' })`): `journal/new.vue`, `capture.vue`, `evidence/index.vue`'s upload action (component-level guard, not full page), `case.vue` settings, anything that POSTs.

#### 2c. Outputs tab

A new tab on `/case` (or its own page `/case/outputs`):
- Lists every saved export (`exports` table), most recent first.
- "Request a new export" button (collaborators) or "Generate new export" button (owners) — same modal in both cases, different downstream behavior.

#### 2d. Export-request flow

| Step | Behavior |
|---|---|
| 1. Collaborator opens "Request a new export" modal | Fields: date range, included types, freeform note. |
| 2. Submit → `POST /api/export-requests` | Inserts `export_requests` row (table below). |
| 3. Owner gets in-app notification + email | Reuse the toast/notification pattern; email via Resend. |
| 4. Owner clicks "Generate" | Existing export pipeline runs. On completion, sets `export_requests.fulfilled_export_id` and notifies the collaborator. |
| 5. Collaborator sees the new export in `/case/outputs` | RLS on `exports` already grants them SELECT (Plan 00 + Phase 1 here). |

Migration `0051_export_requests.sql`:

```sql
create table export_requests (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  date_from date,
  date_to date,
  included_types text[] default '{}',
  note text,
  status text not null default 'pending' check (status in ('pending','fulfilled','dismissed')),
  fulfilled_export_id uuid references exports(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index idx_export_requests_case on export_requests (case_id, created_at desc);
alter table export_requests enable row level security;
create policy export_requests_collab_all on export_requests
  for all using (user_can_access_case(case_id))
  with check (user_can_access_case(case_id));
create trigger export_requests_set_updated_at
  before update on export_requests
  for each row execute function set_updated_at();
```

**Done when:** attorney can browse the case, download any saved export, request a new one with date range + types + note. Parent receives the request and can fulfill it in one click.

## Phase 3 — Chat sharing (depends on Plan 02) (~0.5 days)

If Plan 02 has shipped:

1. The Plan 00 + Phase 1 RLS extension already grants collaborators SELECT on `chats`. No schema changes here.
2. `chats/[id].post.ts` builds the system prompt via `buildSystemPrompt({ ..., role: useCaseRole() })`. For collaborators (`role === 'attorney'` in the prompt context), use the precise/legal-relevance persona.
3. UI: chat is shared between owner and collaborator by default. They both see the same conversation history. No private chats in v0.
4. Permissions: collaborator can send messages too (read-only access to evidence, but read-write to the chat). The agent operates on the same evidence in either case.

**Done when:** attorney can ask "Show me every late pickup since March, formatted for a continuance motion exhibit list" and get a cited answer. Parent and attorney see the same chat history.

## Phase 4 — Telemetry for the GTM motion (~0.5 days)

Track via the existing `analytics` infrastructure (migration 0046). Event types:

- `collaborator_invited` — properties: `caseId`, `role`, `inviteId`
- `collaborator_accepted` — properties: `caseId`, `daysToAccept`
- `collaborator_revoked` — properties: `caseId`, `daysActive`
- `export_requested` — properties: `caseId`, `fromDate`, `toDate`, `typesCount`
- `export_fulfilled` — properties: `caseId`, `requestId`, `latencyHours`
- `collaborator_first_action` — properties: `caseId`, `actionType` (`viewed_case`, `downloaded_export`, `sent_chat_message`)

Surface in `src/app/pages/internal/index.vue`:
- Funnel: invites → accepts → first action → second action
- Time-to-first-action histogram
- "Attorneys appearing on 2+ cases" list — the leading indicator that a firm could become a customer (Plan 04 path)

**Done when:** the internal page renders the funnel and the multi-case-attorney list.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Privilege & confidentiality.** Adding an attorney to a Daylight case does not create attorney-client privilege; communication through Daylight is not privileged. | Disclosure on the invite email, on the acceptance page, and in the read-only banner. Reviewed with a family-law attorney before launch. |
| **Owner-revoke must be immediate and complete.** | Revoke flips `revoked_at`; the `user_can_access_case` function checks `revoked_at IS NULL`. Test: revoke mid-session, attorney's next request 403s. Audit log already captures the revoke (the existing trigger on `case_collaborators`). |
| **Email deliverability.** Lawyer firm domains have aggressive filters. | Plain HTML, no tracking, verified sender domain, no marketing copy. Test against Gmail, Outlook365, and at least one practice management firm domain (Clio.com etc.) before launch. |
| **Email-mismatch on accept.** Invite sent to `me@firm.com`, attorney signs up as `me@gmail.com`, then accepts. | Reject acceptance if logged-in user's email differs (case-insensitive) from invite email. Show a clear message: "This invite was for me@firm.com — please sign in with that address or ask {parent} to re-invite." |
| **Scope creep into ClearLine.** Every feature request from this plan will pull toward firm dashboards, client rosters, time-tracking. | Resist all of it in v0. The v0 question is binary: does the share moment convert? Plan 04 is the surface for richer firm features. |
| **Owner reads collaborator chats.** Some attorneys may not want their queries visible to clients. | v0: chat is shared, documented in the invite. v1.1 considers private chats — wait until an attorney asks. |

## Out of scope

- Multi-case attorney accounts (one attorney, many cases). Natural Phase 5; only after we see a firm appear twice.
- Firm billing.
- Court e-filing integrations.
- Document review workflows (annotations, redactions).
- Attorney comments on individual evidence items.

## Definition of done

Owner clicks "Invite my attorney" → enters email → attorney receives clean invite → accepts → lands in read-only case workspace → downloads a PDF the same day → every step captured in the internal page so we can read the funnel weekly.

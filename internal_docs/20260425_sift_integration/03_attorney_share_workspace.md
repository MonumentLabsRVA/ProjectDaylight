# Plan 03 — Attorney Share Workspace

## Goal

A Daylight user can invite their attorney to a case as a read-only collaborator. The attorney accepts via email, lands in a clean firm-flavored view of the case (timeline, OFW messages, journal, exports, chat), and can request specific outputs (a date-range PDF, a contradiction report) without the parent doing more work.

This is the smallest possible v0 of the law-firm side. It is not ClearLine. It is the wedge that turns every paying parent into a referral channel for their attorney's firm.

## Why this matters more than the feature implies

Two-sided products are how vertical legal AI gets fundable in 2026 (see `gtm_plan.md`). The current Daylight motion is single-sided B2C. Adding a one-click "invite my lawyer" shifts the conversation in three ways:

1. **Attorney sees value firsthand.** They land in a workspace where every claim is cite-backed and every PDF export is print-ready. They learn the product on a case they're already being paid to handle.
2. **Each paying parent becomes a top-of-funnel for their firm.** The attorney is incentivized to ask "would the rest of my clients use this?"
3. **Firm-side billing.** Some firms will pay for attorney seats once one or two clients show up with Daylight-organized evidence.

## What does NOT ship in v0

- No firm/org accounts. An attorney is just a user with read-only access to a specific case.
- No firm-wide dashboard, no client roster, no white-labeling.
- No collaborative editing of evidence. Read-only + comment + request.
- No billing wired to attorney accounts. They use the product free in v0.

The whole point of v0 is to learn whether the share moment converts.

## Phases

### Phase 1 — Data model + invite flow (2–3 days)

1. **DB migration** (`db_migrations/0XX_case_collaborators.sql`):
   ```sql
   create table case_collaborators (
     id uuid pk default gen_random_uuid(),
     case_id uuid not null references cases(id) on delete cascade,
     email text not null,
     user_id uuid references auth.users(id),  -- null until they accept
     role text not null check (role in ('attorney_readonly')),
     invited_by uuid not null references auth.users(id),
     invited_at timestamptz default now(),
     accepted_at timestamptz,
     last_seen_at timestamptz
   );
   create unique index on case_collaborators (case_id, email);
   ```
2. Update RLS on `events`, `messages`, `journal_entries`, `evidence`, `chats`, `exports` to also grant SELECT to users whose email/user_id matches an `accepted_at IS NOT NULL` row in `case_collaborators` for the case.
3. **Endpoints**:
   - `POST /api/cases/:id/invite` — body `{ email, role }`, creates row + sends email.
   - `POST /api/invites/:token/accept` — claims the row for the logged-in user, redirects to the case.
   - `DELETE /api/cases/:id/collaborators/:collabId` — owner revokes.
4. **Email** — Postmark or Resend (whichever Daylight already uses). Subject: "{ParentName} invited you to a Daylight case." Body: short, human, one CTA. No marketing.

**Done when:** owner can invite, attorney clicks email link, lands in their case view.

### Phase 2 — Attorney UX (2–3 days)

A logged-in user with collaborator access sees:
- The case at `/case` with a banner: "You're viewing as an invited collaborator. Read-only."
- All existing read-only views work (timeline, messages, journal, evidence, exports list).
- Capture/journal/upload UI is hidden (route-level guard via collaborator role).
- A new tab `Outputs` — see/download every PDF the parent has ever generated, plus a "Request a new export" button.

**Outputs request flow:**
- Attorney clicks "Request a new export" → modal with date range, included types, freeform note.
- Creates an `export_requests` row, parent gets an in-app notification + email.
- When parent clicks "Generate", existing export pipeline runs and the result is auto-shared.

**Done when:** attorney can browse the case, download exports, and request a new one. Parent receives the request and can fulfill it in one click.

### Phase 3 — Chat sharing (depends on Plan 02) (1 day)

If Plan 02 has shipped, the attorney can also use the chat panel — but their tools include a slightly different system-prompt persona ("you're assisting a family-law attorney; tone is precise and neutral, surface the legal-relevance angle in every summary"). The chat is shared between parent and attorney by default; they can both see the conversation history. No private chats in v0.

**Done when:** attorney can ask "Show me every late pickup since March, formatted for a continuance motion exhibit list" and get a cited answer.

### Phase 4 — Telemetry for the GTM motion (0.5 days)

Track:
- Invites sent / invites accepted
- Time-to-first-attorney-action (login → first PDF download)
- Outputs requested
- Attorneys who came in via 2+ separate parents (signal of "this firm could become a customer")

Surface these in the internal page (`src/app/pages/internal/index.vue`) so we can spot the moment a firm shows up twice.

## Risks

- **Privilege & confidentiality** — adding an attorney to a case workspace doesn't create attorney-client privilege; communication through Daylight isn't privileged. Add this disclosure in the invite acceptance flow and in the attorney banner. Check with a family law attorney before launch.
- **Owner-revoke is critical** — relationships end. Revoking access has to be one click, immediate, with `last_seen_at` and an audit log of what they accessed.
- **Email deliverability** — invite emails to lawyers go to firm domains with strict filters. Use a verified sender domain, plain HTML, no marketing footer.
- **Scope creep into ClearLine** — every feature request from this plan will pull toward firm dashboards, client rosters, time-tracking integrations. Resist all of it in v0. The v0 question is binary: does the share moment convert?

## Out of scope (this plan)

- Multi-case attorney accounts (one attorney, many cases) — natural Phase 5, but only after we see firms come in twice.
- Firm billing.
- Court e-filing integrations.
- Document review workflows (annotations, redactions).

## Definition of done for the plan

Owner clicks "Invite my attorney" → enters email → attorney receives clean invite → accepts → lands in read-only case workspace → downloads a PDF the same day. Each event in that flow is captured in the internal page so we can read the funnel weekly.

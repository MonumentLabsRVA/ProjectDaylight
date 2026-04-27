# Google Ads Tracking Setup

**Implemented:** April 27, 2026
**Status:** Code merged, migration pending manual run.
**Conversion ID:** `AW-18123769984`
**Conversion URL (in Google Ads UI):** the post-signup destination — for new users this is `/onboarding`, see "Conversion URL" section below.

---

## What this does

Wires Daylight up so the live Google Ads campaign can:

1. Count signup conversions via a URL-based pixel hit (the global gtag fires on every page; Google Ads counts the `/onboarding` URL hit as the conversion).
2. Capture the `gclid` query parameter on first touch and persist it onto the user's `profiles` row at signup, so we can later build a Stripe → Google Ads offline-conversion attribution bridge without scanning analytics events.

What this **doesn't** do (deferred):

- Manual `gtag('event', 'conversion', ...)` calls. URL-based conversion is enough for now; we'll add deeper events (first voice note, paid upgrade) when there's volume to warrant it.
- The Stripe → Google Ads offline conversion API push. Phase 2.
- GA4 / Tag Manager. Overkill for one campaign.

---

## Files touched

| File | Purpose |
|------|---------|
| [src/app/plugins/gtag.client.ts](src/app/plugins/gtag.client.ts) | New. Injects `gtag.js` site-wide. `.client.ts` suffix → browser-only, no SSR. |
| [src/app/plugins/signup-attribution.client.ts](src/app/plugins/signup-attribution.client.ts) | Extended. Now captures `gclid` from the URL alongside the existing UTMs. Same first-touch / flush-on-`SIGNED_IN` lifecycle. |
| [src/server/api/signup-attribution.post.ts](src/server/api/signup-attribution.post.ts) | Extended. Accepts `gclid` in the payload and writes it (with `gclid_captured_at`) to the user's profile in addition to the existing analytics event log. First-touch wins (only updates if `gclid` is null on the profile). |
| [db_migrations/0051_profiles_gclid.sql](db_migrations/0051_profiles_gclid.sql) | New. Adds `profiles.gclid` (text) and `profiles.gclid_captured_at` (timestamptz). Indexed where not null. |

---

## Deviations from the original spec

The spec proposed a separate `plugins/gclid.client.ts` writing to a `daylight_gclid` localStorage key, then attaching gclid to the signup form payload directly. The Daylight codebase already has a robust first-touch attribution system that does exactly this pattern for UTMs — captures on first touch, flushes via authenticated `/api/signup-attribution` POST on `SIGNED_IN`. The right call was to **extend that system** rather than build a parallel one.

This honors the spec's intent ("the Nuxt way," "extend existing patterns") and the spec author's note that merging into the same plugin is "your call — separate is cleaner" — in our case, merged-into-existing is cleaner because the plumbing already exists.

The end-to-end behavior is the same: `gclid` is captured on landing, persists for as long as localStorage holds it, and lands on the user's profile after signup.

---

## Conversion URL (the answer to "what about /onboarding?")

The signup flow:

1. User submits `/auth/signup` → `supabase.auth.signUp()` returns a session.
2. `signup.vue` does `router.push('/home')` (line 81).
3. **The global auth middleware intercepts.** [src/app/middleware/auth.global.ts:50-64](src/app/middleware/auth.global.ts#L50-L64) checks `data.value?.needsOnboarding` for any authenticated user on a protected route, and **redirects new users to `/onboarding`**.
4. So for a brand-new user, the first authenticated page they actually see is `/onboarding`.
5. Returning users (`needsOnboarding === false`) skip step 4 and land on `/home` directly. They will not trigger the `/onboarding` URL conversion — which is correct, because Google Ads should only count net-new signups, not returning logins.

**Set the Google Ads conversion URL to `/onboarding`** (or `https://www.daylight.legal/onboarding`). This will fire exactly once per new account, on the first page load after signup.

If we ever change the post-signup destination (e.g. add a `/welcome` interstitial), update the conversion URL in the Google Ads UI to match.

---

## Manual steps to run

1. **Run the migration.** Open the Supabase SQL editor for the prod project and execute [db_migrations/0051_profiles_gclid.sql](db_migrations/0051_profiles_gclid.sql). Verify `profiles.gclid` and `profiles.gclid_captured_at` exist via the Table Editor.
2. **Regenerate Supabase types** at your convenience. The server endpoint currently uses an `as any` cast on the profile update (justified inline) until types catch up — once regenerated, the cast can be dropped.
3. **Confirm `/onboarding` is set as the conversion URL** in the Google Ads UI for the conversion under account `AW-18123769984`. If it's set to `/home` or `/welcome`, change it to `/onboarding`.

---

## Verification checklist

After deploy:

- [ ] Load `https://www.daylight.legal/` in DevTools → Network tab → filter `googletagmanager` → confirm `gtag/js?id=AW-18123769984` loads on every page (homepage, `/document`, `/auth/signup`, `/onboarding`).
- [ ] Or install [Google Tag Assistant](https://tagassistant.google.com) and confirm tag fires.
- [ ] Visit `https://www.daylight.legal/?gclid=test123` → DevTools → Application → Local Storage → confirm `signup_attribution_v1` JSON contains `"gclid":"test123"`.
- [ ] Sign up with `?gclid=test123` in the URL via a throwaway email. After auth, query Supabase: `select id, gclid, gclid_captured_at from profiles where id = '<new user id>';` — expect the row to have `gclid = 'test123'` and a recent `gclid_captured_at`.
- [ ] Sign up *without* a `gclid`. Confirm signup completes normally and `profiles.gclid` is null. Nothing breaks.
- [ ] Check prod logs for any SSR errors mentioning `window`, `localStorage`, or `gtag` — should be none, since the plugins are `.client.ts` and the server endpoint never touches browser globals.
- [ ] Wait for the first real ad click → signup → confirm a row appears in Google Ads conversion reports within ~24h.

---

## Phase 2 (later — not now)

When we have signup volume + at least a few paid conversions:

- Build a server-side job that reads `profiles.gclid` joined to Stripe `customers` / `subscriptions`, and pushes offline conversions to the Google Ads API with the original `gclid`. This closes the loop: a $X subscription that started as a Google Ad click attributes that revenue back to the keyword/ad that drove it.
- Consider deeper conversion events (first voice note recorded, first export generated) — only after we have enough volume that the noise of optimizing for signup-completion alone becomes a problem.

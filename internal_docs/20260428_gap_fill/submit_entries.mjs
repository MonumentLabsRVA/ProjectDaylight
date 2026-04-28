// Submit gap-fill journal entries for gkjohns@gmail.com via the production endpoint.
// Mints a session for the user using the service-role admin API + verifyOtp.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..', 'src')
const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
const env = Object.fromEntries(
  envText.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_SECRET_KEY = env.SUPABASE_SECRET_KEY
const SUPABASE_KEY = env.SUPABASE_KEY
const PROD_URL = 'https://www.daylight.legal'
const TARGET_EMAIL = 'gkjohns@gmail.com'
const CASE_ID = '830cf878-cf26-444c-b07b-d761f5c6c682'
const TIMEZONE = 'America/New_York'

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)
const anon = createClient(SUPABASE_URL, SUPABASE_KEY)

console.log(`Generating magic link for ${TARGET_EMAIL}...`)
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: TARGET_EMAIL,
})
if (linkErr) {
  console.error('generateLink error:', linkErr)
  process.exit(1)
}
const tokenHash = linkData?.properties?.hashed_token
if (!tokenHash) {
  console.error('No hashed_token in link response:', linkData)
  process.exit(1)
}

console.log('Verifying OTP to mint session...')
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink',
})
if (otpErr || !sess?.session) {
  console.error('verifyOtp error:', otpErr, sess)
  process.exit(1)
}

const accessToken = sess.session.access_token
console.log(`Got session for user_id=${sess.user?.id}`)

// Load entries from JSON
const entries = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, 'entries.json'), 'utf8')
)

console.log(`\nSubmitting ${entries.length} journal entries...`)
const results = []
for (const e of entries) {
  process.stdout.write(`  ${e.referenceDate} — ${e.label} ... `)
  const res = await fetch(`${PROD_URL}/api/journal/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      eventText: e.eventText,
      referenceDate: e.referenceDate,
      timezone: TIMEZONE,
      caseId: CASE_ID,
      evidenceIds: [],
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    console.log(`FAIL ${res.status} ${txt}`)
    results.push({ ...e, ok: false, status: res.status, body: txt })
    continue
  }
  const json = await res.json()
  console.log(`OK journalEntryId=${json.journalEntryId}`)
  results.push({ ...e, ok: true, ...json })
  // tiny throttle to avoid overwhelming OpenAI extraction
  await new Promise(r => setTimeout(r, 800))
}

fs.writeFileSync(
  path.join(import.meta.dirname, 'submit_results.json'),
  JSON.stringify(results, null, 2)
)
console.log(`\nDone. Results saved to submit_results.json`)

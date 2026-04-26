const STORAGE_KEY = 'signup_attribution_v1'
const FLUSHED_KEY = 'signup_attribution_flushed_v1'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

type Attribution = {
  referrer: string | null
  landing_path: string
  landing_at: string
  user_agent: string | null
} & Partial<Record<(typeof UTM_KEYS)[number], string>>

function captureFirstTouch() {
  if (localStorage.getItem(STORAGE_KEY)) return
  if (localStorage.getItem(FLUSHED_KEY)) return

  const url = new URL(window.location.href)
  const utm: Partial<Record<(typeof UTM_KEYS)[number], string>> = {}
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)
    if (value) utm[key] = value
  }

  const referrer = document.referrer || null
  const internal = referrer && referrer.startsWith(window.location.origin)
  const hasUtm = Object.keys(utm).length > 0

  if (internal && !hasUtm) return

  const payload: Attribution = {
    referrer: internal ? null : referrer,
    landing_path: url.pathname + url.search,
    landing_at: new Date().toISOString(),
    user_agent: navigator.userAgent || null,
    ...utm
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

async function flushIfReady() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  if (localStorage.getItem(FLUSHED_KEY)) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }

  try {
    const res = await $fetch('/api/signup-attribution', {
      method: 'POST',
      body: JSON.parse(raw)
    })
    if (res) {
      localStorage.setItem(FLUSHED_KEY, '1')
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch (err) {
    console.warn('[signup-attribution] flush failed', err)
  }
}

export default defineNuxtPlugin(() => {
  if (!process.client) return

  captureFirstTouch()

  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  if (user.value) {
    flushIfReady()
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      flushIfReady()
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem(FLUSHED_KEY)
    }
  })
})

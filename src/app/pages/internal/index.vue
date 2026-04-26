<script setup lang="ts">
useHead({ title: 'Daylight — Internal' })

const ALLOWED_EMAILS = new Set([
  'gkjohns@gmail.com',
  'kyle@monumentlabs.io',
  'kyle@tidewaterresearch.com'
])

const user = useSupabaseUser()
const isAllowed = computed(() => Boolean(user.value?.email && ALLOWED_EMAILS.has(user.value.email)))

if (import.meta.server && !isAllowed.value) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
}

watchEffect(() => {
  if (import.meta.client && user.value && !isAllowed.value) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', fatal: true })
  }
})

// ─────────────────────────── Dev tools ───────────────────────────

type CheckStatus = 'idle' | 'checking' | 'ok' | 'error'

type CheckSnapshot = {
  ok: boolean
  latencyMs: number | null
  error: string | null
  detail: string | null
}

type StatusPayload = {
  checkedAt: string
  env: {
    nodeEnv: string
    nodeVersion: string
    hasSupabaseUrl: boolean
    hasSupabaseAnonKey: boolean
    hasSupabaseServiceKey: boolean
    hasOpenAIKey: boolean
    hasInngestEventKey: boolean
    hasInngestSigningKey: boolean
  }
  checks: {
    supabase: CheckSnapshot
    profile: CheckSnapshot
  }
  whoami: { userId: string, email: string | null }
}

const statusData = ref<StatusPayload | null>(null)
const statusLoading = ref(false)
const statusError = ref<string | null>(null)

async function refreshStatus() {
  statusLoading.value = true
  statusError.value = null
  try {
    statusData.value = await $fetch<StatusPayload>('/api/internal/status', {
      headers: useRequestHeaders(['cookie'])
    })
  } catch (e: any) {
    statusError.value = e?.data?.statusMessage ?? e?.message ?? 'Failed to load status'
  } finally {
    statusLoading.value = false
  }
}

onMounted(() => {
  void refreshStatus()
})

const checkColor = (ok: boolean): 'success' | 'error' => (ok ? 'success' : 'error')
const envColor = (present: boolean): 'success' | 'error' => (present ? 'success' : 'error')

// Client-side latency probes
type Probe = {
  id: string
  label: string
  description: string
  path: string
  method?: 'GET' | 'POST'
}

const probes: Probe[] = [
  { id: 'profile', label: 'Profile API', description: 'GET /api/profile — current user and onboarding state', path: '/api/profile' },
  { id: 'timeline', label: 'Timeline API', description: 'GET /api/timeline — case events for the current user', path: '/api/timeline' },
  { id: 'journal', label: 'Journal API', description: 'GET /api/journal — journal entries for the current user', path: '/api/journal' }
]

interface ProbeState {
  status: CheckStatus
  latencyMs: number | null
  error: string | null
  responsePreview: string | null
}

const probeStates = reactive<Record<string, ProbeState>>(
  Object.fromEntries(probes.map(p => [p.id, { status: 'idle', latencyMs: null, error: null, responsePreview: null }]))
)

async function runProbe(probe: Probe) {
  const state = probeStates[probe.id]
  state.status = 'checking'
  state.latencyMs = null
  state.error = null
  state.responsePreview = null

  const start = performance.now()
  try {
    const response = await $fetch<unknown>(probe.path, {
      method: probe.method ?? 'GET',
      headers: useRequestHeaders(['cookie'])
    })
    state.latencyMs = Math.round(performance.now() - start)
    state.status = 'ok'
    const json = JSON.stringify(response, null, 2)
    state.responsePreview = json.length > 600 ? json.slice(0, 600) + '\n…' : json
  } catch (e: any) {
    state.latencyMs = Math.round(performance.now() - start)
    state.status = 'error'
    state.error = e?.data?.statusMessage ?? e?.message ?? 'Request failed'
  }
}

async function runAllProbes() {
  await Promise.all(probes.map(p => runProbe(p)))
}

// Browser snapshot
const browserInfo = ref<{
  userAgent: string
  language: string
  timezone: string
  viewport: string
  online: boolean
  cores: number
} | null>(null)

onMounted(() => {
  if (!import.meta.client) return
  browserInfo.value = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    online: navigator.onLine,
    cores: navigator.hardwareConcurrency
  }
})

// Planned labs (placeholders for what each Plan will unlock)
const plannedLabs = [
  { plan: 'Plan 01', title: 'OFW Parser sandbox', desc: 'Drop in an OFW Message Report PDF and inspect parsed messages, headers, and dedup output. Wires to the lifted Sift parser.', icon: 'i-lucide-file-text' },
  { plan: 'Plan 02', title: 'Chat tool dry-run', desc: 'Pick a chat tool (search_events, find_contradictions, etc.), supply args, and inspect the JSON the LLM would receive.', icon: 'i-lucide-message-square' },
  { plan: 'Plan 03', title: 'Attorney share preview', desc: 'Spin up a sandbox attorney session against your own case and click through the read-only views as they will appear to outside counsel.', icon: 'i-lucide-share-2' }
]
</script>

<template>
  <UDashboardPanel id="internal">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="font-medium">Internal</span>
        </template>
        <template #right>
          <UBadge color="info" variant="subtle" size="sm">Employee only</UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6">
        <div class="max-w-6xl mx-auto space-y-10">
          <!-- Service status -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-highlighted">Service status</h2>
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-refresh-cw"
                :loading="statusLoading"
                @click="refreshStatus"
              >
                Refresh
              </UButton>
            </div>

            <UAlert
              v-if="statusError"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="statusError"
              class="mb-4"
            />

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <UCard
                v-for="(snap, key) in statusData?.checks ?? {}"
                :key="key"
                :ui="{ body: 'space-y-2' }"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-highlighted capitalize">{{ key }}</span>
                  <UBadge :color="checkColor(snap.ok)" variant="subtle" size="sm">
                    {{ snap.ok ? 'OK' : 'ERROR' }}
                  </UBadge>
                </div>
                <div class="flex items-center gap-2 text-xs text-muted">
                  <UIcon name="i-lucide-timer" class="w-3.5 h-3.5" />
                  <span class="font-mono">{{ snap.latencyMs ?? '—' }}ms</span>
                </div>
                <p class="text-xs text-muted">{{ snap.detail ?? snap.error }}</p>
              </UCard>
            </div>

            <div v-if="!statusData && statusLoading" class="text-sm text-muted mt-4">
              Checking…
            </div>
            <p v-if="statusData?.checkedAt" class="text-xs text-muted mt-3 italic">
              Last checked {{ new Date(statusData.checkedAt).toLocaleTimeString() }}
            </p>
          </section>

          <!-- Environment -->
          <section v-if="statusData">
            <h2 class="text-lg font-semibold text-highlighted mb-4">Environment</h2>
            <UCard :ui="{ body: 'p-0' }">
              <table class="w-full text-sm">
                <tbody>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">NODE_ENV</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ statusData.env.nodeEnv }}</td>
                  </tr>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">Node version</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ statusData.env.nodeVersion }}</td>
                  </tr>
                  <tr
                    v-for="(present, key) in {
                      'SUPABASE_URL': statusData.env.hasSupabaseUrl,
                      'SUPABASE_ANON_KEY': statusData.env.hasSupabaseAnonKey,
                      'SUPABASE_SERVICE_KEY': statusData.env.hasSupabaseServiceKey,
                      'OPENAI_API_KEY': statusData.env.hasOpenAIKey,
                      'INNGEST_EVENT_KEY': statusData.env.hasInngestEventKey,
                      'INNGEST_SIGNING_KEY': statusData.env.hasInngestSigningKey
                    }"
                    :key="key"
                    class="border-b border-default last:border-b-0"
                  >
                    <td class="py-2.5 px-4 text-muted font-mono text-xs">{{ key }}</td>
                    <td class="py-2.5 px-4 text-right">
                      <UBadge :color="envColor(present)" variant="subtle" size="sm">
                        {{ present ? 'set' : 'missing' }}
                      </UBadge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </section>

          <!-- Whoami -->
          <section v-if="statusData?.whoami">
            <h2 class="text-lg font-semibold text-highlighted mb-4">Whoami</h2>
            <UCard :ui="{ body: 'space-y-2' }">
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span class="text-muted">Email</span>
                <span class="font-mono text-xs text-highlighted">{{ statusData.whoami.email ?? '—' }}</span>
              </div>
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span class="text-muted">User ID</span>
                <span class="font-mono text-xs text-highlighted truncate">{{ statusData.whoami.userId || '—' }}</span>
              </div>
            </UCard>
          </section>

          <!-- API probes -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-highlighted">API probes</h2>
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                icon="i-lucide-zap"
                @click="runAllProbes"
              >
                Run all
              </UButton>
            </div>
            <div class="space-y-3">
              <UCard
                v-for="probe in probes"
                :key="probe.id"
                :ui="{ body: 'space-y-3' }"
              >
                <div class="flex items-center justify-between gap-4">
                  <div class="space-y-0.5">
                    <h3 class="text-sm font-semibold text-highlighted">{{ probe.label }}</h3>
                    <p class="text-xs text-muted font-mono">{{ probe.description }}</p>
                  </div>
                  <div class="flex items-center gap-3 shrink-0">
                    <UBadge
                      v-if="probeStates[probe.id].status !== 'idle'"
                      :color="probeStates[probe.id].status === 'ok' ? 'success' : probeStates[probe.id].status === 'error' ? 'error' : 'warning'"
                      variant="subtle"
                      size="sm"
                    >
                      {{ probeStates[probe.id].status === 'checking' ? 'Checking…' : probeStates[probe.id].status === 'ok' ? `OK · ${probeStates[probe.id].latencyMs}ms` : `Error · ${probeStates[probe.id].latencyMs}ms` }}
                    </UBadge>
                    <UButton
                      color="primary"
                      variant="soft"
                      size="xs"
                      :loading="probeStates[probe.id].status === 'checking'"
                      @click="runProbe(probe)"
                    >
                      Run
                    </UButton>
                  </div>
                </div>
                <div v-if="probeStates[probe.id].error" class="text-xs text-red-500 font-mono">
                  {{ probeStates[probe.id].error }}
                </div>
                <pre
                  v-if="probeStates[probe.id].responsePreview"
                  class="text-xs bg-elevated/50 border border-default rounded p-3 overflow-x-auto"
                >{{ probeStates[probe.id].responsePreview }}</pre>
              </UCard>
            </div>
          </section>

          <!-- Browser -->
          <section v-if="browserInfo">
            <h2 class="text-lg font-semibold text-highlighted mb-4">Browser</h2>
            <UCard :ui="{ body: 'p-0' }">
              <table class="w-full text-sm">
                <tbody>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">Timezone</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ browserInfo.timezone }}</td>
                  </tr>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">Language</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ browserInfo.language }}</td>
                  </tr>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">Viewport</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ browserInfo.viewport }}</td>
                  </tr>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">Online</td>
                    <td class="py-2.5 px-4 text-right">
                      <UBadge :color="browserInfo.online ? 'success' : 'error'" variant="subtle" size="sm">
                        {{ browserInfo.online ? 'yes' : 'no' }}
                      </UBadge>
                    </td>
                  </tr>
                  <tr class="border-b border-default">
                    <td class="py-2.5 px-4 text-muted">CPU cores</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs">{{ browserInfo.cores }}</td>
                  </tr>
                  <tr>
                    <td class="py-2.5 px-4 text-muted">User agent</td>
                    <td class="py-2.5 px-4 text-right font-mono text-xs truncate max-w-md">{{ browserInfo.userAgent }}</td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </section>

          <!-- Planned labs -->
          <section>
            <h2 class="text-lg font-semibold text-highlighted mb-4">Planned labs</h2>
            <p class="text-sm text-muted mb-4">
              Each implementation plan unlocks a new lab here. Until that plan ships, this section is empty.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UCard
                v-for="lab in plannedLabs"
                :key="lab.title"
                :ui="{ body: 'space-y-3' }"
              >
                <div class="flex items-center justify-between">
                  <UIcon :name="lab.icon" class="w-5 h-5 text-muted" />
                  <UBadge color="neutral" variant="subtle" size="sm">{{ lab.plan }}</UBadge>
                </div>
                <h3 class="text-sm font-semibold text-highlighted">{{ lab.title }}</h3>
                <p class="text-xs text-default leading-relaxed">{{ lab.desc }}</p>
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  disabled
                  block
                >
                  Available after {{ lab.plan }} ships
                </UButton>
              </UCard>
            </div>
          </section>

          <!-- Existing dev pages -->
          <section class="pb-6">
            <h2 class="text-lg font-semibold text-highlighted mb-4">Other dev pages</h2>
            <UCard :ui="{ body: 'space-y-2' }">
              <UButton
                to="/dev/inngest-test"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-external-link"
                block
                :ui="{ base: 'justify-between' }"
              >
                <span>Inngest test page</span>
                <span class="text-xs text-muted font-mono">/dev/inngest-test</span>
              </UButton>
            </UCard>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

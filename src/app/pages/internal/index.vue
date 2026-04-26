<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

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

// ─────────────────────────── Tabs ───────────────────────────

const route = useRoute()
const router = useRouter()

const tabs: TabsItem[] = [
  { label: 'Plans & GTM', icon: 'i-lucide-target', value: 'plans', slot: 'plans' as const },
  { label: 'Dev tools', icon: 'i-lucide-flask-conical', value: 'dev', slot: 'dev' as const }
]

const activeTab = ref<string>(typeof route.query.tab === 'string' ? route.query.tab : 'plans')
watch(activeTab, (value) => {
  router.replace({ query: { ...route.query, tab: value } })
})

// ─────────────────────────── Plans & GTM data ───────────────────────────

interface PlanCard {
  number: string
  title: string
  oneLine: string
  filePath: string
  status: 'planned' | 'in_progress' | 'shipped'
  estimatedDays: string
}

const plans: PlanCard[] = [
  {
    number: '01',
    title: 'OFW Ingest',
    oneLine: 'Lift Sift\'s OFW PDF parser into Daylight. Messages become first-class evidence on the timeline.',
    filePath: 'internal_docs/20260425_sift_integration/01_ofw_ingest.md',
    status: 'planned',
    estimatedDays: '6–9 days'
  },
  {
    number: '02',
    title: 'Chat Over Evidence',
    oneLine: 'Port AIR-Bot\'s chat apparatus. Cited conversational investigation over events, messages, journal.',
    filePath: 'internal_docs/20260425_sift_integration/02_chat_over_evidence.md',
    status: 'planned',
    estimatedDays: '5–8 days'
  },
  {
    number: '03',
    title: 'Attorney Share Workspace',
    oneLine: 'Invite-my-attorney as read-only collaborator. The wedge into the law-firm side without a sales motion.',
    filePath: 'internal_docs/20260425_sift_integration/03_attorney_share_workspace.md',
    status: 'planned',
    estimatedDays: '5–7 days'
  },
  {
    number: '04',
    title: 'Evidence Brief for Firms',
    oneLine: 'One-button OFW → court-ready exhibit packet. The high-impact feature for selling to local family-law firms.',
    filePath: 'internal_docs/20260425_sift_integration/04_evidence_brief.md',
    status: 'planned',
    estimatedDays: '11–16 days'
  }
]

interface ReferenceDoc {
  title: string
  oneLine: string
  filePath: string
  kind: 'research' | 'experience' | 'gtm'
}

const referenceDocs: ReferenceDoc[] = [
  {
    title: 'Founder custody experience',
    oneLine: 'Lived first-person account of contested custody — the source material that shaped Daylight\'s product direction.',
    filePath: 'internal_docs/founder_custody_experience.md',
    kind: 'experience'
  },
  {
    title: 'Local firm pain points (research)',
    oneLine: 'Web + practitioner research on what local family-law firms actually struggle with. Source-grounded, citable.',
    filePath: 'internal_docs/20260425_sift_integration/research_local_firm_pain_points.md',
    kind: 'research'
  },
  {
    title: 'Local firm GTM',
    oneLine: 'Direct-sales motion for selling Plan 04 to local family-law firms. Richmond-first, bar-association-led.',
    filePath: 'internal_docs/20260425_sift_integration/gtm_local_firms.md',
    kind: 'gtm'
  }
]

const refKindMeta: Record<ReferenceDoc['kind'], { label: string, color: 'neutral' | 'info' | 'primary', icon: string }> = {
  experience: { label: 'Experience', color: 'primary', icon: 'i-lucide-user' },
  research: { label: 'Research', color: 'neutral', icon: 'i-lucide-search' },
  gtm: { label: 'GTM', color: 'info', icon: 'i-lucide-target' }
}

const statusMeta: Record<PlanCard['status'], { label: string, color: 'neutral' | 'warning' | 'success' }> = {
  planned: { label: 'Planned', color: 'neutral' },
  in_progress: { label: 'In progress', color: 'warning' },
  shipped: { label: 'Shipped', color: 'success' }
}

const icps = [
  {
    tag: 'B2C',
    name: 'Self-represented or represented parent in active custody',
    who: 'Parent, 30–55, in or anticipating a custody dispute. Court-ordered to use OFW or similar.',
    pain: 'Their attorney bills hourly to organize chaos, or they\'re self-represented and drowning. Afraid of forgetting something that matters.',
    jtbd: 'Help me show up to court with the truth in order, so I don\'t lose time with my kid because I couldn\'t keep up with paperwork.',
    pricing: [
      { tier: 'Free', price: '$0', notes: 'Voice journal, manual events, 1 OFW preview' },
      { tier: 'Personal', price: '$19/mo', notes: 'Full OFW import, timeline, AI chat, 5GB' },
      { tier: 'Personal Pro', price: '$39/mo or $149 one-time', notes: 'Court-ready PDFs, unlimited storage, attorney share' }
    ]
  },
  {
    tag: 'B2B',
    name: 'Solo / small family-law firm (1–10 attorneys)',
    who: 'Family law attorney, 20–80 active cases. Knows Clio/MyCase. Finds them overbuilt for evidence work.',
    pain: 'Clients arrive with disorganized evidence. Paralegal spends 4–8 hrs per case. Can\'t bill that prep at full rate.',
    jtbd: 'Cut 6 hours of evidence-prep work per case, and give clients a place to dump chaos that doesn\'t end up in my inbox.',
    pricing: [
      { tier: 'Firm', price: '$149/seat/mo', notes: 'Per-attorney access, branded PDFs, request-an-export' },
      { tier: 'Firm Pro (later)', price: '$299/seat/mo', notes: 'Multi-case dashboard, client roster, intake automation' }
    ]
  }
]

const wedges = [
  { n: 1, name: 'Free OFW analyzer', purpose: 'Acquisition', body: 'Landing page where anyone can upload an OFW PDF and get a 1-page analysis. Email-gated. Captures the unmet "OFW message export" search intent.', target: '8% conversion to paid trial within 7 days' },
  { n: 2, name: 'Paid personal account', purpose: 'Monetization', body: 'Standard freemium ladder. Voice + manual = free. OFW + chat + court PDFs = paid. The chat\'s first-cited answer is the magic moment.', target: '$19–$39/mo or $149 one-time' },
  { n: 3, name: 'Attorney share', purpose: 'Firm acquisition (no sales motion)', body: 'Every paying parent invites their attorney from the first export. Attorney lands in the workspace, learns the product on a paid case.', target: 'Firms arriving via 2+ different parents' },
  { n: 4, name: 'Direct firm sales', purpose: 'Scale (only after Wedge 3 signal)', body: 'Outbound to Virginia family-law firms first. CLE talks. Veteran-spouse + military-divorce angle leveraging Kyle\'s background.', target: '$149/seat/mo, 3+ paying firms by day 90' }
]

const ninetyDay = [
  { label: 'Days 1–30', bullets: ['Ship Plan 01 (OFW ingest) end-to-end behind a flag', 'Ship the free OFW analyzer landing page', 'Publish 4 cornerstone SEO articles', '10 beta parents from /r/Custody + Facebook; 5 paid', '3 friendly attorneys piloting the share workspace'], bar: '100 free OFW analyses, 10 paid signups, 1 attorney active' },
  { label: 'Days 31–60', bullets: ['Ship Plan 02 (chat over evidence) to all paid users', 'Ship Plan 03 (attorney share) to all paid users', '4 more cornerstone SEO articles', 'Turn on Google Ads at $750/mo'], bar: '25 paid parents, 5 attorneys active, 1 firm with 2+ clients on Daylight' },
  { label: 'Days 61–90', bullets: ['Open paid firm tier at $149/seat/mo (50% pilot discount)', 'Submit first CLE talk pitch (Q3 Virginia Bar)', '12 SEO articles total', 'Decide raise vs. bootstrap based on traction'], bar: '50 paying parents, 3 paying firms, $4k MRR' }
]

const metrics = [
  { metric: 'Free OFW analyses run', target: '600', source: 'landing page analytics', value: 'TBD' },
  { metric: 'Paid parents', target: '50', source: 'Stripe', value: 'TBD' },
  { metric: 'Paid firms', target: '3', source: 'Stripe', value: 'TBD' },
  { metric: 'MRR', target: '$4,000', source: 'Stripe', value: 'TBD' },
  { metric: 'Free → paid (7-day)', target: '8%', source: 'analytics', value: 'TBD' },
  { metric: 'Attorneys invited via share', target: '30', source: 'case_collaborators', value: 'TBD' },
  { metric: 'Attorneys accepted invite', target: '18', source: 'case_collaborators', value: 'TBD' },
  { metric: 'Firms with 2+ clients on Daylight', target: '2', source: 'derived', value: 'TBD' }
]

const openQuestions = [
  'Are we comfortable framing this as evidence software (not legal-tech, not divorce-tech)? The category positioning is load-bearing for the next 12 months.',
  'Is the firm wedge a Monument Labs offering or a Daylight company offering? If the latter, pricing and brand decisions need to start now.',
  'How do you feel about the military-divorce niche as the firm-side beachhead given your Marine background?'
]

const copyPath = async (path: string) => {
  if (!import.meta.client) return
  await navigator.clipboard.writeText(path)
}

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
  if (activeTab.value === 'dev') void refreshStatus()
})

watch(activeTab, (value) => {
  if (value === 'dev' && !statusData.value && !statusLoading.value) void refreshStatus()
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
        <div class="max-w-6xl mx-auto">
          <UTabs v-model="activeTab" :items="tabs" class="w-full" :ui="{ list: 'mb-6' }">
            <!-- ─────────────── Plans & GTM ─────────────── -->
            <template #plans>
              <div class="space-y-10">
                <!-- Active push banner -->
                <section>
                  <UCard>
                    <div class="flex items-start gap-4">
                      <div class="rounded-full bg-primary/10 p-3 shrink-0">
                        <UIcon name="i-lucide-target" class="w-6 h-6 text-primary" />
                      </div>
                      <div class="space-y-1">
                        <h2 class="text-lg font-semibold text-highlighted">Active push — Sift integration</h2>
                        <p class="text-sm text-muted">
                          Three independent plans on branch <code class="text-xs px-1.5 py-0.5 bg-elevated rounded">feat/sift-integration-plans</code>.
                          Each ships behind a flag. Started 2026-04-25.
                        </p>
                        <p class="text-sm text-muted pt-1">
                          Reference: <code class="text-xs px-1.5 py-0.5 bg-elevated rounded">internal_docs/20260425_sift_integration/</code>
                        </p>
                      </div>
                    </div>
                  </UCard>
                </section>

                <!-- Implementation plans -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">Implementation plans</h2>
                  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <UCard
                      v-for="plan in plans"
                      :key="plan.number"
                      :ui="{ body: 'space-y-3' }"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-mono text-muted">PLAN {{ plan.number }}</span>
                        <UBadge :color="statusMeta[plan.status].color" variant="subtle" size="sm">
                          {{ statusMeta[plan.status].label }}
                        </UBadge>
                      </div>
                      <h3 class="text-base font-semibold text-highlighted">{{ plan.title }}</h3>
                      <p class="text-sm text-default leading-relaxed">{{ plan.oneLine }}</p>
                      <div class="text-xs text-muted">Estimated: {{ plan.estimatedDays }}</div>
                      <div class="pt-2 border-t border-default flex items-center justify-between gap-2">
                        <code class="text-xs text-muted truncate">{{ plan.filePath }}</code>
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-copy"
                          aria-label="Copy file path"
                          @click="copyPath(plan.filePath)"
                        />
                      </div>
                    </UCard>
                  </div>
                </section>

                <!-- GTM: Positioning -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">GTM — Positioning</h2>
                  <UCard>
                    <blockquote class="border-l-4 border-primary pl-4 italic text-default leading-relaxed">
                      Daylight is where a parent in a custody case turns chaos into evidence — a private, court-ready record built from voice notes, screenshots, and Our Family Wizard messages, that their attorney can also use.
                    </blockquote>
                    <p class="mt-4 text-sm text-muted">
                      <strong class="text-highlighted">The wedge sentence:</strong>
                      "Upload your OFW export, see your case organized in 60 seconds, free."
                    </p>
                  </UCard>
                </section>

                <!-- GTM: ICPs -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">GTM — Two ICPs, one product</h2>
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <UCard
                      v-for="icp in icps"
                      :key="icp.tag"
                      :ui="{ body: 'space-y-3' }"
                    >
                      <div class="flex items-center gap-2">
                        <UBadge :color="icp.tag === 'B2C' ? 'primary' : 'info'" variant="subtle" size="sm">
                          {{ icp.tag }}
                        </UBadge>
                        <h3 class="text-base font-semibold text-highlighted">{{ icp.name }}</h3>
                      </div>
                      <div class="text-sm space-y-2">
                        <p><span class="text-muted font-medium">Who:</span> {{ icp.who }}</p>
                        <p><span class="text-muted font-medium">Pain:</span> {{ icp.pain }}</p>
                        <p class="italic text-default">"{{ icp.jtbd }}"</p>
                      </div>
                      <div class="pt-3 border-t border-default">
                        <div class="text-xs font-medium text-muted mb-2">Pricing</div>
                        <div class="space-y-1.5">
                          <div
                            v-for="tier in icp.pricing"
                            :key="tier.tier"
                            class="flex justify-between items-baseline text-sm gap-3"
                          >
                            <span class="text-highlighted">{{ tier.tier }}</span>
                            <span class="font-mono text-xs">{{ tier.price }}</span>
                          </div>
                          <div
                            v-for="tier in icp.pricing"
                            :key="`${tier.tier}-notes`"
                            class="text-xs text-muted -mt-1 pl-0"
                          >
                            <span class="font-medium">{{ tier.tier }}:</span> {{ tier.notes }}
                          </div>
                        </div>
                      </div>
                    </UCard>
                  </div>
                </section>

                <!-- GTM: Wedge sequence -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">GTM — Wedge sequence</h2>
                  <div class="space-y-3">
                    <UCard
                      v-for="wedge in wedges"
                      :key="wedge.n"
                      :ui="{ body: 'flex gap-4 items-start' }"
                    >
                      <div class="rounded-full bg-elevated w-8 h-8 flex items-center justify-center font-mono text-sm text-muted shrink-0">
                        {{ wedge.n }}
                      </div>
                      <div class="flex-1 space-y-1">
                        <div class="flex items-baseline gap-3 flex-wrap">
                          <h3 class="text-base font-semibold text-highlighted">{{ wedge.name }}</h3>
                          <UBadge color="neutral" variant="subtle" size="sm">{{ wedge.purpose }}</UBadge>
                        </div>
                        <p class="text-sm text-default">{{ wedge.body }}</p>
                        <p class="text-xs text-muted pt-1">
                          <span class="font-medium">Target:</span> {{ wedge.target }}
                        </p>
                      </div>
                    </UCard>
                  </div>
                </section>

                <!-- GTM: 90-day plan -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">GTM — 90-day plan</h2>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <UCard
                      v-for="block in ninetyDay"
                      :key="block.label"
                      :ui="{ body: 'space-y-3' }"
                    >
                      <h3 class="text-base font-semibold text-highlighted">{{ block.label }}</h3>
                      <ul class="space-y-2 text-sm">
                        <li
                          v-for="(item, i) in block.bullets"
                          :key="i"
                          class="flex gap-2"
                        >
                          <UIcon name="i-lucide-circle" class="w-3 h-3 mt-1.5 text-muted shrink-0" />
                          <span class="text-default">{{ item }}</span>
                        </li>
                      </ul>
                      <div class="pt-3 border-t border-default text-xs text-muted">
                        <div class="font-medium text-highlighted mb-1">Success bar</div>
                        {{ block.bar }}
                      </div>
                    </UCard>
                  </div>
                </section>

                <!-- Metrics -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">Success metrics</h2>
                  <UCard :ui="{ body: 'p-0' }">
                    <table class="w-full text-sm">
                      <thead>
                        <tr class="border-b border-default bg-elevated/30">
                          <th class="text-left py-3 px-4 text-muted font-medium">Metric</th>
                          <th class="text-right py-3 px-4 text-muted font-medium">Target (day 90)</th>
                          <th class="text-right py-3 px-4 text-muted font-medium">Current</th>
                          <th class="text-left py-3 px-4 text-muted font-medium hidden sm:table-cell">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="(row, i) in metrics"
                          :key="row.metric"
                          :class="['border-b border-default', i === metrics.length - 1 ? 'border-b-0' : '']"
                        >
                          <td class="py-3 px-4 text-default">{{ row.metric }}</td>
                          <td class="py-3 px-4 text-right font-mono text-highlighted">{{ row.target }}</td>
                          <td class="py-3 px-4 text-right">
                            <UBadge color="neutral" variant="subtle" size="sm">{{ row.value }}</UBadge>
                          </td>
                          <td class="py-3 px-4 text-xs text-muted hidden sm:table-cell">{{ row.source }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </UCard>
                  <p class="text-xs text-muted mt-2 italic">
                    Wire up live values after Plan 03 ships and the share funnel begins producing data.
                  </p>
                </section>

                <!-- Reference docs -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">Reference & research</h2>
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <UCard
                      v-for="doc in referenceDocs"
                      :key="doc.filePath"
                      :ui="{ body: 'space-y-3' }"
                    >
                      <div class="flex items-center justify-between">
                        <UIcon :name="refKindMeta[doc.kind].icon" class="w-5 h-5 text-muted" />
                        <UBadge :color="refKindMeta[doc.kind].color" variant="subtle" size="sm">
                          {{ refKindMeta[doc.kind].label }}
                        </UBadge>
                      </div>
                      <h3 class="text-base font-semibold text-highlighted">{{ doc.title }}</h3>
                      <p class="text-sm text-default leading-relaxed">{{ doc.oneLine }}</p>
                      <div class="pt-2 border-t border-default flex items-center justify-between gap-2">
                        <code class="text-xs text-muted truncate">{{ doc.filePath }}</code>
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-copy"
                          aria-label="Copy file path"
                          @click="copyPath(doc.filePath)"
                        />
                      </div>
                    </UCard>
                  </div>
                </section>

                <!-- Open questions -->
                <section>
                  <h2 class="text-lg font-semibold text-highlighted mb-4">Open questions</h2>
                  <UCard>
                    <ol class="space-y-3 text-sm list-decimal list-inside marker:text-muted marker:font-mono">
                      <li
                        v-for="(q, i) in openQuestions"
                        :key="i"
                        class="text-default leading-relaxed pl-1"
                      >
                        {{ q }}
                      </li>
                    </ol>
                  </UCard>
                </section>

                <section class="pb-6">
                  <p class="text-xs text-muted text-center">
                    Source of truth for all plans:
                    <code class="px-1.5 py-0.5 bg-elevated rounded">internal_docs/20260425_sift_integration/</code>
                  </p>
                </section>
              </div>
            </template>

            <!-- ─────────────── Dev tools ─────────────── -->
            <template #dev>
              <div class="space-y-10">
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
            </template>
          </UTabs>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

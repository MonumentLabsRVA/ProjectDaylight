<script setup lang="ts">
import type { TimelineEvent } from '~/types'

interface HomeSummary {
  todayEvents: number
  incidentsThisWeek: number
  positiveThisWeek: number
  totalEvents: number
  totalEvidence: number
  totalCommunications: number
  nextCourtDate?: string
  lastCaptureAt?: string
}

interface HomeResponse {
  summary: HomeSummary
  recentEvents: TimelineEvent[]
}

// Use useFetch with cookie headers for SSR compatibility
const { data, status, error, refresh } = await useFetch<HomeResponse>('/api/home', {
  headers: useRequestHeaders(['cookie'])
})

// Watch for session changes and refresh data
const session = useSupabaseSession()
watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

const router = useRouter()

function formatDate (value?: string) {
  if (!value) { return 'Not set' }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDay (value?: string) {
  if (!value) { return '—' }

  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  })
}

function onQuickCapture () {
  router.push('/capture')
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Home">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-4xl space-y-6">
        <UCard class="border border-primary/30 bg-primary/5">
          <template #header>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-semibold text-highlighted">
                  Chaos → Capture
                </p>
                <p class="text-sm text-muted">
                  One tap to record what happened. Daylight turns it into court‑ready evidence later.
                </p>
              </div>

              <UButton
                color="primary"
                size="lg"
                icon="i-lucide-mic"
                class="w-full sm:w-auto"
                @click="onQuickCapture"
              >
                Quick capture
              </UButton>
            </div>
          </template>

          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted">
                Today
              </p>
              <p class="mt-1 text-2xl font-semibold text-highlighted">
                {{ data?.summary.todayEvents }}
              </p>
              <p class="text-xs text-muted">
                events captured
              </p>
            </div>

            <div>
              <p class="text-xs uppercase tracking-wide text-muted">
                This week
              </p>
              <p class="mt-1 text-sm text-muted">
                <span class="font-semibold text-success">
                  {{ data?.summary.positiveThisWeek }}
                </span>
                positive ·
                <span class="font-semibold text-error">
                  {{ data?.summary.incidentsThisWeek }}
                </span>
                incidents
              </p>
              <p class="text-xs text-muted">
                Based on your captured events in the last 7 days.
              </p>
            </div>

            <div>
              <p class="text-xs uppercase tracking-wide text-muted">
                Next court date
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted">
                {{ formatDay(data?.summary.nextCourtDate) }}
              </p>
              <p class="text-xs text-muted">
                Last capture: {{ formatDate(data?.summary.lastCaptureAt) }}
              </p>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 md:grid-cols-2">
          <UCard>
            <template #header>
              <p class="font-medium text-highlighted">
                Your data so far
              </p>
            </template>

            <ul class="space-y-2 text-sm text-muted">
              <li>
                • You’ve captured {{ data?.summary.totalEvents }} event(s) in your timeline.
              </li>
              <li>
                • You’ve uploaded {{ data?.summary.totalEvidence }} evidence item(s).
              </li>
              <li>
                • You’ve logged {{ data?.summary.totalCommunications }} communication(s).
              </li>
            </ul>
          </UCard>

          <UCard>
            <template #header>
              <p class="font-medium text-highlighted">
                Where to go next
              </p>
            </template>

            <div class="space-y-2 text-sm text-muted">
              <p>
                • Capture new audio or notes on the
                <NuxtLink to="/capture" class="underline text-primary">Capture</NuxtLink> page.
              </p>
              <p>
                • Review everything in order in the
                <NuxtLink to="/timeline" class="underline text-primary">Timeline</NuxtLink>.
              </p>
              <p>
                • Organize screenshots, emails, and documents in
                <NuxtLink to="/evidence" class="underline text-primary">Evidence</NuxtLink>.
              </p>
              <p>
                • Generate packets in the
                <NuxtLink to="/export" class="underline text-primary">Export center</NuxtLink>.
              </p>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <p class="font-medium text-highlighted">
              Recent events
            </p>
          </template>

          <div v-if="status === 'pending'" class="flex items-center justify-center py-6">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
            <span class="ml-2 text-sm text-muted">Loading recent events…</span>
          </div>

          <div
            v-else
            class="space-y-3"
          >
            <NuxtLink
              v-for="event in data?.recentEvents"
              :key="event.id"
              :to="`/event/${event.id}`"
              class="flex flex-col justify-between gap-2 border-b border-default pb-2 last:border-b-0 last:pb-0 sm:flex-row sm:items-center hover:bg-muted/5 px-2 -mx-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ event.title }}
                </p>
                <p class="text-xs text-muted">
                  {{ event.description }}
                </p>
              </div>

              <div class="flex items-center gap-2">
                <div class="flex flex-col items-start gap-1 text-xs text-muted sm:items-end">
                  <span>{{ formatDate(event.timestamp) }}</span>
                  <span v-if="event.location">{{ event.location }}</span>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-muted flex-shrink-0" />
              </div>
            </NuxtLink>

            <p
              v-if="!data?.recentEvents.length"
              class="text-center text-sm text-muted"
            >
              No recent events in the dummy dataset yet.
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>



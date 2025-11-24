<script setup lang="ts">
import type { EventType, TimelineEvent } from '~/types'

// Fetch timeline via SSR-aware useFetch and cookie-based auth
const { data, status, error, refresh } = await useFetch<TimelineEvent[]>('/api/timeline', {
  headers: useRequestHeaders(['cookie'])
})

const session = useSupabaseSession()

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

const selectedType = ref<'all' | EventType>('all')

const typeOptions: { label: string; value: 'all' | EventType }[] = [{
  label: 'All types',
  value: 'all'
}, {
  label: 'Positive parenting',
  value: 'positive'
}, {
  label: 'Incidents',
  value: 'incident'
}, {
  label: 'Medical',
  value: 'medical'
}, {
  label: 'School',
  value: 'school'
}, {
  label: 'Communication',
  value: 'communication'
}, {
  label: 'Legal / court',
  value: 'legal'
}]

const typeColors: Record<EventType, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
  positive: 'success',
  incident: 'error',
  medical: 'info',
  school: 'warning',
  communication: 'info',
  legal: 'neutral'
}

const filteredEvents = computed(() => {
  const events = data.value || []

  if (selectedType.value === 'all') {
    return events
  }

  return events.filter(event => event.type === selectedType.value)
})

if (process.client) {
  watchEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[Timeline] /api/timeline result:',
      {
        status: status.value,
        error: error.value,
        count: (data.value ?? []).length,
        items: data.value
      }
    )
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <UDashboardPanel id="timeline">
    <template #header>
      <UDashboardNavbar title="Timeline">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <USelect
            v-model="selectedType"
            :items="typeOptions"
            class="min-w-36"
            :ui="{
              trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
            }"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Unified, chronological stream of events with clear types and linked evidence, loaded from your account via
          <code class="px-1 rounded bg-subtle text-xs text-muted border border-default">/api/timeline</code>.
        </p>

        <!-- Loading state with skeleton placeholders -->
        <div v-if="status === 'pending'" class="space-y-3">
          <UCard v-for="i in 5" :key="i">
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <USkeleton class="h-5 w-20" />
                  <USkeleton class="h-6 w-48" />
                </div>
                <USkeleton class="h-4 w-32" />
              </div>

              <div class="space-y-1">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-4/5" />
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <USkeleton class="h-4 w-24" />
                <USkeleton class="h-4 w-32" />
                <USkeleton class="h-4 w-28" />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Content display -->
        <div
          v-else
          class="space-y-3"
        >
          <NuxtLink
            v-for="event in filteredEvents"
            :key="event.id"
            :to="`/event/${event.id}`"
            class="block"
          >
            <UCard
              :ui="{ 
                body: 'flex flex-col gap-2',
                base: 'hover:bg-muted/5 transition-colors cursor-pointer'
              }"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <UBadge
                    :color="typeColors[event.type]"
                    variant="subtle"
                    class="capitalize"
                  >
                    {{ event.type }}
                  </UBadge>

                  <p class="font-medium text-highlighted">
                    {{ event.title }}
                  </p>
                </div>

                <div class="flex items-center gap-2">
                  <p class="text-xs text-muted">
                    {{ formatDate(event.timestamp) }}
                  </p>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                </div>
              </div>

              <p class="text-sm text-muted">
                {{ event.description }}
              </p>

              <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span v-if="event.location" class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-map-pin" class="size-3.5" />
                  {{ event.location }}
                </span>

                <span class="inline-flex items-center gap-1">
                  <UIcon name="i-lucide-users" class="size-3.5" />
                  {{ event.participants.join(', ') }}
                </span>

                <span
                  v-if="event.evidenceIds?.length"
                  class="inline-flex items-center gap-1"
                >
                  <UIcon name="i-lucide-paperclip" class="size-3.5" />
                  {{ event.evidenceIds.length }} linked evidence item(s)
                </span>
              </div>
            </UCard>
          </NuxtLink>

          <UCard
            v-if="!filteredEvents.length && status === 'success'"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon name="i-lucide-timer-off" class="size-10 text-dimmed mb-2" />
            <p class="text-sm font-medium text-highlighted">
              No events for this filter
            </p>
            <p class="text-xs text-muted">
              Adjust the type filter above or start capturing events to populate your timeline.
            </p>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>



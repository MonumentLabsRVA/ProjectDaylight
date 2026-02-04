<script setup lang="ts">
interface JournalEntry {
  id: string
  eventText: string | null
  referenceDate: string | null
  status: 'draft' | 'processing' | 'review' | 'completed' | 'cancelled'
  createdAt: string
  evidenceCount: number
}

const { formatDate: formatTzDate } = useTimezone()

// Fetch journal entries
const { data: journalData, status: journalStatus } = await useFetch<JournalEntry[]>('/api/journal', {
  headers: useRequestHeaders(['cookie'])
})

const router = useRouter()

function formatDate(value?: string | null) {
  if (!value) return '—'

  // referenceDate is stored as a date-only string (YYYY-MM-DD) without timezone.
  // When passed directly to `new Date(value)` it is interpreted as midnight UTC,
  // which can render as the previous day for users in negative offsets.
  // To avoid off-by-one issues, anchor the date at noon UTC before formatting.
  const safeDate = new Date(`${value}T12:00:00Z`)

  return formatTzDate(safeDate.toISOString(), {
    month: 'short',
    day: 'numeric'
  })
}

// Greeting based on time of day
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
})

// Recent journal entries (limit to 8)
const recentJournalEntries = computed(() => {
  return (journalData.value || []).slice(0, 8)
})

// Truncate text helper
function truncateText(text: string | null, maxLength: number = 80): string {
  if (!text) return '—'
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '…'
}

// Status badge color
function statusColor(status: JournalEntry['status']): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  switch (status) {
    case 'completed': return 'success'
    case 'review': return 'info'
    case 'processing': return 'warning'
    case 'draft': return 'neutral'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

// Navigate to journal entry
function goToEntry(entry: JournalEntry) {
  router.push(`/journal/${entry.id}`)
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
      <div class="p-4 sm:p-6 space-y-6">
        <!-- Greeting -->
        <div>
          <h1 class="text-2xl sm:text-3xl font-semibold text-highlighted tracking-tight">
            {{ greeting }}
          </h1>
          <p class="mt-1 text-muted text-sm sm:text-base">
            Document what matters. Build your story with evidence.
          </p>
        </div>

        <!-- Two Action Buttons Side by Side -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <!-- New Journal Entry -->
          <NuxtLink
            to="/journal/new"
            class="group relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-5 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10 cursor-pointer"
          >
            <div class="flex items-center gap-4">
              <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/15 flex items-center justify-center group-hover:bg-primary/25 transition-colors">
                <UIcon name="i-lucide-pen-line" class="w-6 h-6 text-primary" />
              </div>
              
              <div class="flex-1 min-w-0">
                <h2 class="text-base font-semibold text-highlighted group-hover:text-primary transition-colors">
                  New Journal Entry
                </h2>
                <p class="text-sm text-muted line-clamp-1">
                  Speak or type what happened
                </p>
              </div>
              
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </NuxtLink>

          <!-- Create Report for Attorney -->
          <NuxtLink
            to="/exports/new"
            class="group relative overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-gradient-to-br from-neutral-50 via-neutral-100/50 to-neutral-50 dark:from-neutral-800/50 dark:via-neutral-800/30 dark:to-neutral-800/50 p-5 transition-all duration-200 hover:border-neutral-300 dark:hover:border-neutral-600 hover:shadow-md cursor-pointer"
          >
            <div class="flex items-center gap-4">
              <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-neutral-200/70 dark:bg-neutral-700/50 flex items-center justify-center group-hover:bg-neutral-300/70 dark:group-hover:bg-neutral-600/50 transition-colors">
                <UIcon name="i-lucide-file-text" class="w-6 h-6 text-neutral-600 dark:text-neutral-300" />
              </div>
              
              <div class="flex-1 min-w-0">
                <h2 class="text-base font-semibold text-highlighted">
                  Create Report for Attorney
                </h2>
                <p class="text-sm text-muted line-clamp-1">
                  Generate a timeline summary
                </p>
              </div>
              
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5 text-muted group-hover:text-highlighted group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </NuxtLink>
        </div>

        <!-- Recent Journal Entries -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-highlighted">
              Recent Journal Entries
            </h2>
            <NuxtLink
              to="/journal"
              class="text-xs text-primary hover:underline"
            >
              View all
            </NuxtLink>
          </div>

          <UCard :ui="{ body: 'p-0' }">
            <div v-if="journalStatus === 'pending'" class="flex items-center justify-center py-8">
              <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-muted" />
              <span class="ml-2 text-sm text-muted">Loading entries…</span>
            </div>

            <div v-else-if="!recentJournalEntries.length" class="py-8 text-center">
              <UIcon name="i-lucide-book-open" class="w-8 h-8 mx-auto text-muted/50 mb-2" />
              <p class="text-sm text-muted">No journal entries yet</p>
              <UButton to="/journal/new" size="sm" color="primary" variant="soft" class="mt-3">
                Create your first entry
              </UButton>
            </div>

            <div v-else class="divide-y divide-default">
              <div
                v-for="entry in recentJournalEntries"
                :key="entry.id"
                class="flex items-center gap-3 px-4 py-3 hover:bg-muted/5 cursor-pointer transition-colors"
                @click="goToEntry(entry)"
              >
                <!-- Date -->
                <div class="flex-shrink-0 w-14 text-center">
                  <p class="text-xs font-medium text-highlighted">
                    {{ formatDate(entry.referenceDate) }}
                  </p>
                </div>

                <!-- Content preview -->
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-highlighted truncate">
                    {{ truncateText(entry.eventText, 100) }}
                  </p>
                </div>

                <!-- Status & Evidence count -->
                <div class="flex items-center gap-2 flex-shrink-0">
                  <div v-if="entry.evidenceCount > 0" class="flex items-center gap-1 text-xs text-muted">
                    <UIcon name="i-lucide-paperclip" class="w-3.5 h-3.5" />
                    <span>{{ entry.evidenceCount }}</span>
                  </div>
                  
                  <UBadge
                    :color="statusColor(entry.status)"
                    variant="subtle"
                    size="xs"
                  >
                    {{ entry.status }}
                  </UBadge>

                  <UIcon name="i-lucide-chevron-right" class="w-4 h-4 text-muted" />
                </div>
              </div>
            </div>
          </UCard>
        </div>

      </div>
    </template>
  </UDashboardPanel>
</template>

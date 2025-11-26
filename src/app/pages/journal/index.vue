<script setup lang="ts">
import type { JournalEntry } from '~/server/api/journal'
import { getDateStringInTimezone } from '~/composables/useTimezone'

const { timezone, formatDate: formatTzDate } = useTimezone()

// Fetch journal entries
const { data, status, error, refresh } = await useFetch<JournalEntry[]>('/api/journal', {
  headers: useRequestHeaders(['cookie'])
})

const session = useSupabaseSession()

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

// Filter states
const selectedStatuses = ref<string[]>([])
const searchQuery = ref('')
const sortOrder = ref<'newest' | 'oldest'>('newest')

const statusOptions = [
  { value: 'draft', label: 'Draft', icon: 'i-lucide-pencil', color: 'neutral' as const },
  { value: 'processing', label: 'Processing', icon: 'i-lucide-loader-2', color: 'warning' as const },
  { value: 'review', label: 'Review', icon: 'i-lucide-eye', color: 'info' as const },
  { value: 'completed', label: 'Completed', icon: 'i-lucide-check-circle', color: 'success' as const },
  { value: 'cancelled', label: 'Cancelled', icon: 'i-lucide-x-circle', color: 'error' as const }
]

const statusColors: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
  draft: 'neutral',
  processing: 'warning',
  review: 'info',
  completed: 'success',
  cancelled: 'error'
}

// Filtered and sorted entries
const filteredEntries = computed(() => {
  let entries = data.value || []

  // Filter by search
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    entries = entries.filter(entry =>
      entry.eventText?.toLowerCase().includes(query) ||
      entry.referenceTimeDescription?.toLowerCase().includes(query)
    )
  }

  // Filter by status
  if (selectedStatuses.value.length > 0) {
    entries = entries.filter(entry => selectedStatuses.value.includes(entry.status))
  }

  // Sort
  entries = [...entries].sort((a, b) => {
    // Sort by reference_date first, then created_at
    const dateA = a.referenceDate || a.createdAt
    const dateB = b.referenceDate || b.createdAt
    const timeA = new Date(dateA).getTime()
    const timeB = new Date(dateB).getTime()
    return sortOrder.value === 'newest' ? timeB - timeA : timeA - timeB
  })

  return entries
})

// Group entries by date for display
const entriesByDate = computed(() => {
  const groups = new Map<string, JournalEntry[]>()

  for (const entry of filteredEntries.value) {
    const dateKey = entry.referenceDate || getDateStringInTimezone(new Date(entry.createdAt), timezone.value)
    const existing = groups.get(dateKey) || []
    existing.push(entry)
    groups.set(dateKey, existing)
  }

  return Array.from(groups.entries()).map(([date, entries]) => ({
    date,
    entries
  }))
})

const hasActiveFilters = computed(() => {
  return selectedStatuses.value.length > 0 || searchQuery.value.length > 0
})

function clearFilters() {
  selectedStatuses.value = []
  searchQuery.value = ''
}

function toggleStatus(status: string) {
  const index = selectedStatuses.value.indexOf(status)
  if (index > -1) {
    selectedStatuses.value.splice(index, 1)
  } else {
    selectedStatuses.value.push(status)
  }
}

function formatDateHeader(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00') // Avoid timezone issues
  return formatTzDate(date.toISOString(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatRelativeDate(dateStr: string) {
  // Compare date strings (YYYY-MM-DD) to avoid timezone issues
  const todayStr = getDateStringInTimezone(new Date(), timezone.value)
  
  // Calculate yesterday
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = getDateStringInTimezone(yesterday, timezone.value)
  
  if (dateStr === todayStr) return 'Today'
  if (dateStr === yesterdayStr) return 'Yesterday'
  
  // Calculate tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = getDateStringInTimezone(tomorrow, timezone.value)
  if (dateStr === tomorrowStr) return 'Tomorrow'
  
  // Calculate days difference properly
  const [year, month, day] = dateStr.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number)
  
  // Create dates at same time (midnight) to compare just the date parts
  const entryDate = new Date(year, month - 1, day)
  const today = new Date(todayYear, todayMonth - 1, todayDay)
  const diffTime = today.getTime() - entryDate.getTime()
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 1) return 'Yesterday' // Edge case
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 0) {
    const futureDays = Math.abs(diffDays)
    return `In ${futureDays} ${futureDays === 1 ? 'day' : 'days'}`
  }
  
  // For older entries, show the date
  const displayDate = new Date(dateStr + 'T12:00:00')
  return formatTzDate(displayDate.toISOString(), { month: 'short', day: 'numeric' })
}

function truncateText(text: string | null, maxLength: number) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trim() + '…'
}
</script>

<template>
  <UDashboardPanel id="journal">
    <template #header>
      <UDashboardNavbar title="Journal">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted">
              {{ filteredEntries.length }} {{ filteredEntries.length === 1 ? 'entry' : 'entries' }}
            </span>
            <UButton
              v-if="hasActiveFilters"
              variant="soft"
              size="xs"
              icon="i-lucide-x"
              @click="clearFilters"
            >
              Clear
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <!-- Toolbar -->
      <div class="shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-4 overflow-x-auto min-h-[49px] py-2">
        <div class="flex items-center gap-2">
          <!-- Status Filter -->
          <UPopover>
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              icon="i-lucide-filter"
              trailing-icon="i-lucide-chevron-down"
            >
              <span v-if="selectedStatuses.length > 0">
                Status ({{ selectedStatuses.length }})
              </span>
              <span v-else>All Statuses</span>
            </UButton>

            <template #content>
              <div class="p-2 w-56">
                <p class="text-xs font-medium text-muted mb-2 px-2">Entry Status</p>

                <div class="space-y-1">
                  <label
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <UCheckbox
                      :model-value="selectedStatuses.includes(opt.value)"
                      :ui="{ wrapper: 'pointer-events-none' }"
                      @update:model-value="toggleStatus(opt.value)"
                    />
                    <UIcon :name="opt.icon" class="size-4" />
                    <span class="text-sm flex-1">{{ opt.label }}</span>
                    <UBadge
                      v-if="data"
                      size="xs"
                      variant="subtle"
                      :color="opt.color"
                    >
                      {{ data.filter(e => e.status === opt.value).length }}
                    </UBadge>
                  </label>
                </div>

                <USeparator class="my-2" />

                <div class="px-2">
                  <UButton
                    variant="ghost"
                    size="xs"
                    class="w-full"
                    @click="selectedStatuses = []"
                  >
                    Clear
                  </UButton>
                </div>
              </div>
            </template>
          </UPopover>

          <!-- Sort -->
          <UPopover>
            <UButton
              variant="soft"
              color="neutral"
              size="sm"
              icon="i-lucide-arrow-up-down"
              trailing-icon="i-lucide-chevron-down"
            >
              {{ sortOrder === 'newest' ? 'Newest First' : 'Oldest First' }}
            </UButton>

            <template #content>
              <div class="p-1 w-40">
                <button
                  class="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                  :class="{ 'bg-primary/10': sortOrder === 'newest' }"
                  @click="sortOrder = 'newest'"
                >
                  <UIcon name="i-lucide-arrow-down" class="size-4" />
                  <span class="text-sm">Newest First</span>
                </button>
                <button
                  class="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                  :class="{ 'bg-primary/10': sortOrder === 'oldest' }"
                  @click="sortOrder = 'oldest'"
                >
                  <UIcon name="i-lucide-arrow-up" class="size-4" />
                  <span class="text-sm">Oldest First</span>
                </button>
              </div>
            </template>
          </UPopover>
        </div>

        <!-- Search -->
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search journal entries..."
          size="sm"
          class="flex-1 max-w-md"
        />

        <!-- Actions -->
        <div class="flex items-center gap-2">
          <UButton
            variant="solid"
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            to="/capture"
          >
            New Entry
          </UButton>
        </div>
      </div>
    </template>

    <template #body>
      <div class="p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="status === 'pending'" class="space-y-6">
          <div v-for="i in 3" :key="i" class="space-y-3">
            <USkeleton class="h-6 w-48" />
            <UCard v-for="j in 2" :key="j">
              <div class="space-y-3">
                <USkeleton class="h-5 w-full" />
                <USkeleton class="h-5 w-4/5" />
                <div class="flex gap-2">
                  <USkeleton class="h-5 w-20" />
                  <USkeleton class="h-5 w-24" />
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Error -->
        <UCard v-else-if="status === 'error'" class="border-error">
          <div class="flex items-center gap-3 text-error">
            <UIcon name="i-lucide-alert-triangle" class="size-5" />
            <p class="font-medium">Failed to load journal entries</p>
          </div>
          <p class="text-sm text-muted mt-2">{{ error?.message || 'An error occurred' }}</p>
        </UCard>

        <!-- Entries grouped by date -->
        <div v-else-if="entriesByDate.length > 0" class="space-y-8">
          <div v-for="group in entriesByDate" :key="group.date" class="space-y-3">
            <!-- Date header -->
            <div class="flex items-center gap-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-calendar" class="size-4 text-muted" />
                <h2 class="text-sm font-semibold text-highlighted">
                  {{ formatDateHeader(group.date) }}
                </h2>
              </div>
              <USeparator class="flex-1" />
              <span class="text-xs text-muted">
                {{ formatRelativeDate(group.date) }}
              </span>
            </div>

            <!-- Entries for this date -->
            <div class="space-y-3 pl-6">
              <NuxtLink
                v-for="entry in group.entries"
                :key="entry.id"
                :to="`/journal/${entry.id}`"
                class="block"
              >
                <UCard
                  :ui="{
                    base: 'hover:bg-muted/5 transition-colors cursor-pointer border-l-4',
                    root: entry.status === 'completed' ? 'border-l-success' : entry.status === 'draft' ? 'border-l-neutral' : 'border-l-warning'
                  }"
                >
                  <div class="space-y-3">
                    <!-- Entry preview -->
                    <p class="text-sm text-highlighted leading-relaxed">
                      {{ truncateText(entry.eventText, 280) }}
                    </p>

                    <!-- Entry metadata -->
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <UBadge
                          :color="statusColors[entry.status]"
                          variant="subtle"
                          size="xs"
                          class="capitalize"
                        >
                          {{ entry.status }}
                        </UBadge>

                        <span
                          v-if="entry.referenceTimeDescription"
                          class="text-xs text-muted"
                        >
                          {{ entry.referenceTimeDescription }}
                        </span>
                      </div>

                      <div class="flex items-center gap-3 text-xs text-muted">
                        <span
                          v-if="entry.evidenceCount > 0"
                          class="inline-flex items-center gap-1"
                        >
                          <UIcon name="i-lucide-paperclip" class="size-3" />
                          {{ entry.evidenceCount }} {{ entry.evidenceCount === 1 ? 'file' : 'files' }}
                        </span>

                        <UIcon name="i-lucide-chevron-right" class="size-4" />
                      </div>
                    </div>
                  </div>
                </UCard>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Empty states -->
        <div v-else>
          <!-- No results with filters -->
          <UCard
            v-if="hasActiveFilters"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon name="i-lucide-filter-x" class="size-12 text-dimmed mb-3" />
            <p class="text-base font-medium text-highlighted mb-1">
              No entries match your filters
            </p>
            <p class="text-sm text-muted mb-4">
              Try adjusting your search or status filters
            </p>
            <UButton
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              @click="clearFilters"
            >
              Clear all filters
            </UButton>
          </UCard>

          <!-- No entries at all -->
          <UCard
            v-else
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-book-open" class="size-10 text-primary" />
            </div>
            <p class="text-lg font-medium text-highlighted mb-2">
              Start Your Journal
            </p>
            <p class="text-sm text-muted mb-6 max-w-md">
              Document what's happening in your life. Write about events, attach evidence,
              and build a clear record over time.
            </p>
            <UButton
              variant="solid"
              color="primary"
              size="lg"
              icon="i-lucide-pen-line"
              to="/capture"
            >
              Write First Entry
            </UButton>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>


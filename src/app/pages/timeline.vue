<script setup lang="ts">
import type { EventType, ExtractionEventType, TimelineEvent } from '~/types'
import { 
  getDateStringInTimezone, 
  getStartOfDayInTimezone 
} from '~/composables/useTimezone'

// Get user's timezone
const { timezone, formatDate: formatTzDate } = useTimezone()

// Fetch timeline via SSR-aware useFetch and cookie-based auth
const { data, status, error, refresh } = await useFetch<TimelineEvent[]>('/api/timeline', {
  headers: {
    ...useRequestHeaders(['cookie']),
    'X-Timezone': timezone.value
  }
})

const session = useSupabaseSession()

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

// Filter states
const selectedTypes = ref<ExtractionEventType[]>([])
const dateRange = ref<{ start: string | null; end: string | null }>({
  start: null,
  end: null
})
const sortOrder = ref<'newest' | 'oldest'>('newest')
const searchQuery = ref('')

// Quick date range presets
const datePresets = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'Last 90 Days', value: '90days' },
  { label: 'All Time', value: 'all' }
]

const selectedPreset = ref('all')

// Helper to map legacy UI event types (incident, positive, etc.)
// to the new, more granular extraction event types used by the AI.
const legacyToExtractionTypeMap: Record<EventType, ExtractionEventType> = {
  positive: 'parenting_time',
  incident: 'coparent_conflict',
  medical: 'medical',
  school: 'school',
  communication: 'communication',
  legal: 'legal'
}

function getExtractionType(event: TimelineEvent): ExtractionEventType {
  const fromApi = (event as any).extractionType as ExtractionEventType | null | undefined
  if (fromApi) {
    return fromApi
  }

  return legacyToExtractionTypeMap[event.type]
}

function formatEventType(type: ExtractionEventType): string {
  const map: Record<ExtractionEventType, string> = {
    parenting_time: 'Parenting time',
    caregiving: 'Caregiving',
    household: 'Household / chores',
    coparent_conflict: 'Co-parent conflict',
    gatekeeping: 'Gatekeeping',
    communication: 'Communication',
    medical: 'Medical',
    school: 'School',
    legal: 'Legal / court'
  }

  return map[type] || type
}

// Type options with icons and colors (using extraction event types)
const typeOptions = [
  {
    value: 'parenting_time' as ExtractionEventType,
    label: 'Parenting time',
    icon: 'i-lucide-heart',
    color: 'primary' as const
  },
  {
    value: 'caregiving' as ExtractionEventType,
    label: 'Caregiving',
    icon: 'i-lucide-baby',
    color: 'success' as const
  },
  {
    value: 'household' as ExtractionEventType,
    label: 'Household / chores',
    icon: 'i-lucide-home',
    color: 'neutral' as const
  },
  {
    value: 'coparent_conflict' as ExtractionEventType,
    label: 'Co-parent conflict',
    icon: 'i-lucide-alert-triangle',
    color: 'error' as const
  },
  {
    value: 'gatekeeping' as ExtractionEventType,
    label: 'Gatekeeping',
    icon: 'i-lucide-shield-alert',
    color: 'warning' as const
  },
  {
    value: 'medical' as ExtractionEventType,
    label: 'Medical',
    icon: 'i-lucide-stethoscope',
    color: 'info' as const
  },
  {
    value: 'school' as ExtractionEventType,
    label: 'School',
    icon: 'i-lucide-backpack',
    color: 'warning' as const
  },
  {
    value: 'communication' as ExtractionEventType,
    label: 'Communication',
    icon: 'i-lucide-message-circle',
    color: 'primary' as const
  },
  {
    value: 'legal' as ExtractionEventType,
    label: 'Legal/Court',
    icon: 'i-lucide-gavel',
    color: 'neutral' as const
  }
]

const sortOptions = [
  { label: 'Newest First', value: 'newest', icon: 'i-lucide-arrow-down' },
  { label: 'Oldest First', value: 'oldest', icon: 'i-lucide-arrow-up' }
]

const typeColors: Record<ExtractionEventType, 'success' | 'error' | 'info' | 'warning' | 'neutral' | 'primary'> = {
  parenting_time: 'primary',
  caregiving: 'success',
  household: 'neutral',
  coparent_conflict: 'error',
  gatekeeping: 'warning',
  communication: 'primary',
  medical: 'info',
  school: 'warning',
  legal: 'neutral'
}

// Handle date preset selection
// Uses user's timezone for accurate "today", "this week" calculations
function selectDatePreset(preset: string) {
  selectedPreset.value = preset
  const now = new Date()
  const tz = timezone.value
  
  // Get today's date string in user's timezone (YYYY-MM-DD)
  const todayStr = getDateStringInTimezone(now, tz)
  const [year, month, day] = todayStr.split('-').map(Number)
  
  switch (preset) {
    case 'today':
      dateRange.value = {
        start: todayStr,
        end: todayStr
      }
      break
    case 'week': {
      // Calculate start of week (Sunday) in user's timezone
      const tempDate = new Date(Date.UTC(year, month - 1, day))
      const dayOfWeek = tempDate.getUTCDay() // 0 = Sunday
      const weekStartDate = new Date(Date.UTC(year, month - 1, day - dayOfWeek))
      const weekStartStr = getDateStringInTimezone(weekStartDate, tz)
      dateRange.value = {
        start: weekStartStr,
        end: todayStr
      }
      break
    }
    case 'month': {
      // First day of current month
      const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`
      dateRange.value = {
        start: monthStartStr,
        end: todayStr
      }
      break
    }
    case '30days': {
      const thirtyDaysAgo = new Date(Date.UTC(year, month - 1, day - 30))
      const startStr = getDateStringInTimezone(thirtyDaysAgo, tz)
      dateRange.value = {
        start: startStr,
        end: todayStr
      }
      break
    }
    case '90days': {
      const ninetyDaysAgo = new Date(Date.UTC(year, month - 1, day - 90))
      const startStr = getDateStringInTimezone(ninetyDaysAgo, tz)
      dateRange.value = {
        start: startStr,
        end: todayStr
      }
      break
    }
    case 'all':
    default:
      dateRange.value = { start: null, end: null }
  }
}

// Toggle type selection
function toggleType(type: ExtractionEventType) {
  const index = selectedTypes.value.indexOf(type)
  if (index > -1) {
    selectedTypes.value.splice(index, 1)
  } else {
    selectedTypes.value.push(type)
  }
}

// Clear all filters
function clearFilters() {
  selectedTypes.value = []
  dateRange.value = { start: null, end: null }
  selectedPreset.value = 'all'
  searchQuery.value = ''
}

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return selectedTypes.value.length > 0 || 
         dateRange.value.start !== null || 
         dateRange.value.end !== null ||
         searchQuery.value.length > 0
})

// Filtered and sorted events
const filteredEvents = computed(() => {
  let events = data.value || []

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    events = events.filter(event => 
      event.title.toLowerCase().includes(query) ||
      event.description.toLowerCase().includes(query) ||
      event.participants.some(p => p.toLowerCase().includes(query)) ||
      (event.location && event.location.toLowerCase().includes(query))
    )
  }

  // Filter by event types (using granular extraction event types)
  if (selectedTypes.value.length > 0) {
    events = events.filter((event) => {
      const extractionType = getExtractionType(event)
      return selectedTypes.value.includes(extractionType)
    })
  }

  // Filter by date range (using user's timezone for accurate date comparison)
  if (dateRange.value.start || dateRange.value.end) {
    events = events.filter(event => {
      // Get the event's date in the user's timezone
      const eventDate = getDateStringInTimezone(new Date(event.timestamp), timezone.value)
      
      if (dateRange.value.start && eventDate < dateRange.value.start) {
        return false
      }
      
      if (dateRange.value.end && eventDate > dateRange.value.end) {
        return false
      }
      
      return true
    })
  }

  // Sort events
  events = [...events].sort((a, b) => {
    const dateA = new Date(a.timestamp).getTime()
    const dateB = new Date(b.timestamp).getTime()
    return sortOrder.value === 'newest' ? dateB - dateA : dateA - dateB
  })

  return events
})

// Stats for the toolbar
const eventStats = computed(() => {
  const events = data.value || []
  return {
    total: events.length,
    filtered: filteredEvents.value.length
  }
})

function formatDate(value: string) {
  return formatTzDate(value, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Helper to get date string for grouping events by day
function getEventDateString(timestamp: string): string {
  return getDateStringInTimezone(new Date(timestamp), timezone.value)
}

// Format a date string for display in date separators
function formatDateSeparator(timestamp: string): string {
  return formatTzDate(timestamp, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Format time only
function formatTime(timestamp: string): string {
  return formatTzDate(timestamp, {
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
          <div class="flex items-center gap-2">
            <div class="text-sm text-muted">
              <span v-if="hasActiveFilters">
                {{ eventStats.filtered }} of {{ eventStats.total }} events
              </span>
              <span v-else>
                {{ eventStats.total }} events
              </span>
            </div>
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

      <!-- Mobile-friendly scrollable toolbar -->
      <div class="shrink-0 border-b border-default">
        <!-- Search row - always visible -->
        <div class="flex items-center gap-3 px-4 sm:px-6 py-2">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search events..."
            size="sm"
            class="flex-1 min-w-0"
          />
          <UButton
            variant="solid"
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            to="/journal/new"
            class="shrink-0"
          >
            <span class="hidden sm:inline">New Event</span>
          </UButton>
        </div>

        <!-- Scrollable filters row -->
        <div class="flex items-center gap-2 px-4 sm:px-6 py-2 overflow-x-auto scrollbar-none border-t border-default/50">
          <!-- Date Range Popover -->
          <UPopover>
            <UButton
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-lucide-calendar"
              trailing-icon="i-lucide-chevron-down"
              class="shrink-0"
            >
              <span v-if="dateRange.start || dateRange.end" class="hidden sm:inline">
                {{ dateRange.start || 'Any' }} - {{ dateRange.end || 'Any' }}
              </span>
              <span v-else-if="selectedPreset !== 'all'">
                {{ datePresets.find(p => p.value === selectedPreset)?.label }}
              </span>
              <span v-else>All Time</span>
            </UButton>

            <template #content>
              <div class="p-3 w-80">
                <!-- Quick Presets -->
                <div class="mb-3">
                  <p class="text-xs font-medium text-muted mb-2">Quick Select</p>
                  <div class="grid grid-cols-2 gap-1">
                    <UButton
                      v-for="preset in datePresets"
                      :key="preset.value"
                      :variant="selectedPreset === preset.value ? 'solid' : 'ghost'"
                      :color="selectedPreset === preset.value ? 'primary' : 'neutral'"
                      size="xs"
                      @click="selectDatePreset(preset.value)"
                    >
                      {{ preset.label }}
                    </UButton>
                  </div>
                </div>

                <USeparator class="my-3" />

                <!-- Custom Date Range -->
                <div>
                  <p class="text-xs font-medium text-muted mb-2">Custom Range</p>
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-muted w-12">From:</label>
                      <UInput
                        v-model="dateRange.start"
                        type="date"
                        size="xs"
                        class="flex-1"
                        @change="selectedPreset = 'custom'"
                      />
                    </div>
                    <div class="flex items-center gap-2">
                      <label class="text-xs text-muted w-12">To:</label>
                      <UInput
                        v-model="dateRange.end"
                        type="date"
                        size="xs"
                        class="flex-1"
                        @change="selectedPreset = 'custom'"
                      />
                    </div>
                  </div>
                </div>

                <div class="mt-3 flex justify-end gap-2">
                  <UButton
                    variant="ghost"
                    size="xs"
                    @click="dateRange = { start: null, end: null }; selectedPreset = 'all'"
                  >
                    Clear
                  </UButton>
                </div>
              </div>
            </template>
          </UPopover>

          <!-- Event Type Filter Popover -->
          <UPopover>
            <UButton
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-lucide-filter"
              trailing-icon="i-lucide-chevron-down"
              class="shrink-0"
            >
              <span v-if="selectedTypes.length > 0">
                Types ({{ selectedTypes.length }})
              </span>
              <span v-else>All Types</span>
            </UButton>

            <template #content>
              <div class="p-2 w-64">
                <p class="text-xs font-medium text-muted mb-2 px-2">Event Types</p>
                
                <div class="space-y-1">
                  <label
                    v-for="type in typeOptions"
                    :key="type.value"
                    class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <UCheckbox
                      :model-value="selectedTypes.includes(type.value)"
                      :ui="{ wrapper: 'pointer-events-none' }"
                      @update:model-value="toggleType(type.value)"
                    />
                    <UIcon :name="type.icon" :class="`text-${type.color}-500`" class="size-4" />
                    <span class="text-sm flex-1 text-left">{{ type.label }}</span>
                    <UBadge
                      v-if="data"
                      size="xs"
                      variant="subtle"
                      :color="type.color"
                    >
                      {{ data.filter(e => getExtractionType(e) === type.value).length }}
                    </UBadge>
                  </label>
                </div>

                <USeparator class="my-2" />

                <div class="flex justify-between gap-2 px-2">
                  <UButton
                    variant="ghost"
                    size="xs"
                    @click="selectedTypes = []"
                  >
                    Clear
                  </UButton>
                  <UButton
                    variant="ghost"
                    size="xs"
                    @click="selectedTypes = selectedTypes.length === typeOptions.length ? [] : typeOptions.map(t => t.value)"
                  >
                    {{ selectedTypes.length === typeOptions.length ? 'Deselect All' : 'Select All' }}
                  </UButton>
                </div>
              </div>
            </template>
          </UPopover>

          <!-- Sort Popover -->
          <UPopover>
            <UButton
              variant="soft"
              color="neutral"
              size="xs"
              icon="i-lucide-arrow-up-down"
              trailing-icon="i-lucide-chevron-down"
              class="shrink-0"
            >
              <span class="hidden sm:inline">{{ sortOptions.find(s => s.value === sortOrder)?.label }}</span>
              <span class="sm:hidden">Sort</span>
            </UButton>

            <template #content>
              <div class="p-1 w-40">
                <button
                  v-for="option in sortOptions"
                  :key="option.value"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted/50 transition-colors"
                  :class="{ 'bg-primary/10': sortOrder === option.value }"
                  @click="sortOrder = option.value"
                >
                  <UIcon
                    :name="option.icon"
                    class="size-4"
                  />
                  <span class="text-sm">{{ option.label }}</span>
                </button>
              </div>
            </template>
          </UPopover>

          <!-- Clear Filters Button -->
          <UButton
            v-if="hasActiveFilters"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            class="shrink-0"
            @click="clearFilters"
          >
            <span class="hidden sm:inline">Clear</span>
          </UButton>

          <!-- Spacer to show scroll indicator -->
          <div class="w-2 shrink-0" />
        </div>
      </div>
    </template>

    <template #body>
      <div class="space-y-4 p-4">
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
          v-else-if="filteredEvents.length > 0"
          class="space-y-0"
        >
          <!-- Group events by date (using user's timezone) -->
          <div v-for="(event, index) in filteredEvents" :key="event.id">
            <!-- Date separator for new days -->
            <div
              v-if="index === 0 || getEventDateString(event.timestamp) !== getEventDateString(filteredEvents[index - 1].timestamp)"
              class="flex items-center gap-2 mt-4 mb-2"
            >
              <USeparator class="flex-1" />
              <span class="text-xs font-medium text-muted px-2">
                {{ formatDateSeparator(event.timestamp) }}
              </span>
              <USeparator class="flex-1" />
            </div>

            <NuxtLink
              :to="`/event/${event.id}`"
              class="block"
            >
              <div class="py-2 px-3 flex flex-col gap-1 hover:bg-muted/5 transition-colors cursor-pointer">
                <!-- Primary row: type, title, location, time, evidence -->
                <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div class="flex items-center gap-2 min-w-0">
                    <UBadge
                      :color="typeColors[getExtractionType(event)]"
                      variant="subtle"
                      size="xs"
                      class="capitalize shrink-0"
                    >
                      <UIcon :name="typeOptions.find(t => t.value === getExtractionType(event))?.icon" class="size-3.5 mr-1" />
                      {{ formatEventType(getExtractionType(event)) }}
                    </UBadge>

                    <p class="font-medium text-highlighted truncate">
                      {{ event.title }}
                    </p>

                    <span
                      v-if="event.location"
                      class="hidden sm:inline-flex items-center gap-1 text-xs text-muted truncate"
                    >
                      <UIcon name="i-lucide-map-pin" class="size-3" />
                      <span class="truncate">
                        {{ event.location }}
                      </span>
                    </span>
                  </div>

                  <div class="flex items-center gap-3 text-xs text-muted">
                    <span
                      v-if="event.evidenceIds?.length"
                      class="inline-flex items-center gap-1"
                    >
                      <UIcon name="i-lucide-paperclip" class="size-3" />
                      {{ event.evidenceIds.length }} evidence
                    </span>

                    <p>
                      {{ formatTime(event.timestamp) }}
                    </p>
                    <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                  </div>
                </div>

                <!-- Secondary row: description & participants -->
                <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <p class="flex-1 min-w-0 line-clamp-1">
                    {{ event.description }}
                  </p>

                  <span class="inline-flex items-center gap-1 shrink-0">
                    <UIcon name="i-lucide-users" class="size-3.5" />
                    <span class="truncate max-w-[10rem] sm:max-w-xs">
                      {{ event.participants.join(', ') }}
                    </span>
                  </span>
                </div>
              </div>
            </NuxtLink>
            <!-- Separator between items on the same day -->
            <USeparator
              v-if="index !== filteredEvents.length - 1 && getEventDateString(event.timestamp) === getEventDateString(filteredEvents[index + 1].timestamp)"
              class="my-1 opacity-60"
            />
          </div>
        </div>

        <!-- Empty states -->
        <div v-else-if="status === 'success'">
          <!-- No results with active filters -->
          <UCard
            v-if="hasActiveFilters"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon name="i-lucide-filter-x" class="size-12 text-dimmed mb-3" />
            <p class="text-base font-medium text-highlighted mb-1">
              No events match your filters
            </p>
            <p class="text-sm text-muted mb-4">
              Try adjusting your date range, event types, or search query
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

          <!-- No events at all -->
          <UCard
            v-else
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon name="i-lucide-calendar-x" class="size-12 text-dimmed mb-3" />
            <p class="text-base font-medium text-highlighted mb-1">
              Your timeline is empty
            </p>
            <p class="text-sm text-muted mb-4">
              Start capturing events to build your chronological record
            </p>
            <div class="flex gap-2">
              <UButton
                variant="solid"
                size="sm"
                icon="i-lucide-mic"
                to="/journal/new"
              >
                Record event
              </UButton>
              <UButton
                variant="soft"
                size="sm"
                icon="i-lucide-camera"
                to="/evidence"
              >
                Upload evidence
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>



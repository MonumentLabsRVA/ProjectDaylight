<script setup lang="ts">
import type { EventType } from '~/types'

interface EventDetailResponse {
  id: string
  timestamp: string
  type: EventType
  title: string
  description: string
  participants: string[]
  location?: string
  evidenceIds?: string[]
  
  // Additional fields
  childInvolved?: boolean
  agreementViolation?: boolean
  safetyConcern?: boolean
  welfareImpact?: string
  durationMinutes?: number
  timestampPrecision?: string
  createdAt: string
  updatedAt: string
  
  // Related data
  evidenceDetails?: Array<{
    id: string
    sourceType: string
    originalName?: string
    summary?: string
    tags: string[]
    isPrimary: boolean
  }>
  
  evidenceMentions?: Array<{
    id: string
    type: string
    description: string
    status: string
  }>
  
  actionItems?: Array<{
    id: string
    priority: string
    type: string
    description: string
    deadline?: string
    status: string
  }>
  
  communications?: Array<{
    id: string
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

// Use SSR-aware useFetch with cookie-based auth
const session = useSupabaseSession()
const route = useRoute()
const router = useRouter()

const eventId = computed(() => route.params.id as string)

const {
  data,
  status,
  error,
  refresh
} = await useFetch<EventDetailResponse>(() => `/api/event/${eventId.value}`, {
  headers: useRequestHeaders(['cookie'])
})

// Refresh when session changes (e.g., login)
watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

// Redirect to timeline if event not found
watch(error, async (err: any) => {
  if (err?.statusCode === 404) {
    await router.push('/timeline')
  }
})

const typeColors: Record<EventType, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
  positive: 'success',
  incident: 'error',
  medical: 'info',
  school: 'warning',
  communication: 'info',
  legal: 'neutral'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const priorityColors: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
  urgent: 'error',
  high: 'warning',
  normal: 'info',
  low: 'neutral'
}

const statusIcons: Record<string, string> = {
  open: 'i-lucide-circle',
  in_progress: 'i-lucide-timer',
  done: 'i-lucide-check-circle',
  cancelled: 'i-lucide-x-circle'
}

const evidenceStatusColors: Record<string, 'success' | 'warning' | 'error'> = {
  have: 'success',
  need_to_get: 'warning',
  need_to_create: 'error'
}
</script>

<template>
  <UDashboardPanel id="event-detail">
    <template #header>
      <UDashboardNavbar title="Event Details">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/timeline"
          >
            Back to Timeline
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="status === 'pending'" class="space-y-4">
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <USkeleton class="h-6 w-20" />
                <USkeleton class="h-7 w-64" />
              </div>
              <USkeleton class="h-5 w-40" />
            </div>
            <USkeleton class="h-20 w-full" />
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <USkeleton class="h-16 w-full" />
              <USkeleton class="h-16 w-full" />
              <USkeleton class="h-16 w-full" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Error state -->
      <UCard v-else-if="status === 'error'" class="border-error">
        <div class="flex items-center gap-3 text-error">
          <UIcon name="i-lucide-alert-triangle" class="size-5" />
          <p class="font-medium">Failed to load event details</p>
        </div>
        <p class="text-sm text-muted mt-2">{{ error?.statusMessage || 'An error occurred' }}</p>
        <UButton
          to="/timeline"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          class="mt-4"
        >
          Back to Timeline
        </UButton>
      </UCard>

      <!-- Content -->
      <div v-else-if="data" class="space-y-4">
        <!-- Main Event Card -->
        <UCard>
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <UBadge
                  :color="typeColors[data.type]"
                  variant="subtle"
                  size="lg"
                  class="capitalize"
                >
                  {{ data.type }}
                </UBadge>
                <h1 class="text-xl font-semibold">{{ data.title }}</h1>
              </div>
              <p class="text-sm text-muted">
                {{ formatDate(data.timestamp) }}
              </p>
            </div>

            <!-- Description -->
            <div class="prose prose-sm max-w-none">
              <p>{{ data.description }}</p>
            </div>

            <!-- Key Details -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div v-if="data.location" class="flex items-start gap-2">
                <UIcon name="i-lucide-map-pin" class="size-4 mt-0.5 text-muted" />
                <div>
                  <p class="text-xs text-muted">Location</p>
                  <p class="text-sm">{{ data.location }}</p>
                </div>
              </div>

              <div v-if="data.participants.length" class="flex items-start gap-2">
                <UIcon name="i-lucide-users" class="size-4 mt-0.5 text-muted" />
                <div>
                  <p class="text-xs text-muted">Participants</p>
                  <p class="text-sm">{{ data.participants.join(', ') }}</p>
                </div>
              </div>

              <div v-if="data.durationMinutes" class="flex items-start gap-2">
                <UIcon name="i-lucide-clock" class="size-4 mt-0.5 text-muted" />
                <div>
                  <p class="text-xs text-muted">Duration</p>
                  <p class="text-sm">{{ data.durationMinutes }} minutes</p>
                </div>
              </div>
            </div>

            <!-- Flags -->
            <div v-if="data.childInvolved || data.agreementViolation || data.safetyConcern" class="flex flex-wrap gap-2">
              <UBadge v-if="data.childInvolved" color="info" variant="outline" size="xs">
                <UIcon name="i-lucide-baby" class="size-3 mr-1" />
                Child Involved
              </UBadge>
              <UBadge v-if="data.agreementViolation" color="warning" variant="outline" size="xs">
                <UIcon name="i-lucide-file-warning" class="size-3 mr-1" />
                Agreement Violation
              </UBadge>
              <UBadge v-if="data.safetyConcern" color="error" variant="outline" size="xs">
                <UIcon name="i-lucide-shield-alert" class="size-3 mr-1" />
                Safety Concern
              </UBadge>
            </div>

            <!-- Welfare Impact -->
            <div v-if="data.welfareImpact && data.welfareImpact !== 'unknown'" class="flex items-center gap-2">
              <p class="text-xs text-muted">Welfare Impact:</p>
              <UBadge
                :color="data.welfareImpact === 'positive' ? 'success' : 
                        data.welfareImpact === 'significant' ? 'error' : 
                        data.welfareImpact === 'moderate' ? 'warning' : 'neutral'"
                variant="subtle"
                size="xs"
                class="capitalize"
              >
                {{ data.welfareImpact }}
              </UBadge>
            </div>
          </div>
        </UCard>

        <!-- Evidence Section -->
        <UCard v-if="data.evidenceDetails?.length || data.evidenceMentions?.length">
          <template #header>
            <h2 class="text-lg font-medium">Evidence</h2>
          </template>

          <div class="space-y-4">
            <!-- Linked Evidence -->
            <div v-if="data.evidenceDetails?.length">
              <h3 class="text-sm font-medium mb-2">Linked Evidence</h3>
              <div class="grid gap-2">
                <NuxtLink
                  v-for="item in data.evidenceDetails"
                  :key="item.id"
                  :to="`/evidence/${item.id}`"
                  class="block"
                >
                  <UCard :ui="{ base: 'hover:bg-muted/5 transition-colors' }">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                          <UBadge
                            color="neutral"
                            variant="subtle"
                            size="xs"
                          >
                            {{ item.sourceType }}
                          </UBadge>
                          <UBadge
                            v-if="item.isPrimary"
                            color="primary"
                            variant="outline"
                            size="xs"
                          >
                            Primary
                          </UBadge>
                        </div>
                        <p class="text-sm font-medium">{{ item.originalName }}</p>
                        <p class="text-xs text-muted line-clamp-2">{{ item.summary }}</p>
                        <div v-if="item.tags?.length" class="flex flex-wrap gap-1 mt-1">
                          <UBadge
                            v-for="tag in item.tags.slice(0, 3)"
                            :key="tag"
                            color="neutral"
                            variant="outline"
                            size="xs"
                          >
                            {{ tag }}
                          </UBadge>
                        </div>
                      </div>
                      <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                    </div>
                  </UCard>
                </NuxtLink>
              </div>
            </div>

            <!-- Evidence Mentions -->
            <div v-if="data.evidenceMentions?.length">
              <h3 class="text-sm font-medium mb-2">Evidence Mentions</h3>
              <div class="space-y-2">
                <div
                  v-for="mention in data.evidenceMentions"
                  :key="mention.id"
                  class="flex items-start gap-3 p-3 rounded-lg bg-muted/5"
                >
                  <UBadge
                    :color="evidenceStatusColors[mention.status]"
                    variant="subtle"
                    size="xs"
                  >
                    {{ mention.status.replace(/_/g, ' ') }}
                  </UBadge>
                  <div class="flex-1">
                    <p class="text-xs text-muted">{{ mention.type }}</p>
                    <p class="text-sm">{{ mention.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Action Items -->
        <UCard v-if="data.actionItems?.length">
          <template #header>
            <h2 class="text-lg font-medium">Action Items</h2>
          </template>

          <div class="space-y-2">
            <div
              v-for="item in data.actionItems"
              :key="item.id"
              class="flex items-start gap-3 p-3 rounded-lg bg-muted/5"
            >
              <UIcon :name="statusIcons[item.status]" class="size-4 mt-0.5" />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <UBadge
                    :color="priorityColors[item.priority]"
                    variant="subtle"
                    size="xs"
                  >
                    {{ item.priority }}
                  </UBadge>
                  <span class="text-xs text-muted">{{ item.type }}</span>
                  <span v-if="item.deadline" class="text-xs text-muted">
                    Due: {{ formatShortDate(item.deadline) }}
                  </span>
                </div>
                <p class="text-sm">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Communications -->
        <UCard v-if="data.communications?.length">
          <template #header>
            <h2 class="text-lg font-medium">Related Communications</h2>
          </template>

          <div class="space-y-2">
            <div
              v-for="comm in data.communications"
              :key="comm.id"
              class="p-3 rounded-lg bg-muted/5"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <UBadge color="neutral" variant="subtle" size="xs">
                    {{ comm.medium }}
                  </UBadge>
                  <UBadge color="neutral" variant="outline" size="xs">
                    {{ comm.direction }}
                  </UBadge>
                </div>
                <span v-if="comm.sentAt" class="text-xs text-muted">
                  {{ formatShortDate(comm.sentAt) }}
                </span>
              </div>
              <p v-if="comm.subject" class="text-sm font-medium">{{ comm.subject }}</p>
              <p class="text-sm text-muted">{{ comm.summary }}</p>
            </div>
          </div>
        </UCard>

        <!-- Metadata -->
        <UCard>
          <template #header>
            <h2 class="text-sm font-medium text-muted">Metadata</h2>
          </template>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs text-muted">Event ID</p>
              <p class="font-mono text-xs">{{ data.id }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Timestamp Precision</p>
              <p>{{ data.timestampPrecision || 'Unknown' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Created</p>
              <p>{{ formatShortDate(data.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Last Updated</p>
              <p>{{ formatShortDate(data.updatedAt) }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

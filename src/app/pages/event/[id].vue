<script setup lang="ts">
import type { ChildStatement, CoparentInteraction, CoparentTone, EventType, ExtractionEventType } from '~/types'
import type { Database } from '~/types/database.types'

type LegacyWelfareImpact = Database['public']['Enums']['welfare_impact']

interface EventDetailResponse {
  id: string
  timestamp: string
  type: EventType
  /**
   * New granular extraction event type when available.
   * Falls back to a mapping from the legacy `type` when missing.
   */
  extractionType?: ExtractionEventType | null
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
  welfareCategory?: string | null
  welfareDirection?: string | null
  welfareSeverity?: string | null
  durationMinutes?: number
  timestampPrecision?: string
  createdAt: string
  updatedAt: string

  // Enriched AI extraction fields
  childStatements?: ChildStatement[]
  coparentInteraction?: CoparentInteraction | null
  
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
  
  suggestedEvidence?: Array<{
    id: string
    evidenceType: string
    evidenceStatus: string
    description: string
    fulfilledEvidenceId?: string
    fulfilledAt?: string
    dismissedAt?: string
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

const legacyToExtractionTypeMap: Record<EventType, ExtractionEventType> = {
  positive: 'parenting_time',
  incident: 'coparent_conflict',
  medical: 'medical',
  school: 'school',
  communication: 'communication',
  legal: 'legal'
}

const extractionTypeColors: Record<ExtractionEventType, 'success' | 'error' | 'info' | 'warning' | 'neutral' | 'primary'> = {
  parenting_time: 'primary',
  caregiving: 'success',
  household: 'neutral',
  coparent_conflict: 'error',
  gatekeeping: 'warning',
  communication: 'info',
  medical: 'info',
  school: 'warning',
  legal: 'neutral'
}

function formatExtractionEventType(type: ExtractionEventType): string {
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

const eventTypeOptions: { label: string; value: EventType }[] = [
  { label: 'Positive parenting', value: 'positive' },
  { label: 'Incident', value: 'incident' },
  { label: 'Medical', value: 'medical' },
  { label: 'School', value: 'school' },
  { label: 'Communication', value: 'communication' },
  { label: 'Legal / court', value: 'legal' }
]

const toneColors: Record<CoparentTone, 'neutral' | 'success' | 'warning' | 'error'> = {
  neutral: 'neutral',
  cooperative: 'success',
  defensive: 'warning',
  hostile: 'error'
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

const welfareImpactOptions: { label: string; value: LegacyWelfareImpact }[] = [
  { label: 'None / neutral', value: 'none' },
  { label: 'Minor impact', value: 'minor' },
  { label: 'Moderate impact', value: 'moderate' },
  { label: 'Significant impact', value: 'significant' },
  { label: 'Positive impact', value: 'positive' },
  { label: 'Unknown / not sure', value: 'unknown' }
]

const isSaving = ref(false)
const isDeleting = ref(false)
const deleteOrphanEvidence = ref(false)

const editableTimestamp = computed({
  get() {
    if (!data.value?.timestamp) return ''
    const d = new Date(data.value.timestamp)
    const iso = d.toISOString()
    return iso.slice(0, 16)
  },
  set(value: string) {
    if (!data.value) return
    if (!value) {
      data.value.timestamp = data.value.createdAt
      return
    }
    // Let the server coerce/validate this ISO-like string
    data.value.timestamp = new Date(value).toISOString()
  }
})

const hasStructuredWelfareImpact = computed(() => {
  const value = data.value
  if (!value) return false
  return Boolean(value.welfareCategory || value.welfareDirection || value.welfareSeverity)
})

const extractionType = computed<ExtractionEventType | null>(() => {
  if (!data.value) return null
  const fromApi = (data.value as any).extractionType as ExtractionEventType | null | undefined
  if (fromApi) {
    return fromApi
  }

  return legacyToExtractionTypeMap[data.value.type]
})

function formatWelfareCategory(category: string | null | undefined) {
  if (!category) return 'None'
  const map: Record<string, string> = {
    routine: 'Routine / schedule',
    emotional: 'Emotional',
    medical: 'Medical',
    educational: 'Educational',
    social: 'Social',
    safety: 'Safety',
    none: 'No impact'
  }
  return map[category] ?? category
}

function formatWelfareDirection(direction: string | null | undefined) {
  if (!direction) return 'Neutral'
  const map: Record<string, string> = {
    positive: 'Positive',
    negative: 'Negative',
    neutral: 'Neutral'
  }
  return map[direction] ?? direction
}

function formatWelfareSeverity(severity: string | null | undefined) {
  if (!severity) return 'Not specified'
  const map: Record<string, string> = {
    minimal: 'Minimal',
    moderate: 'Moderate',
    significant: 'Significant'
  }
  return map[severity] ?? severity
}

const editableLocation = computed({
  get() {
    return data.value?.location || ''
  },
  set(value: string) {
    if (!data.value) return
    data.value.location = value || undefined
  }
})

const editableTitle = computed({
  get() {
    return data.value?.title || ''
  },
  set(value: string) {
    if (!data.value) return
    data.value.title = value || ''
  }
})

const editableDescription = computed({
  get() {
    return data.value?.description || ''
  },
  set(value: string) {
    if (!data.value) return
    data.value.description = value || ''
  }
})

const editableType = computed<EventType>({
  get() {
    return (data.value?.type as EventType | undefined) ?? 'incident'
  },
  set(value: EventType) {
    if (!data.value) return
    data.value.type = value
  }
})

const editableWelfareImpact = computed<LegacyWelfareImpact>({
  get() {
    // Default to 'unknown' so the select always has a value
    return (data.value?.welfareImpact as WelfareImpact | undefined) ?? 'unknown'
  },
  set(value: WelfareImpact) {
    if (!data.value) return
    data.value.welfareImpact = value
  }
})

async function saveEdits(close?: () => void) {
  if (!data.value) return
  isSaving.value = true

  try {
    await $fetch(`/api/event/${eventId.value}`, {
      method: 'PATCH',
      body: {
        type: data.value.type,
        title: data.value.title,
        description: data.value.description,
        location: data.value.location ?? null,
        timestamp: data.value.timestamp,
        timestampPrecision: data.value.timestampPrecision ?? null,
        durationMinutes: data.value.durationMinutes ?? null,
        childInvolved: data.value.childInvolved ?? null,
        agreementViolation: data.value.agreementViolation ?? null,
        safetyConcern: data.value.safetyConcern ?? null,
        welfareImpact: data.value.welfareImpact ?? null
      }
    })

    await refresh()
    if (close) {
      close()
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to save event edits:', err)
  } finally {
    isSaving.value = false
  }
}

async function deleteEventHandler(deleteEvidence: boolean, close?: () => void) {
  if (!eventId.value) return

  isDeleting.value = true

  try {
    const query = deleteEvidence ? '?deleteOrphanEvidence=true' : ''

    await $fetch(`/api/event/${eventId.value}${query}`, {
      method: 'DELETE'
    })

    if (close) {
      close()
    }

    await router.push('/timeline')
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to delete event:', err)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="event-detail">
    <template #header>
      <UDashboardNavbar title="Event Details">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/timeline"
          >
            Back to Timeline
          </UButton>
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UModal
              v-if="status === 'success' && data"
              title="Edit event"
              :ui="{ footer: 'justify-end' }"
            >
              <UButton
                icon="i-lucide-pencil"
                color="primary"
                variant="soft"
                size="sm"
              >
                Edit
              </UButton>

              <template #body>
                <div class="space-y-4">
                  <div class="flex items-center gap-2 mb-2">
                    <UBadge
                      :color="typeColors[data.type]"
                      variant="subtle"
                      size="xs"
                      class="capitalize"
                    >
                      {{ data.type }}
                    </UBadge>
                    <span class="text-xs text-muted">
                      Update the core details of this event.
                    </span>
                  </div>

                  <UFormField
                    label="Event type"
                    name="type"
                  >
                    <div class="w-full">
                      <USelect
                        v-model="editableType"
                        :items="eventTypeOptions"
                        option-attribute="label"
                        value-attribute="value"
                        class="w-full"
                      />
                    </div>
                  </UFormField>

                  <UFormField
                    label="Title"
                    name="title"
                  >
                    <div class="w-full">
                      <UInput
                        v-model="editableTitle"
                        color="neutral"
                        variant="outline"
                        class="w-full"
                      />
                    </div>
                  </UFormField>

                  <UFormField
                    label="Description"
                    name="description"
                  >
                    <div class="w-full">
                      <UTextarea
                        v-model="editableDescription"
                        :rows="4"
                        color="neutral"
                        variant="outline"
                        class="w-full"
                      />
                    </div>
                  </UFormField>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UFormField
                      label="Date & time"
                      name="timestamp"
                    >
                      <div class="w-full">
                        <UInput
                          v-model="editableTimestamp"
                          type="datetime-local"
                          color="neutral"
                          variant="outline"
                          class="w-full"
                        />
                      </div>
                    </UFormField>

                    <UFormField
                      label="Location"
                      name="location"
                    >
                      <div class="w-full">
                        <UInput
                          v-model="editableLocation"
                          color="neutral"
                          variant="outline"
                          class="w-full"
                        />
                      </div>
                    </UFormField>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-3">
                      <p class="text-xs font-medium text-muted uppercase tracking-wide">
                        Impact flags
                      </p>
                      <div class="flex flex-col gap-2">
                        <UFormField name="childInvolved">
                          <USwitch
                            v-model="data.childInvolved"
                            label="Child involved"
                          />
                        </UFormField>
                        <UFormField name="agreementViolation">
                          <USwitch
                            v-model="data.agreementViolation"
                            label="Agreement violation"
                          />
                        </UFormField>
                        <UFormField name="safetyConcern">
                          <USwitch
                            v-model="data.safetyConcern"
                            label="Safety concern"
                          />
                        </UFormField>
                      </div>
                    </div>

                    <UFormField
                      label="Overall welfare impact"
                      name="welfareImpact"
                      description="How does this event affect the child’s wellbeing overall?"
                    >
                      <div class="w-full">
                        <USelect
                          v-model="editableWelfareImpact"
                          :items="welfareImpactOptions"
                          option-attribute="label"
                          value-attribute="value"
                          class="w-full"
                        />
                      </div>
                    </UFormField>
                  </div>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="close"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  :loading="isSaving"
                  @click="saveEdits(close)"
                >
                  Save changes
                </UButton>
              </template>
            </UModal>

            <UModal
              v-if="status === 'success' && data"
              title="Delete event"
              :ui="{ footer: 'justify-end' }"
            >
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
              >
                Delete
              </UButton>

              <template #body>
                <div class="space-y-3">
                  <p class="text-sm">
                    This will permanently delete this event from your timeline.
                  </p>
                  <p class="text-xs text-muted">
                    Event participants, evidence mentions, patterns, suggestions, and other linked rows
                    will be cleaned up automatically by the database. Action items will remain but
                    will no longer be linked to this event.
                  </p>
                  <UFormField
                    name="deleteAssociatedEvidence"
                    label="Also delete associated evidence?"
                    description="If enabled, any evidence that is only linked to this event (and not used elsewhere) will also be deleted."
                  >
                    <USwitch
                      v-model="deleteOrphanEvidence"
                      label="Delete evidence that is only linked to this event"
                    />
                  </UFormField>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="close"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  variant="solid"
                  :loading="isDeleting"
                  @click="deleteEventHandler(deleteOrphanEvidence, close)"
                >
                  Delete event
                </UButton>
              </template>
            </UModal>
          </div>
        </template>
      </UDashboardToolbar>
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

        <!-- Suggested Evidence -->
        <UCard v-if="data.suggestedEvidence?.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-medium">Suggested Evidence</h2>
              <p class="text-xs text-muted">
                AI-generated ideas for what to gather or attach.
              </p>
            </div>
          </template>

          <div class="space-y-2">
            <div
              v-for="suggestion in data.suggestedEvidence"
              :key="suggestion.id"
              class="flex items-start gap-3 p-3 rounded-lg bg-muted/5"
            >
              <div class="flex flex-col items-start gap-1">
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="xs"
                  class="capitalize"
                >
                  {{ suggestion.evidenceType }}
                </UBadge>
                <UBadge
                  :color="evidenceStatusColors[suggestion.evidenceStatus] || 'neutral'"
                  variant="outline"
                  size="xs"
                >
                  {{ suggestion.evidenceStatus.replace(/_/g, ' ') }}
                </UBadge>
              </div>

              <div class="flex-1 space-y-1">
                <p class="text-sm">
                  {{ suggestion.description }}
                </p>

                <p v-if="suggestion.fulfilledAt" class="text-xs text-success">
                  Fulfilled {{ formatShortDate(suggestion.fulfilledAt) }}
                </p>
                <p v-else-if="suggestion.dismissedAt" class="text-xs text-muted">
                  Dismissed {{ formatShortDate(suggestion.dismissedAt) }}
                </p>
              </div>
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
                  :color="extractionType ? extractionTypeColors[extractionType] : 'neutral'"
                  variant="subtle"
                  size="lg"
                  class="capitalize"
                >
                  {{ extractionType ? formatExtractionEventType(extractionType) : data.type }}
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

            <!-- Co-parent Interaction Analysis -->
            <div v-if="data.coparentInteraction" class="flex flex-wrap items-center gap-2">
              <p class="text-xs text-muted">Co-parent interaction:</p>
              <UBadge
                v-if="data.coparentInteraction.your_tone"
                :color="toneColors[data.coparentInteraction.your_tone]"
                variant="outline"
                size="xs"
                class="capitalize"
              >
                Your tone: {{ data.coparentInteraction.your_tone }}
              </UBadge>
              <UBadge
                v-if="data.coparentInteraction.their_tone"
                :color="toneColors[data.coparentInteraction.their_tone]"
                variant="outline"
                size="xs"
                class="capitalize"
              >
                Their tone: {{ data.coparentInteraction.their_tone }}
              </UBadge>
              <UBadge
                v-if="data.coparentInteraction.your_response_appropriate !== null && data.coparentInteraction.your_response_appropriate !== undefined"
                :color="data.coparentInteraction.your_response_appropriate ? 'success' : 'warning'"
                variant="subtle"
                size="xs"
              >
                Your response was {{ data.coparentInteraction.your_response_appropriate ? 'appropriate' : 'not appropriate' }}
              </UBadge>
            </div>

            <!-- Welfare Impact -->
            <div v-if="hasStructuredWelfareImpact" class="space-y-1">
              <p class="text-xs text-muted">Welfare Impact:</p>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <UBadge
                  v-if="data.welfareCategory"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  Category: {{ formatWelfareCategory(data.welfareCategory) }}
                </UBadge>
                <UBadge
                  v-if="data.welfareDirection"
                  :color="data.welfareDirection === 'positive' ? 'success' : data.welfareDirection === 'negative' ? 'error' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  Direction: {{ formatWelfareDirection(data.welfareDirection) }}
                </UBadge>
                <UBadge
                  v-if="data.welfareSeverity"
                  :color="data.welfareSeverity === 'significant' ? 'error' : data.welfareSeverity === 'moderate' ? 'warning' : 'neutral'"
                  variant="outline"
                  size="xs"
                >
                  Severity: {{ formatWelfareSeverity(data.welfareSeverity) }}
                </UBadge>
              </div>
            </div>
            <div v-else-if="data.welfareImpact && data.welfareImpact !== 'unknown'" class="flex items-center gap-2">
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

        <!-- Child Statements -->
        <UCard v-if="data.childStatements?.length">
          <template #header>
            <h2 class="text-lg font-medium">Child Statements</h2>
          </template>

          <div class="space-y-3">
            <div
              v-for="(statement, index) in data.childStatements"
              :key="index"
              class="p-3 rounded-lg bg-muted/5"
            >
              <p class="text-sm italic">
                “{{ statement.statement }}”
              </p>
              <p v-if="statement.context" class="text-xs text-muted mt-1">
                Context: {{ statement.context }}
              </p>
              <div class="mt-2">
                <UBadge
                  :color="statement.concerning ? 'error' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ statement.concerning ? 'Concerning' : 'Not marked as concerning' }}
                </UBadge>
              </div>
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

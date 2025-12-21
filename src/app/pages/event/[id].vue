<script setup lang="ts">
import type { ChildStatement, CoparentInteraction, CoparentTone, EventType, ExtractionEventType } from '~/types'
import type { Database } from '~/types/database.types'

type LegacyWelfareImpact = Database['public']['Enums']['welfare_impact']

interface EventDetailResponse {
  id: string
  timestamp: string
  type: EventType
  extractionType?: ExtractionEventType | null
  title: string
  description: string
  participants: string[]
  location?: string
  evidenceIds?: string[]
  
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

  childStatements?: ChildStatement[]
  coparentInteraction?: CoparentInteraction | null
  
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

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

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

const extractionTypeIcons: Record<ExtractionEventType, string> = {
  parenting_time: 'i-lucide-calendar-heart',
  caregiving: 'i-lucide-heart-handshake',
  household: 'i-lucide-home',
  coparent_conflict: 'i-lucide-swords',
  gatekeeping: 'i-lucide-shield-ban',
  communication: 'i-lucide-message-circle',
  medical: 'i-lucide-stethoscope',
  school: 'i-lucide-graduation-cap',
  legal: 'i-lucide-scale'
}

function formatExtractionEventType(type: ExtractionEventType): string {
  const map: Record<ExtractionEventType, string> = {
    parenting_time: 'Parenting Time',
    caregiving: 'Caregiving',
    household: 'Household',
    coparent_conflict: 'Co-parent Conflict',
    gatekeeping: 'Gatekeeping',
    communication: 'Communication',
    medical: 'Medical',
    school: 'School',
    legal: 'Legal'
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
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
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
    return (data.value?.welfareImpact as LegacyWelfareImpact | undefined) ?? 'unknown'
  },
  set(value: LegacyWelfareImpact) {
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
    console.error('Failed to delete event:', err)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="event-detail">
    <template #header>
      <UDashboardNavbar title="Event">
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
            Back
          </UButton>
        </template>

        <template #right>
          <div v-if="status === 'success' && data" class="flex items-center gap-2">
            <UModal
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
                  <UFormField label="Event type" name="type">
                    <USelect
                      v-model="editableType"
                      :items="eventTypeOptions"
                      option-attribute="label"
                      value-attribute="value"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Title" name="title">
                    <UInput
                      v-model="editableTitle"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="Description" name="description">
                    <UTextarea
                      v-model="editableDescription"
                      :rows="4"
                      class="w-full"
                    />
                  </UFormField>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UFormField label="Date & time" name="timestamp">
                      <UInput
                        v-model="editableTimestamp"
                        type="datetime-local"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField label="Location" name="location">
                      <UInput
                        v-model="editableLocation"
                        class="w-full"
                      />
                    </UFormField>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-3">
                      <p class="text-xs font-medium text-muted uppercase tracking-wide">
                        Impact flags
                      </p>
                      <div class="flex flex-col gap-2">
                        <USwitch v-model="data.childInvolved" label="Child involved" />
                        <USwitch v-model="data.agreementViolation" label="Agreement violation" />
                        <USwitch v-model="data.safetyConcern" label="Safety concern" />
                      </div>
                    </div>

                    <UFormField
                      label="Welfare impact"
                      name="welfareImpact"
                      description="How does this affect the child's wellbeing?"
                    >
                      <USelect
                        v-model="editableWelfareImpact"
                        :items="welfareImpactOptions"
                        option-attribute="label"
                        value-attribute="value"
                        class="w-full"
                      />
                    </UFormField>
                  </div>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton color="neutral" variant="ghost" @click="close">
                  Cancel
                </UButton>
                <UButton color="primary" :loading="isSaving" @click="saveEdits(close)">
                  Save
                </UButton>
              </template>
            </UModal>

            <UModal
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
                  <USwitch
                    v-model="deleteOrphanEvidence"
                    label="Also delete evidence only linked to this event"
                  />
                </div>
              </template>

              <template #footer="{ close }">
                <UButton color="neutral" variant="ghost" @click="close">
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  :loading="isDeleting"
                  @click="deleteEventHandler(deleteOrphanEvidence, close)"
                >
                  Delete
                </UButton>
              </template>
            </UModal>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="status === 'pending'" class="p-6 space-y-6 max-w-4xl mx-auto">
        <div class="space-y-4">
          <USkeleton class="h-6 w-32" />
          <USkeleton class="h-10 w-3/4" />
          <USkeleton class="h-24 w-full" />
        </div>
        <div class="grid grid-cols-3 gap-4">
          <USkeleton class="h-16" />
          <USkeleton class="h-16" />
          <USkeleton class="h-16" />
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="status === 'error'" class="p-6 max-w-2xl mx-auto">
        <UCard class="border-error">
          <div class="flex items-center gap-3 text-error">
            <UIcon name="i-lucide-alert-triangle" class="size-5" />
            <p class="font-medium">Failed to load event</p>
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
      </div>

      <!-- Content -->
      <div v-else-if="data" class="p-6 space-y-8 max-w-4xl mx-auto">
        <!-- Header Section -->
        <div class="space-y-4">
          <!-- Type badge and date -->
          <div class="flex flex-wrap items-center gap-3">
            <UBadge
              :color="extractionType ? extractionTypeColors[extractionType] : 'neutral'"
              variant="subtle"
              size="lg"
            >
              <UIcon
                v-if="extractionType"
                :name="extractionTypeIcons[extractionType]"
                class="size-4 mr-1.5"
              />
              {{ extractionType ? formatExtractionEventType(extractionType) : data.type }}
            </UBadge>
            <span class="text-sm text-muted">
              {{ formatDate(data.timestamp) }}
            </span>
          </div>

          <!-- Title -->
          <h1 class="text-3xl font-bold text-highlighted">
            {{ data.title }}
          </h1>

          <!-- Description -->
          <p class="text-lg text-muted leading-relaxed">
            {{ data.description }}
          </p>

          <!-- Flags -->
          <div v-if="data.childInvolved || data.agreementViolation || data.safetyConcern" class="flex flex-wrap gap-2">
            <UBadge v-if="data.safetyConcern" color="error" variant="soft" size="sm">
              <UIcon name="i-lucide-shield-alert" class="size-3.5 mr-1.5" />
              Safety Concern
            </UBadge>
            <UBadge v-if="data.agreementViolation" color="warning" variant="soft" size="sm">
              <UIcon name="i-lucide-file-warning" class="size-3.5 mr-1.5" />
              Agreement Violation
            </UBadge>
            <UBadge v-if="data.childInvolved" color="info" variant="soft" size="sm">
              <UIcon name="i-lucide-baby" class="size-3.5 mr-1.5" />
              Child Involved
            </UBadge>
          </div>
        </div>

        <!-- Quick Info Bar -->
        <div
          v-if="data.location || data.participants.length || data.durationMinutes"
          class="flex flex-wrap gap-6 py-4 border-y border-default"
        >
          <div v-if="data.location" class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-map-pin" class="size-4 text-muted" />
            <span>{{ data.location }}</span>
          </div>

          <div v-if="data.participants.length" class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-users" class="size-4 text-muted" />
            <span>{{ data.participants.join(', ') }}</span>
          </div>

          <div v-if="data.durationMinutes" class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-clock" class="size-4 text-muted" />
            <span>{{ data.durationMinutes }} minutes</span>
          </div>
        </div>

        <!-- Co-parent Interaction Analysis -->
        <div v-if="data.coparentInteraction" class="p-4 rounded-xl bg-muted/5 border border-default space-y-3">
          <h3 class="text-sm font-medium text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-message-square-more" class="size-4" />
            Co-parent Interaction
          </h3>
          <div class="flex flex-wrap gap-3">
            <div v-if="data.coparentInteraction.your_tone" class="text-sm">
              <span class="text-muted">Your tone:</span>
              <UBadge
                :color="toneColors[data.coparentInteraction.your_tone]"
                variant="subtle"
                size="xs"
                class="ml-2 capitalize"
              >
                {{ data.coparentInteraction.your_tone }}
              </UBadge>
            </div>
            <div v-if="data.coparentInteraction.their_tone" class="text-sm">
              <span class="text-muted">Their tone:</span>
              <UBadge
                :color="toneColors[data.coparentInteraction.their_tone]"
                variant="subtle"
                size="xs"
                class="ml-2 capitalize"
              >
                {{ data.coparentInteraction.their_tone }}
              </UBadge>
            </div>
            <div v-if="data.coparentInteraction.your_response_appropriate !== null" class="text-sm">
              <UBadge
                :color="data.coparentInteraction.your_response_appropriate ? 'success' : 'warning'"
                variant="soft"
                size="xs"
              >
                {{ data.coparentInteraction.your_response_appropriate ? 'Appropriate response' : 'Response could improve' }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Welfare Impact -->
        <div v-if="hasStructuredWelfareImpact" class="p-4 rounded-xl bg-muted/5 border border-default space-y-3">
          <h3 class="text-sm font-medium text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-heart" class="size-4" />
            Welfare Impact
          </h3>
          <div class="flex flex-wrap gap-2">
            <UBadge v-if="data.welfareCategory" color="neutral" variant="subtle" size="sm">
              {{ formatWelfareCategory(data.welfareCategory) }}
            </UBadge>
            <UBadge
              v-if="data.welfareDirection"
              :color="data.welfareDirection === 'positive' ? 'success' : data.welfareDirection === 'negative' ? 'error' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ formatWelfareDirection(data.welfareDirection) }}
            </UBadge>
            <UBadge
              v-if="data.welfareSeverity"
              :color="data.welfareSeverity === 'significant' ? 'error' : data.welfareSeverity === 'moderate' ? 'warning' : 'neutral'"
              variant="outline"
              size="sm"
            >
              {{ formatWelfareSeverity(data.welfareSeverity) }} severity
            </UBadge>
          </div>
        </div>

        <!-- Child Statements -->
        <div v-if="data.childStatements?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-quote" class="size-5" />
            Child Statements
          </h2>

          <div class="space-y-3">
            <div
              v-for="(statement, index) in data.childStatements"
              :key="index"
              class="p-4 rounded-xl border border-default"
              :class="statement.concerning ? 'bg-error/5 border-error/20' : 'bg-muted/5'"
            >
              <p class="text-base italic text-highlighted">
                "{{ statement.statement }}"
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-3">
                <UBadge
                  :color="statement.concerning ? 'error' : 'neutral'"
                  variant="subtle"
                  size="xs"
                >
                  {{ statement.concerning ? 'Concerning' : 'Not concerning' }}
                </UBadge>
                <span v-if="statement.context" class="text-xs text-muted">
                  {{ statement.context }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Evidence Section -->
        <div v-if="data.evidenceDetails?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-paperclip" class="size-5" />
            Linked Evidence
          </h2>

          <div class="grid gap-3 sm:grid-cols-2">
            <NuxtLink
              v-for="item in data.evidenceDetails"
              :key="item.id"
              :to="`/evidence/${item.id}`"
              class="group block p-4 rounded-xl border border-default bg-muted/5 hover:bg-muted/10 hover:border-primary/30 transition-all"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <UBadge color="neutral" variant="subtle" size="xs">
                      {{ item.sourceType }}
                    </UBadge>
                    <UBadge v-if="item.isPrimary" color="primary" variant="outline" size="xs">
                      Primary
                    </UBadge>
                  </div>
                  <p class="font-medium text-highlighted group-hover:text-primary transition-colors truncate">
                    {{ item.originalName || 'Untitled' }}
                  </p>
                  <p v-if="item.summary" class="text-xs text-muted mt-1 line-clamp-2">
                    {{ item.summary }}
                  </p>
                </div>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-4 text-muted group-hover:text-primary transition-colors shrink-0"
                />
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Evidence Mentions (things to gather) -->
        <div v-if="data.evidenceMentions?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-search" class="size-5" />
            Evidence to Gather
          </h2>

          <div class="space-y-2">
            <div
              v-for="mention in data.evidenceMentions"
              :key="mention.id"
              class="flex items-start gap-3 p-3 rounded-lg bg-muted/5 border border-default"
            >
              <UBadge
                :color="evidenceStatusColors[mention.status] || 'neutral'"
                variant="subtle"
                size="xs"
              >
                {{ mention.status.replace(/_/g, ' ') }}
              </UBadge>
              <div class="flex-1">
                <p class="text-sm">{{ mention.description }}</p>
                <p class="text-xs text-muted mt-1">{{ mention.type }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Items -->
        <div v-if="data.actionItems?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-list-checks" class="size-5" />
            Action Items
          </h2>

          <div class="space-y-2">
            <div
              v-for="item in data.actionItems"
              :key="item.id"
              class="flex items-start gap-3 p-4 rounded-xl border border-default bg-muted/5"
            >
              <UIcon
                :name="statusIcons[item.status]"
                class="size-5 mt-0.5"
                :class="{
                  'text-success': item.status === 'done',
                  'text-muted': item.status === 'cancelled',
                  'text-primary': item.status === 'in_progress',
                  'text-warning': item.status === 'open'
                }"
              />
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
                </div>
                <p class="text-sm text-highlighted">{{ item.description }}</p>
                <p v-if="item.deadline" class="text-xs text-muted mt-1">
                  Due: {{ formatShortDate(item.deadline) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Communications -->
        <div v-if="data.communications?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-messages-square" class="size-5" />
            Related Communications
          </h2>

          <div class="space-y-3">
            <div
              v-for="comm in data.communications"
              :key="comm.id"
              class="p-4 rounded-xl border border-default bg-muted/5"
            >
              <div class="flex items-center justify-between mb-2">
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
              <p v-if="comm.subject" class="font-medium text-highlighted">{{ comm.subject }}</p>
              <p class="text-sm text-muted">{{ comm.summary }}</p>
            </div>
          </div>
        </div>

        <!-- Suggested Evidence -->
        <div v-if="data.suggestedEvidence?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-lightbulb" class="size-5" />
            Suggested Evidence
          </h2>

          <div class="space-y-2">
            <div
              v-for="suggestion in data.suggestedEvidence"
              :key="suggestion.id"
              class="flex items-start gap-3 p-4 rounded-xl border border-default bg-muted/5"
              :class="{
                'opacity-60': suggestion.dismissedAt,
                'border-success/30 bg-success/5': suggestion.fulfilledAt
              }"
            >
              <UIcon
                :name="suggestion.fulfilledAt ? 'i-lucide-check-circle' : suggestion.dismissedAt ? 'i-lucide-x-circle' : 'i-lucide-circle'"
                class="size-5 mt-0.5"
                :class="{
                  'text-success': suggestion.fulfilledAt,
                  'text-muted': suggestion.dismissedAt
                }"
              />
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <UBadge color="neutral" variant="subtle" size="xs" class="capitalize">
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
                <p class="text-sm text-highlighted">{{ suggestion.description }}</p>
                <p v-if="suggestion.fulfilledAt" class="text-xs text-success mt-1">
                  Fulfilled {{ formatShortDate(suggestion.fulfilledAt) }}
                </p>
                <p v-else-if="suggestion.dismissedAt" class="text-xs text-muted mt-1">
                  Dismissed {{ formatShortDate(suggestion.dismissedAt) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

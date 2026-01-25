<script setup lang="ts">
import type { JournalEntryDetail } from '~/types/journal'
import type { RealtimeChannel } from '@supabase/supabase-js'

const route = useRoute()
const router = useRouter()
const session = useSupabaseSession()
const supabase = useSupabaseClient()
const toast = useToast()
const { trackJob } = useJobs()
const { formatDate: formatTzDate } = useTimezone()
const user = useSupabaseUser()

const entryId = computed(() => route.params.id as string)

const { data, status, error, refresh } = await useFetch<JournalEntryDetail>(
  () => `/api/journal/${entryId.value}`,
  {
    headers: useRequestHeaders(['cookie'])
  }
)

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

watch(error, async (err: any) => {
  if (err?.statusCode === 404) {
    await router.push('/journal')
  }
})

// Subscribe to job updates for real-time status refresh
let jobsChannel: RealtimeChannel | null = null

onMounted(() => {
  const userId = (user.value as any)?.id || (user.value as any)?.sub
  if (!userId) return

  jobsChannel = supabase
    .channel(`journal-detail-${entryId.value}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'jobs',
      filter: `journal_entry_id=eq.${entryId.value}`
    }, (payload) => {
      const job = payload.new as { status: string }
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'processing') {
        refresh()
      }
    })
    .subscribe()
})

onUnmounted(() => {
  if (jobsChannel) {
    supabase.removeChannel(jobsChannel)
    jobsChannel = null
  }
})

const sourceTypeIcons: Record<string, string> = {
  photo: 'i-lucide-image',
  document: 'i-lucide-file-text',
  text: 'i-lucide-message-square',
  email: 'i-lucide-mail',
  recording: 'i-lucide-mic',
  other: 'i-lucide-file'
}

// Edit state
const isSaving = ref(false)
const isDeleting = ref(false)
const isReprocessing = ref(false)

// Delete options state
const deleteEvidence = ref(false)
const deleteEvents = ref(true)

// Evidence upload state
const addEvidenceModalOpen = ref(false)
const evidenceFile = ref<File | null>(null)
const evidenceAnnotation = ref('')
const isUploadingEvidence = ref(false)

// Image loading states
const imageLoadStates = ref<Map<string, 'loading' | 'loaded' | 'error'>>(new Map())

function resetEvidenceForm() {
  evidenceFile.value = null
  evidenceAnnotation.value = ''
}

async function uploadAndAttachEvidence() {
  if (!evidenceFile.value) {
    toast.add({
      title: 'No file selected',
      description: 'Please select a file to upload.',
      color: 'warning'
    })
    return
  }

  isUploadingEvidence.value = true

  try {
    const accessToken = session.value?.access_token
      || (await supabase.auth.getSession()).data.session?.access_token

    const formData = new FormData()
    formData.append('file', evidenceFile.value)

    const uploadResult = await $fetch<{ id: string }>('/api/evidence-upload', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData
    })

    await $fetch(`/api/journal/${entryId.value}/evidence`, {
      method: 'POST',
      body: {
        evidenceId: uploadResult.id,
        annotation: evidenceAnnotation.value || undefined
      }
    })

    toast.add({
      title: 'Evidence attached',
      description: 'The file has been uploaded and attached to this entry.',
      color: 'success'
    })

    resetEvidenceForm()
    addEvidenceModalOpen.value = false
    await refresh()
  } catch (err: any) {
    console.error('Failed to upload evidence:', err)
    toast.add({
      title: 'Upload failed',
      description: err?.data?.statusMessage || 'Failed to upload and attach evidence.',
      color: 'error'
    })
  } finally {
    isUploadingEvidence.value = false
  }
}

const editableText = computed({
  get() {
    return data.value?.eventText || ''
  },
  set(value: string) {
    if (data.value) {
      data.value.eventText = value
    }
  }
})

const editableDate = computed({
  get() {
    return data.value?.referenceDate || ''
  },
  set(value: string) {
    if (data.value) {
      data.value.referenceDate = value || null
    }
  }
})

const editableTimeDescription = computed({
  get() {
    return data.value?.referenceTimeDescription || ''
  },
  set(value: string) {
    if (data.value) {
      data.value.referenceTimeDescription = value || null
    }
  }
})

async function saveEntry(close?: () => void) {
  if (!data.value) return
  isSaving.value = true

  try {
    await $fetch(`/api/journal/${entryId.value}`, {
      method: 'PATCH',
      body: {
        eventText: data.value.eventText,
        referenceDate: data.value.referenceDate,
        referenceTimeDescription: data.value.referenceTimeDescription
      }
    })

    await refresh()
    if (close) close()
  } catch (err) {
    console.error('Failed to save entry:', err)
  } finally {
    isSaving.value = false
  }
}

async function deleteEntry(close?: () => void) {
  if (!entryId.value) return
  isDeleting.value = true

  try {
    await $fetch(`/api/journal/${entryId.value}`, {
      method: 'DELETE',
      body: {
        deleteEvidence: deleteEvidence.value,
        deleteEvents: deleteEvents.value
      }
    })

    if (close) close()
    await router.push('/journal')
  } catch (err) {
    console.error('Failed to delete entry:', err)
  } finally {
    isDeleting.value = false
  }
}

async function redoExtraction() {
  if (!entryId.value || !data.value) return
  if (data.value.status === 'processing') return

  isReprocessing.value = true

  try {
    const result = await $fetch<{
      journalEntryId: string
      jobId: string
      message?: string
    }>(`/api/journal/${entryId.value}/reprocess`, {
      method: 'POST'
    })

    trackJob({
      id: result.jobId,
      journal_entry_id: result.journalEntryId
    })

    toast.add({
      title: 'Redoing AI extraction',
      description: 'This usually takes 30–60 seconds and will update automatically.',
      color: 'info',
      icon: 'i-lucide-sparkles'
    })

    await refresh()
  } catch (err: any) {
    console.error('Failed to redo extraction:', err)
    toast.add({
      title: 'Could not redo extraction',
      description: err?.data?.statusMessage || err?.message || 'Please try again.',
      color: 'error'
    })
  } finally {
    isReprocessing.value = false
  }
}

function resetDeleteOptions() {
  deleteEvidence.value = false
  deleteEvents.value = true
}

function formatDate(value: string) {
  if (!value) return ''
  const safeDate = new Date(`${value}T12:00:00Z`)
  return formatTzDate(safeDate.toISOString(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatDateTime(value: string) {
  return formatTzDate(value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Get signed URL for evidence preview
async function getEvidenceUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null

  const { data: signedUrl } = await supabase.storage
    .from('daylight-files')
    .createSignedUrl(storagePath, 3600)

  return signedUrl?.signedUrl || null
}

// Evidence preview URLs
const evidenceUrls = ref<Map<string, string>>(new Map())

watch(
  () => data.value?.evidence,
  async (evidence) => {
    if (!evidence) return
    for (const item of evidence) {
      if (item.storagePath && !evidenceUrls.value.has(item.id)) {
        imageLoadStates.value.set(item.id, 'loading')
        const url = await getEvidenceUrl(item.storagePath)
        if (url) {
          evidenceUrls.value.set(item.id, url)
        }
      }
    }
  },
  { immediate: true }
)

function onImageLoad(id: string) {
  imageLoadStates.value.set(id, 'loaded')
}

function onImageError(id: string) {
  imageLoadStates.value.set(id, 'error')
}

const statusConfig = computed(() => {
  if (!data.value) return null
  
  const configs: Record<string, { color: 'info' | 'error' | 'warning' | 'success' | 'neutral'; icon: string; label: string }> = {
    processing: { color: 'info', icon: 'i-lucide-loader-2', label: 'Processing' },
    failed: { color: 'error', icon: 'i-lucide-alert-circle', label: 'Failed' },
    cancelled: { color: 'warning', icon: 'i-lucide-x-circle', label: 'Cancelled' },
    draft: { color: 'neutral', icon: 'i-lucide-pencil', label: 'Draft' },
    completed: { color: 'success', icon: 'i-lucide-check-circle', label: 'Complete' }
  }
  
  return configs[data.value.status] || configs.completed
})
</script>

<template>
  <UDashboardPanel id="journal-detail">
    <template #header>
      <UDashboardNavbar title="Journal Entry">
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
            to="/journal"
          >
            Back
          </UButton>
        </template>

        <template #right>
          <div v-if="status === 'success' && data" class="flex items-center gap-2">
            <!-- Redo AI Extraction -->
            <UButton
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-sparkles"
              :loading="isReprocessing"
              :disabled="data.status === 'processing'"
              @click="redoExtraction"
            >
              Redo AI
            </UButton>

            <!-- Edit Modal -->
            <UModal
              title="Edit Entry"
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
                  <UFormField label="What happened?" name="eventText">
                    <UTextarea
                      v-model="editableText"
                      :rows="8"
                      placeholder="Describe the events, conversations, or situations..."
                      class="w-full"
                    />
                  </UFormField>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UFormField label="Date" name="referenceDate" description="When did this happen?">
                      <UInput
                        v-model="editableDate"
                        type="date"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField
                      label="Time of day"
                      name="referenceTimeDescription"
                      description="Optional: morning, afternoon, 3pm, etc."
                    >
                      <UInput
                        v-model="editableTimeDescription"
                        placeholder="e.g., Morning, After school"
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
                <UButton color="primary" :loading="isSaving" @click="saveEntry(close)">
                  Save
                </UButton>
              </template>
            </UModal>

            <!-- Delete Modal -->
            <UModal
              title="Delete Entry"
              :ui="{ footer: 'justify-end' }"
              @close="resetDeleteOptions"
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
                <div class="space-y-4">
                  <p class="text-sm">
                    This will permanently delete this journal entry.
                  </p>

                  <div class="space-y-3 p-3 rounded-lg bg-muted/5 border border-default">
                    <p class="text-xs font-medium text-highlighted">Also delete:</p>

                    <UCheckbox
                      v-model="deleteEvents"
                      label="Generated events"
                    >
                      <template #description>
                        <span class="text-xs text-muted">
                          Events extracted from this entry will be removed from your timeline.
                        </span>
                      </template>
                    </UCheckbox>

                    <UCheckbox
                      v-model="deleteEvidence"
                      label="Attached evidence"
                    >
                      <template #description>
                        <span class="text-xs text-muted">
                          Evidence files will be permanently deleted.
                        </span>
                      </template>
                    </UCheckbox>
                  </div>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton color="neutral" variant="ghost" @click="close">
                  Cancel
                </UButton>
                <UButton color="error" :loading="isDeleting" @click="deleteEntry(close)">
                  Delete
                </UButton>
              </template>
            </UModal>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="status === 'pending'" class="p-6 space-y-6 max-w-4xl mx-auto">
        <div class="space-y-4">
          <USkeleton class="h-6 w-48" />
          <USkeleton class="h-8 w-64" />
          <USkeleton class="h-40 w-full" />
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="status === 'error'" class="p-6 max-w-2xl mx-auto">
        <UCard class="border-error">
          <div class="flex items-center gap-3 text-error">
            <UIcon name="i-lucide-alert-triangle" class="size-5" />
            <p class="font-medium">Failed to load journal entry</p>
          </div>
          <p class="text-sm text-muted mt-2">{{ error?.message || 'An error occurred' }}</p>
          <UButton
            to="/journal"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            class="mt-4"
          >
            Back to Journal
          </UButton>
        </UCard>
      </div>

      <!-- Content -->
      <div v-else-if="data" class="p-6 space-y-8 max-w-4xl mx-auto">
        <!-- Processing/Status Alerts -->
        <UAlert
          v-if="data.status === 'processing'"
          color="info"
          variant="subtle"
          icon="i-lucide-sparkles"
          title="Analyzing your entry"
          description="We're extracting events and processing evidence. This usually takes 30-60 seconds."
          :ui="{ icon: 'animate-pulse' }"
        />

        <UAlert
          v-else-if="data.status === 'failed'"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          title="Processing failed"
          :description="data.processingError || 'An error occurred while processing. You can edit and try again.'"
        />

        <UAlert
          v-else-if="data.status === 'cancelled'"
          color="warning"
          variant="subtle"
          icon="i-lucide-x-circle"
          title="Processing was cancelled"
          description="This entry was not fully processed. You can edit and resubmit."
        />

        <!-- Main Entry Section -->
        <div class="space-y-4">
          <!-- Date and status header -->
          <div class="flex flex-wrap items-center gap-3">
            <UBadge
              v-if="statusConfig"
              :color="statusConfig.color"
              variant="subtle"
              size="sm"
            >
              <UIcon
                :name="statusConfig.icon"
                class="size-3.5 mr-1.5"
                :class="{ 'animate-spin': data.status === 'processing' }"
              />
              {{ statusConfig.label }}
            </UBadge>
            <span class="text-sm text-muted">
              Written {{ formatDateTime(data.createdAt) }}
            </span>
          </div>

          <!-- Date heading -->
          <div v-if="data.referenceDate" class="space-y-1">
            <h1 class="text-3xl font-bold text-highlighted">
              {{ formatDate(data.referenceDate) }}
            </h1>
            <p v-if="data.referenceTimeDescription" class="text-lg text-muted">
              {{ data.referenceTimeDescription }}
            </p>
          </div>
          <h1 v-else class="text-3xl font-bold text-highlighted">
            Journal Entry
          </h1>

          <!-- Journal content -->
          <div class="py-6 border-y border-default">
            <p
              v-if="data.eventText"
              class="text-lg text-highlighted leading-relaxed whitespace-pre-wrap"
            >
              {{ data.eventText }}
            </p>
            <p v-else class="text-muted italic">
              No content written yet.
            </p>
          </div>
        </div>

        <!-- Evidence Section -->
        <div v-if="data.evidence.length > 0" class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
              <UIcon name="i-lucide-paperclip" class="size-5" />
              Attached Evidence
              <span class="text-sm font-normal text-muted">
                ({{ data.evidence.length }})
              </span>
            </h2>
            <UButton
              icon="i-lucide-plus"
              color="primary"
              variant="soft"
              size="xs"
              @click="addEvidenceModalOpen = true"
            >
              Add
            </UButton>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <NuxtLink
              v-for="item in data.evidence"
              :key="item.id"
              :to="`/evidence/${item.id}`"
              class="group block rounded-xl border border-default overflow-hidden hover:border-primary/30 transition-all"
            >
              <!-- Image preview with loading state -->
              <div
                v-if="item.mimeType?.startsWith('image/') && evidenceUrls.get(item.id)"
                class="relative aspect-video bg-muted/10"
              >
                <!-- Loading skeleton -->
                <div
                  v-if="imageLoadStates.get(item.id) !== 'loaded'"
                  class="absolute inset-0 flex items-center justify-center bg-muted/20 animate-pulse"
                >
                  <UIcon name="i-lucide-image" class="size-10 text-muted/40" />
                </div>

                <!-- Actual image -->
                <img
                  :src="evidenceUrls.get(item.id)"
                  :alt="item.originalFilename || 'Evidence'"
                  class="w-full h-full object-cover transition-opacity duration-300"
                  :class="{ 'opacity-0': imageLoadStates.get(item.id) !== 'loaded' }"
                  @load="onImageLoad(item.id)"
                  @error="onImageError(item.id)"
                >

                <!-- Hover overlay -->
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </div>

              <!-- Non-image file icon -->
              <div
                v-else
                class="aspect-video bg-muted/10 flex items-center justify-center"
              >
                <UIcon
                  :name="sourceTypeIcons[item.sourceType] || 'i-lucide-file'"
                  class="size-12 text-muted"
                />
              </div>

              <!-- Details -->
              <div class="p-4 space-y-2">
                <div class="flex items-start justify-between gap-2">
                  <p class="font-medium text-highlighted group-hover:text-primary transition-colors truncate">
                    {{ item.originalFilename || 'Untitled' }}
                  </p>
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="capitalize shrink-0"
                  >
                    {{ item.sourceType }}
                  </UBadge>
                </div>

                <p v-if="item.summary" class="text-sm text-muted line-clamp-2">
                  {{ item.summary }}
                </p>

                <p v-if="item.userAnnotation" class="text-sm text-muted italic">
                  "{{ item.userAnnotation }}"
                </p>

                <div v-if="item.tags.length > 0" class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="tag in item.tags.slice(0, 3)"
                    :key="tag"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  >
                    {{ tag }}
                  </UBadge>
                  <UBadge
                    v-if="item.tags.length > 3"
                    color="neutral"
                    variant="outline"
                    size="xs"
                  >
                    +{{ item.tags.length - 3 }}
                  </UBadge>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- No Evidence Prompt -->
        <div
          v-else
          class="p-8 rounded-xl border border-dashed border-default text-center"
        >
          <UIcon name="i-lucide-paperclip" class="size-10 text-muted mx-auto mb-3" />
          <p class="font-medium text-highlighted mb-1">
            No evidence attached
          </p>
          <p class="text-sm text-muted mb-4">
            Add screenshots, photos, or documents to support this entry
          </p>
          <UButton
            variant="solid"
            color="primary"
            size="sm"
            icon="i-lucide-upload"
            @click="addEvidenceModalOpen = true"
          >
            Add Evidence
          </UButton>
        </div>

        <!-- Add Evidence Modal -->
        <UModal
          v-model:open="addEvidenceModalOpen"
          title="Add Evidence"
          description="Upload a file and attach it to this journal entry."
          :ui="{ footer: 'justify-end' }"
        >
          <template #body>
            <div class="space-y-4">
              <UFormField
                label="File"
                name="file"
                description="Select a screenshot, photo, or document to attach."
              >
                <UFileUpload
                  v-model="evidenceFile"
                  accept="image/*,application/pdf,.doc,.docx,.txt"
                  label="Drop your file here"
                  description="Images, PDFs, or documents (max 10MB)"
                  class="w-full min-h-40"
                />
              </UFormField>

              <UFormField
                label="Annotation"
                name="annotation"
                description="Optional: Describe what this evidence shows."
              >
                <UTextarea
                  v-model="evidenceAnnotation"
                  placeholder="e.g., Screenshot of text message showing late pickup notification..."
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>

          <template #footer>
            <UButton
              color="neutral"
              variant="ghost"
              :disabled="isUploadingEvidence"
              @click="addEvidenceModalOpen = false; resetEvidenceForm()"
            >
              Cancel
            </UButton>
            <UButton
              color="primary"
              :loading="isUploadingEvidence"
              :disabled="!evidenceFile"
              @click="uploadAndAttachEvidence"
            >
              Upload
            </UButton>
          </template>
        </UModal>

        <!-- Created Events -->
        <div v-if="data.events?.length" class="space-y-4">
          <h2 class="text-lg font-semibold text-highlighted flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="size-5" />
            Timeline Events
            <span class="text-sm font-normal text-muted">
              ({{ data.events.length }})
            </span>
          </h2>

          <div class="space-y-3">
            <NuxtLink
              v-for="event in data.events"
              :key="event.id"
              :to="`/event/${event.id}`"
              class="group block p-4 rounded-xl border border-default bg-muted/5 hover:border-primary/30 hover:bg-muted/10 transition-all"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-2">
                    <p class="font-medium text-highlighted group-hover:text-primary transition-colors">
                      {{ event.title || 'Untitled Event' }}
                    </p>
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="xs"
                      class="capitalize"
                    >
                      {{ event.type }}
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted line-clamp-2">
                    {{ event.description }}
                  </p>
                </div>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-5 text-muted group-hover:text-primary transition-colors shrink-0"
                />
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

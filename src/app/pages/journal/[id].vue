<script setup lang="ts">
import type { JournalEntryDetail } from '~/server/api/journal/[id]'
import type { RealtimeChannel } from '@supabase/supabase-js'

const route = useRoute()
const router = useRouter()
const session = useSupabaseSession()
const supabase = useSupabaseClient()
const toast = useToast()
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

// Redirect if not found
watch(error, async (err: any) => {
  if (err?.statusCode === 404) {
    await router.push('/journal')
  }
})

// Subscribe to job updates for real-time status refresh when viewing a processing entry
let jobsChannel: RealtimeChannel | null = null

onMounted(() => {
  const userId = (user.value as any)?.id || (user.value as any)?.sub
  if (!userId) return

  // Subscribe to job updates for this user
  jobsChannel = supabase
    .channel(`journal-detail-${entryId.value}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'jobs',
      filter: `journal_entry_id=eq.${entryId.value}`
    }, (payload) => {
      const job = payload.new as { status: string }
      // Refresh when job status changes
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

// We currently only surface "draft" vs a generic saved entry in the UI.

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

// Evidence upload state
const addEvidenceModalOpen = ref(false)
const evidenceFile = ref<File | null>(null)
const evidenceAnnotation = ref('')
const isUploadingEvidence = ref(false)

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
    // Step 1: Upload the file
    const formData = new FormData()
    formData.append('file', evidenceFile.value)

    const uploadResult = await $fetch<{ id: string }>('/api/evidence-upload', {
      method: 'POST',
      body: formData
    })

    // Step 2: Link to this journal entry
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

    // Reset form and close modal
    resetEvidenceForm()
    addEvidenceModalOpen.value = false

    // Refresh data
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
      method: 'DELETE'
    })

    if (close) close()
    await router.push('/journal')
  } catch (err) {
    console.error('Failed to delete entry:', err)
  } finally {
    isDeleting.value = false
  }
}

function formatDate(value: string) {
  if (!value) return ''

  // referenceDate is stored as a date-only string (YYYY-MM-DD) without timezone.
  // When passed directly to `new Date(value)` it is interpreted as midnight UTC,
  // which can render as the previous day for users in negative offsets.
  // To avoid off-by-one issues, anchor the date at noon before formatting.
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

  // Evidence files are stored in the "daylight-files" bucket under an "evidence/" prefix.
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
        const url = await getEvidenceUrl(item.storagePath)
        if (url) {
          evidenceUrls.value.set(item.id, url)
        }
      }
    }
  },
  { immediate: true }
)
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
            Back to Journal
          </UButton>
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <!-- Edit Modal -->
            <UModal
              v-if="status === 'success' && data"
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
                  <UFormField
                    label="What happened?"
                    name="eventText"
                  >
                    <UTextarea
                      v-model="editableText"
                      :rows="8"
                      placeholder="Describe the events, conversations, or situations..."
                      class="w-full"
                    />
                  </UFormField>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <UFormField
                      label="Date"
                      name="referenceDate"
                      description="When did this happen?"
                    >
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
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="close"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  :loading="isSaving"
                  @click="saveEntry(close)"
                >
                  Save Changes
                </UButton>
              </template>
            </UModal>

            <!-- Delete Modal -->
            <UModal
              v-if="status === 'success' && data"
              title="Delete Entry"
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
                    This will permanently delete this journal entry. Any events extracted from this entry will remain, but the entry itself will be gone.
                  </p>
                  <p class="text-xs text-muted">
                    Evidence files attached to this entry will not be deleted and can still be accessed from the Evidence page.
                  </p>
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
                  :loading="isDeleting"
                  @click="deleteEntry(close)"
                >
                  Delete Entry
                </UButton>
              </template>
            </UModal>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="status === 'pending'" class="p-6 space-y-4">
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <USkeleton class="h-6 w-24" />
              <USkeleton class="h-6 w-48" />
            </div>
            <USkeleton class="h-32 w-full" />
            <USkeleton class="h-4 w-32" />
          </div>
        </UCard>
      </div>

      <!-- Error -->
      <div v-else-if="status === 'error'" class="p-6">
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
      <div v-else-if="data" class="p-6 space-y-6 max-w-4xl">
        <!-- Processing Alert -->
        <UAlert
          v-if="data.status === 'processing'"
          color="info"
          variant="subtle"
          icon="i-lucide-sparkles"
          title="Analyzing your entry"
          description="We're extracting events and processing any evidence. This usually takes 30-60 seconds. This page will update automatically when complete."
          :ui="{ icon: 'animate-pulse' }"
        />

        <!-- Failed Alert -->
        <UAlert
          v-else-if="data.status === 'failed'"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          title="Processing failed"
          :description="data.processingError || 'An error occurred while processing this entry. You can edit and try again, or delete this entry.'"
        />

        <!-- Cancelled Alert -->
        <UAlert
          v-else-if="data.status === 'cancelled'"
          color="warning"
          variant="subtle"
          icon="i-lucide-x-circle"
          title="Processing was cancelled"
          :description="data.processingError || 'This entry was not fully processed. You can edit and resubmit, or delete this entry.'"
        />

        <!-- Main Entry Card -->
        <UCard>
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <!-- Processing status -->
                <UBadge
                  v-if="data.status === 'processing'"
                  color="info"
                  variant="subtle"
                  size="lg"
                >
                  <UIcon name="i-lucide-loader-2" class="size-3.5 mr-1 animate-spin" />
                  Processing
                </UBadge>
                <!-- Failed status -->
                <UBadge
                  v-else-if="data.status === 'failed'"
                  color="error"
                  variant="subtle"
                  size="lg"
                >
                  <UIcon name="i-lucide-alert-circle" class="size-3.5 mr-1" />
                  Failed
                </UBadge>
                <!-- Cancelled status -->
                <UBadge
                  v-else-if="data.status === 'cancelled'"
                  color="warning"
                  variant="subtle"
                  size="lg"
                >
                  <UIcon name="i-lucide-x-circle" class="size-3.5 mr-1" />
                  Cancelled
                </UBadge>
                <!-- Draft status -->
                <UBadge
                  v-else-if="data.status === 'draft'"
                  color="neutral"
                  variant="subtle"
                  size="lg"
                  class="capitalize"
                >
                  <UIcon name="i-lucide-pencil" class="size-3.5 mr-1" />
                  Draft
                </UBadge>
                <!-- Completed/default status -->
                <UBadge
                  v-else
                  color="primary"
                  variant="subtle"
                  size="lg"
                >
                  <UIcon name="i-lucide-book-open" class="size-3.5 mr-1" />
                  Journal entry
                </UBadge>

                <div v-if="data.referenceDate">
                  <p class="text-lg font-medium text-highlighted">
                    {{ formatDate(data.referenceDate) }}
                  </p>
                  <p v-if="data.referenceTimeDescription" class="text-sm text-muted">
                    {{ data.referenceTimeDescription }}
                  </p>
                </div>
              </div>

              <p class="text-xs text-muted">
                Written {{ formatDateTime(data.createdAt) }}
              </p>
            </div>

            <!-- Entry Content -->
            <div class="py-4 border-y border-default">
              <p
                v-if="data.eventText"
                class="text-base text-highlighted leading-relaxed whitespace-pre-wrap"
              >
                {{ data.eventText }}
              </p>
              <p v-else class="text-sm text-muted italic">
                No content written yet.
              </p>
            </div>

            <!-- Processing Info -->
            <div v-if="data.processingError" class="p-3 rounded-lg bg-error/10 border border-error/20">
              <div class="flex items-center gap-2 text-error text-sm">
                <UIcon name="i-lucide-alert-circle" class="size-4" />
                <span class="font-medium">Processing Error</span>
              </div>
              <p class="text-xs text-muted mt-1">{{ data.processingError }}</p>
            </div>
          </div>
        </UCard>

        <!-- Evidence Section -->
        <UCard v-if="data.evidence.length > 0">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-medium text-highlighted">
                Attached Evidence
              </h2>
              <div class="flex items-center gap-2">
                <span class="text-sm text-muted">
                  {{ data.evidence.length }} {{ data.evidence.length === 1 ? 'file' : 'files' }}
                </span>
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
            </div>
          </template>

          <div class="grid gap-4 sm:grid-cols-2">
            <NuxtLink
              v-for="item in data.evidence"
              :key="item.id"
              :to="`/evidence/${item.id}`"
              class="block"
            >
              <div
                class="border border-default rounded-lg overflow-hidden hover:bg-muted/5 transition-colors"
              >
                <!-- Preview -->
                <div
                  v-if="item.mimeType?.startsWith('image/') && evidenceUrls.get(item.id)"
                  class="aspect-video bg-muted/30"
                >
                  <img
                    :src="evidenceUrls.get(item.id)"
                    :alt="item.originalFilename || 'Evidence'"
                    class="w-full h-full object-contain"
                  />
                </div>
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
                <div class="p-3 space-y-2">
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-sm font-medium text-highlighted truncate">
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

                  <p v-if="item.summary" class="text-xs text-muted line-clamp-2">
                    {{ item.summary }}
                  </p>

                  <p v-if="item.userAnnotation" class="text-xs text-muted italic">
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
              </div>
            </NuxtLink>
          </div>
        </UCard>

        <!-- No Evidence Prompt -->
        <UCard
          v-else
          class="border-dashed"
        >
          <div class="flex flex-col items-center justify-center py-6 text-center">
            <UIcon name="i-lucide-paperclip" class="size-10 text-muted mb-3" />
            <p class="text-sm font-medium text-highlighted mb-1">
              No evidence attached
            </p>
            <p class="text-xs text-muted mb-4">
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
        </UCard>

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
                description="Optional: Describe what this evidence shows or why it matters."
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
              Upload & Attach
            </UButton>
          </template>
        </UModal>

        <!-- Extracted Events (if any) -->
        <UCard v-if="data.extractionRaw?.events?.length">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-medium text-highlighted">
                Extracted Events
              </h2>
              <UBadge color="info" variant="subtle" size="xs">
                AI Generated
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <div
              v-for="(event, index) in data.extractionRaw.events"
              :key="index"
              class="p-3 rounded-lg bg-muted/5 border border-default"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <p class="font-medium text-highlighted">
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
                  <p class="text-sm text-muted">
                    {{ event.description }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Metadata -->
        <UCard>
          <template #header>
            <h2 class="text-sm font-medium text-muted">Metadata</h2>
          </template>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p class="text-xs text-muted">Entry ID</p>
              <p class="font-mono text-xs truncate">{{ data.id }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Status</p>
              <p class="capitalize">
                {{ data.status }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">Created</p>
              <p>{{ formatDateTime(data.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Last Updated</p>
              <p>{{ formatDateTime(data.updatedAt) }}</p>
            </div>
            <div v-if="data.processedAt">
              <p class="text-xs text-muted">Processed</p>
              <p>{{ formatDateTime(data.processedAt) }}</p>
            </div>
            <div v-if="data.completedAt">
              <p class="text-xs text-muted">Completed</p>
              <p>{{ formatDateTime(data.completedAt) }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>


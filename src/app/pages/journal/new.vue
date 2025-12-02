<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useObjectUrl } from '@vueuse/core'
import { getDateStringInTimezone, detectBrowserTimezone } from '~/composables/useTimezone'
import type { JournalSubmitResponse } from '~/types'

// Subscription check for feature gating
const { 
  canCreateJournalEntry, 
  journalEntriesRemaining,
  isFree,
  incrementJournalEntryCount 
} = useSubscription()

// Job tracking for background processing
const { trackJob } = useJobs()
const toast = useToast()

// =============================================================================
// Types
// =============================================================================

interface EvidenceItem {
  id: string
  file: File | null
  previewUrl: string
  annotation: string
  fileName: string
  mimeType: string
  isUploading: boolean
  uploadedEvidenceId: string | null
  error: string | null
}

interface CaptureState {
  step: 'event' | 'evidence'
  eventText: string
  referenceDate: string
  evidence: EvidenceItem[]
  isRecording: boolean
  hasRecording: boolean
  recordingBlob: Blob | null
  transcript: string
  error: string | null
}

// =============================================================================
// State
// =============================================================================

const supabase = useSupabaseClient()
const supabaseSession = useSupabaseSession()

// Get local date string to avoid UTC date mismatch (e.g., 11pm Nov 25 local showing as Nov 26)
const localTodayDate = getDateStringInTimezone(new Date(), detectBrowserTimezone())

const state = ref<CaptureState>({
  step: 'event',
  eventText: '',
  referenceDate: localTodayDate,
  evidence: [],
  isRecording: false,
  hasRecording: false,
  recordingBlob: null,
  transcript: '',
  error: null
})

const isSupported = ref(true)
const isTranscribing = ref(false)
const isSubmitting = ref(false)

let mediaRecorder: MediaRecorder | null = null
let chunks: BlobPart[] = []
let recordingMimeType = ''

const recordingUrl = useObjectUrl(() => state.value.recordingBlob)

// =============================================================================
// Computed
// =============================================================================

const hasEventContent = computed(() => {
  return state.value.eventText.trim().length > 0 || state.value.transcript.trim().length > 0
})

const effectiveEventText = computed(() => {
  return state.value.transcript.trim() || state.value.eventText.trim()
})

const canProceedToEvidence = computed(() => {
  // Block if at limit - don't let users proceed to waste LLM tokens
  if (isFree.value && !canCreateJournalEntry.value) return false
  return hasEventContent.value && !state.value.isRecording && !isTranscribing.value
})

const canSubmit = computed(() => {
  // Block if at limit - don't let users waste LLM tokens on extraction
  if (isFree.value && !canCreateJournalEntry.value) return false
  return hasEventContent.value && !isSubmitting.value
})

// Block recording/transcription when at limit to avoid wasting Whisper tokens
const canRecord = computed(() => {
  if (isFree.value && !canCreateJournalEntry.value) return false
  return isSupported.value
})

const hasEvidence = computed(() => state.value.evidence.length > 0)

// =============================================================================
// Lifecycle
// =============================================================================

onMounted(() => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    isSupported.value = false
  }
})

onBeforeUnmount(() => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  // Clean up evidence preview URLs
  state.value.evidence.forEach(e => {
    if (e.previewUrl && e.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(e.previewUrl)
    }
  })
})

// =============================================================================
// Recording Functions
// =============================================================================

async function startRecording() {
  if (!isSupported.value || state.value.isRecording) return

  state.value.error = null

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    chunks = []

    let preferredMimeType = ''
    if (typeof MediaRecorder !== 'undefined') {
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mpeg',
        'audio/wav'
      ]
      for (const candidate of candidates) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          preferredMimeType = candidate
          break
        }
      }
    }

    mediaRecorder = preferredMimeType
      ? new MediaRecorder(stream, { mimeType: preferredMimeType })
      : new MediaRecorder(stream)

    recordingMimeType = mediaRecorder.mimeType || preferredMimeType || 'audio/webm'

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: recordingMimeType })
      state.value.recordingBlob = blob
      state.value.hasRecording = true
      stream.getTracks().forEach(track => track.stop())
    }

    mediaRecorder.start()
    state.value.isRecording = true
  } catch (e) {
    console.error(e)
    state.value.error = 'Unable to access microphone. Please check your permissions.'
    state.value.isRecording = false
  }
}

function stopRecording() {
  if (mediaRecorder && state.value.isRecording && mediaRecorder.state === 'recording') {
    mediaRecorder.stop()
    state.value.isRecording = false
  }
}

async function toggleRecording() {
  if (!isSupported.value) return
  if (state.value.isRecording) {
    stopRecording()
  } else {
    await startRecording()
  }
}

async function transcribeRecording() {
  if (!state.value.recordingBlob || isTranscribing.value) return

  isTranscribing.value = true
  state.value.error = null

  try {
    const formData = new FormData()
    const mimeType = state.value.recordingBlob.type || recordingMimeType || 'audio/webm'
    let fileExtension = 'webm'

    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) {
      fileExtension = 'mp3'
    } else if (mimeType.includes('wav')) {
      fileExtension = 'wav'
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      fileExtension = 'mp4'
    }

    formData.append('audio', state.value.recordingBlob, `recording.${fileExtension}`)

    const response = await $fetch<{ transcript: string }>('/api/transcribe', {
      method: 'POST',
      body: formData as any
    })

    state.value.transcript = response.transcript
  } catch (e: any) {
    console.error(e)
    state.value.error = e?.data?.statusMessage || 'Failed to transcribe recording.'
  } finally {
    isTranscribing.value = false
  }
}

// =============================================================================
// Evidence Functions
// =============================================================================

function addEvidence() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*,application/pdf,.doc,.docx'
  input.multiple = true

  input.onchange = (event) => {
    const target = event.target as HTMLInputElement
    const files = target.files
    if (!files) return

    for (const file of Array.from(files)) {
      const previewUrl = file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : ''

      state.value.evidence.push({
        id: crypto.randomUUID(),
        file,
        previewUrl,
        annotation: '',
        fileName: file.name,
        mimeType: file.type,
        isUploading: false,
        uploadedEvidenceId: null,
        error: null
      })
    }
  }

  input.click()
}

function removeEvidence(id: string) {
  const index = state.value.evidence.findIndex(e => e.id === id)
  if (index !== -1) {
    const item = state.value.evidence[index]!
    if (item.previewUrl && item.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
    state.value.evidence.splice(index, 1)
  }
}

function updateAnnotation(id: string, annotation: string) {
  const item = state.value.evidence.find(e => e.id === id)
  if (item) {
    item.annotation = annotation
  }
}

// =============================================================================
// Processing Functions
// =============================================================================

async function uploadEvidence(item: EvidenceItem): Promise<void> {
  if (!item.file) {
    item.error = 'No file to upload'
    return
  }

  const accessToken = supabaseSession.value?.access_token
    || (await supabase.auth.getSession()).data.session?.access_token

  item.isUploading = true
  item.error = null

  try {
    const formData = new FormData()
    formData.append('file', item.file)

    const uploadResult = await $fetch<{ id: string }>('/api/evidence-upload', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData as any
    })

    item.uploadedEvidenceId = uploadResult.id
  } catch (e: any) {
    console.error('Evidence upload error:', e)
    item.error = e?.data?.statusMessage || 'Failed to upload evidence'
  } finally {
    item.isUploading = false
  }
}

async function uploadAllEvidence(): Promise<string[]> {
  // Upload evidence items sequentially
  for (const item of state.value.evidence) {
    if (!item.uploadedEvidenceId && !item.error) {
      await uploadEvidence(item)
    }
  }
  
  // Return IDs of successfully uploaded evidence
  return state.value.evidence
    .filter(e => e.uploadedEvidenceId)
    .map(e => e.uploadedEvidenceId!)
}

async function submitCapture() {
  if (!canSubmit.value) return

  isSubmitting.value = true
  state.value.error = null

  try {
    // Step 1: Upload all evidence first (fast, synchronous)
    const evidenceIds = hasEvidence.value ? await uploadAllEvidence() : []

    // Check if any evidence failed to upload
    const failedEvidence = state.value.evidence.filter(e => e.error)
    if (failedEvidence.length > 0) {
      state.value.error = `Failed to upload ${failedEvidence.length} file(s). Please try again.`
      return
    }

    // Step 2: Submit for background processing
    const result = await $fetch<JournalSubmitResponse>('/api/journal/submit', {
      method: 'POST',
      body: {
        eventText: effectiveEventText.value,
        referenceDate: state.value.referenceDate,
        evidenceIds
      }
    })

    // Step 3: Track job for toast notification
    trackJob({ id: result.jobId, journal_entry_id: result.journalEntryId })

    // Step 4: Increment usage count
    incrementJournalEntryCount()

    // Step 5: Show confirmation toast
    toast.add({
      title: 'Entry submitted!',
      description: 'You\'ll be notified when processing completes.',
      icon: 'i-lucide-clock',
      color: 'info'
    })

    // Step 6: Navigate to journal list
    await navigateTo('/journal')
  } catch (e: any) {
    console.error('Capture submission error:', e)
    state.value.error = e?.data?.statusMessage || e?.message || 'Failed to submit entry'
  } finally {
    isSubmitting.value = false
  }
}

// =============================================================================
// Navigation
// =============================================================================

function proceedToEvidence() {
  if (canProceedToEvidence.value) {
    state.value.step = 'evidence'
  }
}

function goBackToEvent() {
  state.value.step = 'event'
}

// =============================================================================
// Helpers
// =============================================================================

// Test data loaders
function loadTestText(sample: string) {
  const samples: Record<string, string> = {
    incident: `Tonight the kids were scheduled to be dropped off at 6:00 PM per our custody agreement. Other parent arrived at 6:45 PM with no prior notice. When they arrived, I could smell alcohol on their breath. The children mentioned they hadn't eaten dinner yet. Sarah said "Daddy forgot to feed us again" and looked upset. Tommy was crying and said his tummy hurt from being hungry. I took a photo of the sign-in sheet showing the time.`,
    positive: `Had a wonderful day with the kids today. We made pancakes together for breakfast, then went to the library for story time. Sarah checked out three chapter books. In the afternoon, Tommy rode his bike without training wheels for the first time! Both kids were in bed by 8:00 PM after baths and bedtime stories.`,
    neutral: `Today's custody exchange at 5:00 PM at Walmart parking lot. Other parent arrived at 5:02 PM. Children had their overnight bags with clothes, toiletries, and homework. Brief conversation about upcoming school events. Exchange completed at 5:08 PM without incident.`
  }
  state.value.eventText = samples[sample] ?? samples.incident!
}
</script>

<template>
  <UDashboardPanel id="journal-new">
    <template #header>
      <UDashboardNavbar title="New Journal Entry">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl w-full mx-auto">
        <!-- Feature gate: Free tier limit check -->
        <div v-if="isFree && !canCreateJournalEntry" class="mb-6">
          <UpgradePrompt
            title="Journal entry limit reached"
            description="You've used all 5 journal entries on the free plan. Upgrade to Pro for unlimited entries and keep documenting your case."
            variant="card"
          />
        </div>

        <!-- Free tier remaining warning -->
        <UpgradePrompt
          v-else-if="isFree && journalEntriesRemaining <= 2 && journalEntriesRemaining > 0"
          :title="`${journalEntriesRemaining} journal ${journalEntriesRemaining === 1 ? 'entry' : 'entries'} remaining`"
          description="Upgrade to Pro for unlimited journal entries."
          :show-remaining="true"
          :remaining="journalEntriesRemaining"
          remaining-label="entries left"
          variant="inline"
          class="mb-6"
        />

        <!-- Progress Steps -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border"
            :class="state.step === 'event' 
              ? 'bg-primary text-white border-primary' 
              : 'bg-transparent text-muted border-default'"
          >
            <span 
              class="w-5 h-5 rounded-full flex items-center justify-center text-xs"
              :class="state.step === 'event' ? 'bg-white/20' : 'bg-muted'"
            >1</span>
            <span class="hidden sm:inline">Describe</span>
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-muted size-4" />
          <div
            class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border"
            :class="state.step === 'evidence' 
              ? 'bg-primary text-white border-primary' 
              : 'bg-transparent text-muted border-default'"
          >
            <span 
              class="w-5 h-5 rounded-full flex items-center justify-center text-xs"
              :class="state.step === 'evidence' ? 'bg-white/20' : 'bg-muted'"
            >2</span>
            <span class="hidden sm:inline">Evidence & Submit</span>
          </div>
        </div>

        <!-- Step 1: Event Capture -->
        <UCard v-if="state.step === 'event'" class="mb-6">
          <template #header>
            <div>
              <p class="font-semibold text-lg text-highlighted">What happened?</p>
              <p class="text-sm text-muted mt-1">
                This becomes a journal entry and timeline events. Use your voice or text—whatever is easiest right now.
              </p>
            </div>
          </template>

          <div class="space-y-6" :class="{ 'opacity-50 pointer-events-none': isFree && !canCreateJournalEntry }">
            <!-- Voice Recording -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-highlighted">Voice Recording</p>
                <UBadge v-if="state.isRecording" color="error" variant="subtle" class="animate-pulse">
                  Recording...
                </UBadge>
              </div>

              <ClientOnly>
                <div class="flex flex-wrap items-center gap-3">
                  <UButton
                    :color="state.isRecording ? 'error' : 'primary'"
                    :icon="state.isRecording ? 'i-lucide-square' : 'i-lucide-mic'"
                    size="lg"
                    :disabled="!canRecord"
                    @click="toggleRecording"
                  >
                    {{ state.isRecording ? 'Stop Recording' : 'Start Recording' }}
                  </UButton>

                  <UButton
                    v-if="state.hasRecording"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-sparkles"
                    :loading="isTranscribing"
                    :disabled="state.isRecording || isTranscribing || !canRecord"
                    @click="transcribeRecording"
                  >
                    Transcribe
                  </UButton>
                </div>

                <div v-if="state.hasRecording && recordingUrl" class="mt-3">
                  <audio :src="recordingUrl" controls class="w-full" />
                </div>

                <template #fallback>
                  <p class="text-sm text-muted">Audio recording requires browser support.</p>
                </template>
              </ClientOnly>
            </div>

            <!-- Transcript Display -->
            <div v-if="state.transcript" class="space-y-2">
              <p class="text-sm font-medium text-highlighted">Transcript</p>
              <div class="p-3 rounded-lg bg-muted/50 border border-default">
                <p class="text-sm text-highlighted whitespace-pre-wrap">{{ state.transcript }}</p>
              </div>
            </div>

            <!-- Divider -->
            <div class="relative">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-default" />
              </div>
              <div class="relative flex justify-center text-xs uppercase">
                <span class="bg-default px-2 text-muted">or type your note</span>
              </div>
            </div>

            <!-- Text Input -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-highlighted">Written Description</p>
                <UDropdownMenu
                  :items="[
                    [
                      { label: 'Late exchange incident', icon: 'i-lucide-alert-triangle', onSelect: () => loadTestText('incident') },
                      { label: 'Positive parenting day', icon: 'i-lucide-heart', onSelect: () => loadTestText('positive') },
                      { label: 'Routine exchange', icon: 'i-lucide-calendar', onSelect: () => loadTestText('neutral') }
                    ]
                  ]"
                >
                  <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-file-text" trailing-icon="i-lucide-chevron-down">
                    Load sample
                  </UButton>
                </UDropdownMenu>
              </div>
              <UTextarea
                v-model="state.eventText"
                placeholder="Describe what happened. Include details like time, location, people involved, and any concerning behaviors..."
                :rows="6"
                color="neutral"
                variant="outline"
                class="w-full"
              />
            </div>

            <!-- Reference Date -->
            <div class="space-y-2">
              <p class="text-sm font-medium text-highlighted">When did this happen?</p>
              <p class="text-xs text-muted">
                Select the date when these events occurred. This helps with accurate timeline placement.
              </p>
              <UInput
                v-model="state.referenceDate"
                type="date"
                color="neutral"
                variant="outline"
                class="w-48"
              />
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-between gap-4">
              <p v-if="isFree && !canCreateJournalEntry" class="text-sm text-error">
                Upgrade to continue documenting your case.
              </p>
              <div v-else />
              <UButton
                color="primary"
                icon="i-lucide-arrow-right"
                trailing
                :disabled="!canProceedToEvidence"
                @click="proceedToEvidence"
              >
                Continue to Evidence
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Step 2: Evidence Attachment -->
        <UCard v-else-if="state.step === 'evidence'" class="mb-6">
          <template #header>
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-semibold text-lg text-highlighted">Add Supporting Evidence</p>
                <p class="text-sm text-muted mt-1">
                  Attach photos, screenshots, or documents that support this entry. Add a note for each to explain what it shows.
                </p>
              </div>
              <UBadge color="info" variant="subtle">Optional</UBadge>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Event Summary -->
            <div class="p-3 rounded-lg bg-muted/30 border border-default">
              <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Your Journal Text</p>
              <p class="text-sm text-highlighted line-clamp-3">{{ effectiveEventText }}</p>
            </div>

            <!-- Evidence List -->
            <div v-if="hasEvidence" class="space-y-4">
              <div
                v-for="item in state.evidence"
                :key="item.id"
                class="border border-default rounded-lg overflow-hidden"
              >
                <div class="flex gap-4 p-4">
                  <!-- Preview -->
                  <div class="w-20 h-20 flex-shrink-0 rounded-md bg-muted/50 overflow-hidden flex items-center justify-center">
                    <img
                      v-if="item.previewUrl"
                      :src="item.previewUrl"
                      :alt="item.fileName"
                      class="w-full h-full object-cover"
                    />
                    <UIcon v-else name="i-lucide-file" class="w-8 h-8 text-muted-foreground" />
                  </div>

                  <!-- Details -->
                  <div class="flex-1 min-w-0 space-y-2">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-sm font-medium text-highlighted truncate">{{ item.fileName }}</p>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-lucide-x"
                        @click="removeEvidence(item.id)"
                      />
                    </div>
                    <UTextarea
                      :model-value="item.annotation"
                      placeholder="What does this show? Why is it relevant?"
                      :rows="2"
                      color="neutral"
                      variant="outline"
                      class="w-full text-sm"
                      @update:model-value="updateAnnotation(item.id, $event)"
                    />
                  </div>
                </div>

                <!-- Status -->
                <div v-if="item.isUploading || item.uploadedEvidenceId || item.error" class="px-4 py-2 bg-muted/30 border-t border-default">
                  <div v-if="item.error" class="flex items-center gap-2 text-error text-xs">
                    <UIcon name="i-lucide-alert-circle" />
                    {{ item.error }}
                  </div>
                  <div v-else-if="item.isUploading" class="flex items-center gap-2 text-muted text-xs">
                    <UIcon name="i-lucide-loader-2" class="animate-spin" />
                    Uploading...
                  </div>
                  <div v-else-if="item.uploadedEvidenceId" class="flex items-center gap-2 text-success text-xs">
                    <UIcon name="i-lucide-check-circle" />
                    Ready
                  </div>
                </div>
              </div>
            </div>

            <!-- Add Evidence Button -->
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              class="w-full"
              @click="addEvidence"
            >
              Add Evidence
            </UButton>
          </div>

          <template #footer>
            <div class="flex items-center justify-between">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-arrow-left"
                @click="goBackToEvent"
              >
                Back
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-send"
                :loading="isSubmitting"
                :disabled="!canSubmit"
                @click="submitCapture"
              >
                Submit Entry
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Error Alert -->
        <UAlert
          v-if="state.error"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          :title="state.error"
          class="mb-6"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>




<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useObjectUrl } from '@vueuse/core'
import { getDateStringInTimezone, detectBrowserTimezone } from '~/composables/useTimezone'

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
  isProcessing: boolean
  isProcessed: boolean
  uploadedEvidenceId: string | null
  extractionSummary: string | null
  error: string | null
}

interface CaptureState {
  step: 'event' | 'evidence' | 'processing' | 'review'
  eventText: string
  referenceDate: string
  evidence: EvidenceItem[]
  isRecording: boolean
  hasRecording: boolean
  recordingBlob: Blob | null
  transcript: string
  extractionResult: any | null
  processingStatus: string
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
  extractionResult: null,
  processingStatus: '',
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
  return hasEventContent.value && !state.value.isRecording && !isTranscribing.value
})

const canSubmit = computed(() => {
  return hasEventContent.value && !isSubmitting.value
})

const hasEvidence = computed(() => state.value.evidence.length > 0)

const allEvidenceProcessed = computed(() => {
  return state.value.evidence.every(e => e.isProcessed || e.error)
})

const evidenceWithExtractions = computed(() => {
  return state.value.evidence
    .filter(e => e.isProcessed && e.extractionSummary)
    .map(e => ({
      evidenceId: e.uploadedEvidenceId,
      annotation: e.annotation,
      summary: e.extractionSummary
    }))
})

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
        isProcessing: false,
        isProcessed: false,
        uploadedEvidenceId: null,
        extractionSummary: null,
        error: null
      })
    }
  }

  input.click()
}

function removeEvidence(id: string) {
  const index = state.value.evidence.findIndex(e => e.id === id)
  if (index !== -1) {
    const item = state.value.evidence[index]
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

async function uploadAndProcessEvidence(item: EvidenceItem): Promise<void> {
  if (!item.file) {
    item.error = 'No file to upload'
    return
  }

  const accessToken = supabaseSession.value?.access_token 
    || (await supabase.auth.getSession()).data.session?.access_token

  // Step 1: Upload the file
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
    item.isUploading = false

    // Step 2: Process with LLM
    item.isProcessing = true

    const processResult = await $fetch<{ extraction: any }>('/api/capture/process-evidence', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: {
        evidenceId: uploadResult.id,
        userAnnotation: item.annotation
      }
    })

    item.extractionSummary = processResult.extraction?.summary || 'Processed successfully'
    item.isProcessed = true
  } catch (e: any) {
    console.error('Evidence processing error:', e)
    item.error = e?.data?.statusMessage || 'Failed to process evidence'
  } finally {
    item.isUploading = false
    item.isProcessing = false
  }
}

async function processAllEvidence(): Promise<void> {
  state.value.processingStatus = 'Processing evidence...'
  
  // Process evidence items sequentially to avoid overwhelming the API
  for (const item of state.value.evidence) {
    if (!item.isProcessed && !item.error) {
      state.value.processingStatus = `Processing: ${item.fileName}...`
      await uploadAndProcessEvidence(item)
    }
  }
}

async function extractEvents(): Promise<void> {
  state.value.processingStatus = 'Extracting events from your description...'

  const accessToken = supabaseSession.value?.access_token 
    || (await supabase.auth.getSession()).data.session?.access_token

  try {
    const result = await $fetch<any>('/api/capture/extract-events', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: {
        eventText: effectiveEventText.value,
        referenceDate: state.value.referenceDate,
        evidenceSummaries: evidenceWithExtractions.value
      }
    })

    state.value.extractionResult = result
  } catch (e: any) {
    console.error('Event extraction error:', e)
    throw new Error(e?.data?.statusMessage || 'Failed to extract events')
  }
}

async function submitCapture() {
  if (!canSubmit.value) return

  isSubmitting.value = true
  state.value.error = null
  state.value.step = 'processing'

  try {
    // Step 1: Process all evidence (if any)
    if (hasEvidence.value) {
      await processAllEvidence()
    }

    // Step 2: Extract events using the event text + evidence summaries
    await extractEvents()

    // Move to review step
    state.value.step = 'review'
  } catch (e: any) {
    console.error('Capture submission error:', e)
    state.value.error = e?.message || 'Failed to process capture'
    state.value.step = 'evidence'
  } finally {
    isSubmitting.value = false
    state.value.processingStatus = ''
  }
}

async function confirmAndSave() {
  if (!state.value.extractionResult) return

  isSubmitting.value = true
  state.value.error = null

  const accessToken = supabaseSession.value?.access_token 
    || (await supabase.auth.getSession()).data.session?.access_token

  try {
    // Save the extracted events to the database
    const result = await $fetch<{ createdEventIds: string[]; linkedEvidenceCount: number; captureId?: string | null }>('/api/capture/save-events', {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: {
        extraction: state.value.extractionResult.extraction,
        evidenceIds: state.value.evidence
          .filter(e => e.uploadedEvidenceId)
          .map(e => e.uploadedEvidenceId),
        // Include journal entry data
        eventText: effectiveEventText.value,
        referenceDate: state.value.referenceDate
      }
    })

    // Prefer navigating to the newly created journal entry if available
    if (result.captureId) {
      await navigateTo(`/journal/${result.captureId}`)
    } else {
      // Fallback to timeline if capture record wasn't created for some reason
      await navigateTo('/timeline')
    }
  } catch (e: any) {
    console.error('Save error:', e)
    state.value.error = e?.data?.statusMessage || 'Failed to save events'
  } finally {
    isSubmitting.value = false
  }
}

function goBackToEdit() {
  state.value.step = 'evidence'
  state.value.extractionResult = null
}

function startNewCapture() {
  // Clean up
  state.value.evidence.forEach(e => {
    if (e.previewUrl && e.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(e.previewUrl)
    }
  })

  // Reset state
  state.value = {
    step: 'event',
    eventText: '',
    referenceDate: new Date().toISOString().slice(0, 10),
    evidence: [],
    isRecording: false,
    hasRecording: false,
    recordingBlob: null,
    transcript: '',
    extractionResult: null,
    processingStatus: '',
    error: null
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

function eventColor(type: string): 'primary' | 'success' | 'info' | 'warning' | 'error' | 'neutral' {
  switch (type) {
    case 'incident': return 'error'
    case 'positive': return 'success'
    case 'medical': return 'info'
    case 'school': return 'warning'
    case 'communication': return 'primary'
    case 'legal': return 'neutral'
    default: return 'neutral'
  }
}

// Test data loaders
function loadTestText(sample: string) {
  const samples: Record<string, string> = {
    incident: `Tonight the kids were scheduled to be dropped off at 6:00 PM per our custody agreement. Other parent arrived at 6:45 PM with no prior notice. When they arrived, I could smell alcohol on their breath. The children mentioned they hadn't eaten dinner yet. Sarah said "Daddy forgot to feed us again" and looked upset. Tommy was crying and said his tummy hurt from being hungry. I took a photo of the sign-in sheet showing the time.`,
    positive: `Had a wonderful day with the kids today. We made pancakes together for breakfast, then went to the library for story time. Sarah checked out three chapter books. In the afternoon, Tommy rode his bike without training wheels for the first time! Both kids were in bed by 8:00 PM after baths and bedtime stories.`,
    neutral: `Today's custody exchange at 5:00 PM at Walmart parking lot. Other parent arrived at 5:02 PM. Children had their overnight bags with clothes, toiletries, and homework. Brief conversation about upcoming school events. Exchange completed at 5:08 PM without incident.`
  }
  state.value.eventText = samples[sample] || samples.incident
}
</script>

<template>
  <UDashboardPanel id="capture">
    <template #header>
      <UDashboardNavbar title="Capture Event">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="state.step !== 'event'"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="startNewCapture"
          >
            Start Over
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl w-full mx-auto">
        <!-- Progress Steps -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <div 
            class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            :class="state.step === 'event' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <span class="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">1</span>
            Event
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-muted-foreground" />
          <div 
            class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            :class="state.step === 'evidence' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <span class="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">2</span>
            Evidence
          </div>
          <UIcon name="i-lucide-chevron-right" class="text-muted-foreground" />
          <div 
            class="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
            :class="state.step === 'processing' || state.step === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          >
            <span class="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs">3</span>
            Review
          </div>
        </div>

        <!-- Step 1: Event Capture -->
        <UCard v-if="state.step === 'event'" class="mb-6">
          <template #header>
            <div>
              <p class="font-semibold text-lg text-highlighted">What happened?</p>
              <p class="text-sm text-muted mt-1">
                Describe the event using voice or text. Be specific about what occurred, when, and who was involved.
              </p>
            </div>
          </template>

          <div class="space-y-6">
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
                    :disabled="!isSupported"
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
                    :disabled="state.isRecording || isTranscribing"
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
            <div class="flex justify-end">
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
                  Attach photos, screenshots, or documents that support your description. Add a note for each to explain what it shows.
                </p>
              </div>
              <UBadge color="info" variant="subtle">Optional</UBadge>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Event Summary -->
            <div class="p-3 rounded-lg bg-muted/30 border border-default">
              <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Your Event Description</p>
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
                <div v-if="item.isUploading || item.isProcessing || item.isProcessed || item.error" class="px-4 py-2 bg-muted/30 border-t border-default">
                  <div v-if="item.error" class="flex items-center gap-2 text-error text-xs">
                    <UIcon name="i-lucide-alert-circle" />
                    {{ item.error }}
                  </div>
                  <div v-else-if="item.isUploading" class="flex items-center gap-2 text-muted text-xs">
                    <UIcon name="i-lucide-loader-2" class="animate-spin" />
                    Uploading...
                  </div>
                  <div v-else-if="item.isProcessing" class="flex items-center gap-2 text-info text-xs">
                    <UIcon name="i-lucide-sparkles" class="animate-pulse" />
                    Analyzing with AI...
                  </div>
                  <div v-else-if="item.isProcessed" class="flex items-center gap-2 text-success text-xs">
                    <UIcon name="i-lucide-check-circle" />
                    Processed
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
                icon="i-lucide-sparkles"
                :loading="isSubmitting"
                :disabled="!canSubmit"
                @click="submitCapture"
              >
                {{ hasEvidence ? 'Process & Extract Events' : 'Extract Events' }}
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Step 3a: Processing -->
        <UCard v-else-if="state.step === 'processing'" class="mb-6">
          <div class="py-12 text-center space-y-4">
            <div class="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-primary animate-pulse" />
            </div>
            <div>
              <p class="font-semibold text-lg text-highlighted">Processing Your Capture</p>
              <p class="text-sm text-muted mt-1">{{ state.processingStatus || 'Please wait...' }}</p>
            </div>
            <div class="w-48 mx-auto">
              <div class="h-1.5 bg-muted rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full animate-pulse" style="width: 60%" />
              </div>
            </div>
          </div>
        </UCard>

        <!-- Step 3b: Review -->
        <UCard v-else-if="state.step === 'review'" class="mb-6">
          <template #header>
            <div>
              <p class="font-semibold text-lg text-highlighted">Review Extracted Events</p>
              <p class="text-sm text-muted mt-1">
                Review the events we extracted from your description. Confirm to save them to your timeline.
              </p>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Extracted Events -->
            <div v-if="state.extractionResult?.extraction?.events?.length" class="space-y-4">
              <div
                v-for="(event, index) in state.extractionResult.extraction.events"
                :key="index"
                class="border border-default rounded-lg p-4 space-y-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <p class="font-medium text-highlighted">{{ event.title || 'Untitled Event' }}</p>
                      <UBadge
                        :color="eventColor(event.type)"
                        variant="subtle"
                        size="xs"
                        class="uppercase"
                      >
                        {{ event.type }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted">{{ event.description }}</p>
                  </div>
                  <div class="text-right text-xs text-muted">
                    <p v-if="event.primary_timestamp">
                      {{ new Date(event.primary_timestamp).toLocaleDateString() }}
                    </p>
                    <p v-if="event.location" class="mt-1">{{ event.location }}</p>
                  </div>
                </div>

                <!-- Flags -->
                <div class="flex flex-wrap gap-2">
                  <UBadge v-if="event.child_involved" color="warning" variant="soft" size="xs">
                    Child involved
                  </UBadge>
                  <UBadge v-if="event.custody_relevance?.agreement_violation" color="error" variant="soft" size="xs">
                    Agreement violation
                  </UBadge>
                  <UBadge v-if="event.custody_relevance?.safety_concern" color="error" variant="soft" size="xs">
                    Safety concern
                  </UBadge>
                </div>
              </div>
            </div>

            <!-- No Events -->
            <div v-else class="py-8 text-center">
              <UIcon name="i-lucide-inbox" class="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p class="text-muted">No events were extracted from your description.</p>
            </div>

            <!-- Linked Evidence -->
            <div v-if="hasEvidence && evidenceWithExtractions.length" class="space-y-2">
              <p class="text-xs font-medium text-muted uppercase tracking-wide">Linked Evidence</p>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="(ev, idx) in state.evidence.filter(e => e.isProcessed)"
                  :key="idx"
                  color="info"
                  variant="soft"
                >
                  {{ ev.fileName }}
                </UBadge>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-between">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                @click="goBackToEdit"
              >
                Edit
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-check"
                :loading="isSubmitting"
                :disabled="!state.extractionResult?.extraction?.events?.length"
                @click="confirmAndSave"
              >
                Save Entry
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

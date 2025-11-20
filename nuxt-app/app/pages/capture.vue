<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useObjectUrl } from '@vueuse/core'

const isSupported = ref(true)
const isRecording = ref(false)
const isSubmitting = ref(false)
const hasRecording = ref(false)
const transcript = ref('')
const error = ref<string | null>(null)

const recordingBlob = ref<Blob | null>(null)
const recordingUrl = useObjectUrl(recordingBlob)

let mediaRecorder: MediaRecorder | null = null
let chunks: BlobPart[] = []

const canTranscribe = computed(() => hasRecording.value && !isRecording.value && !isSubmitting.value)

onMounted(() => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    isSupported.value = false
    error.value = 'Audio recording is not supported in this browser.'
  }
})

onBeforeUnmount(() => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
})

async function startRecording() {
  if (!isSupported.value || isRecording.value) {
    return
  }

  error.value = null

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

    chunks = []
    mediaRecorder = new MediaRecorder(stream)

    mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      recordingBlob.value = blob
      hasRecording.value = true

      // Stop all tracks so we release the microphone
      stream.getTracks().forEach(track => track.stop())
    }

    mediaRecorder.start()
    isRecording.value = true
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    error.value = 'Unable to access microphone. Please check your permissions and try again.'
    isRecording.value = false
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording.value && mediaRecorder.state === 'recording') {
    mediaRecorder.stop()
    isRecording.value = false
  }
}

async function toggleRecording() {
  if (!isSupported.value) {
    return
  }

  if (isRecording.value) {
    stopRecording()
  } else {
    await startRecording()
  }
}

async function loadTestAudio(audioFile: string = 'invictus') {
  error.value = null
  isRecording.value = false
  
  try {
    // Map audio file names to their paths
    const audioFiles: Record<string, string> = {
      'invictus': '/invictus.mp3',
      'speech': '/test-speech.wav',
      'music': '/test-audio.mp3'
    }
    
    const filename = audioFiles[audioFile] || '/invictus.mp3'
    const response = await fetch(filename)
    if (!response.ok) {
      throw new Error(`Failed to load ${audioFile} audio`)
    }
    
    const blob = await response.blob()
    recordingBlob.value = blob
    hasRecording.value = true
    transcript.value = ''
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    error.value = `Failed to load ${audioFile} audio file.`
  }
}

async function sendForTranscription() {
  if (!recordingBlob.value || !canTranscribe.value) {
    return
  }

  isSubmitting.value = true
  error.value = null

  try {
    const formData = new FormData()
    // Determine file extension based on MIME type
    let fileExtension = 'webm'
    if (recordingBlob.value.type.includes('mp3')) {
      fileExtension = 'mp3'
    } else if (recordingBlob.value.type.includes('wav')) {
      fileExtension = 'wav'
    }
    formData.append('audio', recordingBlob.value, `recording.${fileExtension}`)

    const response = await $fetch<{ transcript: string }>('/api/transcribe', {
      method: 'POST',
      body: formData as any
    })

    transcript.value = response.transcript
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e)
    error.value = 'Failed to contact transcription service. Please try again.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="capture">
    <template #header>
      <UDashboardNavbar title="Audio Capture Test">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl w-full mx-auto space-y-6">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="font-medium text-highlighted">
                  Audio Capture & Transcription
                </p>
                <p class="text-sm text-muted">
                  Record audio and transcribe it using OpenAI's Whisper model.
                </p>
              </div>
              <UBadge v-if="isRecording" color="warning" variant="subtle">
                Recording…
              </UBadge>
              <UBadge v-else-if="hasRecording" color="info" variant="subtle">
                Ready to transcribe
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <ClientOnly>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  :color="isRecording ? 'error' : 'primary'"
                  :icon="isRecording ? 'i-lucide-square' : 'i-lucide-mic'"
                  :variant="isRecording ? 'solid' : 'solid'"
                  size="lg"
                  :disabled="!isSupported"
                  @click="toggleRecording"
                >
                  <span v-if="isRecording">
                    Stop recording
                  </span>
                  <span v-else>
                    Start recording
                  </span>
                </UButton>

                <UButton
                  color="neutral"
                  variant="outline"
                  :loading="isSubmitting"
                  :disabled="!canTranscribe"
                  icon="i-lucide-sparkles"
                  @click="sendForTranscription"
                >
                  Transcribe with AI
                </UButton>
                
                <UDropdownMenu 
                  :items="[
                    [{
                      label: 'Invictus Poem',
                      icon: 'i-lucide-book-open',
                      onSelect: () => loadTestAudio('invictus')
                    }],
                    [{
                      label: 'Speech Sample',
                      icon: 'i-lucide-mic-2',
                      onSelect: () => loadTestAudio('speech')
                    }],
                    [{
                      label: 'Music Sample',
                      icon: 'i-lucide-music',
                      onSelect: () => loadTestAudio('music')
                    }]
                  ]"
                  :disabled="isRecording || isSubmitting"
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-download"
                    trailing-icon="i-lucide-chevron-down"
                    :disabled="isRecording || isSubmitting"
                  >
                    Load test audio
                  </UButton>
                </UDropdownMenu>
              </div>

              <div
                v-if="hasRecording && recordingUrl"
                class="space-y-1 pt-1"
              >
                <p class="text-sm text-muted">
                  Preview recording
                </p>
                <audio
                  :src="recordingUrl"
                  controls
                  class="w-full"
                />
              </div>

              <template #fallback>
                <p class="text-sm text-muted">
                  Audio capture controls are only available in the browser.
                </p>
              </template>
            </ClientOnly>

            <div class="space-y-2">
              <p class="text-sm font-medium text-highlighted">
                Transcript
              </p>
              <UTextarea
                :model-value="transcript || 'Transcript will appear here after transcription.'"
                color="neutral"
                variant="subtle"
                readonly
                :rows="6"
                class="w-full"
              />
            </div>

            <UAlert
              v-if="error"
              color="error"
              variant="subtle"
              title="Something went wrong"
              :description="error"
            />

            <UAlert
              v-else-if="!isSupported"
              color="warning"
              variant="subtle"
              title="Audio capture not available"
              description="Your browser does not support microphone access. Try using a modern browser like Chrome, Edge, or Safari."
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>



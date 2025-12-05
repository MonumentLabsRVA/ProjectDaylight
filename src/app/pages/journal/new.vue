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
  return state.value.eventText.trim().length > 0
})

const effectiveEventText = computed(() => {
  return state.value.eventText.trim()
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

    const newTranscript = response.transcript?.trim()

    if (newTranscript) {
      const existing = state.value.eventText.trim()
      state.value.eventText = existing
        ? `${existing}\n\n${newTranscript}`
        : newTranscript
    }
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
    if (item.annotation.trim()) {
      formData.append('annotation', item.annotation.trim())
    }

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
      description: 'Processing should take about 30 seconds. You\'ll be notified when complete.',
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
    incident: `What a stressful day. I need to document everything while it's still fresh in my mind.

This morning started off okay. I got the kids up at 7:00 AM for school like usual. Sarah seemed tired and said she didn't sleep well at dad's house over the weekend. When I asked why, she said "Daddy's new girlfriend was over and they were being loud until really late." I didn't push her on it but made a mental note. Tommy didn't want to eat breakfast and when I checked his backpack, I found the homework folder I sent with him on Friday was completely empty - none of the assignments were done.

I texted Michael at 8:15 AM asking about the homework situation. His response was just "they said they didn't have any" which is frustrating because I specifically told him about the math worksheet and reading log when I dropped them off. I have the text screenshots saved.

The real issue happened this evening. Per our custody agreement, Michael was supposed to drop the kids off at my house at 6:00 PM. By 6:30 PM he still hadn't shown up and wasn't responding to my calls or texts. I sent three text messages and called twice - no answer. I was starting to get really worried.

He finally pulled into the driveway at 7:15 PM - over an hour late with no explanation or advance notice. When I went outside to get the kids, I immediately noticed he seemed off. His eyes were red and he was slurring his words slightly. When he got close to hand me Sarah's bag, I could definitely smell alcohol on his breath. It wasn't subtle.

I asked him if he'd been drinking and he got defensive and said "I had one beer at dinner, relax." But based on his behavior it seemed like more than that. I didn't want to start a fight in front of the kids so I just took them inside.

Once we were inside, the kids both seemed upset. Tommy was crying and said his tummy hurt. When I asked if they'd eaten dinner, Sarah said "No, daddy said we'd eat when we got home but then he forgot and we just watched TV." So they hadn't eaten since lunch. I made them sandwiches right away and they both scarfed them down like they were starving.

While I was making dinner, Sarah told me more about the weekend. She said Michael's girlfriend Amanda was there the whole time and that Amanda yelled at Tommy for spilling juice on Saturday. Sarah said Tommy cried and Michael didn't do anything about it. I'm concerned about this new person being around my kids and how she's treating them.

I checked Sarah's overnight bag and her clothes from Friday were still in there, unworn - meaning she wore the same outfit all weekend. Tommy's bag was missing his toothbrush entirely. These might seem like small things but it's part of a pattern of neglect I've been noticing.

I took photos of the clock when he arrived (7:15 PM), saved all the text messages, and made notes about the alcohol smell and the kids' statements. I also took a picture of Tommy's empty homework folder and Sarah's unchanged overnight bag. My neighbor Janet was outside gardening and saw the whole exchange - she mentioned to me later that she thought Michael "looked intoxicated." I should ask her if she'd be willing to write a statement.

The kids are in bed now. Tomorrow is a school day and I'm going to have to email Mrs. Patterson about the missing homework again. This is the third time this has happened when they've come back from his house.

I really need to talk to my lawyer about this. The pattern is getting worse. Late drop-offs, not feeding them, not doing homework, possible drinking and driving with the kids in the car. I'm scared for their safety.`,

    positive: `Today was such a wonderful day with the kids and I want to write it all down so I remember it.

We started the morning slowly since it's Saturday. I let the kids sleep in until about 8:30 AM, then we all made pancakes together as a family. Sarah mixed the batter and Tommy got to flip one (with my help of course). We made them into fun shapes - Tommy wanted a dinosaur and Sarah made a heart. They both ate a full breakfast which made me happy since sometimes getting them to eat in the morning is a struggle.

After breakfast, we did some tidying up around the house. I've been trying to teach them responsibility with age-appropriate chores. Sarah helped me sort laundry and Tommy's job was to put all his toys back in his toy bin. They did great and I gave them each a sticker for their chore charts.

Around 10:30 AM, we headed to the library for their Saturday morning story time. Sarah has been really into chapter books lately, so we spent some extra time in the kids' section. She checked out three books from the Magic Tree House series. Tommy picked out two picture books about trucks. The librarian, Mrs. Chen, commented on how well-behaved they were and what good readers they're becoming. That made me so proud.

For lunch, we had a picnic at Memorial Park. The weather was perfect - sunny but not too hot. The kids played on the playground for about an hour. Tommy made a new friend, a little boy named Marcus, and they played on the swings together. I got some great photos of both kids on the slide and swings. Sarah found a "fairy garden" near some trees and spent a long time examining bugs and leaves. I love seeing her curiosity about nature.

The big highlight of the day happened around 3:00 PM. Tommy has been working on riding his bike without training wheels for weeks. We've been practicing in the driveway after school. Today, something just clicked - he took off down the sidewalk, pedaling all by himself, without any help from me! He was so proud of himself he was literally jumping up and down afterward. I recorded a video of him riding and called my mom so he could tell her all about it. Sarah was cheering him on the whole time, being such a supportive big sister.

We came home and I let them have some screen time while I made dinner - chicken nuggets and veggie sticks, their favorite. During dinner, we talked about their week and what they're looking forward to. Sarah has a spelling test on Wednesday and she's been studying hard. Tommy is excited about show-and-tell on Friday - he wants to bring his new bike helmet to show his class.

After dinner, we had a family game night and played Candy Land. Tommy won the first game and Sarah won the second. No fighting or meltdowns, which doesn't always happen, so that was nice.

Bath time was smooth. I let them have a few extra minutes to play with their bath toys. Tommy's been really into his rubber ducks lately. Sarah likes to practice holding her breath underwater.

We read two bedtime stories - "Goodnight Moon" for Tommy and a chapter from Sarah's new library book. Both kids were asleep by 8:00 PM on the dot. 

I'm so grateful for days like this. The kids seem happy, healthy, and well-adjusted. We have a good routine going. I want to document these positive moments too, not just the difficult ones. Days like today remind me why I'm fighting so hard in this custody situation - to give my kids stability, structure, and lots of love.

Tomorrow is church in the morning, then Michael picks them up at 5:00 PM for his week. I've already packed their bags with everything they need - clothes for each day, toothbrushes, homework folders, their favorite stuffed animals. I included a note with their school schedule and Sarah's spelling words.`,

    neutral: `Standard weekly custody exchange today. Want to document it since I'm trying to keep records of everything.

Per our court-ordered custody agreement, the exchange was scheduled for 5:00 PM at the Walmart parking lot on Main Street. This is the neutral location we agreed to use.

I arrived at 4:50 PM and parked in our usual spot near the garden center entrance. I had both kids with me - Sarah (8) and Tommy (5). They had their overnight bags packed with:
- 5 days worth of clothes each
- Pajamas
- Toothbrushes and toothpaste  
- Sarah's homework folder with her assignments for the week
- Tommy's show-and-tell item (his toy fire truck)
- Their favorite stuffed animals (Sarah's bunny, Tommy's bear)
- A note with upcoming school events and reminders

Michael pulled in at 5:02 PM, so just a couple minutes late but nothing significant. He parked next to my car as usual.

The exchange itself was brief and civil. Michael asked how the kids' week was and I gave him a quick update - Sarah has a spelling test Wednesday and Tommy has a dentist appointment next Thursday at 3:30 PM that I'll be taking him to. He acknowledged both and said he'd remind Sarah to study.

The kids gave me hugs and said goodbye. They seemed comfortable and didn't show any hesitation about going with their dad, which is good. Tommy was excited to tell his dad about learning to ride his bike without training wheels.

We didn't discuss anything contentious. I avoided bringing up the late drop-off from two weeks ago since I've already documented that and sent it to my lawyer. Keeping exchanges neutral and conflict-free is what the parenting coordinator recommended.

Exchange completed at 5:08 PM. Kids were with their dad and I drove home.

A few observations for the record:
- Michael appeared sober and appropriate
- His car looked clean and had proper car seats installed
- He was polite and didn't make any negative comments
- The kids' demeanor was normal

I'll get the kids back next Sunday at 6:00 PM at the same location. I've already marked it in my calendar and set a reminder. I also sent Michael a confirmation text about the pickup time and he acknowledged it.

Nothing concerning to report from this exchange. Just want to keep the documentation consistent whether things go well or poorly.`
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
                This becomes a journal entry and timeline events. Start by writing what happened, then optionally add to it with your voice.
              </p>
            </div>
          </template>

          <div class="space-y-6" :class="{ 'opacity-50 pointer-events-none': isFree && !canCreateJournalEntry }">
            <!-- Text Input (Primary) -->
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

            <!-- Voice Recording (Secondary, augments text input) -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-muted">
                  Optional: Use your voice to add more detail to this note. The transcript will appear in the same box above.
                </p>
                <UBadge v-if="state.isRecording" color="error" variant="subtle" class="animate-pulse">
                  Recording...
                </UBadge>
              </div>

              <ClientOnly>
                <div class="flex flex-wrap items-center gap-3">
                  <UButton
                    :color="state.isRecording ? 'error' : 'primary'"
                    :icon="state.isRecording ? 'i-lucide-square' : 'i-lucide-mic'"
                    size="md"
                    :disabled="!canRecord"
                    @click="toggleRecording"
                  >
                    {{ state.isRecording ? 'Stop Recording' : 'Record with voice' }}
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
                    Transcribe into note
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




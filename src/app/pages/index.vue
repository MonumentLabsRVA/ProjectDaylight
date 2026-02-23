<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

definePageMeta({
  layout: 'landing'
})

// Custom title for landing page - template will pass it through since it contains "Daylight"
useHead({
  title: 'Daylight – Just talk. We handle the rest.',
  titleTemplate: '' // Override template to use exact title for landing
})

useSeoMeta({
  description: 'Stop carrying custody documentation in your head. Daylight turns voice notes into organized timelines your lawyer can actually use.',
  ogTitle: 'Daylight – Just talk. We handle the rest.',
  ogDescription: 'Stop carrying custody documentation in your head. Daylight turns voice notes into organized timelines your lawyer can actually use.'
})

const steps = [
  {
    number: '01',
    title: 'Talk into your phone',
    description: 'Record what happened, when it happened. No formatting, no organizing—just talk.'
  },
  {
    number: '02',
    title: 'We transcribe and extract',
    description: 'AI turns your voice into timestamped events. Names, dates, and details—all captured.'
  },
  {
    number: '03',
    title: 'Export when needed',
    description: 'Your lawyer gets a clean timeline. No shoeboxes of screenshots. Just what they need.'
  }
]

const capabilities = [
  {
    icon: 'i-lucide-scan-text',
    title: 'AI reads your screenshots',
    description: 'Upload a text screenshot. We OCR it, extract every message, and identify who said what.'
  },
  {
    icon: 'i-lucide-alert-triangle',
    title: 'Flags what matters',
    description: 'Broken promises, safety concerns, missed handoffs—AI detects patterns you might miss.'
  },
  {
    icon: 'i-lucide-link',
    title: 'Links to your timeline',
    description: 'Every screenshot becomes a searchable event with dates, participants, and context.'
  }
]

// Evidence demo mock data
const evidenceScreenshot = {
  filename: 'text_marcus_nov23.png',
  uploadTime: '3 seconds ago'
}

const aiExtractionSteps = ref([
  {
    visible: false,
    icon: 'i-lucide-scan',
    label: 'Reading screenshot...',
    status: 'processing',
    detail: null
  },
  {
    visible: false,
    icon: 'i-lucide-type',
    label: 'Text extracted',
    status: 'complete',
    detail: '4 messages found'
  },
  {
    visible: false,
    icon: 'i-lucide-users',
    label: 'Participants identified',
    status: 'complete',
    detail: 'Marcus → You'
  },
  {
    visible: false,
    icon: 'i-lucide-alert-circle',
    label: 'Concern detected',
    status: 'flagged',
    detail: 'Possible custody schedule violation'
  }
])

const extractedEvidence = ref({
  visible: false,
  summary: 'Text exchange regarding late pickup. Marcus claims traffic delay, contradicted by user\'s observation.',
  tags: ['custody', 'late-pickup', 'text-message', 'schedule-violation'],
  timeline_event: {
    type: 'communication',
    title: 'Schedule change dispute',
    timestamp: 'Nov 23, 6:15 PM'
  },
  flags: {
    agreement_violation: true,
    child_involved: true
  }
})

let evidenceAnimationTimeouts: ReturnType<typeof setTimeout>[] = []

// Animate evidence extraction steps
const startEvidenceAnimation = () => {
  // Reset
  aiExtractionSteps.value.forEach(s => s.visible = false)
  extractedEvidence.value.visible = false
  
  aiExtractionSteps.value.forEach((_, index) => {
    const timeout = setTimeout(() => {
      const step = aiExtractionSteps.value[index]
      if (step) step.visible = true
    }, 800 + (index * 600))
    evidenceAnimationTimeouts.push(timeout)
  })
  
  // Show final result
  const finalTimeout = setTimeout(() => {
    extractedEvidence.value.visible = true
  }, 800 + (aiExtractionSteps.value.length * 600) + 400)
  evidenceAnimationTimeouts.push(finalTimeout)
}

// Start animation on mount (after voice animation completes)
const initEvidenceAnimation = () => {
  setTimeout(() => {
    startEvidenceAnimation()
  }, 5000) // Start after voice demo completes
}

// Court-ready document mock data (now lives in `HomeCourtDocumentPreview`)

// Mock data for voice-to-timeline demo
const voiceTranscript = "So yesterday Marcus was supposed to pick up Emma at 5pm for his weekend visitation, but he didn't show up until almost 7:30. Emma was really upset, she'd been waiting by the window. He texted me at 6:15 saying traffic was bad but I checked Google Maps and there wasn't any traffic. This is the third time this month."

const extractedEvents = ref([
  { 
    visible: false,
    time: 'Nov 23, 5:00 PM', 
    type: 'incident',
    title: 'Missed scheduled pickup', 
    detail: 'Marcus failed to arrive at scheduled 5:00 PM pickup time',
    color: 'error'
  },
  { 
    visible: false,
    time: 'Nov 23, 6:15 PM', 
    type: 'communication',
    title: 'Text received', 
    detail: '"Traffic was bad" - contradicts traffic data',
    color: 'warning'
  },
  { 
    visible: false,
    time: 'Nov 23, 7:30 PM', 
    type: 'incident',
    title: 'Late arrival (2.5 hrs)', 
    detail: 'Actual pickup occurred, child was distressed',
    color: 'error'
  },
  { 
    visible: false,
    time: 'Pattern detected',
    type: 'insight',
    title: '3rd late pickup this month', 
    detail: 'Recurring pattern identified for Nov 2024',
    color: 'info'
  }
])

// Timeline mock data
const timelineEvents = [
  {
    date: 'Nov 24',
    time: '9:15 AM',
    type: 'positive',
    icon: 'i-lucide-heart',
    title: 'Weekend activity',
    description: 'Emma came home happy, showed me artwork from dad\'s house',
    evidence: 2
  },
  {
    date: 'Nov 23',
    time: '7:30 PM',
    type: 'incident',
    icon: 'i-lucide-alert-circle',
    title: 'Late pickup',
    description: '2.5 hours late for scheduled visitation',
    evidence: 3
  },
  {
    date: 'Nov 21',
    time: '3:45 PM',
    type: 'medical',
    icon: 'i-lucide-stethoscope',
    title: 'Pediatrician visit',
    description: 'Annual checkup - all good, updated vaccination',
    evidence: 1
  },
  {
    date: 'Nov 19',
    time: '6:00 PM',
    type: 'school',
    icon: 'i-lucide-graduation-cap',
    title: 'Parent-teacher conference',
    description: 'Emma doing well in reading, needs math support',
    evidence: 2
  }
]

const typeColors: Record<string, string> = {
  positive: 'success',
  incident: 'error',
  medical: 'info',
  school: 'warning'
}


// Animation for extracted events
const waveformBars = ref<number[]>([])
const isRecording = ref(true)
let animationInterval: ReturnType<typeof setInterval> | null = null
let eventRevealTimeout: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  // Generate random waveform bars
  waveformBars.value = Array.from({ length: 40 }, () => Math.random() * 100)

  // Animate waveform
  animationInterval = setInterval(() => {
    if (isRecording.value) {
      waveformBars.value = waveformBars.value.map(() => 20 + Math.random() * 80)
    }
  }, 150)

  // Reveal events one by one
  extractedEvents.value.forEach((_, index) => {
    const timeout = setTimeout(() => {
      const event = extractedEvents.value[index]
      if (event) event.visible = true
    }, 1500 + index * 800)
    eventRevealTimeout.push(timeout)
  })

  // Start evidence animation
  initEvidenceAnimation()
})

onUnmounted(() => {
  if (animationInterval) clearInterval(animationInterval)
  eventRevealTimeout.forEach(t => clearTimeout(t))
  evidenceAnimationTimeouts.forEach(t => clearTimeout(t))
})
</script>

<template>
  <div class="relative bg-default">
    <!-- Hero Section -->
    <section class="relative overflow-hidden pt-12 pb-20 lg:pt-24 lg:pb-32">
      <UContainer class="relative z-10">
        <div class="mx-auto max-w-4xl text-center">
          <h1 class="text-5xl font-bold tracking-tight text-highlighted sm:text-7xl mb-6">
            <span class="text-primary">Just talk.</span>
            <span class="block text-highlighted">We handle the rest.</span>
          </h1>
          
          <p class="mt-6 text-xl text-muted max-w-2xl mx-auto leading-relaxed">
            Stop carrying custody documentation in your head. Record voice notes, and Daylight creates the organized timeline your lawyer can actually use.
          </p>

          <div class="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <UButton
              to="/auth/signup"
              size="xl"
              color="primary"
              class="px-8 py-4 text-lg font-semibold shadow-xl shadow-primary/20 rounded-full"
            >
              Start documenting free
              <template #trailing>
                <UIcon name="i-lucide-arrow-right" class="size-5" />
              </template>
            </UButton>
            
            <!-- TODO: Add social proof once we have real users -->
            <!--
            <div class="flex items-center gap-2 text-sm text-muted mt-4 sm:mt-0 sm:ml-6">
              <div class="flex -space-x-2">
                <div class="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-bold text-gray-600">JD</div>
                <div class="w-8 h-8 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-xs font-bold text-gray-600">SM</div>
                <div class="w-8 h-8 rounded-full bg-gray-400 border-2 border-white flex items-center justify-center text-xs font-bold text-gray-600">RK</div>
              </div>
              <span>Trusted by 2,000+ parents</span>
            </div>
            -->
          </div>

          <!-- Trust Badges -->
          <div class="mt-12 flex flex-wrap justify-center gap-4 sm:gap-8 text-sm font-medium text-muted">
            <div class="flex items-center gap-2 bg-elevated px-4 py-2 rounded-full border border-default">
              <UIcon name="i-lucide-shield-check" class="size-5 text-primary" />
              <span>Bank-level encryption</span>
            </div>
            <div class="flex items-center gap-2 bg-elevated px-4 py-2 rounded-full border border-default">
              <UIcon name="i-lucide-scale" class="size-5 text-primary" />
              <span>Attorney recommended</span>
            </div>
            <div class="flex items-center gap-2 bg-elevated px-4 py-2 rounded-full border border-default">
              <UIcon name="i-lucide-check-circle" class="size-5 text-primary" />
              <span>Admissible evidence</span>
            </div>
          </div>
        </div>

        <!-- Hero Image/Mockup - Centered -->
        <div class="mt-16 sm:mt-24 relative mx-auto max-w-5xl">
          <div class="grid lg:grid-cols-2 gap-8 items-center p-4 lg:p-6">
            <div class="order-2 lg:order-1 flex justify-center">
              <HomeHeroPhoneMockup />
            </div>
            <div class="order-1 lg:order-2 space-y-6">
              <div class="bg-elevated p-6 rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UIcon name="i-lucide-mic" class="size-5" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-highlighted">Voice to Timeline</h3>
                    <p class="text-sm text-muted">You talk, we type and organize.</p>
                  </div>
                </div>
              </div>
              <div class="bg-elevated p-6 rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UIcon name="i-lucide-search" class="size-5" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-highlighted">Searchable Evidence</h3>
                    <p class="text-sm text-muted">Find exactly what you need, instantly.</p>
                  </div>
                </div>
              </div>
              <div class="bg-elevated p-6 rounded-xl">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UIcon name="i-lucide-file-text" class="size-5" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-highlighted">Court-Ready Exports</h3>
                    <p class="text-sm text-muted">Generate professional PDFs in seconds.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- TODO: Testimonials section — uncomment and populate once we have real user feedback
    <section class="py-24 bg-muted border-y border-default">
        <UContainer>
            <div class="text-center mb-16">
                <h2 class="text-3xl font-bold tracking-tight text-highlighted">Trusted by parents navigating custody</h2>
                <p class="mt-4 text-lg text-muted">Don't just take our word for it.</p>
            </div>
            <div class="grid md:grid-cols-3 gap-8">
                <div class="bg-default p-8 rounded-2xl shadow-sm border border-default">
                    <div class="flex gap-1 text-yellow-400 mb-4">stars</div>
                    <p class="text-toned mb-6">"Quote here"</p>
                    <div class="font-medium text-highlighted">Name</div>
                    <div class="text-sm text-muted">Role</div>
                </div>
            </div>
        </UContainer>
    </section>
    -->

    <!-- How It Works (Simplified) -->
    <section id="how-it-works" class="py-24 bg-default">
      <UContainer>
        <div class="mx-auto max-w-2xl text-center mb-16">
          <h2 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
            Documentation without the headache
          </h2>
          <p class="mt-4 text-lg text-muted">
            Three simple steps to a court-ready timeline.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-12">
            <div v-for="step in steps" :key="step.number" class="text-center group">
                <div class="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-bold text-xl mb-6 group-hover:scale-110 transition-transform duration-300">
                    {{ step.number }}
                </div>
                <h3 class="text-xl font-bold text-highlighted mb-3">{{ step.title }}</h3>
                <p class="text-muted leading-relaxed">{{ step.description }}</p>
            </div>
        </div>
      </UContainer>
    </section>

    <!-- Voice to Timeline -->
    <section class="py-24 bg-muted overflow-hidden">
      <UContainer>
        <div class="grid lg:grid-cols-2 gap-16 items-center">
            <div>
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                    <UIcon name="i-lucide-mic" class="size-4" />
                    <span>Voice to Timeline</span>
                </div>
                <h2 class="text-4xl font-bold text-highlighted mb-6">You talk. We organize.</h2>
                <p class="text-lg text-muted mb-8">Record what happened, when it happened. No formatting, no organizing—just talk. Our AI extracts the dates, times, and details for you.</p>
                
                <ul class="space-y-4 mb-8">
                    <li class="flex items-start gap-3">
                        <UIcon name="i-lucide-check-circle" class="size-6 text-primary shrink-0" />
                        <span class="text-toned">Instant transcription and extraction</span>
                    </li>
                    <li class="flex items-start gap-3">
                        <UIcon name="i-lucide-check-circle" class="size-6 text-primary shrink-0" />
                        <span class="text-toned">Automatic timeline creation</span>
                    </li>
                    <li class="flex items-start gap-3">
                        <UIcon name="i-lucide-check-circle" class="size-6 text-primary shrink-0" />
                        <span class="text-toned">Secure and private</span>
                    </li>
                </ul>

                <UButton to="/auth/signup" color="primary" size="lg" class="rounded-full px-8">Try it now</UButton>
            </div>
            
            <!-- Voice Demo Component -->
            <div class="relative">
                 <div class="rounded-2xl border border-default bg-default p-6 shadow-xl">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                        <div class="flex size-10 items-center justify-center rounded-full bg-error/10">
                            <UIcon name="i-lucide-mic" class="size-5 text-error" />
                        </div>
                        <div>
                            <p class="text-sm font-medium text-highlighted">Voice Note</p>
                            <p class="text-xs text-dimmed">Recording • 0:47</p>
                        </div>
                        </div>
                        <div class="flex items-center gap-1.5 text-xs text-dimmed">
                        <UIcon name="i-lucide-calendar" class="size-3.5" />
                        Nov 24, 2024
                        </div>
                    </div>
                    
                    <!-- Waveform visualization -->
                    <div class="flex h-12 items-center gap-0.5 rounded-lg bg-elevated/50 px-3">
                        <div
                        v-for="(height, i) in waveformBars"
                        :key="i"
                        class="flex-1 rounded-full bg-primary/60 transition-all duration-150"
                        :style="{ height: `${Math.max(8, height * 0.4)}px` }"
                        />
                    </div>

                    <!-- Transcript preview -->
                    <div class="mt-4 rounded-lg bg-elevated/30 p-4">
                        <p class="text-xs font-medium text-dimmed uppercase tracking-wider mb-2">Transcript</p>
                        <p class="text-sm text-muted leading-relaxed italic">
                        "{{ voiceTranscript }}"
                        </p>
                    </div>
                </div>
                
                <!-- Extracted Events Overlay/Side -->
                <div class="mt-6 space-y-3">
                    <div
                        v-for="(event, index) in extractedEvents"
                        :key="index"
                        class="rounded-xl border border-default bg-default p-4 shadow-sm transition-all duration-500"
                        :class="event.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
                    >
                        <div class="flex items-start gap-4">
                        <!-- Type indicator -->
                        <div 
                            class="flex size-9 shrink-0 items-center justify-center rounded-lg"
                            :class="{
                            'bg-error/10': event.color === 'error',
                            'bg-warning/10': event.color === 'warning',
                            'bg-info/10': event.color === 'info'
                            }"
                        >
                            <UIcon 
                            :name="event.type === 'incident' ? 'i-lucide-alert-circle' : event.type === 'communication' ? 'i-lucide-message-square' : 'i-lucide-lightbulb'"
                            class="size-4"
                            :class="{
                                'text-error': event.color === 'error',
                                'text-warning': event.color === 'warning',
                                'text-info': event.color === 'info'
                            }"
                            />
                        </div>
                        
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between gap-2">
                            <p class="font-medium text-highlighted text-sm">{{ event.title }}</p>
                            <span class="shrink-0 text-xs text-dimmed font-mono">{{ event.time }}</span>
                            </div>
                            <p class="mt-1 text-sm text-muted">{{ event.detail }}</p>
                        </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </UContainer>
    </section>

    <!-- Evidence Section -->
    <section class="py-24 bg-default">
      <UContainer>
        <div class="grid lg:grid-cols-2 gap-16 items-center">
            <!-- Left: Evidence Demo -->
            <div class="order-2 lg:order-1 space-y-4">
                <!-- Upload card -->
                <div class="rounded-xl border border-default bg-elevated p-5 shadow-lg">
                    <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="flex size-10 items-center justify-center rounded-lg bg-info/10">
                        <UIcon name="i-lucide-image" class="size-5 text-info" />
                        </div>
                        <div>
                        <p class="text-sm font-medium text-highlighted">{{ evidenceScreenshot.filename }}</p>
                        <p class="text-xs text-dimmed">Uploaded {{ evidenceScreenshot.uploadTime }}</p>
                        </div>
                    </div>
                    <UBadge color="success" variant="subtle" size="xs">
                        Processing
                    </UBadge>
                    </div>

                    <!-- Mock screenshot preview -->
                    <div class="rounded-lg border border-default bg-muted/30 p-4 font-mono text-xs space-y-2">
                    <div class="flex gap-2">
                        <span class="text-dimmed">6:15 PM</span>
                        <span class="text-highlighted font-medium">Marcus:</span>
                        <span class="text-muted">Traffic was really bad, sorry</span>
                    </div>
                    <div class="flex gap-2">
                        <span class="text-dimmed">6:18 PM</span>
                        <span class="text-primary font-medium">You:</span>
                        <span class="text-muted">You were supposed to be here at 5. Emma was crying.</span>
                    </div>
                    <div class="flex gap-2">
                        <span class="text-dimmed">6:22 PM</span>
                        <span class="text-highlighted font-medium">Marcus:</span>
                        <span class="text-muted">I said I'm sorry. I'll be there by 7.</span>
                    </div>
                    <div class="flex gap-2">
                        <span class="text-dimmed">6:23 PM</span>
                        <span class="text-primary font-medium">You:</span>
                        <span class="text-muted">This is the third time this month.</span>
                    </div>
                    </div>
                </div>

                <!-- AI Extraction progress -->
                <div class="rounded-xl border border-default bg-default p-5 shadow-sm">
                    <div class="flex items-center gap-2 mb-4">
                    <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
                    <p class="text-sm font-medium text-highlighted">AI Analysis</p>
                    </div>

                    <div class="space-y-3">
                    <div
                        v-for="(step, index) in aiExtractionSteps"
                        :key="index"
                        class="flex items-center gap-3 transition-all duration-500"
                        :class="step.visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'"
                    >
                        <div 
                        class="flex size-7 items-center justify-center rounded-full"
                        :class="{
                            'bg-primary/10': step.status === 'processing',
                            'bg-success/10': step.status === 'complete',
                            'bg-warning/10': step.status === 'flagged'
                        }"
                        >
                        <UIcon 
                            :name="step.status === 'processing' ? 'i-lucide-loader-2' : step.status === 'flagged' ? 'i-lucide-alert-triangle' : 'i-lucide-check'"
                            class="size-3.5"
                            :class="{
                            'text-primary animate-spin': step.status === 'processing',
                            'text-success': step.status === 'complete',
                            'text-warning': step.status === 'flagged'
                            }"
                        />
                        </div>
                        <div class="flex-1 min-w-0">
                        <p class="text-sm text-highlighted">{{ step.label }}</p>
                        <p v-if="step.detail" class="text-xs text-muted">{{ step.detail }}</p>
                        </div>
                    </div>
                    </div>
                </div>

                <!-- Extracted evidence result -->
                <div 
                    class="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 transition-all duration-500"
                    :class="extractedEvidence.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
                >
                    <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <UIcon name="i-lucide-file-check" class="size-4 text-primary" />
                        <p class="text-sm font-semibold text-highlighted">Evidence Created</p>
                    </div>
                    <UBadge color="primary" variant="subtle" size="xs">
                        Added to timeline
                    </UBadge>
                    </div>

                    <p class="text-sm text-muted mb-3">{{ extractedEvidence.summary }}</p>

                    <!-- Tags -->
                    <div class="flex flex-wrap gap-1.5 mb-3">
                    <UBadge
                        v-for="tag in extractedEvidence.tags"
                        :key="tag"
                        color="neutral"
                        variant="outline"
                        size="xs"
                    >
                        {{ tag }}
                    </UBadge>
                    </div>

                    <!-- Flags -->
                    <div class="flex items-center gap-3 pt-3 border-t border-primary/20">
                    <div v-if="extractedEvidence.flags.agreement_violation" class="flex items-center gap-1.5">
                        <UIcon name="i-lucide-alert-circle" class="size-3.5 text-warning" />
                        <span class="text-xs text-warning font-medium">Schedule violation</span>
                    </div>
                    <div v-if="extractedEvidence.flags.child_involved" class="flex items-center gap-1.5">
                        <UIcon name="i-lucide-user" class="size-3.5 text-info" />
                        <span class="text-xs text-info font-medium">Child involved</span>
                    </div>
                    </div>
                </div>
            </div>

            <!-- Right: Content -->
            <div class="order-1 lg:order-2">
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                    <UIcon name="i-lucide-scan-text" class="size-4" />
                    <span>Screenshot Analysis</span>
                </div>
                <h2 class="text-4xl font-bold text-highlighted mb-6">Screenshot it. AI does the rest.</h2>
                <p class="text-lg text-muted mb-8">Every text screenshot, every email, every photo—just upload it. Our AI reads the image, extracts every word, identifies who said what, and flags anything your lawyer needs to see.</p>
                
                <div class="space-y-6">
                    <div v-for="capability in capabilities" :key="capability.title" class="flex gap-4">
                        <div class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <UIcon :name="capability.icon" class="size-6" />
                        </div>
                        <div>
                            <h3 class="font-semibold text-highlighted text-lg">{{ capability.title }}</h3>
                            <p class="text-muted">{{ capability.description }}</p>
                        </div>
                    </div>
                </div>

                <div class="mt-10">
                    <UButton to="/auth/signup" color="primary" size="lg" class="rounded-full px-8">Start uploading evidence</UButton>
                </div>
            </div>
        </div>
      </UContainer>
    </section>
    
    <HomeCourtDocumentPreview />

    <!-- For Attorneys Section -->
    <section class="border-t border-default bg-default py-24">
      <UContainer>
        <div class="mx-auto max-w-6xl">
          <div class="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <!-- Left: Content -->
            <div>
              <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <UIcon name="i-lucide-scale" class="size-3.5" />
                For Family Law Attorneys
              </div>

              <h2 class="mt-6 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
                Better client documentation.<br />
                <span class="text-muted">Better outcomes.</span>
              </h2>

              <p class="mt-6 text-lg leading-relaxed text-toned">
                Stop getting chaotic folders of screenshots before hearings. Give your clients Daylight—they document as they go, you get organized timelines you can actually use.
              </p>

              <!-- Benefits list -->
              <div class="mt-8 space-y-4">
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <UIcon name="i-lucide-check" class="size-3 text-success" />
                  </div>
                  <div>
                    <p class="font-medium text-highlighted">Chronological timelines ready for court</p>
                    <p class="text-sm text-muted">Events organized with dates, times, and linked evidence</p>
                  </div>
                </div>
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <UIcon name="i-lucide-check" class="size-3 text-success" />
                  </div>
                  <div>
                    <p class="font-medium text-highlighted">PDF exports formatted for filings</p>
                    <p class="text-sm text-muted">Professional documentation that judges can follow</p>
                  </div>
                </div>
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <UIcon name="i-lucide-check" class="size-3 text-success" />
                  </div>
                  <div>
                    <p class="font-medium text-highlighted">Clients capture in real-time</p>
                    <p class="text-sm text-muted">No more "I forgot to write it down" at meetings</p>
                  </div>
                </div>
              </div>

              <div class="mt-10">
                <UButton
                  to="/auth/signup"
                  size="lg"
                  color="neutral"
                  variant="soft"
                  class="rounded-full px-8"
                >
                  Partner with us
                  <template #trailing>
                    <UIcon name="i-lucide-arrow-right" class="size-4" />
                  </template>
                </UButton>
              </div>
            </div>

            <!-- Right: Lawyer Client Photo -->
            <div class="lg:pl-8">
              <div class="relative overflow-hidden rounded-2xl shadow-2xl">
                <img
                  src="/romain-dancre-doplSDELX7E-unsplash.jpg"
                  alt="Professional signing legal documents"
                  class="w-full h-auto object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Security Section -->
    <section class="border-t border-default bg-muted py-24">
      <UContainer>
        <div class="mx-auto max-w-5xl">
          <div class="text-center mb-12">
            <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
              <UIcon name="i-lucide-shield-check" class="size-3.5" />
              Your data is protected
            </div>
            <h2 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
              One less thing to worry about.
            </h2>
            <p class="mt-4 text-lg text-muted max-w-2xl mx-auto">
              You're dealing with enough stress. We built Daylight with serious security from day one, so you can focus on your case—not your data.
            </p>
          </div>

          <div class="grid gap-8 md:grid-cols-3">
            <div class="text-center space-y-3">
              <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-lock" class="size-6" />
              </div>
              <h3 class="font-semibold text-highlighted">Encrypted everywhere</h3>
              <p class="text-sm text-muted">Your recordings, screenshots, and notes are encrypted in transit and at rest. Nobody can read them but you.</p>
            </div>

            <div class="text-center space-y-3">
              <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-user-check" class="size-6" />
              </div>
              <h3 class="font-semibold text-highlighted">Your data stays yours</h3>
              <p class="text-sm text-muted">We don't sell your information. Ever. Your evidence is isolated and only accessible to you.</p>
            </div>

            <div class="text-center space-y-3">
              <div class="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-database-backup" class="size-6" />
              </div>
              <h3 class="font-semibold text-highlighted">Backed up daily</h3>
              <p class="text-sm text-muted">Automatic backups mean your documentation is safe. No lost evidence, no accidents, no worries.</p>
            </div>
          </div>

          <div class="mt-10 text-center">
            <NuxtLink to="/security" class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              Learn more about our security
              <UIcon name="i-lucide-arrow-right" class="size-3.5" />
            </NuxtLink>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Final CTA -->
    <section class="border-t border-default bg-elevated py-24 text-center">
      <UContainer>
        <div class="mx-auto max-w-2xl">
          <h2 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
            Stop carrying this in your head.
          </h2>
          <p class="mt-4 text-lg text-muted">
            Sign up. Press record. Talk. Done.
          </p>

          <div class="mt-10">
            <UButton
              to="/auth/signup"
              size="xl"
              color="primary"
              variant="solid"
              class="px-8 rounded-full font-bold"
            >
              Start documenting
              <template #trailing>
                <UIcon name="i-lucide-arrow-right" class="size-4" />
              </template>
            </UButton>
            <p class="mt-6 text-sm text-dimmed">No credit card required • Cancel anytime</p>
          </div>
        </div>
      </UContainer>
    </section>
  </div>
</template>

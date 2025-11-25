<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const phoneTimelineEvents = ref([
  {
    visible: false,
    time: '7:30 PM',
    type: 'incident',
    icon: 'i-lucide-alert-circle',
    title: 'Late pickup (2.5 hours)',
    description: 'Arrived 2.5 hours late for scheduled 5pm pickup. Child was distressed.',
    badge: 'Incident',
    evidence: 2
  },
  {
    visible: false,
    time: '3:45 PM',
    type: 'positive',
    icon: 'i-lucide-heart',
    title: 'School conference attended',
    description: 'Met with Ms. Rodriguez. Emma showing improvement in reading.',
    badge: 'Positive',
    evidence: 1
  },
  {
    visible: false,
    time: '10:00 AM',
    type: 'medical',
    icon: 'i-lucide-stethoscope',
    title: 'Dental checkup complete',
    description: 'No cavities. Next appointment scheduled for May.',
    badge: 'Medical',
    evidence: 1
  },
  {
    visible: false,
    time: '8:15 PM',
    type: 'communication',
    icon: 'i-lucide-message-square',
    title: 'Schedule change request',
    description: 'Text received requesting weekend swap. No documentation provided.',
    badge: 'Communication',
    evidence: 3
  }
])

let phoneAnimationTimeouts: ReturnType<typeof setTimeout>[] = []

onMounted(() => {
  phoneTimelineEvents.value.forEach((_, index) => {
    const timeout = setTimeout(() => {
      const event = phoneTimelineEvents.value[index]
      if (event) event.visible = true
    }, 600 + index * 400)
    phoneAnimationTimeouts.push(timeout)
  })
})

onUnmounted(() => {
  phoneAnimationTimeouts.forEach(t => clearTimeout(t))
})
</script>

<template>
  <!-- Right: iPhone mockup -->
  <div class="relative flex items-center justify-center">
    <!-- Glow behind phone -->
    <div class="absolute inset-0 flex items-center justify-center">
      <div class="w-72 h-[500px] bg-gradient-to-b from-primary/20 dark:from-primary/30 via-primary/10 dark:via-primary/20 to-transparent rounded-full blur-3xl" />
    </div>

    <!-- iPhone Frame - themed for light/dark -->
    <div class="relative">
      <!-- Phone outer frame -->
      <div
        class="relative w-[280px] sm:w-[300px] h-[580px] sm:h-[620px] bg-neutral-200 dark:bg-neutral-900 rounded-[50px] p-2 shadow-2xl shadow-black/20 dark:shadow-black/50 border border-neutral-300 dark:border-neutral-700/50"
      >
        <!-- Phone inner bezel -->
        <div class="relative w-full h-full bg-neutral-100 dark:bg-neutral-950 rounded-[42px] overflow-hidden">
          <!-- Dynamic Island / Notch -->
          <div
            class="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-7 bg-neutral-900 dark:bg-black rounded-full z-20 flex items-center justify-center gap-2"
          >
            <div class="w-2 h-2 rounded-full bg-neutral-700 dark:bg-neutral-800" />
            <div class="w-3 h-3 rounded-full bg-neutral-700/80 dark:bg-neutral-800/80" />
          </div>

          <!-- Screen content -->
          <div
            class="relative w-full h-full bg-gradient-to-b from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-950 pt-14 overflow-hidden"
          >
            <!-- App header -->
            <div class="px-5 pb-4 border-b border-neutral-200 dark:border-neutral-800/50">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-[10px] text-neutral-500 uppercase tracking-wider font-medium">
                    Your Timeline
                  </p>
                  <p class="text-lg font-semibold text-neutral-900 dark:text-white mt-0.5">
                    November 2025
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <UIcon name="i-lucide-plus" class="size-4 text-primary" />
                  </div>
                </div>
              </div>

              <!-- Quick stats -->
              <div class="flex gap-3 mt-4">
                <div class="flex-1 bg-neutral-200/70 dark:bg-neutral-800/50 rounded-xl px-3 py-2">
                  <p class="text-[10px] text-neutral-500">
                    Events
                  </p>
                  <p class="text-sm font-bold text-neutral-900 dark:text-white">
                    47
                  </p>
                </div>
                <div class="flex-1 bg-neutral-200/70 dark:bg-neutral-800/50 rounded-xl px-3 py-2">
                  <p class="text-[10px] text-neutral-500">
                    Evidence
                  </p>
                  <p class="text-sm font-bold text-neutral-900 dark:text-white">
                    23
                  </p>
                </div>
                <div class="flex-1 bg-neutral-200/70 dark:bg-neutral-800/50 rounded-xl px-3 py-2">
                  <p class="text-[10px] text-neutral-500">
                    Flags
                  </p>
                  <p class="text-sm font-bold text-warning">
                    6
                  </p>
                </div>
              </div>
            </div>

            <!-- Timeline events -->
            <div class="px-4 py-4 space-y-3 overflow-hidden">
              <div
                v-for="(event, index) in phoneTimelineEvents"
                :key="index"
                class="relative transition-all duration-700 ease-out"
                :class="event.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
              >
                <!-- Event card -->
                <div
                  class="bg-white/80 dark:bg-neutral-800/60 backdrop-blur rounded-2xl p-3 border border-neutral-200 dark:border-neutral-700/30"
                  :class="{
                    'border-l-2 border-l-error': event.type === 'incident',
                    'border-l-2 border-l-success': event.type === 'positive',
                    'border-l-2 border-l-info': event.type === 'medical',
                    'border-l-2 border-l-warning': event.type === 'communication'
                  }"
                >
                  <div class="flex items-start gap-3">
                    <div
                      class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      :class="{
                        'bg-error/20': event.type === 'incident',
                        'bg-success/20': event.type === 'positive',
                        'bg-info/20': event.type === 'medical',
                        'bg-warning/20': event.type === 'communication'
                      }"
                    >
                      <UIcon
                        :name="event.icon"
                        class="size-4"
                        :class="{
                          'text-error': event.type === 'incident',
                          'text-success': event.type === 'positive',
                          'text-info': event.type === 'medical',
                          'text-warning': event.type === 'communication'
                        }"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <p class="text-xs font-semibold text-neutral-900 dark:text-white truncate">
                          {{ event.title }}
                        </p>
                        <span class="text-[10px] text-neutral-500 shrink-0">
                          {{ event.time }}
                        </span>
                      </div>
                      <p class="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                        {{ event.description }}
                      </p>
                      <div class="flex items-center gap-2 mt-2">
                        <span
                          class="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                          :class="{
                            'bg-error/20 text-error': event.type === 'incident',
                            'bg-success/20 text-success': event.type === 'positive',
                            'bg-info/20 text-info': event.type === 'medical',
                            'bg-warning/20 text-warning': event.type === 'communication'
                          }"
                        >
                          {{ event.badge }}
                        </span>
                        <span
                          v-if="event.evidence"
                          class="text-[9px] text-neutral-500 flex items-center gap-1"
                        >
                          <UIcon name="i-lucide-paperclip" class="size-2.5" />
                          {{ event.evidence }} attached
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Floating record button -->
            <div class="absolute bottom-6 left-1/2 -translate-x-1/2">
              <div class="relative">
                <div class="absolute inset-0 bg-primary rounded-full animate-ping opacity-20" />
                <div class="relative w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
                  <UIcon name="i-lucide-mic" class="size-6 text-white dark:text-neutral-900" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Side button (power) -->
      <div class="absolute right-[-2px] top-32 w-1 h-16 bg-neutral-400 dark:bg-neutral-700 rounded-l-sm" />
      <!-- Volume buttons -->
      <div class="absolute left-[-2px] top-28 w-1 h-8 bg-neutral-400 dark:bg-neutral-700 rounded-r-sm" />
      <div class="absolute left-[-2px] top-40 w-1 h-12 bg-neutral-400 dark:bg-neutral-700 rounded-r-sm" />
    </div>
  </div>
</template>



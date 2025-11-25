<script setup lang="ts">
const documentData = {
  caseName: 'Anderson vs. Taylor',
  court: 'Fairfax County Family Court',
  generatedDate: '11/24/2024, 3:45:22 PM',
  overview: {
    goal: "My primary focus is ensuring consistent care and routine for Emma. I've maintained detailed records to demonstrate my active involvement in her education, healthcare, and daily activities.",
    children: 'Emma Anderson, 7 years old, currently in 2nd grade at Lincoln Elementary',
    concerns: ['Inconsistent pickup times', 'Missed medical appointments', 'Communication gaps regarding schedule changes']
  },
  events: [
    {
      date: 'Nov 23, 05:30 PM',
      title: 'Late pickup for weekend visitation',
      category: 'Incident',
      categoryColor: 'error',
      description:
        'Other parent arrived 2.5 hours late for scheduled 3:00 PM pickup. Child waited with packed bag, became distressed asking "Is daddy coming?" No advance notice provided.',
      participants: ['self', 'child', 'other parent']
    },
    {
      date: 'Nov 22, 02:15 PM',
      title: 'School conference attended',
      category: 'Positive parenting',
      categoryColor: 'success',
      description:
        "Met with teacher Ms. Rodriguez to discuss Emma's progress. Teacher noted significant improvement in reading comprehension. Scheduled follow-up for December.",
      participants: ['self', 'Ms. Rodriguez (teacher)', 'child present']
    },
    {
      date: 'Nov 21, 09:00 AM',
      title: 'Dental appointment completed',
      category: 'Medical',
      categoryColor: 'info',
      description:
        "Regular checkup at Dr. Chen's office. No cavities found. Next cleaning scheduled for May 2025. Other parent was notified but did not attend.",
      participants: ['self', 'child', 'Dr. Chen']
    },
    {
      date: 'Nov 20, 07:45 PM',
      title: 'Schedule change request via text',
      category: 'Communication',
      categoryColor: 'warning',
      description:
        'Received text requesting to move weekend pickup from Friday to Saturday, citing work obligation. Requested documentation of conflict per court order. No response received.',
      participants: ['self', 'other parent']
    }
  ]
}
</script>

<template>
  <!-- Court-Ready Document Preview Section -->
  <section class="border-t border-default bg-muted py-24 overflow-hidden">
    <UContainer>
      <div class="mx-auto max-w-2xl text-center mb-12">
        <h2 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
          The document your attorney actually needs.
        </h2>
        <p class="mt-4 text-lg text-muted">
          Clean, chronological, court-ready. No more digging through texts at midnight.
        </p>
      </div>

      <!-- Document Preview -->
      <div class="relative mx-auto max-w-4xl">
        <!-- Paper shadow layers for depth -->
        <div class="absolute inset-x-4 top-2 h-full bg-gray-200/30 dark:bg-gray-800/30 rounded-lg transform rotate-1" />
        <div class="absolute inset-x-2 top-1 h-full bg-gray-100/30 dark:bg-gray-900/30 rounded-lg transform -rotate-0.5" />

        <!-- Main document -->
        <div class="relative bg-white dark:bg-gray-950 rounded-lg shadow-2xl overflow-hidden border border-default">
          <!-- Accent bar at top -->
          <div class="h-1.5 bg-primary" />

          <!-- Document content -->
          <div class="p-8 sm:p-12">
            <!-- Document Header -->
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              Custody case timeline & evidence summary
            </h1>

            <!-- Case metadata -->
            <div class="mt-6 space-y-1.5 text-sm">
              <div class="flex gap-2">
                <span class="font-semibold text-highlighted min-w-[100px]">
                  Case:
                </span>
                <span class="text-muted">
                  {{ documentData.caseName }}
                </span>
              </div>
              <div class="flex gap-2">
                <span class="font-semibold text-highlighted min-w-[100px]">
                  Court:
                </span>
                <span class="text-muted">
                  {{ documentData.court }}
                </span>
              </div>
              <div class="flex gap-2">
                <span class="font-semibold text-highlighted min-w-[100px]">
                  Generated on:
                </span>
                <span class="text-muted">
                  {{ documentData.generatedDate }}
                </span>
              </div>
            </div>

            <!-- Divider -->
            <div class="my-8 border-t border-default" />

            <!-- Section 1: Overview -->
            <div>
              <h2 class="text-lg font-bold text-highlighted">
                1. Overview
              </h2>
              <p class="mt-4 text-sm text-toned leading-relaxed">
                {{ documentData.overview.goal }}
              </p>
              <p class="mt-4 text-sm text-toned">
                <span class="font-medium text-highlighted">Children:</span>
                {{ documentData.overview.children }}
              </p>
              <p class="mt-4 text-sm text-toned">
                <span class="font-medium text-highlighted">Key concerns:</span>
                {{ documentData.overview.concerns.join(', ') }}
              </p>
            </div>

            <!-- Divider -->
            <div class="my-8 border-t border-default" />

            <!-- Section 2: Timeline -->
            <div>
              <h2 class="text-lg font-bold text-highlighted mb-6">
                2. Timeline of key events
              </h2>

              <ol class="space-y-6">
                <li
                  v-for="(event, index) in documentData.events.slice(0, 4)"
                  :key="index"
                  class="relative"
                >
                  <!-- Event header -->
                  <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span class="text-sm text-dimmed">
                      {{ index + 1 }}.
                    </span>
                    <span class="text-sm text-dimmed">
                      {{ event.date }}
                    </span>
                    <span class="font-semibold text-highlighted">
                      {{ event.title }}
                    </span>
                    <span class="text-sm italic text-dimmed">
                      ({{ event.category }})
                    </span>
                  </div>

                  <!-- Event description -->
                  <p class="mt-2 ml-6 text-sm text-muted leading-relaxed">
                    {{ event.description }}
                  </p>

                  <!-- Participants -->
                  <p class="mt-2 ml-6 text-xs text-dimmed">
                    Participants: {{ event.participants.join(', ') }}
                  </p>
                </li>
              </ol>
            </div>
          </div>

          <!-- Fade overlay at bottom -->
          <div
            class="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-white via-white/95 dark:from-gray-950 dark:via-gray-950/95 to-transparent pointer-events-none"
          />
        </div>

        <!-- "Continue" hint at bottom -->
        <div
          class="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 text-sm text-muted"
        >
          <span class="px-3 py-1 rounded-full bg-elevated/80 backdrop-blur border border-default shadow-sm">
            <span class="text-dimmed">47 more events documented</span>
          </span>
        </div>
      </div>

      <!-- CTA under document -->
      <div class="mt-16 text-center">
        <NuxtLink to="/auth/signup">
          <UButton
            size="lg"
            color="primary"
          >
            Generate your timeline
            <template #trailing>
              <UIcon name="i-lucide-file-text" class="size-4" />
            </template>
          </UButton>
        </NuxtLink>
      </div>
    </UContainer>
  </section>
</template>



<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui'

useHead({
  title: 'Feedback - Daylight'
})

interface BugReport {
  id: string
  category: string
  subject: string
  description: string
  status: string
  created_at: string
}

const user = useSupabaseUser()
const toast = useToast()

// Fetch previous reports
const { data: previousReports, refresh: refreshReports } = await useFetch<BugReport[]>('/api/support/bug-reports', {
  headers: useRequestHeaders(['cookie'])
})

// Tabs
const tabItems: TabsItem[] = [
  { label: 'New', icon: 'i-lucide-plus', slot: 'form' as const },
  { label: 'History', icon: 'i-lucide-history', slot: 'history' as const }
]

// Modal state
const selectedReport = ref<BugReport | null>(null)
const isModalOpen = computed({
  get: () => selectedReport.value !== null,
  set: (val) => { if (!val) selectedReport.value = null }
})

function openReportModal(report: BugReport) {
  selectedReport.value = report
}

// Bug report form state
const description = ref('')
const isSubmitting = ref(false)
const submitError = ref('')

const categoryLabels: Record<string, string> = {
  bug: 'Bug Report',
  feature_request: 'Feature Request',
  question: 'Question',
  feedback: 'Feedback',
  other: 'Other'
}

function getCategoryLabel(value: string) {
  return categoryLabels[value] || value
}

function getStatusColor(status: string): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  switch (status) {
    case 'resolved':
    case 'closed': return 'success'
    case 'in_progress': return 'info'
    case 'triaged': return 'warning'
    case 'wont_fix': return 'neutral'
    default: return 'neutral'
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

async function submitFeedback() {
  if (!description.value.trim()) {
    submitError.value = 'Please tell us what\'s on your mind'
    return
  }

  isSubmitting.value = true
  submitError.value = ''

  try {
    const response = await $fetch('/api/support/bug-report', {
      method: 'POST',
      body: {
        description: description.value.trim(),
        pageUrl: document.referrer || window.location.href,
        userAgent: navigator.userAgent
      }
    })

    if (response.success) {
      toast.add({
        title: `"${response.subject}"`,
        description: 'Submitted! View it in the History tab.',
        color: 'success',
        icon: 'i-lucide-check-circle'
      })
      
      description.value = ''
      await refreshReports()
    }
  } catch (err: any) {
    submitError.value = err.data?.statusMessage || 'Failed to submit. Please email hello@monumentlabs.io'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="support-report">
    <template #header>
      <UDashboardNavbar title="Feedback">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <NuxtLink to="/help" target="_blank">
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-life-buoy"
            >
              <span class="hidden sm:inline">Help & FAQ</span>
            </UButton>
          </NuxtLink>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-8">
        <div class="mx-auto max-w-lg">
          <UTabs
            :items="tabItems"
            size="sm"
            class="w-full"
            :ui="{ trigger: 'grow justify-center' }"
          >
            <!-- New Feedback Form -->
            <template #form>
              <div class="pt-6 space-y-6">
                <!-- Intro blurb -->
                <div class="text-center space-y-2">
                  <div class="flex size-12 items-center justify-center rounded-full bg-primary/10 mx-auto">
                    <UIcon name="i-lucide-message-square-heart" class="size-6 text-primary" />
                  </div>
                  <h2 class="text-lg font-semibold text-highlighted">We'd love to hear from you</h2>
                  <p class="text-sm text-muted leading-relaxed max-w-sm mx-auto">
                    Found something broken? Have an idea that would make Daylight better? 
                    Or maybe you just want to say hi — whatever it is, we're listening.
                  </p>
                </div>

                <form @submit.prevent="submitFeedback" class="space-y-5">
                  <div>
                    <UTextarea
                      v-model="description"
                      placeholder="Tell us what's on your mind..."
                      :rows="5"
                      autoresize
                      class="w-full"
                      :disabled="isSubmitting"
                    />
                    <p class="mt-2 text-xs text-muted">
                      Bug reports, feature ideas, questions, praise, complaints — anything goes. 
                      We'll categorize it automatically.
                    </p>
                  </div>

                  <UAlert
                    v-if="submitError"
                    color="error"
                    variant="soft"
                    :title="submitError"
                    icon="i-lucide-alert-circle"
                    :close-button="{ onClick: () => submitError = '' }"
                  />

                  <!-- Submitting state -->
                  <div v-if="isSubmitting" class="flex items-center justify-center gap-2 py-2 text-sm text-primary">
                    <UIcon name="i-lucide-sparkles" class="size-4 animate-pulse" />
                    <span>Generating a title for your feedback...</span>
                  </div>

                  <div class="flex items-center justify-between gap-4 pt-2">
                    <div class="flex items-center gap-2 text-xs text-muted">
                      <UIcon name="i-lucide-mail" class="size-3.5 shrink-0" />
                      <span class="truncate">We'll follow up at {{ user?.email }}</span>
                    </div>

                    <UButton
                      type="submit"
                      :loading="isSubmitting"
                      :disabled="isSubmitting || !description.trim()"
                      icon="i-lucide-send"
                    >
                      Send
                    </UButton>
                  </div>
                </form>

                <USeparator />

                <p class="text-center text-xs text-muted">
                  Prefer email? Reach us at
                  <a href="mailto:hello@monumentlabs.io" class="text-primary hover:underline">
                    hello@monumentlabs.io
                  </a>
                </p>
              </div>
            </template>

            <!-- Past Reports -->
            <template #history>
              <div class="pt-6">
                <div v-if="!previousReports?.length" class="py-12 text-center">
                  <UIcon name="i-lucide-inbox" class="size-12 text-muted/20 mx-auto mb-4" />
                  <p class="text-sm text-muted">No feedback submitted yet</p>
                  <p class="text-xs text-muted/70 mt-1">Your submissions will appear here</p>
                </div>

                <div v-else class="space-y-3">
                  <div
                    v-for="report in previousReports"
                    :key="report.id"
                    class="rounded-lg border border-default p-4 hover:bg-muted/5 cursor-pointer transition-colors"
                    @click="openReportModal(report)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <p class="font-medium text-highlighted">
                          {{ report.subject }}
                        </p>
                        <div class="flex items-center gap-2 mt-1.5 text-xs text-muted">
                          <UBadge
                            color="neutral"
                            variant="subtle"
                            size="xs"
                          >
                            {{ getCategoryLabel(report.category) }}
                          </UBadge>
                          <span>{{ formatDate(report.created_at) }}</span>
                        </div>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <UBadge
                          :color="getStatusColor(report.status)"
                          variant="subtle"
                          size="xs"
                        >
                          {{ report.status }}
                        </UBadge>
                        <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </UTabs>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Report Detail Modal -->
  <UModal
    v-model:open="isModalOpen"
    title="Feedback details"
    description="View the details of your submitted feedback."
  >
    <template #content>
      <UCard v-if="selectedReport">
        <template #header>
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ selectedReport.subject }}
              </h3>
              <div class="flex items-center gap-2 mt-2">
                <UBadge color="neutral" variant="subtle" size="xs">
                  {{ getCategoryLabel(selectedReport.category) }}
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(selectedReport.created_at) }}</span>
              </div>
            </div>
            <UBadge
              :color="getStatusColor(selectedReport.status)"
              variant="subtle"
              size="sm"
            >
              {{ selectedReport.status }}
            </UBadge>
          </div>
        </template>

        <div>
          <p class="text-xs font-medium text-muted uppercase tracking-wide mb-3">Your feedback</p>
          <p class="text-sm text-highlighted whitespace-pre-wrap leading-relaxed">{{ selectedReport.description }}</p>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton
              color="neutral"
              variant="ghost"
              @click="isModalOpen = false"
            >
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

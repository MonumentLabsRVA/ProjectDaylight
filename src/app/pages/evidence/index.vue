<script setup lang="ts">
import type { EvidenceItem } from '~/types'

// Subscription check for feature gating
const {
  canUploadEvidence,
  evidenceUploadsRemaining,
  isFree,
  limits
} = useSubscription()

// Fetch evidence via SSR-aware useFetch and cookie-based auth
const { data, status, error, refresh } = await useFetch<EvidenceItem[]>('/api/evidence', {
  headers: useRequestHeaders(['cookie'])
})

const session = useSupabaseSession()

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

// OFW import: hidden file input + status banner. Job-in-flight state lives in
// the global useJobs tracker so navigating away and back keeps the spinner.
// We only keep local state for the upload phase (pre-DB) and for transient
// errors that haven't reached the jobs table.
const OFW_MAX_BYTES = 100 * 1024 * 1024
const ofwInput = ref<HTMLInputElement | null>(null)
const ofwLocalState = ref<{
  state: 'idle' | 'uploading' | 'error'
  message?: string
}>({ state: 'idle' })

const { trackJob, activeJobsOfType } = useJobs()
const ofwActiveJobs = activeJobsOfType('ofw_ingest')

const ofwBanner = computed<{ kind: 'uploading' | 'processing' | 'error', message: string } | null>(() => {
  if (ofwLocalState.value.state === 'uploading') {
    return { kind: 'uploading', message: ofwLocalState.value.message ?? 'Uploading…' }
  }
  if (ofwLocalState.value.state === 'error') {
    return { kind: 'error', message: ofwLocalState.value.message ?? 'Upload failed.' }
  }
  if (ofwActiveJobs.value.length > 0) {
    return { kind: 'processing', message: 'Parsing your messages — this usually takes under a minute.' }
  }
  return null
})

// When a tracked OFW job goes terminal, useJobs removes it from activeJobs.
// Refresh the evidence list so the new file's row picks up its parsed messages.
watch(() => ofwActiveJobs.value.length, (now, prev) => {
  if (prev && prev > 0 && now === 0) refresh()
})

// "How to export from OFW" instructions slideover state.
const ofwHelpOpen = ref(false)

// Settings list mirrors Plan 01's required-settings table — keep in sync if
// OFW changes their report dialog.
const ofwExportSettings: { setting: string, value: string, why: string }[] = [
  { setting: 'Messages', value: 'All In Folder', why: 'Pulls the full case history. Single threads or filtered views miss context.' },
  { setting: 'Sort messages by', value: 'Oldest to newest', why: 'Required for stable message numbering — reverse-sort breaks the parser\'s 1..N counter.' },
  { setting: 'Attachments', value: 'Exclude all attachments', why: 'Keeps the PDF small. Attachment names are still preserved in the message body; upload binaries separately as evidence if you need them.' },
  { setting: 'Include official OurFamilyWizard header', value: 'Unchecked', why: 'OFW\'s branded cover pages are extra pages the parser has to skip. Cleaner to omit.' },
  { setting: 'Include message replies', value: 'Checked', why: 'Without this, threaded context is lost and the parser can\'t reconstruct conversations.' },
  { setting: 'Include private messages with your Professional', value: 'Unchecked', why: 'Attorney-client privileged. Off by default in OFW too.' },
  { setting: 'New page per message', value: 'Checked', why: 'Required so the parser can detect message boundaries by page break.' }
]

async function pickOfwFile() {
  ofwInput.value?.click()
}

async function handleOfwSelected(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    ofwLocalState.value = { state: 'error', message: 'OFW exports must be PDF files.' }
    input.value = ''
    return
  }
  if (file.size > OFW_MAX_BYTES) {
    ofwLocalState.value = { state: 'error', message: `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 100 MB.` }
    input.value = ''
    return
  }

  ofwLocalState.value = { state: 'uploading', message: `Uploading ${file.name}…` }

  try {
    const fd = new FormData()
    fd.append('file', file, file.name)

    const res = await $fetch<{ evidenceId: string, jobId: string, message: string }>(
      '/api/evidence-ofw-upload',
      { method: 'POST', body: fd }
    )

    // Hand the job off to the global tracker; useJobs handles Realtime, the
    // completion toast, and the navigate-away-and-back recovery via recoverJobs.
    trackJob({ id: res.jobId, type: 'ofw_ingest', status: 'pending' })
    ofwLocalState.value = { state: 'idle' }
  } catch (err: any) {
    ofwLocalState.value = { state: 'error', message: err?.statusMessage || err?.message || 'Upload failed.' }
  } finally {
    input.value = ''
  }
}

const q = ref('')
const sourceFilter = ref<'all' | EvidenceItem['sourceType']>('all')

const sourceOptions: { label: string, value: 'all' | EvidenceItem['sourceType'] }[] = [{
  label: 'All sources',
  value: 'all'
}, {
  label: 'Photos',
  value: 'photo'
}, {
  label: 'Texts',
  value: 'text'
}, {
  label: 'Emails',
  value: 'email'
}, {
  label: 'Documents',
  value: 'document'
}, {
  label: 'OFW Exports',
  value: 'ofw_export'
}]

const filteredEvidence = computed(() => {
  const items = data.value || []

  return items.filter((item) => {
    const matchesSource = sourceFilter.value === 'all' || item.sourceType === sourceFilter.value
    const query = q.value.trim().toLowerCase()

    if (!query) {
      return matchesSource
    }

    const haystack = [
      item.originalName,
      item.summary,
      ...item.tags
    ].join(' ').toLowerCase()

    return matchesSource && haystack.includes(query)
  })
})

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function sourceLabel(type: EvidenceItem['sourceType']) {
  return {
    text: 'Text',
    email: 'Email',
    photo: 'Photo',
    document: 'Document',
    ofw_export: 'OFW Export'
  }[type]
}

// Track image loading states
const imageLoadStates = ref<Map<string, 'loading' | 'loaded' | 'error'>>(new Map())

function getImageState(id: string) {
  return imageLoadStates.value.get(id) || 'loading'
}

function onImageLoad(id: string) {
  imageLoadStates.value.set(id, 'loaded')
}

function onImageError(id: string) {
  imageLoadStates.value.set(id, 'error')
}
</script>

<template>
  <UDashboardPanel id="evidence">
    <template #header>
      <UDashboardNavbar title="Evidence">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <span class="text-sm text-muted hidden sm:inline">
            {{ filteredEvidence.length }} {{ filteredEvidence.length === 1 ? 'item' : 'items' }}
          </span>
        </template>
      </UDashboardNavbar>

      <!-- Secondary toolbar for search/filter -->
      <div class="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-2 border-b border-default overflow-x-auto scrollbar-none">
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Search..."
          size="sm"
          class="flex-1 min-w-[120px] max-w-xs"
        />

        <USelect
          v-model="sourceFilter"
          :items="sourceOptions"
          size="sm"
          class="w-32 shrink-0"
          :ui="{
            trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
          }"
        />

        <span class="text-xs text-muted shrink-0 sm:hidden">
          {{ filteredEvidence.length }} items
        </span>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- OFW import card -->
        <UCard>
          <div class="flex items-start gap-4">
            <div class="size-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <UIcon
                name="i-lucide-message-square-text"
                class="size-5 text-primary"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-highlighted">
                Import Our Family Wizard messages
              </p>
              <div class="text-xs text-muted mt-0.5">
                Upload an OFW Message Report PDF — every message lands on your timeline.
                <button
                  type="button"
                  class="text-primary hover:underline cursor-pointer"
                  @click="ofwHelpOpen = true"
                >
                  How to export from OFW
                </button>
              </div>
              <div
                v-if="ofwBanner"
                class="mt-3 text-xs"
              >
                <UAlert
                  :color="ofwBanner.kind === 'error' ? 'error' : 'info'"
                  :icon="ofwBanner.kind === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-loader-2'"
                  variant="subtle"
                  :title="ofwBanner.kind === 'uploading' ? 'Uploading…'
                    : ofwBanner.kind === 'processing' ? 'Parsing…'
                      : 'Upload failed'"
                  :description="ofwBanner.message"
                  :ui="{ icon: ofwBanner.kind === 'error' ? '' : 'animate-spin' }"
                />
              </div>
            </div>
            <UButton
              variant="solid"
              color="primary"
              size="sm"
              icon="i-lucide-upload"
              :loading="ofwBanner?.kind === 'uploading' || ofwBanner?.kind === 'processing'"
              @click="pickOfwFile"
            >
              Import OFW PDF
            </UButton>
            <input
              ref="ofwInput"
              type="file"
              accept="application/pdf,.pdf"
              class="hidden"
              @change="handleOfwSelected"
            >
          </div>
        </UCard>

        <!-- Feature gate: Free tier limit warning -->
        <UpgradePrompt
          v-if="isFree && !canUploadEvidence"
          title="Evidence upload limit reached"
          description="You've used all 10 evidence uploads on the free plan. Upgrade to Pro for unlimited uploads."
          variant="banner"
        />
        <UpgradePrompt
          v-else-if="isFree && evidenceUploadsRemaining <= 3 && evidenceUploadsRemaining > 0"
          :title="`${evidenceUploadsRemaining} evidence uploads remaining`"
          description="Upgrade to Pro for unlimited evidence uploads."
          :show-remaining="true"
          :remaining="evidenceUploadsRemaining"
          remaining-label="uploads left"
          variant="inline"
        />

        <!-- Loading state with skeleton placeholders -->
        <UPageGrid v-if="status === 'pending'">
          <UPageCard
            v-for="i in 6"
            :key="i"
            variant="outline"
          >
            <template #header>
              <div class="flex items-center gap-2">
                <USkeleton class="h-5 w-16" />
                <USkeleton class="h-4 w-24" />
              </div>
            </template>
            <template #default>
              <USkeleton class="w-full aspect-[4/3] rounded-lg" />
            </template>
            <template #footer>
              <div class="space-y-2">
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-3/4" />
                <div class="flex gap-1 pt-1">
                  <USkeleton class="h-5 w-14" />
                  <USkeleton class="h-5 w-16" />
                </div>
              </div>
            </template>
          </UPageCard>
        </UPageGrid>

        <!-- Content display -->
        <UPageGrid v-else>
          <UPageCard
            v-for="item in filteredEvidence"
            :key="item.id"
            :to="`/evidence/${item.id}`"
            variant="outline"
          >
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-muted">{{ formatDate(item.createdAt) }}</span>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="xs"
                >
                  {{ sourceLabel(item.sourceType) }}
                </UBadge>
              </div>
            </template>

            <template #title>
              <span class="line-clamp-1">{{ item.originalName }}</span>
            </template>

            <template #description>
              <span class="line-clamp-2">{{ item.summary || 'No description' }}</span>
            </template>

            <!-- Image/thumbnail in default slot -->
            <template #default>
              <div class="w-full aspect-[4/3] rounded-lg bg-muted/20 overflow-hidden flex items-center justify-center relative">
                <!-- Image with loading state -->
                <template v-if="item.storagePath && item.mimeType?.startsWith('image/')">
                  <!-- Loading skeleton -->
                  <div
                    v-if="getImageState(item.id) === 'loading'"
                    class="absolute inset-0 bg-muted/30 animate-pulse"
                  />

                  <!-- Error fallback -->
                  <UIcon
                    v-if="getImageState(item.id) === 'error'"
                    name="i-lucide-image-off"
                    class="size-8 text-muted"
                  />

                  <!-- Actual image -->
                  <img
                    :src="`/api/evidence/${item.id}/image`"
                    :alt="item.originalName"
                    class="w-full h-full object-cover transition-opacity duration-200"
                    :class="getImageState(item.id) === 'loaded' ? 'opacity-100' : 'opacity-0'"
                    loading="lazy"
                    @load="onImageLoad(item.id)"
                    @error="onImageError(item.id)"
                  >
                </template>

                <!-- Non-image file icon -->
                <template v-else>
                  <div class="flex flex-col items-center justify-center gap-2 text-muted">
                    <UIcon
                      :name="item.sourceType === 'photo' ? 'i-lucide-image' : item.sourceType === 'document' ? 'i-lucide-file-text' : item.sourceType === 'email' ? 'i-lucide-mail' : item.sourceType === 'ofw_export' ? 'i-lucide-message-square-text' : 'i-lucide-message-square'"
                      class="size-10"
                    />
                    <span class="text-xs">{{ sourceLabel(item.sourceType) }}</span>
                  </div>
                </template>
              </div>
            </template>

            <template #footer>
              <div
                v-if="item.tags.length"
                class="flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="tag in item.tags.slice(0, 3)"
                  :key="tag"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  {{ tag }}
                </UBadge>
                <UBadge
                  v-if="item.tags.length > 3"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  +{{ item.tags.length - 3 }}
                </UBadge>
              </div>
            </template>
          </UPageCard>
        </UPageGrid>

        <!-- Empty states -->
        <div v-if="!filteredEvidence.length && status === 'success'">
          <!-- No results with filters -->
          <UCard
            v-if="q || sourceFilter !== 'all'"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon
              name="i-lucide-filter-x"
              class="size-12 text-dimmed mb-3"
            />
            <p class="text-base font-medium text-highlighted mb-1">
              No evidence matches your filters
            </p>
            <p class="text-sm text-muted mb-4">
              Try adjusting your search or source filter
            </p>
            <UButton
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              @click="q = ''; sourceFilter = 'all'"
            >
              Clear filters
            </UButton>
          </UCard>

          <!-- No evidence at all -->
          <UCard
            v-else
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UIcon
                name="i-lucide-paperclip"
                class="size-10 text-primary"
              />
            </div>
            <p class="text-lg font-medium text-highlighted mb-2">
              No Evidence Yet
            </p>
            <p class="text-sm text-muted mb-6 max-w-md">
              Upload screenshots, photos, documents, or other files to build your evidence library.
            </p>
            <UButton
              variant="solid"
              color="primary"
              size="lg"
              icon="i-lucide-upload"
              to="/journal/new"
            >
              Add Evidence
            </UButton>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <USlideover
    v-model:open="ofwHelpOpen"
    title="OFW export settings"
    description="In OFW, click Messages → Report. Match these settings:"
    side="right"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4 p-2">
        <img
          src="/ofw-export-settings.png"
          alt="OFW Messages Report dialog with the required settings filled in"
          class="w-full rounded-lg border border-default"
        >

        <div class="divide-y divide-default rounded-lg border border-default">
          <div
            v-for="row in ofwExportSettings"
            :key="row.setting"
            class="py-2.5 px-3 first:pt-2.5 last:pb-2.5 grid grid-cols-[1fr,auto] gap-x-3 items-center"
          >
            <p class="text-sm font-medium text-highlighted">
              {{ row.setting }}
            </p>
            <UBadge
              color="primary"
              variant="subtle"
              size="xs"
            >
              {{ row.value }}
            </UBadge>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

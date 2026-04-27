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

// OFW import: hidden file input + status banner.
// The endpoint enforces the 100 MB cap server-side; we mirror it here for UX.
const OFW_MAX_BYTES = 100 * 1024 * 1024
const ofwInput = ref<HTMLInputElement | null>(null)
const ofwStatus = ref<{
  state: 'idle' | 'uploading' | 'processing' | 'done' | 'error'
  message?: string
  evidenceId?: string
  jobId?: string
}>({ state: 'idle' })

async function pickOfwFile() {
  ofwInput.value?.click()
}

async function handleOfwSelected(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    ofwStatus.value = { state: 'error', message: 'OFW exports must be PDF files.' }
    input.value = ''
    return
  }
  if (file.size > OFW_MAX_BYTES) {
    ofwStatus.value = { state: 'error', message: `File too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 100 MB.` }
    input.value = ''
    return
  }

  ofwStatus.value = { state: 'uploading', message: `Uploading ${file.name}…` }

  try {
    const fd = new FormData()
    fd.append('file', file, file.name)

    const res = await $fetch<{ evidenceId: string; jobId: string; message: string }>(
      '/api/evidence-ofw-upload',
      { method: 'POST', body: fd }
    )

    ofwStatus.value = {
      state: 'processing',
      message: 'Parsing your messages — this usually takes under a minute.',
      evidenceId: res.evidenceId,
      jobId: res.jobId
    }

    await watchJobUntilTerminal(res.evidenceId, res.jobId)
  } catch (err: any) {
    ofwStatus.value = { state: 'error', message: err?.statusMessage || err?.message || 'Upload failed.' }
  } finally {
    input.value = ''
  }
}

const supabase = useSupabaseClient()

// Watches a single ofw_ingest job. Polls every 1.5 s and listens via Realtime
// in parallel — whichever fires first wins. Total deadline 5 minutes; after
// that we tell the user to refresh.
async function watchJobUntilTerminal(evidenceId: string, jobId: string) {
  return new Promise<void>((resolve) => {
    let settled = false
    let pollHandle: ReturnType<typeof setInterval> | null = null
    let deadlineHandle: ReturnType<typeof setTimeout> | null = null

    const finish = (status: { state: typeof ofwStatus.value.state; message?: string }) => {
      if (settled) return
      settled = true
      ofwStatus.value = { ...status, evidenceId, jobId }
      if (pollHandle) clearInterval(pollHandle)
      if (deadlineHandle) clearTimeout(deadlineHandle)
      void supabase.removeChannel(channel)
      void refresh()
      resolve()
    }

    const handleRow = (row: { status: string; result_summary?: { messages_inserted?: number; messages_parsed?: number } | null; error_message?: string | null }) => {
      if (row.status === 'completed') {
        const inserted = row.result_summary?.messages_inserted ?? 0
        const parsed = row.result_summary?.messages_parsed ?? 0
        finish({ state: 'done', message: `Imported ${inserted} new messages (${parsed} parsed).` })
      } else if (row.status === 'failed') {
        finish({ state: 'error', message: row.error_message || 'Parsing failed.' })
      }
    }

    const channel = supabase
      .channel(`ofw-job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`
      }, (payload) => handleRow(payload.new as Parameters<typeof handleRow>[0]))
      .subscribe()

    pollHandle = setInterval(async () => {
      if (settled) return
      const { data: row } = await supabase
        .from('jobs')
        .select('status, result_summary, error_message')
        .eq('id', jobId)
        .maybeSingle()
      if (row) handleRow(row as Parameters<typeof handleRow>[0])
    }, 1500)

    deadlineHandle = setTimeout(() => {
      finish({
        state: 'done',
        message: 'Parsing is still running. Refresh in a minute to see imported messages.'
      })
    }, 5 * 60 * 1000)
  })
}

const q = ref('')
const sourceFilter = ref<'all' | EvidenceItem['sourceType']>('all')

const sourceOptions: { label: string; value: 'all' | EvidenceItem['sourceType'] }[] = [{
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
              <UIcon name="i-lucide-message-square-text" class="size-5 text-primary" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-highlighted">Import Our Family Wizard messages</p>
              <p class="text-xs text-muted mt-0.5">
                Upload an OFW Message Report PDF — every message lands on your timeline.
                Use settings: All In Folder · Oldest to Newest · New page per message · Exclude attachments.
              </p>
              <div v-if="ofwStatus.state !== 'idle'" class="mt-3 text-xs">
                <UAlert
                  :color="ofwStatus.state === 'error' ? 'error' : ofwStatus.state === 'done' ? 'success' : 'info'"
                  :icon="ofwStatus.state === 'uploading' || ofwStatus.state === 'processing'
                    ? 'i-lucide-loader-2'
                    : ofwStatus.state === 'error'
                      ? 'i-lucide-circle-alert'
                      : 'i-lucide-check'"
                  variant="subtle"
                  :title="ofwStatus.state === 'uploading' ? 'Uploading…'
                    : ofwStatus.state === 'processing' ? 'Parsing…'
                    : ofwStatus.state === 'error' ? 'Upload failed'
                    : 'Done'"
                  :description="ofwStatus.message"
                  :ui="{
                    icon: ofwStatus.state === 'uploading' || ofwStatus.state === 'processing' ? 'animate-spin' : ''
                  }"
                />
              </div>
            </div>
            <UButton
              variant="solid"
              color="primary"
              size="sm"
              icon="i-lucide-upload"
              :loading="ofwStatus.state === 'uploading' || ofwStatus.state === 'processing'"
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
          <UPageCard v-for="i in 6" :key="i" variant="outline">
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
              <div v-if="item.tags.length" class="flex flex-wrap gap-1">
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
            <UIcon name="i-lucide-filter-x" class="size-12 text-dimmed mb-3" />
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
              <UIcon name="i-lucide-paperclip" class="size-10 text-primary" />
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
</template>



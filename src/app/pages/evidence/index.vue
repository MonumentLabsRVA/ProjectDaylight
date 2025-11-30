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

if (process.client) {
  watchEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      '[Evidence] /api/evidence result:',
      {
        status: status.value,
        error: error.value,
        count: (data.value ?? []).length,
        items: data.value
      }
    )
  })
}

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
    document: 'Document'
  }[type]
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

        <p class="text-sm text-muted">
          Central library of your uploaded evidence and AI-suggested records from
          <code class="px-1 rounded bg-subtle text-xs text-muted border border-default">/api/evidence</code>.
        </p>

        <!-- Loading state with skeleton placeholders -->
        <div v-if="status === 'pending'" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <UCard v-for="i in 6" :key="i">
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0 space-y-3">
                <div class="flex items-center gap-2">
                  <USkeleton class="h-5 w-16" />
                  <USkeleton class="h-4 w-24" />
                </div>

                <USkeleton class="h-6 w-3/4" />

                <div class="space-y-1">
                  <USkeleton class="h-4 w-full" />
                  <USkeleton class="h-4 w-5/6" />
                </div>

                <div class="flex flex-wrap gap-1">
                  <USkeleton class="h-5 w-16" />
                  <USkeleton class="h-5 w-20" />
                  <USkeleton class="h-5 w-14" />
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Content display -->
        <div v-else class="space-y-1">
          <NuxtLink
            v-for="(item, index) in filteredEvidence"
            :key="item.id"
            :to="`/evidence/${item.id}`"
            class="block"
          >
            <div class="flex items-center gap-3 px-2 py-3 hover:bg-muted/5 transition-colors cursor-pointer rounded-lg">
              <!-- Thumbnail -->
              <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-muted/30 flex-shrink-0 overflow-hidden flex items-center justify-center">
                <img
                  v-if="item.storagePath && item.mimeType?.startsWith('image/')"
                  :src="`/api/evidence/${item.id}/image`"
                  :alt="item.originalName"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <UIcon 
                  v-else 
                  :name="item.sourceType === 'photo' ? 'i-lucide-image' : item.sourceType === 'document' ? 'i-lucide-file-text' : 'i-lucide-file'"
                  class="size-5 sm:size-6 text-muted"
                />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <h3 class="font-medium text-sm truncate text-highlighted">
                    {{ item.originalName }}
                  </h3>
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="shrink-0"
                  >
                    {{ sourceLabel(item.sourceType) }}
                  </UBadge>
                </div>

                <p class="text-xs text-muted line-clamp-1 mb-1">
                  {{ item.summary }}
                </p>

                <div class="flex items-center gap-2 text-xs text-muted">
                  <span>{{ formatDate(item.createdAt) }}</span>
                  <span v-if="item.tags.length" class="hidden sm:inline">·</span>
                  <span v-if="item.tags.length" class="hidden sm:inline truncate">
                    {{ item.tags.slice(0, 2).join(', ') }}
                    <span v-if="item.tags.length > 2">+{{ item.tags.length - 2 }}</span>
                  </span>
                </div>
              </div>

              <!-- Arrow -->
              <UIcon name="i-lucide-chevron-right" class="size-4 text-muted flex-shrink-0" />
            </div>
            
            <!-- Separator -->
            <USeparator v-if="index < filteredEvidence.length - 1" class="mx-2" />
          </NuxtLink>
        </div>

        <UCard
          v-if="!filteredEvidence.length && status === 'success'"
          class="flex flex-col items-center justify-center py-12 text-center"
        >
          <UIcon name="i-lucide-folder-open" class="size-10 text-dimmed mb-2" />
          <p class="text-sm font-medium text-highlighted">
            No evidence matches this search
          </p>
          <p class="text-xs text-muted">
            Try clearing the search or changing the source filter to explore the dummy evidence set.
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>



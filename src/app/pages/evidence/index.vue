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
                      :name="item.sourceType === 'photo' ? 'i-lucide-image' : item.sourceType === 'document' ? 'i-lucide-file-text' : item.sourceType === 'email' ? 'i-lucide-mail' : 'i-lucide-message-square'"
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



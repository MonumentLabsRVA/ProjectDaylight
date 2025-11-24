<script setup lang="ts">
import type { EvidenceItem } from '~/types'

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
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="q"
              icon="i-lucide-search"
              placeholder="Search evidence"
              class="w-44 sm:w-64"
            />

            <USelect
              v-model="sourceFilter"
              :items="sourceOptions"
              class="min-w-32"
              :ui="{
                trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
              }"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
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
        <div
          v-else
          class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <NuxtLink
            v-for="item in filteredEvidence"
            :key="item.id"
            :to="`/evidence/${item.id}`"
            class="block"
          >
            <UCard
              :ui="{ 
                base: 'hover:bg-muted/5 transition-colors cursor-pointer h-full'
              }"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <UBadge
                      color="neutral"
                      variant="subtle"
                    >
                      {{ sourceLabel(item.sourceType) }}
                    </UBadge>
                    <p class="text-xs text-muted">
                      {{ formatDate(item.createdAt) }}
                    </p>
                  </div>

                  <h3 class="font-medium mb-2">
                    {{ item.originalName }}
                  </h3>

                  <p class="text-sm text-muted line-clamp-2 mb-3">
                    {{ item.summary }}
                  </p>

                  <div v-if="item.tags.length" class="flex flex-wrap gap-1">
                    <UBadge
                      v-for="tag in item.tags.slice(0, 4)"
                      :key="tag"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    >
                      {{ tag }}
                    </UBadge>
                    <UBadge
                      v-if="item.tags.length > 4"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    >
                      +{{ item.tags.length - 4 }}
                    </UBadge>
                  </div>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-muted flex-shrink-0" />
              </div>
            </UCard>
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



<script setup lang="ts">
import type { EvidenceItem } from '~/types'

interface EvidenceDetailResponse extends EvidenceItem {
  // Additional fields from the database
  storagePath?: string
  mimeType?: string
  updatedAt: string
  
  // Related data
  relatedEvents?: Array<{
    id: string
    type: string
    title: string
    timestamp: string
    isPrimary: boolean
  }>
  
  relatedCommunications?: Array<{
    id: string
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

// Use SSR-aware useFetch with cookie-based auth
const session = useSupabaseSession()
const route = useRoute()
const router = useRouter()

const evidenceId = computed(() => route.params.id as string)

const {
  data,
  status,
  error,
  refresh
} = await useFetch<EvidenceDetailResponse>(() => `/api/evidence/${evidenceId.value}`, {
  headers: useRequestHeaders(['cookie'])
})

// Refresh when session changes (e.g., login)
watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

// Redirect to list if evidence not found
watch(error, async (err: any) => {
  if (err?.statusCode === 404) {
    await router.push('/evidence')
  }
})

const typeColors: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
  positive: 'success',
  incident: 'error',
  medical: 'info',
  school: 'warning',
  communication: 'info',
  legal: 'neutral'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function sourceLabel(type: EvidenceItem['sourceType']) {
  return {
    text: 'Text Message',
    email: 'Email Communication',
    photo: 'Photo Evidence',
    document: 'Legal Document'
  }[type] || 'Evidence'
}

function sourceIcon(type: EvidenceItem['sourceType']) {
  return {
    text: 'i-lucide-message-square',
    email: 'i-lucide-mail',
    photo: 'i-lucide-image',
    document: 'i-lucide-file-text'
  }[type] || 'i-lucide-file'
}

// Check if the evidence can be previewed
const canPreview = computed(() => {
  if (!data.value?.storagePath || !data.value?.mimeType) return false
  return data.value.mimeType.startsWith('image/') || 
         data.value.mimeType === 'application/pdf'
})
</script>

<template>
  <UDashboardPanel id="evidence-detail">
    <template #header>
      <UDashboardNavbar title="Evidence Details">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/evidence"
          >
            Back to Evidence
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="status === 'pending'" class="space-y-4">
        <UCard>
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <USkeleton class="h-6 w-20" />
                <USkeleton class="h-7 w-64" />
              </div>
              <USkeleton class="h-5 w-40" />
            </div>
            <USkeleton class="h-20 w-full" />
            <div class="flex flex-wrap gap-2">
              <USkeleton class="h-5 w-16" />
              <USkeleton class="h-5 w-20" />
              <USkeleton class="h-5 w-14" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Error state -->
      <UCard v-else-if="status === 'error'" class="border-error">
        <div class="flex items-center gap-3 text-error">
          <UIcon name="i-lucide-alert-triangle" class="size-5" />
          <p class="font-medium">Failed to load evidence details</p>
        </div>
        <p class="text-sm text-muted mt-2">{{ error?.statusMessage || 'An error occurred' }}</p>
        <UButton
          to="/evidence"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          class="mt-4"
        >
          Back to Evidence
        </UButton>
      </UCard>

      <!-- Content -->
      <div v-else-if="data" class="space-y-4">
        <!-- Main Evidence Card -->
        <UCard>
          <div class="space-y-4">
            <!-- Header -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center size-10 rounded-lg bg-muted/10">
                  <UIcon :name="sourceIcon(data.sourceType)" class="size-5" />
                </div>
                <div>
                  <h1 class="text-xl font-semibold">{{ data.originalName }}</h1>
                  <p class="text-sm text-muted">{{ sourceLabel(data.sourceType) }}</p>
                </div>
              </div>
              <p class="text-sm text-muted">
                Uploaded {{ formatDate(data.createdAt) }}
              </p>
            </div>

            <!-- Summary -->
            <div v-if="data.summary" class="prose prose-sm max-w-none">
              <p>{{ data.summary }}</p>
            </div>

            <!-- Tags -->
            <div v-if="data.tags?.length" class="flex flex-wrap gap-2">
              <UBadge
                v-for="tag in data.tags"
                :key="tag"
                color="neutral"
                variant="outline"
              >
                {{ tag }}
              </UBadge>
            </div>

            <!-- File Info -->
            <div v-if="data.mimeType || data.storagePath" class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/5">
              <div v-if="data.mimeType">
                <p class="text-xs text-muted">File Type</p>
                <p class="text-sm font-mono">{{ data.mimeType }}</p>
              </div>
              <div v-if="data.storagePath">
                <p class="text-xs text-muted">Storage Path</p>
                <p class="text-sm font-mono truncate">{{ data.storagePath }}</p>
              </div>
            </div>

            <!-- Preview Button -->
            <div v-if="canPreview" class="flex gap-2">
              <UButton
                icon="i-lucide-eye"
                color="primary"
                variant="outline"
                disabled
              >
                Preview (Coming Soon)
              </UButton>
              <UButton
                icon="i-lucide-download"
                color="neutral"
                variant="ghost"
                disabled
              >
                Download
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Related Events -->
        <UCard v-if="data.relatedEvents?.length">
          <template #header>
            <h2 class="text-lg font-medium">Related Events</h2>
          </template>

          <div class="grid gap-2">
            <NuxtLink
              v-for="event in data.relatedEvents"
              :key="event.id"
              :to="`/event/${event.id}`"
              class="block"
            >
              <UCard class="hover:bg-muted/5 transition-colors">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <UBadge
                        :color="typeColors[event.type as keyof typeof typeColors]"
                        variant="subtle"
                        size="xs"
                        class="capitalize"
                      >
                        {{ event.type }}
                      </UBadge>
                      <UBadge
                        v-if="event.isPrimary"
                        color="primary"
                        variant="outline"
                        size="xs"
                      >
                        Primary Evidence
                      </UBadge>
                    </div>
                    <p class="text-sm font-medium">{{ event.title }}</p>
                    <p class="text-xs text-muted">{{ formatShortDate(event.timestamp) }}</p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                </div>
              </UCard>
            </NuxtLink>
          </div>
        </UCard>

        <!-- Related Communications -->
        <UCard v-if="data.relatedCommunications?.length">
          <template #header>
            <h2 class="text-lg font-medium">Related Communications</h2>
          </template>

          <div class="space-y-2">
            <div
              v-for="comm in data.relatedCommunications"
              :key="comm.id"
              class="p-3 rounded-lg bg-muted/5"
            >
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <UBadge color="neutral" variant="subtle" size="xs">
                    {{ comm.medium }}
                  </UBadge>
                  <UBadge color="neutral" variant="outline" size="xs">
                    {{ comm.direction }}
                  </UBadge>
                </div>
                <span v-if="comm.sentAt" class="text-xs text-muted">
                  {{ formatShortDate(comm.sentAt) }}
                </span>
              </div>
              <p v-if="comm.subject" class="text-sm font-medium">{{ comm.subject }}</p>
              <p class="text-sm text-muted">{{ comm.summary }}</p>
            </div>
          </div>
        </UCard>

        <!-- Metadata -->
        <UCard>
          <template #header>
            <h2 class="text-sm font-medium text-muted">Metadata</h2>
          </template>
          
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-xs text-muted">Evidence ID</p>
              <p class="font-mono text-xs">{{ data.id }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Source Type</p>
              <p>{{ data.sourceType }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Created</p>
              <p>{{ formatShortDate(data.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Last Updated</p>
              <p>{{ formatShortDate(data.updatedAt) }}</p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

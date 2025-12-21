<script setup lang="ts">
import type { EvidenceItem } from '~/types'

interface EvidenceDetailResponse extends EvidenceItem {
  storagePath?: string
  mimeType?: string
  updatedAt: string
  imageUrl?: string
  downloadUrl?: string

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

const session = useSupabaseSession()
const route = useRoute()
const router = useRouter()

const evidenceId = computed(() => route.params.id as string)
const isDeleting = ref(false)
const imageLoaded = ref(false)
const imageError = ref(false)

const {
  data,
  status,
  error,
  refresh
} = await useFetch<EvidenceDetailResponse>(() => `/api/evidence/${evidenceId.value}`, {
  headers: useRequestHeaders(['cookie'])
})

watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})

watch(error, async (err: any) => {
  if (err?.statusCode === 404) {
    await router.push('/evidence')
  }
})

// Reset image state when data changes
watch(() => data.value?.imageUrl, () => {
  imageLoaded.value = false
  imageError.value = false
})

const typeColors: Record<string, 'success' | 'error' | 'info' | 'warning' | 'neutral'> = {
  positive: 'success',
  incident: 'error',
  medical: 'info',
  school: 'warning',
  communication: 'info',
  legal: 'neutral'
}

const hasImage = computed(() => {
  return Boolean(
    data.value?.imageUrl &&
    data.value?.mimeType &&
    data.value.mimeType.startsWith('image/')
  )
})

const hasFile = computed(() => Boolean(data.value?.downloadUrl))

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
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
    email: 'Email',
    photo: 'Photo',
    document: 'Document'
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

function onImageLoad() {
  imageLoaded.value = true
}

function onImageError() {
  imageError.value = true
}

async function deleteEvidence(close?: () => void) {
  if (!evidenceId.value) return

  isDeleting.value = true
  try {
    await $fetch(`/api/evidence/${evidenceId.value}`, {
      method: 'DELETE'
    })

    if (close) {
      close()
    }

    await router.push('/evidence')
  } catch (err) {
    console.error('Failed to delete evidence:', err)
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="evidence-detail">
    <template #header>
      <UDashboardNavbar title="Evidence">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/evidence"
          >
            Back
          </UButton>
        </template>

        <template #right>
          <div v-if="status === 'success' && data" class="flex items-center gap-2">
            <UButton
              v-if="hasFile && data.downloadUrl"
              icon="i-lucide-download"
              color="neutral"
              variant="soft"
              size="sm"
              :to="data.downloadUrl"
              external
              target="_blank"
            >
              Download
            </UButton>

            <UModal
              title="Delete evidence"
              :ui="{ footer: 'justify-end' }"
            >
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
              >
                Delete
              </UButton>

              <template #body>
                <div class="space-y-2">
                  <p class="text-sm">
                    This will permanently delete this evidence item.
                  </p>
                  <p class="text-xs text-muted">
                    Any events or communications that reference this evidence will have their links removed.
                  </p>
                </div>
              </template>

              <template #footer="{ close }">
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="close"
                >
                  Cancel
                </UButton>
                <UButton
                  color="error"
                  variant="solid"
                  :loading="isDeleting"
                  @click="deleteEvidence(close)"
                >
                  Delete
                </UButton>
              </template>
            </UModal>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading state -->
      <div v-if="status === 'pending'" class="max-w-5xl mx-auto">
        <!-- Header skeleton -->
        <div class="px-6 py-4 flex items-center justify-between gap-3 border-b border-default">
          <div class="flex items-center gap-3">
            <USkeleton class="h-6 w-20" />
            <USkeleton class="h-6 w-48" />
          </div>
          <USkeleton class="h-5 w-32" />
        </div>
        
        <!-- Image skeleton -->
        <USkeleton class="w-full aspect-[4/3]" />
        
        <!-- Content skeleton -->
        <div class="p-6 space-y-4">
          <USkeleton class="h-16 w-full" />
        </div>
      </div>

      <!-- Error state -->
      <div v-else-if="status === 'error'" class="p-6 max-w-2xl mx-auto">
        <UCard class="border-error">
          <div class="flex items-center gap-3 text-error">
            <UIcon name="i-lucide-alert-triangle" class="size-5" />
            <p class="font-medium">Failed to load evidence</p>
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
      </div>

      <!-- Content -->
      <div v-else-if="data" class="max-w-5xl mx-auto">
        <!-- Compact header above image -->
        <div class="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-default">
          <div class="flex items-center gap-3 min-w-0">
            <UBadge color="primary" variant="subtle" size="sm">
              <UIcon :name="sourceIcon(data.sourceType)" class="size-3.5 mr-1" />
              {{ sourceLabel(data.sourceType) }}
            </UBadge>
            <h1 class="text-lg font-semibold text-highlighted truncate">
              {{ data.originalName || 'Untitled Evidence' }}
            </h1>
          </div>
          <span class="text-sm text-muted shrink-0">
            {{ formatDate(data.createdAt) }}
          </span>
        </div>

        <!-- Hero Image Section -->
        <div v-if="hasImage && data.imageUrl" class="relative">
          <!-- Image container with loading state -->
          <UModal>
            <div class="relative cursor-zoom-in group">
              <!-- Skeleton placeholder while loading -->
              <div
                v-if="!imageLoaded && !imageError"
                class="w-full aspect-[4/3] bg-muted/20 animate-pulse flex items-center justify-center"
              >
                <UIcon name="i-lucide-image" class="size-16 text-muted/40" />
              </div>

              <!-- Error state -->
              <div
                v-else-if="imageError"
                class="w-full aspect-[4/3] bg-muted/10 flex flex-col items-center justify-center gap-3"
              >
                <UIcon name="i-lucide-image-off" class="size-12 text-muted" />
                <p class="text-sm text-muted">Failed to load image</p>
              </div>

              <!-- Actual image -->
              <img
                :src="data.imageUrl"
                :alt="data.originalName || 'Evidence image'"
                class="w-full max-h-[70vh] object-contain bg-neutral-950/5 dark:bg-neutral-50/5 transition-opacity duration-300"
                :class="{ 'opacity-0 h-0': !imageLoaded, 'opacity-100': imageLoaded }"
                loading="eager"
                @load="onImageLoad"
                @error="onImageError"
              >

              <!-- Hover overlay -->
              <div
                v-if="imageLoaded"
                class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"
              >
                <div class="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm">
                  <UIcon name="i-lucide-maximize-2" class="size-4" />
                  Click to view full size
                </div>
              </div>
            </div>

            <template #content>
              <div class="bg-black min-h-[80vh] flex items-center justify-center p-4">
                <img
                  :src="data.imageUrl"
                  :alt="data.originalName || 'Evidence image'"
                  class="max-w-full max-h-[90vh] object-contain"
                >
              </div>
            </template>
          </UModal>
        </div>

        <!-- Non-image file display -->
        <div
          v-else-if="data.storagePath"
          class="bg-muted/5 border-b border-default py-16 flex flex-col items-center justify-center gap-4"
        >
          <div class="size-20 rounded-2xl bg-muted/10 flex items-center justify-center">
            <UIcon :name="sourceIcon(data.sourceType)" class="size-10 text-muted" />
          </div>
          <p class="text-sm text-muted">{{ data.mimeType || 'File attached' }}</p>
          <UButton
            v-if="hasFile && data.downloadUrl"
            icon="i-lucide-download"
            color="primary"
            variant="soft"
            :to="data.downloadUrl"
            external
            target="_blank"
          >
            Download File
          </UButton>
        </div>

        <!-- Content Section -->
        <div class="p-6 space-y-6">
          <!-- Summary -->
          <p v-if="data.summary" class="text-base text-muted leading-relaxed">
            {{ data.summary }}
          </p>

          <!-- Tags -->
          <div v-if="data.tags?.length" class="flex flex-wrap gap-2 -mt-2">
            <UBadge
              v-for="tag in data.tags"
              :key="tag"
              color="neutral"
              variant="outline"
              size="sm"
            >
              {{ tag }}
            </UBadge>
          </div>

          <!-- Related Events -->
          <div v-if="data.relatedEvents?.length" class="pt-6 border-t border-default space-y-4">
            <h2 class="text-lg font-medium text-highlighted">Related Events</h2>

            <div class="grid gap-3 sm:grid-cols-2">
              <NuxtLink
                v-for="event in data.relatedEvents"
                :key="event.id"
                :to="`/event/${event.id}`"
                class="group block p-4 rounded-xl border border-default bg-muted/5 hover:bg-muted/10 hover:border-primary/30 transition-all"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2">
                      <UBadge
                        :color="typeColors[event.type as keyof typeof typeColors] || 'neutral'"
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
                        Primary
                      </UBadge>
                    </div>
                    <p class="font-medium text-highlighted group-hover:text-primary transition-colors">
                      {{ event.title }}
                    </p>
                    <p class="text-xs text-muted mt-1">
                      {{ formatShortDate(event.timestamp) }}
                    </p>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4 text-muted group-hover:text-primary transition-colors shrink-0"
                  />
                </div>
              </NuxtLink>
            </div>
          </div>

          <!-- Related Communications -->
          <div v-if="data.relatedCommunications?.length" class="pt-6 border-t border-default space-y-4">
            <h2 class="text-lg font-medium text-highlighted">Related Communications</h2>

            <div class="space-y-3">
              <div
                v-for="comm in data.relatedCommunications"
                :key="comm.id"
                class="p-4 rounded-xl border border-default bg-muted/5"
              >
                <div class="flex items-center justify-between mb-2">
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
                <p v-if="comm.subject" class="font-medium text-highlighted">{{ comm.subject }}</p>
                <p class="text-sm text-muted">{{ comm.summary }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

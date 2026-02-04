<script setup lang="ts">
import type { NuxtError } from '#app'
import { Analytics } from '@vercel/analytics/nuxt'

const props = defineProps<{
  error: NuxtError
}>()

const is404 = computed(() => props.error?.statusCode === 404)

const title = computed(() => is404.value ? 'Page not found' : 'Something went wrong')
const description = computed(() => 
  is404.value 
    ? "The page you're looking for doesn't exist or has been moved."
    : "We're sorry, but something unexpected happened. Please try again."
)

useSeoMeta({
  title: title.value,
  description: description.value
})

useHead({
  htmlAttrs: {
    lang: 'en'
  }
})

const user = useSupabaseUser()
const handleError = () => clearError({ redirect: user.value ? '/home' : '/' })
const handleRetry = () => {
  if (import.meta.client) {
    window.location.reload()
  }
}
</script>

<template>
  <UApp>
    <div class="min-h-screen bg-default flex flex-col">
      <!-- Header -->
      <header class="border-b border-default bg-default">
        <UContainer>
          <div class="flex h-16 items-center justify-between">
            <!-- Logo -->
            <NuxtLink to="/" class="flex items-center gap-2.5">
              <AppLogoIcon :size="28" />
              <span class="text-lg font-semibold tracking-tight text-highlighted">
                Daylight
              </span>
            </NuxtLink>

            <!-- Color mode toggle -->
            <UColorModeButton
              size="sm"
              color="neutral"
              variant="ghost"
            />
          </div>
        </UContainer>
      </header>

      <!-- Main content -->
      <main class="flex-1 flex items-center justify-center px-4">
        <div class="text-center max-w-md">
          <!-- Error code badge -->
          <div class="mb-6 inline-flex items-center gap-2 rounded-full border border-error/30 bg-error/10 px-4 py-1.5 text-sm font-medium text-error">
            <UIcon :name="is404 ? 'i-lucide-search-x' : 'i-lucide-alert-triangle'" class="size-4" />
            Error {{ error?.statusCode || 500 }}
          </div>

          <!-- Title -->
          <h1 class="text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
            {{ title }}
          </h1>

          <!-- Description -->
          <p class="mt-4 text-lg text-muted leading-relaxed">
            {{ description }}
          </p>

          <!-- Error message (for non-404s) -->
          <p 
            v-if="!is404 && error?.message" 
            class="mt-4 text-sm text-dimmed font-mono bg-elevated rounded-lg p-3"
          >
            {{ error.message }}
          </p>

          <!-- Action buttons -->
          <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <UButton
              color="primary"
              size="lg"
              @click="handleError"
            >
              <UIcon name="i-lucide-home" class="size-4 mr-2" />
              {{ user ? 'Go to Home' : 'Go to Daylight' }}
            </UButton>
            
            <UButton
              v-if="!is404"
              color="neutral"
              variant="outline"
              size="lg"
              @click="handleRetry"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-4 mr-2" />
              Try again
            </UButton>
          </div>

          <!-- Help link -->
          <p class="mt-8 text-sm text-dimmed">
            Need help? 
            <NuxtLink to="/help" class="text-primary hover:underline">
              Visit our Help Center
            </NuxtLink>
          </p>
        </div>
      </main>

      <!-- Footer -->
      <footer class="border-t border-default py-6">
        <UContainer>
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
            <NuxtLink to="/" class="flex items-center gap-2 hover:text-highlighted transition">
              <AppLogoIcon :size="20" />
              <span class="font-medium">Daylight</span>
            </NuxtLink>
            <div class="flex items-center gap-4">
              <NuxtLink to="/privacy" class="hover:text-highlighted transition">Privacy</NuxtLink>
              <NuxtLink to="/help" class="hover:text-highlighted transition">Help</NuxtLink>
            </div>
          </div>
        </UContainer>
      </footer>
    </div>
  </UApp>
  <Analytics />
</template>


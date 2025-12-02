<script setup lang="ts">
definePageMeta({
  layout: false
})

useHead({
  title: 'Inngest Test'
})

const message = ref('Hello from Daylight!')
const isLoading = ref(false)
const results = ref<Array<{
  id: string
  timestamp: string
  success: boolean
  eventId?: string
  error?: string
}>>([])

async function triggerTestJob() {
  isLoading.value = true
  const id = crypto.randomUUID()
  
  try {
    const response = await $fetch('/api/test-job', {
      method: 'POST',
      body: { message: message.value }
    })
    
    results.value.unshift({
      id,
      timestamp: new Date().toISOString(),
      success: true,
      eventId: response.eventId
    })
  } catch (error: any) {
    results.value.unshift({
      id,
      timestamp: new Date().toISOString(),
      success: false,
      error: error?.data?.message || error?.message || 'Unknown error'
    })
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen p-8">
    <UContainer class="max-w-xl">
      <div class="space-y-6">
        <!-- Header -->
        <div class="text-center">
          <h1 class="text-2xl font-semibold">Inngest Test</h1>
          <p class="text-sm text-muted mt-1">Validate background job processing</p>
        </div>

        <!-- Instructions -->
        <UAlert
          title="How to test"
          icon="i-lucide-info"
          color="info"
          variant="subtle"
        >
          <template #description>
            <ol class="list-decimal list-inside space-y-1 text-sm mt-2">
              <li>Run <UKbd>npx inngest-cli@latest dev -u http://localhost:3000/api/inngest</UKbd></li>
              <li>Open <ULink to="http://localhost:8288" target="_blank">localhost:8288</ULink></li>
              <li>Click "Trigger Test Job" below</li>
            </ol>
          </template>
        </UAlert>

        <!-- Trigger Form -->
        <UCard>
          <div class="space-y-4">
            <UFormField label="Message">
              <UInput v-model="message" placeholder="Enter a test message..." />
            </UFormField>

            <UButton
              block
              icon="i-lucide-zap"
              :loading="isLoading"
              @click="triggerTestJob"
            >
              Trigger Test Job
            </UButton>
          </div>
        </UCard>

        <!-- Results -->
        <UCard v-if="results.length > 0">
          <template #header>
            <div class="flex items-center justify-between">
              <span class="font-medium">Results</span>
              <UButton variant="ghost" size="xs" @click="results = []">
                Clear
              </UButton>
            </div>
          </template>

          <div class="space-y-2">
            <UAlert
              v-for="result in results"
              :key="result.id"
              :color="result.success ? 'success' : 'error'"
              :icon="result.success ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
              :title="result.success ? 'Job Queued' : 'Failed'"
              variant="subtle"
            >
              <template #description>
                <div class="text-xs space-y-1">
                  <p v-if="result.eventId" class="font-mono truncate">
                    Event ID: {{ result.eventId }}
                  </p>
                  <p v-if="result.error">{{ result.error }}</p>
                  <p class="text-muted">{{ new Date(result.timestamp).toLocaleTimeString() }}</p>
                </div>
              </template>
            </UAlert>
          </div>
        </UCard>

        <!-- Footer -->
        <p class="text-center text-sm text-muted">
          Jobs complete after ~3 seconds. Check the Inngest dashboard for details.
        </p>
      </div>
    </UContainer>
  </div>
</template>

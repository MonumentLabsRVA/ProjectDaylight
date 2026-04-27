<script setup lang="ts">
import { Analytics } from '@vercel/analytics/nuxt';

const colorMode = useColorMode()
const loadingIndicatorColor = computed(() => colorMode.value === 'dark' ? '#38bdf8' : '#0369a1')

useHead({
  titleTemplate: (titleChunk) => {
    if (!titleChunk || titleChunk === 'Daylight') {
      return 'Daylight'
    }

    return titleChunk.includes('Daylight') ? titleChunk : `${titleChunk} | Daylight`
  }
})

</script>

<template>
  <UApp>
    <NuxtLoadingIndicator :color="loadingIndicatorColor" />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
  <Analytics />
</template>

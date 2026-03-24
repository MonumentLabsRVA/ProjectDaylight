<script setup lang="ts">
import { Analytics } from '@vercel/analytics/nuxt';

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
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
  <Analytics />
</template>

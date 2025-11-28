<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <!-- Subtle animated background -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style="animation-duration: 8s;" />
      <div class="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-primary/3 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style="animation-duration: 12s;" />
    </div>

    <!-- Header -->
    <header class="fixed top-0 left-0 right-0 z-50 bg-default/80 backdrop-blur-md border-b border-default/50">
      <div class="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2">
          <AppLogoIcon :size="24" />
          <span class="text-base font-semibold tracking-tight text-highlighted">
            Daylight
          </span>
        </NuxtLink>

        <ClientOnly>
          <UColorModeButton size="sm" color="neutral" variant="ghost" />
        </ClientOnly>
      </div>
    </header>

    <!-- Main content -->
    <main class="relative z-10 pt-14">
      <slot />
    </main>
  </div>
</template>


<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <!-- Header -->
    <header class="fixed left-0 right-0 top-0 z-50 border-b border-default/80 bg-default/80 backdrop-blur-md">
      <UContainer>
        <div class="flex h-16 items-center justify-between">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center gap-2.5">
            <AppLogoIcon :size="28" />
            <span class="text-lg font-semibold tracking-tight text-highlighted">
              Daylight
            </span>
          </NuxtLink>

          <!-- Right side -->
          <div class="flex items-center gap-2">
            <UColorModeButton
              size="sm"
              color="neutral"
              variant="ghost"
            />

            <!-- Log in button - icon only on mobile, text on desktop -->
            <NuxtLink to="/auth/login">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-log-in"
                class="sm:hidden"
                square
              />
            </NuxtLink>

            <NuxtLink to="/auth/login" class="hidden sm:block">
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
              >
                Log in
              </UButton>
            </NuxtLink>

            <!-- Get started button - text on all screen sizes -->
            <NuxtLink to="/auth/signup">
              <UButton
                color="primary"
                size="sm"
              >
                Get started
              </UButton>
            </NuxtLink>
          </div>
        </div>
      </UContainer>
    </header>

    <!-- Spacer for fixed header -->
    <div class="h-16" />

    <!-- Main content -->
    <main>
      <slot />
    </main>

    <!-- Footer -->
    <UFooter>
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2">
          <AppLogoIcon :size="24" />
          <span class="font-semibold tracking-tight text-highlighted">
            Daylight
          </span>
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="[
          { label: 'Help & FAQ', to: '/help' },
          { label: 'Privacy Policy', to: '/privacy' },
          { label: 'Terms of Service', to: '/terms' },
          { label: 'Security', to: '/security' }
        ]"
        variant="link"
      />

      <template #right>
        <a
          href="https://monumentlabs.io"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-muted transition hover:text-highlighted"
        >
          Made by Monument Labs
        </a>
      </template>
    </UFooter>
  </div>
</template>

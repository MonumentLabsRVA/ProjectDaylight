<script setup lang="ts">
const route = useRoute()

// Don't show FAB on the journal/new page since that's where recording happens
const isVisible = computed(() => {
  return route.path !== '/journal/new'
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-75 translate-y-4"
    enter-to-class="opacity-100 scale-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100 translate-y-0"
    leave-to-class="opacity-0 scale-75 translate-y-4"
  >
    <NuxtLink
      v-if="isVisible"
      to="/journal/new"
      class="lg:hidden fixed bottom-6 right-6 z-50 group"
    >
      <!-- Main button -->
      <span
        class="relative flex items-center justify-center size-14 rounded-full bg-primary text-white shadow-lg shadow-primary/25 transition-all duration-200 active:scale-95 group-hover:shadow-xl group-hover:shadow-primary/30"
      >
        <UIcon 
          name="i-lucide-mic" 
          class="size-6"
        />
      </span>
      
      <!-- Tooltip label -->
      <span 
        class="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-inverted text-inverted text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg"
      >
        Record
      </span>
    </NuxtLink>
  </Transition>
</template>


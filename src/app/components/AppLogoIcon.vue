<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 400 400"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Sky blue rounded square base -->
    <rect
      x="20"
      y="20"
      width="360"
      height="360"
      rx="48"
      ry="48"
      class="fill-sky-500 dark:fill-sky-400"
    />

    <!-- Amber sun corner fold - curved page peel -->
    <path
      d="M20 72 
         Q20 20 72 20
         L180 20
         Q115 125 20 250
         Z"
      class="fill-amber-400 dark:fill-amber-300"
    />

    <!-- Subtle highlight on the fold edge for depth -->
    <path
      d="M180 20
         Q115 125 20 250"
      class="stroke-amber-300/50 dark:stroke-amber-200/40"
      stroke-width="3"
      fill="none"
    />
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  size?: number | string
}>(), {
  size: 40
})
</script>


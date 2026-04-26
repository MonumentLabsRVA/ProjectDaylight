<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const router = useRouter()
const toast = useToast()
// Read both: setActive flips the global ref + persists; activeCase is derived
// from the ref so this component (and every other consumer) reacts in lockstep.
const { cases, activeCase, setActive } = useCases()

const items = computed<DropdownMenuItem[][]>(() => {
  const caseEntries: DropdownMenuItem[] = cases.value.map((c) => ({
    label: c.title,
    icon: c.isActive ? 'i-lucide-check' : 'i-lucide-briefcase',
    onSelect: async (e: Event) => {
      e.preventDefault()
      if (c.isActive) return
      try {
        await setActive(c.id)
      } catch (err) {
        toast.add({
          title: 'Could not switch case',
          description: (err as Error)?.message ?? 'Please try again.',
          color: 'error'
        })
      }
    }
  }))

  return [
    [{
      type: 'label',
      label: cases.value.length > 1 ? 'Your cases' : 'Active case'
    }],
    caseEntries.length ? caseEntries : [{
      label: 'No cases yet',
      disabled: true,
      icon: 'i-lucide-circle-dashed'
    }],
    [{
      label: 'Manage case',
      icon: 'i-lucide-settings',
      onSelect: (e: Event) => {
        e.preventDefault()
        router.push('/case')
      }
    }]
  ]
})

const triggerLabel = computed(() => activeCase.value?.title ?? 'Daylight')
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', side: 'bottom', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <button
      type="button"
      class="flex items-center gap-2.5 py-3 w-full ring-default data-[state=open]:bg-elevated rounded-md transition-colors"
      :class="collapsed ? 'justify-center px-2' : 'px-3'"
    >
      <AppLogoIcon :size="collapsed ? 24 : 20" class="shrink-0" />
      <div
        v-if="!collapsed"
        class="flex flex-col text-sm font-medium leading-tight text-highlighted text-left flex-1 min-w-0"
      >
        <span class="truncate">{{ triggerLabel }}</span>
      </div>
      <UIcon
        v-if="!collapsed"
        name="i-lucide-chevrons-up-down"
        class="text-dimmed shrink-0 size-4"
      />
    </button>
  </UDropdownMenu>
</template>

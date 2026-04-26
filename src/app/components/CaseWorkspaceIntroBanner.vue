<script setup lang="ts">
// Shown once to users who existed before the case-scoping rollout (2026-04-26).
// New signups never see it. Dismissal is per-device (localStorage) — if they
// hop devices and see it again, no real harm done.

const ROLLOUT_DATE = new Date('2026-04-26T00:00:00Z')
const STORAGE_KEY = 'daylight:caseWorkspacesIntroSeen'

const user = useSupabaseUser()
const { activeCase, cases } = useCases()
const dismissed = useLocalStorage(STORAGE_KEY, false)

const isExistingUser = computed(() => {
  const createdAt = (user.value as any)?.created_at
  if (!createdAt) return false
  return new Date(createdAt) < ROLLOUT_DATE
})

const shouldShow = computed(() =>
  !dismissed.value
  && isExistingUser.value
  && cases.value.length > 0
)

const description = computed(() => {
  const caseTitle = activeCase.value?.title ?? 'your active case'
  if (cases.value.length > 1) {
    return `All your existing notes, evidence, and journal entries are now in ${caseTitle}. Switch between your other cases anytime from the menu in the top-left of the sidebar.`
  }
  return `Everything you've captured is now organized under ${caseTitle}. You can switch cases or start a new one from the menu in the top-left of the sidebar.`
})

function dismiss() {
  dismissed.value = true
}
</script>

<template>
  <UAlert
    v-if="shouldShow"
    icon="i-lucide-sparkles"
    color="primary"
    variant="subtle"
    title="Daylight now organizes work by case"
    :description="description"
    :close="{ color: 'neutral', variant: 'ghost' }"
    class="mb-4"
    @update:open="(open: boolean) => { if (!open) dismiss() }"
  />
</template>

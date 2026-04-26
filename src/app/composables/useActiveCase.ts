import { computed } from 'vue'
import { useState, useFetch, refreshNuxtData } from '#app'

export interface CaseListItem {
  id: string
  title: string
  isActive: boolean
}

interface CasesResponse {
  cases: CaseListItem[]
  activeCaseId: string | null
}

/**
 * The currently-selected case id, as a single global reactive ref.
 *
 * Source of truth lives on the server (`profiles.active_case_id`). This ref is
 * hydrated by `useCases()` from `/api/cases` and updated optimistically by
 * `setActive()`. Any composable, component, or page can `useActiveCase()` to
 * read or watch the value — no prop drilling, no event bus.
 *
 * Pages that need case-scoped data have two options:
 *   1. Pass it as a reactive query param: `useFetch('/api/x', { query: { caseId: useActiveCase() } })`
 *      → Nuxt auto-refetches when the ref changes.
 *   2. Just call `useFetch('/api/x')` and rely on `refreshNuxtData()` (called from
 *      `setActive`) to invalidate caches after a switch.
 *
 * Most server endpoints already pick up the active case from `profiles.active_case_id`
 * via `getActiveCaseId()`, so option 2 works out-of-the-box for the common case.
 * Option 1 is for pages that want to render a different case temporarily without
 * persisting it.
 */
export const useActiveCase = () =>
  useState<string | null>('daylight:activeCaseId', () => null)

export const useCases = () => {
  const activeCaseId = useActiveCase()

  const { data, refresh, status } = useFetch<CasesResponse>('/api/cases', {
    key: 'cases-list',
    default: () => ({ cases: [], activeCaseId: null }),
    onResponse({ response }) {
      // Hydrate the global ref from the server's authoritative resolution.
      // Don't clobber a more recent optimistic update if one is in flight.
      const serverActive = response._data?.activeCaseId ?? null
      if (serverActive && activeCaseId.value === null) {
        activeCaseId.value = serverActive
      }
    }
  })

  const cases = computed<CaseListItem[]>(() => data.value?.cases ?? [])
  const activeCase = computed(
    () => cases.value.find((c) => c.id === activeCaseId.value)
      ?? cases.value.find((c) => c.isActive)
      ?? cases.value[0]
      ?? null
  )

  const setActive = async (caseId: string) => {
    if (activeCaseId.value === caseId) return

    const previous = activeCaseId.value
    // Optimistic: flip the ref immediately so every watcher reacts in one tick.
    activeCaseId.value = caseId

    try {
      await $fetch('/api/cases/active', {
        method: 'POST',
        body: { caseId }
      })
    } catch (err) {
      // Roll back on failure.
      activeCaseId.value = previous
      throw err
    }

    // Refresh the cases list (so isActive flags update) and invalidate every
    // `useFetch` cache so case-scoped data on the current page re-fetches.
    await Promise.all([refresh(), refreshNuxtData()])
  }

  return { cases, activeCase, activeCaseId, setActive, refresh, status }
}

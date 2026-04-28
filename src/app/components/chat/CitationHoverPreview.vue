<script setup lang="ts">
const { target, enterPreview, leavePreview, dismiss } = useCitationHoverState()
const { show } = useCitationViewer()

const cache = ref<Record<string, { loading: boolean, data: Record<string, unknown> | null, error: string | null }>>({})

const cacheKey = computed(() => target.value ? `${target.value.kind}:${target.value.id}` : null)

watch(cacheKey, async (key) => {
  if (!key) return
  if (cache.value[key]) return
  cache.value[key] = { loading: true, data: null, error: null }
  try {
    const [kind, id] = key.split(':')
    const data = await $fetch<Record<string, unknown>>(`/api/chat-citation/${kind}/${id}`, {
      headers: useRequestHeaders(['cookie'])
    })
    cache.value[key] = { loading: false, data, error: null }
  } catch (e) {
    cache.value[key] = {
      loading: false,
      data: null,
      error: e instanceof Error ? e.message : 'Could not load preview'
    }
  }
}, { immediate: false })

const current = computed(() => cacheKey.value ? cache.value[cacheKey.value] : null)
const data = computed(() => current.value?.data ?? null)

// Position the preview flush against the link's bottom (no physical gap).
// A pseudo-element extends the hit area upward 12px to bridge the visual gap
// from the link to the preview body, so the cursor stays "inside" continuously.
const popoverStyle = computed(() => {
  const t = target.value
  if (!t || typeof window === 'undefined') return { display: 'none' }
  const PREVIEW_W = 360
  const left = Math.max(12, Math.min(t.x - PREVIEW_W / 2, window.innerWidth - PREVIEW_W - 12))
  return {
    position: 'fixed' as const,
    left: `${left}px`,
    // Align the bridge zone's top with the link's bottom so the cursor never
    // crosses dead space.
    top: `${t.y}px`,
    width: `${PREVIEW_W}px`,
    zIndex: 60,
    pointerEvents: 'auto' as const
  }
})

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

function openFull() {
  if (!target.value) return
  const t = target.value
  dismiss()
  show({ kind: t.kind as 'event' | 'message' | 'journal', id: t.id })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="target"
      :style="popoverStyle"
      @mouseenter="enterPreview"
      @mouseleave="leavePreview"
    >
      <!-- Bridge zone: invisible 10px strip at the top that overlaps the link's
           bottom edge, so the cursor can never escape the hover state while
           moving from the link into the preview body. -->
      <div class="h-2.5 w-full" />

      <div class="rounded-lg border border-default bg-default shadow-lg p-3 flex flex-col gap-2">
        <div v-if="current?.loading" class="text-xs text-muted">
          Loading…
        </div>
        <div v-else-if="current?.error" class="text-xs text-error">
          {{ current.error }}
        </div>

        <template v-else-if="data && target.kind === 'message'">
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span class="font-medium text-highlighted truncate">{{ data.sender }}</span>
            <span class="shrink-0">{{ fmtDate(data.timestamp as string) }}</span>
          </div>
          <div v-if="data.subject" class="text-sm font-medium text-highlighted truncate">
            {{ data.subject }}
          </div>
          <p class="text-sm text-default whitespace-pre-wrap line-clamp-6">
            {{ data.body }}
          </p>
          <div class="flex items-center justify-between pt-1.5 border-t border-default">
            <span class="text-xs text-muted">
              <span v-if="(data.thread as unknown[])?.length">
                {{ (data.thread as unknown[]).length }} in thread
              </span>
            </span>
            <UButton
              icon="i-lucide-maximize-2"
              label="Open"
              size="xs"
              variant="ghost"
              @click="openFull"
            />
          </div>
        </template>

        <template v-else-if="data && target.kind === 'event'">
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span class="font-medium text-highlighted truncate">{{ data.title }}</span>
            <span class="shrink-0">{{ fmtDate(data.timestamp as string) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-1">
            <UBadge :label="data.type as string" variant="subtle" size="xs" color="neutral" />
            <UBadge v-if="data.childInvolved" label="child involved" variant="subtle" size="xs" color="primary" />
            <UBadge v-if="data.safetyConcern" label="safety" variant="subtle" size="xs" color="error" />
          </div>
          <p class="text-sm text-default whitespace-pre-wrap line-clamp-6">
            {{ data.description }}
          </p>
          <div class="flex justify-end pt-1.5 border-t border-default">
            <UButton
              icon="i-lucide-maximize-2"
              label="Open"
              size="xs"
              variant="ghost"
              @click="openFull"
            />
          </div>
        </template>

        <template v-else-if="data && target.kind === 'journal'">
          <div class="flex items-center justify-between gap-2 text-xs text-muted">
            <span class="font-medium text-highlighted">Journal entry</span>
            <span>{{ data.referenceDate || fmtDate(data.createdAt as string) }}</span>
          </div>
          <p class="text-sm text-default whitespace-pre-wrap line-clamp-6">
            {{ data.text }}
          </p>
          <div class="flex justify-end pt-1.5 border-t border-default">
            <UButton
              icon="i-lucide-maximize-2"
              label="Open"
              size="xs"
              variant="ghost"
              @click="openFull"
            />
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

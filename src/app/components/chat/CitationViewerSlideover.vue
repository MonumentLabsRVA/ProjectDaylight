<script setup lang="ts">
const { target, open, close } = useCitationViewer()

const data = ref<Record<string, unknown> | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

watch([target, open], async ([t, isOpen]) => {
  if (!isOpen || !t) return
  loading.value = true
  error.value = null
  data.value = null
  try {
    data.value = await $fetch(`/api/chat-citation/${t.kind}/${t.id}`, {
      headers: useRequestHeaders(['cookie'])
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load'
  } finally {
    loading.value = false
  }
}, { immediate: false })

const sourcePath = computed(() => (data.value?.sourcePath as string) || '#')

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  })
}

function onClose() { close() }

type ToneColor = 'success' | 'neutral' | 'warning' | 'error' | 'primary'
function threadToneColor(tone: string | null | undefined): ToneColor {
  if (tone === 'cooperative') return 'success'
  if (tone === 'tense') return 'warning'
  if (tone === 'hostile') return 'error'
  if (tone === 'mixed') return 'primary'
  return 'neutral'
}
</script>

<template>
  <USlideover :open="open" side="right" @update:open="(v) => v ? null : onClose()">
    <template #content>
      <div class="flex flex-col h-full">
        <div class="flex items-center justify-between px-5 py-4 border-b border-default">
          <div class="flex items-center gap-2 min-w-0">
            <UIcon
              :name="target?.kind === 'event' ? 'i-lucide-calendar-clock'
                : target?.kind === 'message' ? 'i-lucide-message-square-text'
                  : target?.kind === 'thread' ? 'i-lucide-messages-square'
                    : 'i-lucide-book-open'"
              class="size-4 text-primary shrink-0"
            />
            <p class="text-sm font-medium text-highlighted capitalize">
              {{ target?.kind }} preview
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton
              v-if="data"
              icon="i-lucide-external-link"
              label="Open full page"
              size="xs"
              color="neutral"
              variant="outline"
              :to="sourcePath"
            />
            <UButton
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="onClose"
            />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto px-5 py-4">
          <div v-if="loading" class="text-sm text-muted">
            Loading…
          </div>
          <div v-else-if="error" class="text-sm text-error">
            {{ error }}
          </div>

          <div v-else-if="data && target?.kind === 'message'" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center justify-between gap-3 text-xs text-muted">
                <span class="font-medium text-highlighted">{{ data.sender }}</span>
                <span>{{ fmtDate(data.timestamp as string) }}</span>
              </div>
              <div class="text-xs text-muted">
                to {{ data.recipient }}
                <span v-if="data.messageNumber"> · #{{ data.messageNumber }}</span>
              </div>
              <div v-if="data.subject" class="mt-1 text-sm font-medium text-highlighted">
                {{ data.subject }}
              </div>
            </div>
            <div class="prose prose-sm max-w-none whitespace-pre-wrap text-default">
              {{ data.body }}
            </div>

            <div v-if="(data.thread as unknown[])?.length" class="mt-2 flex flex-col gap-2">
              <div class="text-xs font-medium uppercase tracking-wide text-muted">
                Thread context
              </div>
              <div class="flex flex-col rounded-md border border-default divide-y divide-default">
                <button
                  v-for="m in (data.thread as Array<Record<string, unknown>>)"
                  :key="m.id as string"
                  type="button"
                  class="flex items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-elevated"
                  :class="{ 'bg-primary/5': m.id === data.id }"
                  @click="$router.push(`/messages/${m.id}`)"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 text-xs">
                      <span class="font-medium text-highlighted truncate">{{ m.sender }}</span>
                      <span class="text-muted">{{ fmtDate(m.sentAt as string) }}</span>
                    </div>
                    <div v-if="m.subject" class="truncate text-xs text-muted">
                      {{ m.subject }}
                    </div>
                  </div>
                  <UIcon
                    v-if="m.id === data.id"
                    name="i-lucide-arrow-left-from-line"
                    class="size-3 text-primary"
                  />
                </button>
              </div>
            </div>
          </div>

          <div v-else-if="data && target?.kind === 'event'" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <div class="text-base font-semibold text-highlighted">
                {{ data.title }}
              </div>
              <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{{ fmtDate(data.timestamp as string) }}</span>
                <span v-if="data.location"> · {{ data.location }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-1">
                <UBadge :label="data.type as string" variant="subtle" size="xs" color="neutral" />
                <UBadge v-if="data.childInvolved" label="child involved" variant="subtle" size="xs" color="primary" />
                <UBadge v-if="data.safetyConcern" label="safety concern" variant="subtle" size="xs" color="error" />
              </div>
            </div>
            <div class="prose prose-sm max-w-none whitespace-pre-wrap text-default">
              {{ data.description }}
            </div>
            <div v-if="(data.participants as unknown[])?.length" class="flex flex-col gap-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted">
                Participants
              </div>
              <ul class="text-sm text-default">
                <li v-for="(p, i) in (data.participants as Array<Record<string, unknown>>)" :key="i">
                  {{ p.label }} <span class="text-muted">({{ p.role }})</span>
                </li>
              </ul>
            </div>
          </div>

          <div v-else-if="data && target?.kind === 'journal'" class="flex flex-col gap-3">
            <div class="flex items-center justify-between gap-3 text-xs text-muted">
              <span class="font-medium text-highlighted">Journal entry</span>
              <span>{{ data.referenceDate || fmtDate(data.createdAt as string) }}</span>
            </div>
            <div class="prose prose-sm max-w-none whitespace-pre-wrap text-default">
              {{ data.text }}
            </div>
          </div>

          <div v-else-if="data && target?.kind === 'thread'" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1">
              <div v-if="data.subject" class="text-base font-semibold text-highlighted">
                {{ data.subject }}
              </div>
              <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{{ fmtDate(data.firstSentAt as string) }} – {{ fmtDate(data.lastSentAt as string) }}</span>
                <span>· {{ data.messageCount }} messages</span>
              </div>
              <div class="flex flex-wrap items-center gap-1.5 mt-1">
                <UBadge
                  v-if="data.tone"
                  :label="(data.tone as string)"
                  variant="subtle"
                  size="xs"
                  :color="threadToneColor(data.tone as string)"
                />
                <UBadge
                  v-for="f in (data.flags as string[] | undefined) ?? []"
                  :key="f"
                  :label="f.replace(/_/g, ' ')"
                  variant="subtle"
                  size="xs"
                  color="neutral"
                />
              </div>
            </div>
            <div v-if="(data.participants as string[] | undefined)?.length" class="flex flex-col gap-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted">
                Participants
              </div>
              <div class="text-sm text-default">
                {{ ((data.participants as string[]) ?? []).join(', ') }}
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <div class="text-xs font-medium uppercase tracking-wide text-muted">
                Summary
              </div>
              <div class="prose prose-sm max-w-none whitespace-pre-wrap text-default">
                {{ data.summary }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { useActiveCase } from '~/composables/useActiveCase'

type MessageRow = Tables<'messages'>

type ThreadMessage = Pick<
  MessageRow,
  | 'id' | 'sent_at' | 'first_viewed_at' | 'sender' | 'recipient' | 'subject'
  | 'body' | 'thread_id' | 'message_number' | 'sequence_number'
  | 'word_count' | 'attachments' | 'evidence_id'
>

interface MessagesResponse {
  messages: ThreadMessage[]
  total: number
  limit: number
  offset: number
}

interface ThreadGroup {
  id: string
  subject: string
  senders: string[]
  latestSentAt: string
  earliestSentAt: string
  messageCount: number
  messages: ThreadMessage[]
  hasAttachments: boolean
  latestPreview: string
  latestSender: string
}

const activeCaseId = useActiveCase()
const { formatDate: formatTzDate } = useTimezone()

const q = ref('')
const senderFilter = ref<'all' | string>('all')
const dateFrom = ref<string>('')
const dateTo = ref<string>('')
const offset = ref(0)
const limit = 100

// Debounce search query so we don't refetch on every keystroke.
const debouncedQ = ref('')
let qTimer: ReturnType<typeof setTimeout> | null = null
watch(q, (val) => {
  if (qTimer) clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    debouncedQ.value = val.trim()
    offset.value = 0
  }, 250)
})

// Use `useAsyncData` + an inline `$fetch` rather than `useFetch` with a
// reactive `query`/URL: Nuxt's reactive-query path causes `await useFetch` to
// resolve *before* the SSR fetch completes, leaving `status`/`data` undefined
// at render time and producing a structural hydration mismatch when the
// client re-renders with the populated payload. With `useAsyncData`, the
// fetcher closure reads the current query each time it runs, the SSR `await`
// genuinely waits for the response, and `refresh()` re-runs the closure
// after any param change.
function buildQuery(): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(offset.value)
  }
  if (activeCaseId.value) params.caseId = activeCaseId.value
  if (debouncedQ.value) params.q = debouncedQ.value
  if (senderFilter.value !== 'all') params.sender = senderFilter.value
  if (dateFrom.value) params.from = `${dateFrom.value}T00:00:00`
  if (dateTo.value) params.to = `${dateTo.value}T23:59:59`
  return params
}

const requestHeaders = useRequestHeaders(['cookie'])
const { data, status, refresh } = await useAsyncData<MessagesResponse>(
  'messages-list',
  () => $fetch<MessagesResponse>('/api/messages', {
    headers: requestHeaders,
    query: buildQuery()
  })
)

watch(
  [activeCaseId, debouncedQ, senderFilter, dateFrom, dateTo, offset],
  () => { refresh() }
)

const session = useSupabaseSession()
watch(session, (s) => { if (s?.access_token) refresh() })

const totalPages = computed(() => {
  const t = data.value?.total ?? 0
  return Math.max(1, Math.ceil(t / limit))
})
const currentPage = computed(() => Math.floor(offset.value / limit) + 1)

function nextPage() {
  if (currentPage.value < totalPages.value) offset.value += limit
}
function prevPage() {
  if (offset.value > 0) offset.value = Math.max(0, offset.value - limit)
}

// Senders list — derive from the active page; good enough for v0 since most
// custody cases have 2–3 distinct senders.
const senderOptions = computed(() => {
  const set = new Set<string>()
  for (const m of data.value?.messages ?? []) set.add(m.sender)
  const opts: { label: string; value: string }[] = [{ label: 'All senders', value: 'all' }]
  for (const s of [...set].sort()) opts.push({ label: s, value: s })
  return opts
})

function clearFilters() {
  q.value = ''
  debouncedQ.value = ''
  senderFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
  offset.value = 0
}

const hasFilters = computed(() =>
  q.value.length > 0 || senderFilter.value !== 'all' || !!dateFrom.value || !!dateTo.value
)

function formatSent(value: string) {
  return formatTzDate(value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatSentShort(value: string) {
  return formatTzDate(value, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function previewText(body: string, n: number) {
  if (body.length <= n) return body
  return body.slice(0, n).trimEnd() + '…'
}

function attachmentLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((s): s is string => typeof s === 'string')
}

// Group the paginated batch by thread_id. Singletons (no thread_id, or a
// thread that happens to have one row in the current page) become their own
// group keyed by `single:<id>`. Within a group, messages are sorted oldest →
// newest so the conversation reads top-to-bottom like Gmail.
const threads = computed<ThreadGroup[]>(() => {
  const buckets = new Map<string, ThreadMessage[]>()
  for (const m of data.value?.messages ?? []) {
    const key = m.thread_id ?? `single:${m.id}`
    const arr = buckets.get(key) ?? []
    arr.push(m)
    buckets.set(key, arr)
  }
  const out: ThreadGroup[] = []
  for (const [id, msgs] of buckets) {
    const sorted = [...msgs].sort((a, b) => a.sent_at.localeCompare(b.sent_at))
    const last = sorted[sorted.length - 1]!
    const first = sorted[0]!
    const senders = [...new Set(sorted.map((m) => m.sender))].sort()
    out.push({
      id,
      subject: first.subject || last.subject || '(no subject)',
      senders,
      latestSentAt: last.sent_at,
      earliestSentAt: first.sent_at,
      messageCount: sorted.length,
      messages: sorted,
      hasAttachments: sorted.some((m) => attachmentLabels(m.attachments).length > 0),
      latestPreview: previewText(last.body, 140),
      latestSender: last.sender
    })
  }
  out.sort((a, b) => b.latestSentAt.localeCompare(a.latestSentAt))
  return out
})

const expandedIds = ref<Set<string>>(new Set())
function isExpanded(id: string) {
  return expandedIds.value.has(id)
}
function toggle(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

const allExpanded = computed(() =>
  threads.value.length > 0 && threads.value.every((t) => expandedIds.value.has(t.id))
)
function expandAll() {
  expandedIds.value = new Set(threads.value.map((t) => t.id))
}
function collapseAll() {
  expandedIds.value = new Set()
}

// When the user runs a text search, auto-expand all threads so matching
// messages are immediately visible. Filters that don't search inside bodies
// (sender, date) leave the collapse state alone.
watch([threads, debouncedQ], ([t, query]) => {
  if (query && t.length) {
    expandedIds.value = new Set(t.map((x) => x.id))
  }
})
</script>

<template>
  <UDashboardPanel id="messages">
    <template #header>
      <UDashboardNavbar title="Messages">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <span class="text-sm text-muted hidden sm:inline">
            {{ data?.total ?? 0 }} {{ (data?.total ?? 0) === 1 ? 'message' : 'messages' }}
          </span>
        </template>
      </UDashboardNavbar>

      <div class="shrink-0 flex flex-wrap items-center gap-2 px-4 sm:px-6 py-2 border-b border-default">
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Search message bodies…"
          size="sm"
          class="flex-1 min-w-[180px]"
        />
        <USelect
          v-model="senderFilter"
          :items="senderOptions"
          size="sm"
          class="w-40 shrink-0"
        />
        <UInput v-model="dateFrom" type="date" size="sm" class="w-40 shrink-0" />
        <UInput v-model="dateTo" type="date" size="sm" class="w-40 shrink-0" />
        <UButton
          v-if="hasFilters"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-x"
          @click="clearFilters"
        >
          Clear
        </UButton>
        <UButton
          v-if="threads.length > 0"
          variant="ghost"
          color="neutral"
          size="xs"
          :icon="allExpanded ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
          @click="allExpanded ? collapseAll() : expandAll()"
        >
          {{ allExpanded ? 'Collapse all' : 'Expand all' }}
        </UButton>
      </div>
    </template>

    <template #body>
      <div class="space-y-3 p-4">
        <div v-if="status === 'pending'" class="space-y-2">
          <UCard v-for="i in 6" :key="i">
            <div class="flex flex-col gap-2">
              <USkeleton class="h-4 w-48" />
              <USkeleton class="h-4 w-full" />
              <USkeleton class="h-4 w-3/4" />
            </div>
          </UCard>
        </div>

        <div v-else-if="threads.length > 0" class="space-y-1.5">
          <article
            v-for="t in threads"
            :key="t.id"
            class="border border-default rounded-lg overflow-hidden bg-default"
            :class="isExpanded(t.id) ? 'shadow-sm' : ''"
          >
            <button
              type="button"
              class="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-elevated/40 transition-colors"
              :class="isExpanded(t.id) ? 'bg-elevated/30' : ''"
              :aria-expanded="isExpanded(t.id)"
              :aria-controls="`thread-${t.id}`"
              @click="toggle(t.id)"
            >
              <UIcon
                :name="isExpanded(t.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4 text-muted shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium text-highlighted truncate">
                    {{ t.subject }}
                  </p>
                  <UBadge
                    v-if="t.messageCount > 1"
                    variant="subtle"
                    color="primary"
                    size="xs"
                    class="shrink-0"
                  >
                    {{ t.messageCount }}
                  </UBadge>
                  <UIcon
                    v-if="t.hasAttachments"
                    name="i-lucide-paperclip"
                    class="size-3.5 text-muted shrink-0"
                  />
                </div>
                <p class="text-xs text-muted truncate mt-0.5">
                  <span class="font-medium text-default/80">
                    <template v-for="(s, i) in t.senders" :key="s"
                      ><span v-if="i > 0" class="opacity-50"> · </span>{{ s }}</template>
                  </span>
                  <span v-if="!isExpanded(t.id)" class="opacity-80">
                    — {{ t.latestPreview }}
                  </span>
                </p>
              </div>
              <span class="text-xs text-muted shrink-0 hidden sm:inline">
                {{ t.messageCount > 1 ? formatSentShort(t.latestSentAt) : formatSent(t.latestSentAt) }}
              </span>
            </button>

            <div
              v-if="isExpanded(t.id)"
              :id="`thread-${t.id}`"
              class="border-t border-default bg-elevated/10"
            >
              <div
                v-for="(m, i) in t.messages"
                :key="m.id"
                class="px-4 py-3"
                :class="i < t.messages.length - 1 ? 'border-b border-default/60' : ''"
              >
                <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <UBadge color="primary" variant="subtle" size="xs">
                      {{ m.sender }} → {{ m.recipient }}
                    </UBadge>
                    <span v-if="m.message_number" class="text-xs text-muted">
                      #{{ m.message_number }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="text-xs text-muted">{{ formatSent(m.sent_at) }}</span>
                    <UButton
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      icon="i-lucide-arrow-up-right"
                      :to="`/messages/${m.id}`"
                      square
                      :aria-label="`Open message ${m.message_number ?? ''} in detail view`"
                    />
                  </div>
                </div>
                <p class="text-sm whitespace-pre-wrap text-highlighted/90">{{ m.body }}</p>
                <div
                  v-if="attachmentLabels(m.attachments).length"
                  class="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted"
                >
                  <UIcon name="i-lucide-paperclip" class="size-3.5" />
                  <UBadge
                    v-for="att in attachmentLabels(m.attachments)"
                    :key="att"
                    color="neutral"
                    variant="soft"
                    size="xs"
                  >
                    {{ att }}
                  </UBadge>
                </div>
              </div>
            </div>
          </article>

          <div v-if="totalPages > 1" class="flex items-center justify-between pt-3">
            <span class="text-xs text-muted">
              Page {{ currentPage }} of {{ totalPages }}
            </span>
            <div class="flex gap-2">
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                :disabled="currentPage === 1"
                icon="i-lucide-chevron-left"
                @click="prevPage"
              >
                Prev
              </UButton>
              <UButton
                variant="soft"
                color="neutral"
                size="sm"
                :disabled="currentPage === totalPages"
                trailing-icon="i-lucide-chevron-right"
                @click="nextPage"
              >
                Next
              </UButton>
            </div>
          </div>
        </div>

        <div v-else-if="status === 'success'">
          <UCard
            v-if="hasFilters"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <UIcon name="i-lucide-filter-x" class="size-12 text-dimmed mb-3" />
            <p class="text-base font-medium text-highlighted mb-1">
              No messages match your filters
            </p>
            <UButton
              variant="soft"
              size="sm"
              icon="i-lucide-refresh-cw"
              class="mt-3"
              @click="clearFilters"
            >
              Clear filters
            </UButton>
          </UCard>

          <UCard
            v-else
            class="flex flex-col items-center justify-center py-16 text-center"
          >
            <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UIcon name="i-lucide-message-square-text" class="size-10 text-primary" />
            </div>
            <p class="text-lg font-medium text-highlighted mb-2">
              No messages yet
            </p>
            <p class="text-sm text-muted mb-6 max-w-md">
              Have an Our Family Wizard account? Import a Message Report to bring every message into your timeline.
            </p>
            <UButton
              variant="solid"
              color="primary"
              size="lg"
              icon="i-lucide-upload"
              to="/evidence"
            >
              Import OFW Export
            </UButton>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

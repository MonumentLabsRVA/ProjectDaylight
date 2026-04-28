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
  latestId: string
  subject: string
  senders: string[]
  latestSentAt: string
  earliestSentAt: string
  messageCount: number
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

const debouncedQ = ref('')
let qTimer: ReturnType<typeof setTimeout> | null = null
watch(q, (val) => {
  if (qTimer) clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    debouncedQ.value = val.trim()
    offset.value = 0
  }, 250)
})

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

function formatRelative(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const day = 24 * 60 * 60 * 1000
  if (diff < day && d.getDate() === now.getDate()) {
    return formatTzDate(value, { hour: 'numeric', minute: '2-digit' })
  }
  if (diff < 7 * day) {
    return formatTzDate(value, { weekday: 'short' })
  }
  if (d.getFullYear() === now.getFullYear()) {
    return formatTzDate(value, { month: 'short', day: 'numeric' })
  }
  return formatTzDate(value, { month: 'short', day: 'numeric', year: 'numeric' })
}

function previewText(body: string, n: number) {
  const single = body.replace(/\s+/g, ' ').trim()
  if (single.length <= n) return single
  return single.slice(0, n).trimEnd() + '…'
}

function attachmentLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((s): s is string => typeof s === 'string')
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''
  return (first + last).toUpperCase() || '?'
}

// Stable per-sender side: alphabetically-first sender → "left", second → "right".
// Mirrors the rule on the thread page so the same person keeps the same color
// across both screens.
function sideFor(senders: string[], sender: string): 'left' | 'right' {
  if (senders.length <= 1) return 'right'
  return sender === [...senders].sort()[0] ? 'left' : 'right'
}

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
      latestId: last.id,
      subject: first.subject || last.subject || '(no subject)',
      senders,
      latestSentAt: last.sent_at,
      earliestSentAt: first.sent_at,
      messageCount: sorted.length,
      hasAttachments: sorted.some((m) => attachmentLabels(m.attachments).length > 0),
      latestPreview: previewText(last.body, 160),
      latestSender: last.sender
    })
  }
  out.sort((a, b) => b.latestSentAt.localeCompare(a.latestSentAt))
  return out
})
</script>

<template>
  <UDashboardPanel id="messages" :ui="{ body: 'p-0 sm:p-0' }">
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
      </div>
    </template>

    <template #body>
      <div class="px-2 sm:px-4 py-3">
        <div v-if="status === 'pending'" class="flex flex-col">
          <div
            v-for="i in 6"
            :key="i"
            class="flex items-start gap-3 px-3 py-3 border-b border-default/60"
          >
            <USkeleton class="size-8 rounded-full shrink-0" />
            <div class="flex-1 flex flex-col gap-1.5">
              <USkeleton class="h-4 w-1/3" />
              <USkeleton class="h-3 w-3/4" />
            </div>
          </div>
        </div>

        <ul
          v-else-if="threads.length > 0"
          class="flex flex-col rounded-lg border border-default overflow-hidden bg-default"
        >
          <li
            v-for="(t, i) in threads"
            :key="t.id"
            :class="i < threads.length - 1 ? 'border-b border-default/60' : ''"
          >
            <NuxtLink
              :to="`/messages/${t.latestId}`"
              class="group flex items-start gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-elevated/50"
            >
              <UAvatarGroup size="sm" :max="2" class="shrink-0 mt-0.5">
                <UAvatar
                  v-for="s in t.senders"
                  :key="s"
                  :text="initials(s)"
                  :alt="s"
                  :ui="{ root: sideFor(t.senders, s) === 'right' ? 'bg-primary/15 text-primary' : 'bg-elevated text-default' }"
                />
              </UAvatarGroup>

              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <p class="font-medium text-highlighted truncate">
                      {{ t.subject }}
                    </p>
                    <UBadge
                      v-if="t.messageCount > 1"
                      variant="subtle"
                      color="neutral"
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
                  <span class="text-xs text-muted shrink-0">
                    {{ formatRelative(t.latestSentAt) }}
                  </span>
                </div>
                <p class="text-sm text-muted truncate mt-0.5">
                  <span class="text-default/80 font-medium">{{ t.latestSender }}:</span>
                  {{ t.latestPreview }}
                </p>
              </div>
            </NuxtLink>
          </li>
        </ul>

        <div v-else-if="status === 'success'" class="px-2 sm:px-4">
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

        <div v-if="threads.length > 0 && totalPages > 1" class="flex items-center justify-between pt-3 px-1">
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
    </template>
  </UDashboardPanel>
</template>

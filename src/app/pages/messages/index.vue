<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { useActiveCase } from '~/composables/useActiveCase'

type MessageRow = Tables<'messages'>

interface MessagesResponse {
  messages: Pick<
    MessageRow,
    | 'id' | 'sent_at' | 'first_viewed_at' | 'sender' | 'recipient' | 'subject'
    | 'body' | 'thread_id' | 'message_number' | 'sequence_number'
    | 'word_count' | 'attachments' | 'evidence_id'
  >[]
  total: number
  limit: number
  offset: number
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

const queryParams = computed(() => {
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
})

const { data, status, refresh } = await useFetch<MessagesResponse>('/api/messages', {
  headers: useRequestHeaders(['cookie']),
  query: queryParams,
  watch: [queryParams]
})

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

function bodyPreview(body: string) {
  if (body.length <= 240) return body
  return body.slice(0, 240).trimEnd() + '…'
}
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

        <div v-else-if="(data?.messages?.length ?? 0) > 0" class="space-y-2">
          <NuxtLink
            v-for="msg in data!.messages"
            :key="msg.id"
            :to="`/messages/${msg.id}`"
            class="block"
          >
            <div class="py-2 px-3 hover:bg-muted/5 transition-colors cursor-pointer rounded-md">
              <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div class="flex items-center gap-2 min-w-0">
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="shrink-0"
                  >
                    <UIcon name="i-lucide-message-square-text" class="size-3.5 mr-1" />
                    {{ msg.sender }}
                  </UBadge>
                  <p class="font-medium text-highlighted truncate">
                    {{ msg.subject || '(no subject)' }}
                  </p>
                </div>
                <div class="flex items-center gap-3 text-xs text-muted">
                  <span v-if="msg.message_number" class="text-muted">
                    #{{ msg.message_number }}
                  </span>
                  <p>{{ formatSent(msg.sent_at) }}</p>
                  <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
                </div>
              </div>
              <p class="text-xs text-muted line-clamp-2 mt-0.5">
                {{ bodyPreview(msg.body) }}
              </p>
            </div>
          </NuxtLink>

          <!-- Pagination -->
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

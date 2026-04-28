<script setup lang="ts">
import type { Tables } from '~/types/database.types'

type MessageRow = Tables<'messages'>

interface MessageDetailResponse {
  message: MessageRow
  thread: MessageRow[]
}

const route = useRoute()
const { formatDate: formatTzDate } = useTimezone()

const { data, status, error, refresh } = await useFetch<MessageDetailResponse>(
  () => `/api/messages/${route.params.id}`,
  {
    headers: useRequestHeaders(['cookie']),
    watch: [() => route.params.id]
  }
)

const session = useSupabaseSession()
watch(session, (s) => { if (s?.access_token) refresh() })

function formatTime(value: string) {
  return formatTzDate(value, { hour: 'numeric', minute: '2-digit' })
}

function formatDay(value: string) {
  return formatTzDate(value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatRange(from: string, to: string) {
  if (!from || !to) return ''
  const a = formatTzDate(from, { month: 'short', day: 'numeric', year: 'numeric' })
  const b = formatTzDate(to, { month: 'short', day: 'numeric', year: 'numeric' })
  return a === b ? a : `${a} – ${b}`
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

const messages = computed(() => data.value?.thread ?? (data.value?.message ? [data.value.message] : []))
const focused = computed(() => data.value?.message ?? null)
const subject = computed(() => focused.value?.subject || data.value?.thread?.[0]?.subject || 'Message')

// Stable side assignment: alphabetically-first sender goes left, the other
// goes right. Keeps the same person on the same side across navigation.
const senders = computed(() => {
  const set = new Set<string>()
  for (const m of messages.value) set.add(m.sender)
  return [...set].sort()
})

const sideForSender = computed<Record<string, 'left' | 'right'>>(() => {
  const list = senders.value
  if (list.length <= 1) return Object.fromEntries(list.map((s) => [s, 'right']))
  return { [list[0]!]: 'left', [list[1]!]: 'right' }
})

interface RenderedMessage {
  id: string
  sender: string
  side: 'left' | 'right'
  body: string
  sentAt: string
  messageNumber: number | null
  attachments: string[]
  isFocused: boolean
  showDayDivider: boolean
  dayLabel: string
}

const rendered = computed<RenderedMessage[]>(() => {
  const list = messages.value
  if (!list.length) return []
  const out: RenderedMessage[] = []
  let lastDayKey = ''
  for (const m of list) {
    const dayKey = m.sent_at.slice(0, 10)
    const showDayDivider = dayKey !== lastDayKey
    lastDayKey = dayKey
    out.push({
      id: m.id,
      sender: m.sender,
      side: sideForSender.value[m.sender] ?? 'left',
      body: m.body,
      sentAt: m.sent_at,
      messageNumber: m.message_number,
      attachments: attachmentLabels(m.attachments),
      isFocused: m.id === focused.value?.id,
      showDayDivider,
      dayLabel: formatDay(m.sent_at)
    })
  }
  return out
})

const dateRange = computed(() => {
  const list = messages.value
  if (!list.length) return ''
  const first = list[0]!.sent_at
  const last = list[list.length - 1]!.sent_at
  return formatRange(first, last)
})

const focusedRef = ref<HTMLElement | null>(null)

function setFocusedRef(el: Element | null, isFocused: boolean) {
  if (isFocused && el instanceof HTMLElement) focusedRef.value = el
}

watch(focusedRef, (el) => {
  if (!el) return
  // Wait a tick so layout settles before scrolling.
  nextTick(() => {
    el.scrollIntoView({ behavior: 'auto', block: 'center' })
  })
})
</script>

<template>
  <UDashboardPanel id="message-detail" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar :title="subject">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="i-lucide-arrow-left"
            to="/messages"
          >
            Inbox
          </UButton>
        </template>
      </UDashboardNavbar>

      <div
        v-if="messages.length"
        class="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-6 py-2.5 border-b border-default text-xs text-muted"
      >
        <div class="flex items-center gap-1.5">
          <UAvatarGroup size="2xs" :max="3">
            <UAvatar
              v-for="s in senders"
              :key="s"
              :text="initials(s)"
              :alt="s"
              :ui="{ root: sideForSender[s] === 'right' ? 'bg-primary/15 text-primary' : 'bg-elevated text-default' }"
            />
          </UAvatarGroup>
          <span class="font-medium text-default">
            <template v-for="(s, i) in senders" :key="s"
              ><span v-if="i > 0" class="opacity-60"> · </span>{{ s }}</template>
          </span>
        </div>
        <span class="opacity-50">•</span>
        <span>{{ messages.length }} {{ messages.length === 1 ? 'message' : 'messages' }}</span>
        <template v-if="dateRange">
          <span class="opacity-50">•</span>
          <span>{{ dateRange }}</span>
        </template>
      </div>
    </template>

    <template #body>
      <UContainer class="max-w-3xl mx-auto w-full py-6">
        <div v-if="status === 'pending'" class="flex flex-col gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-20" :class="i % 2 === 0 ? 'self-end w-2/3' : 'self-start w-2/3'" />
        </div>

        <UCard v-else-if="error">
          <p class="text-sm text-error">
            Failed to load message: {{ (error as { statusMessage?: string }).statusMessage || 'Unknown error' }}
          </p>
        </UCard>

        <div v-else-if="rendered.length" class="flex flex-col gap-4">
          <template v-for="m in rendered" :key="m.id">
            <div
              v-if="m.showDayDivider"
              class="flex items-center gap-3 py-1 text-xs uppercase tracking-wide text-muted"
            >
              <USeparator class="flex-1" />
              <span>{{ m.dayLabel }}</span>
              <USeparator class="flex-1" />
            </div>

            <UChatMessage
              :id="m.id"
              role="user"
              :parts="[{ type: 'text', text: m.body }]"
              :side="m.side"
              :variant="m.side === 'right' ? 'soft' : 'naked'"
              :avatar="{ text: initials(m.sender), alt: m.sender }"
              :class="m.isFocused ? 'ring-2 ring-primary/40 rounded-xl' : ''"
              :ref="(el: unknown) => setFocusedRef((el as { $el?: Element } | null)?.$el ?? null, m.isFocused)"
            >
              <template #content>
                <div class="flex flex-col gap-1.5 min-w-0">
                  <div
                    class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs"
                    :class="m.side === 'right' ? 'justify-end' : 'justify-start'"
                  >
                    <span class="font-medium text-highlighted">{{ m.sender }}</span>
                    <span class="text-muted">{{ formatTime(m.sentAt) }}</span>
                    <span v-if="m.messageNumber" class="text-muted">· #{{ m.messageNumber }}</span>
                  </div>

                  <div
                    class="text-sm whitespace-pre-wrap text-highlighted/95 break-words"
                  >
                    {{ m.body }}
                  </div>

                  <div
                    v-if="m.attachments.length"
                    class="mt-1 flex flex-wrap items-center gap-1 text-xs"
                  >
                    <UIcon name="i-lucide-paperclip" class="size-3.5 text-muted" />
                    <UBadge
                      v-for="att in m.attachments"
                      :key="att"
                      color="neutral"
                      variant="soft"
                      size="xs"
                    >
                      {{ att }}
                    </UBadge>
                  </div>
                </div>
              </template>
            </UChatMessage>
          </template>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>

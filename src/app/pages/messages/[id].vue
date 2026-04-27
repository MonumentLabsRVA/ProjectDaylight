<script setup lang="ts">
import type { Tables } from '~/types/database.types'

type MessageRow = Tables<'messages'>

interface MessageDetailResponse {
  message: MessageRow
  thread: MessageRow[]
}

const route = useRoute()
const id = computed(() => route.params.id as string)
const { formatDate: formatTzDate } = useTimezone()

const { data, status, error, refresh } = await useFetch<MessageDetailResponse>(
  () => `/api/messages/${id.value}`,
  {
    headers: useRequestHeaders(['cookie']),
    watch: [id]
  }
)

const session = useSupabaseSession()
watch(session, (s) => { if (s?.access_token) refresh() })

function formatSent(value: string) {
  return formatTzDate(value, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const focusedId = computed(() => data.value?.message.id ?? null)
const threadHasMultipleMessages = computed(() => (data.value?.thread.length ?? 0) > 1)

function attachmentLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((s): s is string => typeof s === 'string')
}
</script>

<template>
  <UDashboardPanel id="message-detail">
    <template #header>
      <UDashboardNavbar :title="data?.message.subject || 'Message'">
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
            Back
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 max-w-4xl mx-auto space-y-6">
        <UCard v-if="status === 'pending'">
          <div class="space-y-3">
            <USkeleton class="h-5 w-48" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-2/3" />
          </div>
        </UCard>

        <UCard v-else-if="error">
          <p class="text-sm text-error">Failed to load message: {{ (error as any).statusMessage || 'Unknown error' }}</p>
        </UCard>

        <template v-else-if="data?.message">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <div class="flex items-center gap-2">
                  <UBadge color="primary" variant="subtle" size="sm">
                    {{ data.message.sender }} → {{ data.message.recipient }}
                  </UBadge>
                  <span v-if="data.message.message_number" class="text-xs text-muted">
                    OFW msg #{{ data.message.message_number }}
                  </span>
                </div>
                <span class="text-xs text-muted">{{ formatSent(data.message.sent_at) }}</span>
              </div>
            </template>

            <p class="text-sm whitespace-pre-wrap">{{ data.message.body }}</p>

            <template v-if="attachmentLabels(data.message.attachments).length" #footer>
              <div class="flex flex-wrap items-center gap-1 text-xs text-muted">
                <UIcon name="i-lucide-paperclip" class="size-3.5" />
                <span class="font-medium">Attachments:</span>
                <UBadge
                  v-for="att in attachmentLabels(data.message.attachments)"
                  :key="att"
                  color="neutral"
                  variant="soft"
                  size="xs"
                >
                  {{ att }}
                </UBadge>
              </div>
            </template>
          </UCard>

          <div v-if="threadHasMultipleMessages" class="space-y-2">
            <h3 class="text-sm font-medium text-muted px-2">
              Thread ({{ data.thread.length }} messages)
            </h3>
            <div class="space-y-2">
              <NuxtLink
                v-for="t in data.thread"
                :key="t.id"
                :to="`/messages/${t.id}`"
                class="block"
              >
                <div
                  class="py-2 px-3 rounded-md transition-colors"
                  :class="t.id === focusedId
                    ? 'bg-primary/5 border border-primary/40'
                    : 'hover:bg-muted/5 border border-default'"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div class="flex items-center gap-2 min-w-0">
                      <UBadge :color="t.id === focusedId ? 'primary' : 'neutral'" variant="subtle" size="xs">
                        {{ t.sender }}
                      </UBadge>
                      <p class="font-medium truncate">{{ t.subject || '(no subject)' }}</p>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-muted">
                      <span v-if="t.message_number">#{{ t.message_number }}</span>
                      <span>{{ formatSent(t.sent_at) }}</span>
                    </div>
                  </div>
                  <p class="text-xs text-muted line-clamp-2 mt-1">
                    {{ t.body.length > 240 ? t.body.slice(0, 240).trimEnd() + '…' : t.body }}
                  </p>
                </div>
              </NuxtLink>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

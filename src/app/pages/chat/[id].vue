<script setup lang="ts">
import type { UIMessage } from 'ai'
import type { FetchError } from 'ofetch'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'

interface StoredChat {
  id: string
  caseId: string
  userId: string
  title: string
  agent: string
  messages: UIMessage[]
  createdAt: string
  updatedAt: string
}

const route = useRoute()
const toast = useToast()
const { copy, copied } = useClipboard()
const session = useSupabaseSession()

const chatRecord = ref<StoredChat | null>(null)
const chat = shallowRef<Chat<UIMessage> | null>(null)
const loading = ref(false)
const followUpInput = ref('')
const hasAutoStarted = ref(false)

function getErrorMessage(error: FetchError<{ statusMessage?: string }> | Error | null | undefined) {
  if (!error) return 'Chat not found'
  if ('data' in error && error.data?.statusMessage) return error.data.statusMessage
  return error.message || 'Chat not found'
}

function getStatusCode(error: FetchError | null | undefined) {
  return error?.statusCode || error?.status || 500
}

function getMessageText(message: UIMessage) {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => (part as { text: string }).text)
    .join('\n\n')
}

function handleChatError(error: Error) {
  let description = error.message
  if (typeof description === 'string' && description.startsWith('{')) {
    try { description = JSON.parse(description).statusMessage || description } catch { /* ignore */ }
  }
  toast.add({ title: 'Error', description, color: 'error', icon: 'i-lucide-alert-circle' })
}

function createChatInstance(record: StoredChat) {
  return new Chat({
    id: record.id,
    messages: record.messages,
    transport: new DefaultChatTransport({
      api: `/api/chats/${record.id}`,
      // Cookie-based supabase auth — Nuxt sends cookies on same-origin POSTs
      // automatically, but we set credentials explicitly to be safe.
      credentials: 'include'
    }),
    onError: handleChatError,
    onFinish({ messages }) {
      if (chatRecord.value?.id !== record.id) return
      chatRecord.value = {
        ...chatRecord.value,
        messages,
        updatedAt: new Date().toISOString()
      }
      void refreshNuxtData('chats')
    }
  })
}

/**
 * If the chat was just created (single user message, no assistant reply),
 * auto-trigger streaming so the user doesn't have to hit Submit twice.
 * Mirrors AIR-Bot's pattern.
 */
async function maybeAutoStart() {
  const active = chat.value
  if (!active || hasAutoStarted.value) return
  const existing = active.messages
  if (existing.length !== 1 || existing[0]?.role !== 'user') return
  hasAutoStarted.value = true
  try { await active.regenerate() } catch { hasAutoStarted.value = false }
}

async function loadChat(id: string) {
  loading.value = true
  try {
    const resolved = await $fetch<StoredChat>(`/api/chats/${id}`, {
      headers: useRequestHeaders(['cookie'])
    })
    if (route.params.id !== id) return
    chatRecord.value = resolved
    chat.value = createChatInstance(resolved)
    hasAutoStarted.value = false
    loading.value = false
    void maybeAutoStart()
  } catch (error) {
    if (route.params.id !== id) return
    chatRecord.value = null
    chat.value = null
    loading.value = false
    showError(createError({
      statusCode: getStatusCode(error as FetchError),
      statusMessage: getErrorMessage(error as FetchError<{ statusMessage?: string }> | Error)
    }))
  }
}

watch(() => route.params.id, (id) => {
  if (typeof id === 'string') {
    followUpInput.value = ''
    void loadChat(id)
  }
}, { immediate: true })

watch(session, (s) => {
  if (s?.access_token && typeof route.params.id === 'string') void loadChat(route.params.id)
})

const messages = computed(() => chat.value?.messages ?? chatRecord.value?.messages ?? [])
const currentTitle = computed(() => chatRecord.value?.title?.trim() || 'New chat')
const messageStatus = computed(() => loading.value ? 'submitted' : (chat.value?.status ?? 'ready'))
const isBusy = computed(() => messageStatus.value === 'submitted' || messageStatus.value === 'streaming')

function copyMessage(_: MouseEvent, message: UIMessage) {
  copy(getMessageText(message))
  toast.add({ title: copied.value ? 'Copied to clipboard' : 'Copied', color: 'success' })
}

function stopStreaming() { chat.value?.stop() }

async function regenerateLast() {
  try { await chat.value?.regenerate() } catch (error) {
    toast.add({
      title: 'Error',
      description: getErrorMessage(error as FetchError<{ statusMessage?: string }> | Error),
      color: 'error'
    })
  }
}

async function submitFollowUp() {
  const active = chat.value
  const input = followUpInput.value.trim()
  if (!active || !input || isBusy.value) return
  followUpInput.value = ''
  try {
    await active.sendMessage({ text: input })
  } catch (error) {
    followUpInput.value = input
    toast.add({
      title: 'Error',
      description: getErrorMessage(error as FetchError<{ statusMessage?: string }> | Error),
      color: 'error'
    })
  }
}
</script>

<template>
  <div class="contents">
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar class="sticky top-0 border-b-0 z-10 bg-default/75 backdrop-blur">
        <template #left>
          <UDashboardSidebarCollapse />
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-semibold text-highlighted truncate">{{ currentTitle }}</span>
          </div>
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="ghost"
            to="/chat"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6 max-w-3xl mx-auto w-full">
        <UChatMessages
          should-auto-scroll
          :messages="messages"
          :status="messageStatus"
          :assistant="{
            actions: [{
              label: copied ? 'Copied' : 'Copy',
              icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy',
              onClick: copyMessage
            }]
          }"
          class="pt-4 pb-4 sm:pb-6"
        >
          <template #indicator>
            <UChatShimmer text="Thinking…" class="text-sm" />
          </template>

          <template #content="{ message }">
            <ChatMessageContent
              :message="message"
              :collapsed="messageStatus === 'ready'"
            />
          </template>
        </UChatMessages>

        <UChatPrompt
          v-model="followUpInput"
          :status="messageStatus"
          :error="chat?.error"
          :disabled="isBusy"
          variant="subtle"
          placeholder="Reply with a follow-up…"
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5' }"
          @submit="submitFollowUp"
        >
          <template #footer>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-plus"
                label="New chat"
                color="neutral"
                size="sm"
                variant="ghost"
                to="/chat"
              />
              <UButton
                v-if="!isBusy && messages.length > 1"
                icon="i-lucide-refresh-cw"
                label="Regenerate"
                color="neutral"
                size="sm"
                variant="ghost"
                @click="regenerateLast"
              />
            </div>
            <UChatPromptSubmit
              :status="messageStatus"
              color="neutral"
              size="sm"
              @stop="stopStreaming"
              @reload="regenerateLast"
            />
          </template>
        </UChatPrompt>
      </UContainer>
    </template>

  </UDashboardPanel>

    <ChatCitationHoverPreview />
    <ChatCitationViewerSlideover />
  </div>
</template>

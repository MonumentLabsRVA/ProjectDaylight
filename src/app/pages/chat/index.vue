<script setup lang="ts">
interface ChatListItem {
  id: string
  caseId: string
  title: string
  agent: string
  createdAt: string
  updatedAt: string
  messageCount: number
  preview: string
}

const toast = useToast()
const session = useSupabaseSession()

const { data, refresh } = await useFetch<ChatListItem[]>('/api/chats', {
  key: 'chats',
  default: () => [],
  headers: useRequestHeaders(['cookie'])
})

watch(session, (s) => { if (s?.access_token) refresh() })

const input = ref('')
const submitting = ref(false)

async function startChat(prompt: string) {
  const trimmed = prompt.trim()
  if (!trimmed || submitting.value) return

  submitting.value = true
  const chatId = crypto.randomUUID()
  try {
    await $fetch('/api/chats', {
      method: 'POST',
      headers: useRequestHeaders(['cookie']),
      body: {
        id: chatId,
        message: {
          id: crypto.randomUUID(),
          role: 'user',
          parts: [{ type: 'text', text: trimmed }]
        }
      }
    })
    input.value = ''
    await navigateTo(`/chat/${chatId}`)
    refreshNuxtData('chats')
  } catch (error) {
    toast.add({
      title: 'Could not start chat',
      description: error instanceof Error ? error.message : 'Unknown error',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  } finally {
    submitting.value = false
  }
}

async function onSubmit() {
  await startChat(input.value)
}

const suggestions = [
  { icon: 'i-lucide-calendar-clock', label: 'Show every late pickup since March' },
  { icon: 'i-lucide-message-square-text', label: 'What did he say about the school transfer?' },
  { icon: 'i-lucide-list-checks', label: 'Summarize the medical decisions we disagreed on' },
  { icon: 'i-lucide-heart-handshake', label: 'Today was hard — can we just talk?' }
]

const chatItems = computed<Array<ChatListItem & { label: string, to: string, icon: string }>>(() =>
  (data.value ?? []).map(c => ({
    ...c,
    label: c.title || 'New chat',
    to: `/chat/${c.id}`,
    icon: 'i-lucide-message-circle'
  }))
)

const { groups } = useChats(chatItems as unknown as Ref<UIChat[]>)

const deleteTarget = ref<{ id: string, label: string } | null>(null)
const deleteOpen = ref(false)
const deleteLoading = ref(false)

function requestDelete(item: ChatListItem & { label: string }) {
  deleteTarget.value = { id: item.id, label: item.label }
  deleteOpen.value = true
}

async function confirmDelete() {
  const t = deleteTarget.value
  if (!t) return
  deleteLoading.value = true
  try {
    await $fetch(`/api/chats/${t.id}`, {
      method: 'DELETE',
      headers: useRequestHeaders(['cookie'])
    })
    refreshNuxtData('chats')
    deleteOpen.value = false
    deleteTarget.value = null
    toast.add({ title: 'Chat deleted', icon: 'i-lucide-trash', color: 'success' })
  } catch (error) {
    toast.add({
      title: 'Could not delete',
      description: error instanceof Error ? error.message : 'Unknown error',
      color: 'error'
    })
  } finally {
    deleteLoading.value = false
  }
}

function formatDate(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function pluralize(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel
      id="chat-home"
      class="min-h-0"
      :ui="{ body: 'p-0 sm:p-0' }"
    >
      <template #header>
        <UDashboardNavbar class="sticky top-0 z-10 border-b-0 bg-default/75 backdrop-blur">
          <template #left>
            <UDashboardSidebarCollapse />
            <div class="min-w-0">
              <p class="font-semibold text-highlighted truncate">
                Chat
              </p>
              <p class="text-xs text-muted truncate">
                Ask about your case — or just talk it out.
              </p>
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <UContainer class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          <div class="flex flex-col gap-4">
            <h1 class="text-2xl font-semibold text-highlighted">
              How can I help?
            </h1>

            <UChatPrompt
              v-model="input"
              :status="submitting ? 'streaming' : 'ready'"
              :disabled="submitting"
              variant="subtle"
              placeholder="Ask about your case, or share what's on your mind…"
              class="[view-transition-name:chat-prompt]"
              :ui="{ base: 'px-1.5 min-h-[48px]' }"
              @submit="onSubmit"
            >
              <template #footer>
                <span class="text-xs text-muted">Press Enter to send</span>
                <UChatPromptSubmit color="neutral" size="sm" />
              </template>
            </UChatPrompt>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="s in suggestions"
                :key="s.label"
                :icon="s.icon"
                :label="s.label"
                size="sm"
                color="neutral"
                variant="outline"
                class="rounded-full"
                :disabled="submitting"
                @click="startChat(s.label)"
              />
            </div>
          </div>

          <div
            v-if="chatItems.length > 0"
            class="flex flex-col gap-4 pt-2"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-medium uppercase tracking-wide text-muted">
                Previous chats
              </h2>
            </div>

            <section
              v-for="group in groups"
              :key="group.id"
              class="flex flex-col gap-2"
            >
              <div class="text-xs font-medium uppercase tracking-wide text-muted">
                {{ group.label }}
              </div>

              <div class="flex flex-col gap-2">
                <div
                  v-for="chat in group.items"
                  :key="chat.id"
                  class="group relative rounded-xl border border-default bg-default transition hover:bg-elevated"
                >
                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Delete chat"
                    class="absolute right-2 top-2 z-10 text-muted opacity-0 transition-opacity hover:text-error group-hover:opacity-100 focus-visible:opacity-100"
                    @click.stop.prevent="requestDelete(chat as unknown as ChatListItem & { label: string })"
                  />
                  <NuxtLink
                    :to="chat.to"
                    class="block px-4 py-3"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <UIcon
                            :name="chat.icon"
                            class="size-4 shrink-0 text-primary"
                          />
                          <p class="truncate font-medium text-highlighted">
                            {{ chat.label }}
                          </p>
                        </div>
                        <p
                          v-if="chat.preview"
                          class="mt-1 line-clamp-1 text-sm text-muted"
                        >
                          {{ chat.preview }}
                        </p>
                        <div class="mt-1.5 flex items-center gap-3 text-xs text-muted">
                          <span class="flex items-center gap-1">
                            <UIcon name="i-lucide-message-circle" class="size-3.5" />
                            {{ pluralize(chat.messageCount, 'message') }}
                          </span>
                          <span>{{ formatDate(chat.updatedAt || chat.createdAt) }}</span>
                        </div>
                      </div>
                    </div>
                  </NuxtLink>
                </div>
              </div>
            </section>
          </div>
        </UContainer>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="deleteOpen">
      <template #content>
        <div class="p-6 flex flex-col gap-4">
          <h3 class="text-lg font-semibold text-highlighted">
            Delete this chat?
          </h3>
          <p class="text-sm text-muted">
            "{{ deleteTarget?.label }}" will be removed permanently. This can't be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="deleteLoading" @click="deleteOpen = false">
              Cancel
            </UButton>
            <UButton color="error" :loading="deleteLoading" @click="confirmDelete">
              Delete
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

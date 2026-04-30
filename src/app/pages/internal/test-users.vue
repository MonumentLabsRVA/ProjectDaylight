<script setup lang="ts">
definePageMeta({ middleware: ['employee'] })

useHead({ title: 'Daylight — Test Users' })

const toast = useToast()

interface TestUserRow {
  id: string
  email: string | null
  full_name: string | null
  created_at: string | null
  onboarding_completed_at: string | null
  case_count: number
}

interface CreateResponse {
  userId: string
  email: string
  magicLink: string
}

const { data: listData, error: listError, pending: listPending, refresh: refreshList } = await useFetch<{ testUsers: TestUserRow[] }>('/api/internal/test-users', {
  key: 'internal-test-users',
  default: () => ({ testUsers: [] })
})

const testUsers = computed(() => listData.value?.testUsers ?? [])
const listErrorMessage = computed(() => {
  const err = listError.value as any
  return err?.data?.statusMessage ?? err?.message ?? 'Failed to load test users'
})

const createPending = ref<'idle' | 'copy' | 'switch'>('idle')
const lastLink = ref<string | null>(null)
const lastEmail = ref<string | null>(null)

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (err) {
    console.warn('[test-users] clipboard write failed:', err)
  }
  return false
}

async function createAndCopy() {
  if (createPending.value !== 'idle') return
  createPending.value = 'copy'
  try {
    const res = await $fetch<CreateResponse>('/api/internal/test-users', { method: 'POST' })
    lastLink.value = res.magicLink
    lastEmail.value = res.email
    const copied = await copyToClipboard(res.magicLink)
    toast.add({
      title: copied ? 'Test user created — link copied' : 'Test user created',
      description: copied
        ? `${res.email} · open the link in an incognito tab to test onboarding.`
        : `${res.email} · clipboard blocked; copy the link from the banner below.`,
      color: copied ? 'success' : 'warning',
      icon: copied ? 'i-lucide-clipboard-check' : 'i-lucide-clipboard'
    })
    await refreshList()
  } catch (err: any) {
    console.error('[test-users] create failed:', err)
    toast.add({
      title: 'Failed to create test user',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    createPending.value = 'idle'
  }
}

async function createAndSwitch() {
  if (createPending.value !== 'idle') return
  createPending.value = 'switch'
  try {
    const res = await $fetch<CreateResponse>('/api/internal/test-users', { method: 'POST' })
    toast.add({
      title: 'Test user created — switching session…',
      description: res.email,
      color: 'success',
      icon: 'i-lucide-log-in'
    })
    window.location.href = res.magicLink
  } catch (err: any) {
    console.error('[test-users] create+switch failed:', err)
    toast.add({
      title: 'Failed to create test user',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    createPending.value = 'idle'
  }
}

async function copyLoginLink(row: TestUserRow) {
  try {
    const res = await $fetch<{ magicLink: string }>(`/api/internal/test-users/${row.id}/login-link`, { method: 'POST' })
    const copied = await copyToClipboard(res.magicLink)
    toast.add({
      title: copied ? 'Login link copied' : 'Generated login link',
      description: copied
        ? `${row.email} · open in incognito to sign in as them.`
        : 'Clipboard blocked; check the console for the link.',
      color: copied ? 'success' : 'warning',
      icon: copied ? 'i-lucide-clipboard-check' : 'i-lucide-clipboard'
    })
    if (!copied) console.log('[test-users] magic link:', res.magicLink)
  } catch (err: any) {
    toast.add({
      title: 'Failed to generate login link',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

async function switchToUser(row: TestUserRow) {
  try {
    const res = await $fetch<{ magicLink: string }>(`/api/internal/test-users/${row.id}/login-link`, { method: 'POST' })
    window.location.href = res.magicLink
  } catch (err: any) {
    toast.add({
      title: 'Failed to switch user',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

const deleteCandidate = ref<TestUserRow | null>(null)
const deletePending = ref(false)

function askDelete(row: TestUserRow) {
  deleteCandidate.value = row
}

async function confirmDelete() {
  if (!deleteCandidate.value) return
  const row = deleteCandidate.value
  deletePending.value = true
  try {
    await $fetch(`/api/internal/test-users/${row.id}`, { method: 'DELETE' })
    toast.add({
      title: 'Test user deleted',
      description: row.email ?? row.id,
      color: 'success',
      icon: 'i-lucide-trash-2'
    })
    deleteCandidate.value = null
    await refreshList()
  } catch (err: any) {
    toast.add({
      title: 'Failed to delete test user',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    deletePending.value = false
  }
}

const bulkOpen = ref(false)
const bulkPending = ref(false)
const bulkResult = ref<{ matched: number, deleted: number, failed: Array<{ id: string, error: string }> } | null>(null)

async function confirmBulkDelete() {
  bulkPending.value = true
  bulkResult.value = null
  try {
    const res = await $fetch<{ matched: number, deleted: number, failed: Array<{ id: string, error: string }> }>('/api/internal/test-users/bulk-delete', {
      method: 'POST',
      body: {}
    })
    bulkResult.value = res
    toast.add({
      title: `Deleted ${res.deleted} of ${res.matched} test users`,
      description: res.failed.length > 0 ? `${res.failed.length} failed — see modal for details.` : 'All cleaned up.',
      color: res.failed.length > 0 ? 'warning' : 'success',
      icon: 'i-lucide-trash-2'
    })
    await refreshList()
  } catch (err: any) {
    toast.add({
      title: 'Bulk delete failed',
      description: err?.data?.statusMessage ?? err?.message ?? 'Unknown error',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  } finally {
    bulkPending.value = false
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch {
    return iso
  }
}
</script>

<template>
  <UDashboardPanel id="internal-test-users">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="font-medium">Test users</span>
        </template>
        <template #right>
          <UBadge color="info" variant="subtle" size="sm">Employee only</UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6">
        <div class="max-w-6xl mx-auto space-y-8">

          <!-- Header / actions -->
          <section>
            <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">Throwaway accounts</h2>
                <p class="text-sm text-muted mt-1 max-w-xl">
                  Create a fresh Supabase user, copy a magic link to test the new-user experience in incognito, or switch your session to walk through onboarding directly.
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <UButton
                  color="primary"
                  variant="solid"
                  icon="i-lucide-clipboard-plus"
                  :loading="createPending === 'copy'"
                  :disabled="createPending !== 'idle'"
                  @click="createAndCopy"
                >
                  Create &amp; copy link
                </UButton>
                <UButton
                  color="primary"
                  variant="soft"
                  icon="i-lucide-log-in"
                  :loading="createPending === 'switch'"
                  :disabled="createPending !== 'idle'"
                  @click="createAndSwitch"
                >
                  Create &amp; switch
                </UButton>
              </div>
            </div>

            <UAlert
              v-if="lastLink"
              class="mt-4"
              color="success"
              variant="subtle"
              icon="i-lucide-check"
              :title="`Last created: ${lastEmail}`"
              :description="lastLink"
              :ui="{ description: 'font-mono text-xs break-all' }"
            >
              <template #actions>
                <UButton
                  color="success"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-clipboard"
                  @click="copyToClipboard(lastLink || '')"
                >
                  Copy
                </UButton>
              </template>
            </UAlert>
          </section>

          <!-- List -->
          <section>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-highlighted">
                Existing test users
                <UBadge color="neutral" variant="subtle" size="sm" class="ml-2">{{ testUsers.length }}</UBadge>
              </h2>
              <div class="flex items-center gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-refresh-cw"
                  :loading="listPending"
                  @click="() => refreshList()"
                >
                  Refresh
                </UButton>
                <UButton
                  color="error"
                  variant="soft"
                  size="sm"
                  icon="i-lucide-trash-2"
                  :disabled="testUsers.length === 0"
                  @click="bulkOpen = true; bulkResult = null"
                >
                  Delete all
                </UButton>
              </div>
            </div>

            <UAlert
              v-if="listError"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :title="listErrorMessage"
              class="mb-4"
            />

            <UCard v-if="testUsers.length === 0" :ui="{ body: 'py-10' }">
              <div class="text-center text-sm text-muted">
                <UIcon name="i-lucide-user-plus" class="w-6 h-6 mx-auto mb-2 text-muted/70" />
                No test users yet. Click <span class="font-medium text-highlighted">Create &amp; copy link</span> to make one.
              </div>
            </UCard>

            <UCard v-else :ui="{ body: 'p-0' }">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-default text-left text-xs uppercase tracking-wide text-muted">
                    <th class="py-2.5 px-4 font-medium">Email</th>
                    <th class="py-2.5 px-4 font-medium">Created</th>
                    <th class="py-2.5 px-4 font-medium">Onboarding</th>
                    <th class="py-2.5 px-4 font-medium">Cases</th>
                    <th class="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in testUsers"
                    :key="row.id"
                    class="border-b border-default last:border-b-0"
                  >
                    <td class="py-2.5 px-4 font-mono text-xs text-highlighted truncate max-w-xs">{{ row.email ?? '—' }}</td>
                    <td class="py-2.5 px-4 text-muted">{{ fmtTime(row.created_at) }}</td>
                    <td class="py-2.5 px-4">
                      <UBadge
                        :color="row.onboarding_completed_at ? 'success' : 'warning'"
                        variant="subtle"
                        size="sm"
                      >
                        {{ row.onboarding_completed_at ? 'Done' : 'Pending' }}
                      </UBadge>
                    </td>
                    <td class="py-2.5 px-4 text-muted font-mono text-xs">{{ row.case_count }}</td>
                    <td class="py-2.5 px-4">
                      <div class="flex items-center justify-end gap-1">
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-clipboard"
                          @click="copyLoginLink(row)"
                        >
                          Copy link
                        </UButton>
                        <UButton
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-log-in"
                          @click="switchToUser(row)"
                        >
                          Switch
                        </UButton>
                        <UButton
                          color="error"
                          variant="ghost"
                          size="xs"
                          icon="i-lucide-trash-2"
                          @click="askDelete(row)"
                        >
                          Delete
                        </UButton>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </UCard>
          </section>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Single delete confirmation -->
  <UModal
    :open="!!deleteCandidate"
    title="Delete test user"
    :description="deleteCandidate ? `This will hard-delete ${deleteCandidate.email} and every case, event, journal entry, and message tied to them.` : ''"
    @update:open="(v) => { if (!v) deleteCandidate = null }"
  >
    <template #content>
      <UCard>
        <div class="space-y-4">
          <p class="text-sm text-default">
            <span class="font-mono text-xs">{{ deleteCandidate?.email }}</span> will be permanently removed. This is not reversible.
          </p>
          <div class="flex items-center justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="deletePending" @click="deleteCandidate = null">
              Cancel
            </UButton>
            <UButton
              color="error"
              variant="solid"
              icon="i-lucide-trash-2"
              :loading="deletePending"
              @click="confirmDelete"
            >
              Delete
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>

  <!-- Bulk delete confirmation -->
  <UModal
    v-model:open="bulkOpen"
    title="Delete all test users"
    :description="`This will hard-delete every account flagged is_test_user = true (${testUsers.length} ${testUsers.length === 1 ? 'user' : 'users'}).`"
  >
    <template #content>
      <UCard>
        <div class="space-y-4">
          <p class="text-sm text-default">
            All {{ testUsers.length }} test {{ testUsers.length === 1 ? 'user' : 'users' }} and their data will be permanently removed.
          </p>
          <UAlert
            v-if="bulkResult"
            :color="bulkResult.failed.length > 0 ? 'warning' : 'success'"
            variant="subtle"
            icon="i-lucide-info"
            :title="`Matched ${bulkResult.matched} · deleted ${bulkResult.deleted} · failed ${bulkResult.failed.length}`"
          >
            <template v-if="bulkResult.failed.length > 0" #description>
              <ul class="font-mono text-xs space-y-1 mt-1">
                <li v-for="f in bulkResult.failed" :key="f.id">{{ f.id }} — {{ f.error }}</li>
              </ul>
            </template>
          </UAlert>
          <div class="flex items-center justify-end gap-2">
            <UButton color="neutral" variant="ghost" :disabled="bulkPending" @click="bulkOpen = false">
              Close
            </UButton>
            <UButton
              color="error"
              variant="solid"
              icon="i-lucide-trash-2"
              :loading="bulkPending"
              :disabled="testUsers.length === 0"
              @click="confirmBulkDelete"
            >
              Delete all
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>

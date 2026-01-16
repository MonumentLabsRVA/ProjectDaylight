<script setup lang="ts">
import { h, resolveComponent, computed, ref, onMounted, onUnmounted } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { Row } from '@tanstack/table-core'
import type { SavedExport, ExportFocus } from '~/types'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UTooltip = resolveComponent('UTooltip')

const toast = useToast()

// Subscription check for feature gating (exports are Pro-only)
const { canExport, isFree } = useSubscription()
const router = useRouter()

interface ExportsResponse {
  exports: SavedExport[]
}

// Fetch saved exports
const {
  data: exportsData,
  status,
  refresh: refreshExports
} = await useFetch<ExportsResponse>('/api/exports', {
  headers: useRequestHeaders(['cookie'])
})

const savedExports = computed(() => exportsData.value?.exports || [])

// Table state
const table = useTemplateRef('table')
const globalFilter = ref('')

// Delete confirmation
const deleteConfirmOpen = ref(false)
const exportToDelete = ref<SavedExport | null>(null)

const focusOptions: Record<ExportFocus, { label: string; color: 'primary' | 'warning' | 'success' }> = {
  'full-timeline': { label: 'Full Timeline', color: 'primary' },
  'incidents-only': { label: 'Incidents', color: 'warning' },
  'positive-parenting': { label: 'Positive', color: 'success' }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRelativeDate(value: string) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

function getRowItems(row: Row<SavedExport>) {
  return [
    {
      type: 'label' as const,
      label: 'Actions'
    },
    {
      label: 'Open export',
      icon: 'i-lucide-eye',
      onSelect() {
        router.push(`/exports/${row.original.id}`)
      }
    },
    {
      label: 'Copy ID',
      icon: 'i-lucide-copy',
      onSelect() {
        navigator.clipboard.writeText(row.original.id)
        toast.add({
          title: 'Copied to clipboard',
          description: 'Export ID copied to clipboard',
          icon: 'i-lucide-check',
          color: 'success'
        })
      }
    },
    {
      type: 'separator' as const
    },
    {
      label: 'Delete export',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect() {
        exportToDelete.value = row.original
        deleteConfirmOpen.value = true
      }
    }
  ]
}

// Check for small screen (reactive)
const isMobile = ref(false)
onMounted(() => {
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 640
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)
  onUnmounted(() => window.removeEventListener('resize', checkMobile))
})

const columns = computed<TableColumn<SavedExport>[]>(() => {
  const baseColumns: TableColumn<SavedExport>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => {
        const isSorted = column.getIsSorted()
        return h(UButton, {
          color: 'neutral',
          variant: 'ghost',
          label: 'Title',
          icon: isSorted
            ? isSorted === 'asc'
              ? 'i-lucide-arrow-up-narrow-wide'
              : 'i-lucide-arrow-down-wide-narrow'
            : 'i-lucide-arrow-up-down',
          class: '-mx-2.5',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
        })
      },
      cell: ({ row }) => {
        const title = row.original.title || ''
        const maxLength = isMobile.value ? 30 : 60
        const isTruncated = title.length > maxLength
        const displayTitle = isTruncated ? `${title.slice(0, maxLength)}…` : title

        const titleNode = h('p', { class: 'font-medium text-highlighted text-sm' }, displayTitle)

        const mainTitle = isTruncated
          ? h(UTooltip, { text: title }, { default: () => titleNode })
          : titleNode

        // On mobile, show focus badge inline with title
        if (isMobile.value) {
          const focus = row.original.focus as ExportFocus
          const opt = focusOptions[focus] || { label: focus, color: 'neutral' as const }
          return h('div', { class: 'flex flex-col gap-1' }, [
            mainTitle,
            h('div', { class: 'flex items-center gap-2' }, [
              h(UBadge, { variant: 'subtle', color: opt.color, size: 'xs' }, () => opt.label),
              h('span', { class: 'text-xs text-muted' }, formatRelativeDate(row.original.created_at))
            ])
          ])
        }

        return h('div', { class: 'flex flex-col gap-0.5' }, [
          mainTitle,
          row.original.metadata?.case_title && row.original.metadata.case_title !== row.original.title
            ? h('p', { class: 'text-xs text-muted truncate max-w-[200px]' }, row.original.metadata.case_title)
            : null
        ])
      }
    }
  ]

  // Only add extra columns on larger screens
  if (!isMobile.value) {
    baseColumns.push(
      {
        accessorKey: 'focus',
        header: 'Focus',
        cell: ({ row }) => {
          const focus = row.original.focus as ExportFocus
          const opt = focusOptions[focus] || { label: focus, color: 'neutral' as const }
          return h(UBadge, { 
            variant: 'subtle', 
            color: opt.color 
          }, () => opt.label)
        }
      },
      {
        id: 'stats',
        header: 'Content',
        cell: ({ row }) => {
          const meta = row.original.metadata
          const parts = []
          if (meta?.events_count) {
            parts.push(`${meta.events_count} events`)
          }
          if (meta?.evidence_count) {
            parts.push(`${meta.evidence_count} evidence`)
          }
          if (meta?.ai_summary_included) {
            parts.push('AI summary')
          }
          return h('span', { class: 'text-sm text-muted' }, parts.join(' · ') || '—')
        }
      },
      {
        accessorKey: 'created_at',
        header: ({ column }) => {
          const isSorted = column.getIsSorted()
          return h(UButton, {
            color: 'neutral',
            variant: 'ghost',
            label: 'Created',
            icon: isSorted
              ? isSorted === 'asc'
                ? 'i-lucide-arrow-up-narrow-wide'
                : 'i-lucide-arrow-down-wide-narrow'
              : 'i-lucide-arrow-up-down',
            class: '-mx-2.5',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
          })
        },
        cell: ({ row }) => {
          return h('div', { class: 'flex flex-col gap-0.5' }, [
            h('span', { class: 'text-sm' }, formatRelativeDate(row.original.created_at)),
            h('span', { class: 'text-xs text-muted' }, formatDate(row.original.created_at))
          ])
        }
      }
    )
  }

  // Actions column always shown
  baseColumns.push({
    id: 'actions',
    cell: ({ row }) => {
      return h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items: getRowItems(row)
          },
          () => h(UButton, {
            icon: 'i-lucide-ellipsis-vertical',
            color: 'neutral',
            variant: 'ghost',
            class: 'ml-auto'
          })
        )
      )
    }
  })

  return baseColumns
})

const sorting = ref([{ id: 'created_at', desc: true }])

async function deleteExport() {
  if (!exportToDelete.value) return

  try {
    await $fetch(`/api/exports/${exportToDelete.value.id}`, {
      method: 'DELETE'
    })

    await refreshExports()

    toast.add({
      title: 'Export deleted',
      icon: 'i-lucide-trash-2',
      color: 'neutral'
    })
  } catch (error) {
    console.error('[Exports] Failed to delete export:', error)
    toast.add({
      title: 'Delete failed',
      description: 'Unable to delete the export. Please try again.',
      color: 'error'
    })
  } finally {
    deleteConfirmOpen.value = false
    exportToDelete.value = null
  }
}

function openExport(row: Row<SavedExport>) {
  router.push(`/exports/${row.original.id}`)
}
</script>

<template>
  <UDashboardPanel id="exports">
    <template #header>
      <UDashboardNavbar title="Exports">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <!-- Secondary toolbar -->
      <div class="shrink-0 flex items-center justify-between border-b border-default px-4 sm:px-6 gap-3 py-3">
        <div class="flex items-center gap-3 flex-1 min-w-0">
          <UInput
            v-model="globalFilter"
            class="max-w-sm w-full sm:w-auto"
            icon="i-lucide-search"
            placeholder="Search exports..."
          />
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <span class="text-sm text-muted">
            {{ savedExports.length }} {{ savedExports.length === 1 ? 'export' : 'exports' }}
          </span>
          <UButton
            variant="solid"
            color="primary"
            size="sm"
            icon="i-lucide-plus"
            to="/exports/new"
            :disabled="isFree && !canExport"
          >
            New Export
          </UButton>
        </div>
      </div>
    </template>

    <template #body>
      <!-- Feature gate: Exports are Pro-only -->
      <div v-if="isFree && !canExport" class="p-4 sm:p-6">
        <UpgradePrompt
          title="Exports are a Pro feature"
          description="Create court-ready timeline documents, PDF exports, and shareable summaries for your attorney. Upgrade to Pro to unlock exports."
          variant="card"
        />
      </div>

      <!-- Loading -->
      <div v-else-if="status === 'pending'" class="flex items-center justify-center py-16">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>

      <!-- Empty state -->
      <div v-else-if="!savedExports.length" class="flex flex-col items-center justify-center py-16 text-center px-4">
        <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <UIcon name="i-lucide-file-text" class="size-10 text-primary" />
        </div>
        <p class="text-lg font-medium text-highlighted mb-2">
          No exports yet
        </p>
        <p class="text-sm text-muted mb-6 max-w-md">
          Generate court-ready timeline exports to share with your attorney or attach to legal filings.
        </p>
        <UButton
          variant="solid"
          color="primary"
          size="lg"
          icon="i-lucide-plus"
          to="/exports/new"
        >
          Create First Export
        </UButton>
      </div>

      <!-- Table view -->
      <div v-else class="flex flex-col h-full min-h-0">
        <UTable
          ref="table"
          v-model:sorting="sorting"
          v-model:global-filter="globalFilter"
          :data="savedExports"
          :columns="columns"
          :loading="status === 'pending'"
          sticky
          class="flex-1"
          @select="(_, row) => openExport(row)"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete confirmation modal -->
  <UModal
    v-model:open="deleteConfirmOpen"
    title="Delete export"
    description="Confirm deletion of this export."
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-trash-2" class="size-5 text-error" />
            <span class="font-medium">Delete export?</span>
          </div>
        </template>

        <p class="text-sm text-muted">
          Are you sure you want to delete "{{ exportToDelete?.title }}"? This action cannot be undone.
        </p>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="deleteConfirmOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              color="error"
              variant="solid"
              @click="deleteExport"
            >
              Delete
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>


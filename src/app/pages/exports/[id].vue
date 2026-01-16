<script setup lang="ts">
import type { SavedExport, ExportFocus, ExportMetadata } from '~/types'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const exportId = computed(() => route.params.id as string)

// Fetch the export
const {
  data: exportData,
  status,
  error,
  refresh
} = await useFetch<{ export: SavedExport & { markdown_content: string } }>(`/api/exports/${exportId.value}`, {
  headers: useRequestHeaders(['cookie'])
})

const currentExport = computed(() => exportData.value?.export)

// State
const showRendered = ref(true)
const copied = ref(false)
const pdfGenerating = ref(false)
const saving = ref(false)
const isEditingTitle = ref(false)
const editedTitle = ref('')
const deleteConfirmOpen = ref(false)

// Initialize edited title when export loads
watch(currentExport, (exp) => {
  if (exp) {
    editedTitle.value = exp.title
  }
}, { immediate: true })

const focusOptions: Record<ExportFocus, { label: string; icon: string; color: string }> = {
  'full-timeline': { label: 'Full Timeline', icon: 'i-lucide-file-text', color: 'text-primary' },
  'incidents-only': { label: 'Incidents Only', icon: 'i-lucide-alert-triangle', color: 'text-warning' },
  'positive-parenting': { label: 'Positive Parenting', icon: 'i-lucide-heart', color: 'text-success' }
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

async function updateTitle() {
  if (!exportId.value || !editedTitle.value.trim()) {
    isEditingTitle.value = false
    return
  }

  saving.value = true

  try {
    await $fetch(`/api/exports/${exportId.value}`, {
      method: 'PATCH',
      body: { title: editedTitle.value.trim() }
    })

    await refresh()
    isEditingTitle.value = false

    toast.add({
      title: 'Title updated',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    console.error('[Export] Failed to update title:', err)
    toast.add({
      title: 'Update failed',
      description: 'Unable to update the title.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function copyToClipboard() {
  if (!process.client || !currentExport.value?.markdown_content) return

  try {
    await navigator.clipboard.writeText(currentExport.value.markdown_content)
    copied.value = true
    
    toast.add({
      title: 'Report copied',
      description: 'The markdown report has been copied to your clipboard',
      icon: 'i-lucide-clipboard-check',
      color: 'neutral'
    })
    
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (e) {
    console.error('[Export] Failed to copy markdown:', e)
    toast.add({
      title: 'Copy failed',
      description: 'Unable to copy to clipboard',
      color: 'error'
    })
  }
}

async function downloadPdf() {
  if (!process.client || !currentExport.value?.markdown_content) return

  pdfGenerating.value = true

  try {
    const { jsPDF } = await import('jspdf')

    const doc = new jsPDF({
      unit: 'pt',
      format: 'letter'
    })

    // Layout constants - matching the clean rendered view style
    const marginX = 72 // 1 inch margins
    const marginTop = 72
    const marginBottom = 60
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentWidth = pageWidth - marginX * 2

    let cursorY = marginTop

    // Typography - tuned to match the web prose styling closely
    // Using Times for a more professional document feel (closer to serif prose)
    const fontFamily = 'times' // 'helvetica' or 'times'
    const typography = {
      h1: { size: 26, weight: 'bold' as const, color: [15, 23, 42] as [number, number, number], spaceBefore: 0, spaceAfter: 28 },
      h2: { size: 20, weight: 'bold' as const, color: [15, 23, 42] as [number, number, number], spaceBefore: 28, spaceAfter: 14 },
      h3: { size: 14, weight: 'bold' as const, color: [15, 23, 42] as [number, number, number], spaceBefore: 22, spaceAfter: 10 },
      body: { size: 12, weight: 'normal' as const, color: [30, 41, 59] as [number, number, number], lineHeight: 18 },
      italic: { size: 12, weight: 'italic' as const, color: [71, 85, 105] as [number, number, number], lineHeight: 18 },
      bold: { size: 12, weight: 'bold' as const, color: [15, 23, 42] as [number, number, number], lineHeight: 18 },
      list: { size: 12, weight: 'normal' as const, color: [30, 41, 59] as [number, number, number], lineHeight: 18, indent: 18 },
    }

    // Helper to handle page breaks
    const ensureSpace = (height: number) => {
      if (cursorY + height > pageHeight - marginBottom) {
        doc.addPage()
        cursorY = marginTop
        return true
      }
      return false
    }

    // Strip markdown inline formatting but track what was there
    const stripMarkdownInline = (text: string) => {
      return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`(.+?)`/g, '$1')
    }

    // Check if line is italic (wrapped in _ or *)
    const isItalicLine = (text: string) => {
      const trimmed = text.trim()
      return (trimmed.startsWith('_') && trimmed.endsWith('_')) ||
             (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**'))
    }

    // Check if line is bold (wrapped in ** or __)
    const isBoldLine = (text: string) => {
      const trimmed = text.trim()
      return (trimmed.startsWith('**') && trimmed.endsWith('**')) ||
             (trimmed.startsWith('__') && trimmed.endsWith('__'))
    }

    const rawLines = currentExport.value.markdown_content.split('\n')
    let lastWasHeading = false
    let lastWasBlank = false

    for (let i = 0; i < rawLines.length; i++) {
      const originalLine = rawLines[i] ?? ''
      const line = originalLine.trimEnd()

      // Blank line = paragraph spacing
      if (!line.trim()) {
        if (!lastWasBlank && !lastWasHeading) {
          cursorY += 12 // Paragraph gap
        }
        lastWasBlank = true
        continue
      }
      lastWasBlank = false

      // === HEADINGS ===
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        const level = headingMatch[1].length
        const text = stripMarkdownInline(headingMatch[2].trim())

        const style = level === 1 ? typography.h1 : level === 2 ? typography.h2 : typography.h3

        // Add space before heading (except first element)
        if (cursorY > marginTop + 10) {
          cursorY += style.spaceBefore
        }

        ensureSpace(style.size + style.spaceAfter)

        doc.setFont(fontFamily, style.weight as 'bold')
        doc.setFontSize(style.size)
        doc.setTextColor(style.color[0], style.color[1], style.color[2])

        // Wrap long headings
        const wrappedHeading = doc.splitTextToSize(text, contentWidth)
        doc.text(wrappedHeading, marginX, cursorY)
        cursorY += (wrappedHeading.length * style.size) + style.spaceAfter

        lastWasHeading = true
        continue
      }
      lastWasHeading = false

      // === HORIZONTAL RULE ===
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
        cursorY += 12
        ensureSpace(20)
        doc.setDrawColor(226, 232, 240) // slate-200
        doc.setLineWidth(1)
        doc.line(marginX, cursorY, pageWidth - marginX, cursorY)
        cursorY += 20
        continue
      }

      // === UNORDERED LIST ===
      const unorderedMatch = line.match(/^[-*]\s+(.*)$/)
      if (unorderedMatch && unorderedMatch[1]) {
        const bulletText = stripMarkdownInline(unorderedMatch[1].trim())
        const style = typography.list

        doc.setFont(fontFamily, style.weight as 'normal')
        doc.setFontSize(style.size)
        doc.setTextColor(style.color[0], style.color[1], style.color[2])

        const wrapped = doc.splitTextToSize(bulletText, contentWidth - style.indent - 8)
        const blockHeight = wrapped.length * style.lineHeight

        ensureSpace(blockHeight)

        // Bullet point
        doc.setFillColor(100, 116, 139) // slate-500
        doc.circle(marginX + 4, cursorY - 3, 2, 'F')

        doc.text(wrapped, marginX + style.indent, cursorY)
        cursorY += blockHeight + 4
        continue
      }

      // === ORDERED LIST ===
      const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/)
      if (orderedMatch && orderedMatch[1] && orderedMatch[2]) {
        const numberLabel = `${orderedMatch[1]}.`
        const itemText = stripMarkdownInline(orderedMatch[2].trim())
        const style = typography.list

        doc.setFont(fontFamily, style.weight as 'normal')
        doc.setFontSize(style.size)
        doc.setTextColor(style.color[0], style.color[1], style.color[2])

        const wrapped = doc.splitTextToSize(itemText, contentWidth - style.indent - 8)
        const blockHeight = wrapped.length * style.lineHeight

        ensureSpace(blockHeight)

        // Number
        doc.setTextColor(100, 116, 139) // slate-500 for number
        doc.text(numberLabel, marginX, cursorY)

        doc.setTextColor(style.color[0], style.color[1], style.color[2])
        doc.text(wrapped, marginX + style.indent, cursorY)
        cursorY += blockHeight + 4
        continue
      }

      // === REGULAR PARAGRAPH ===
      const isItalic = isItalicLine(line)
      const isBold = isBoldLine(line)
      const style = isItalic ? typography.italic : isBold ? typography.bold : typography.body

      const paragraph = stripMarkdownInline(line.trim())

      doc.setFont(fontFamily, style.weight as 'normal' | 'italic' | 'bold')
      doc.setFontSize(style.size)
      doc.setTextColor(style.color[0], style.color[1], style.color[2])

      const wrappedParagraph = doc.splitTextToSize(paragraph, contentWidth)
      const paragraphHeight = wrappedParagraph.length * style.lineHeight

      ensureSpace(paragraphHeight)
      doc.text(wrappedParagraph, marginX, cursorY)
      cursorY += paragraphHeight + 4
    }

    // === FOOTER ===
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFont(fontFamily, 'normal')
      doc.setFontSize(9)
      doc.setTextColor(148, 163, 184) // slate-400

      // Left: Project Daylight branding
      doc.text('Project Daylight', marginX, pageHeight - 30)

      // Right: Page numbers
      const pageText = `Page ${i} of ${pageCount}`
      const pageTextWidth = doc.getTextWidth(pageText)
      doc.text(pageText, pageWidth - marginX - pageTextWidth, pageHeight - 30)
    }

    const filename = `${currentExport.value.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`
    doc.save(filename)

    toast.add({
      title: 'PDF ready',
      description: 'Your report has been downloaded as a PDF.',
      icon: 'i-lucide-file-down',
      color: 'neutral'
    })
  } catch (e) {
    console.error('[Export] Failed to generate PDF:', e)
    toast.add({
      title: 'PDF failed',
      description: 'We were unable to generate the PDF.',
      color: 'error'
    })
  } finally {
    pdfGenerating.value = false
  }
}

async function deleteExport() {
  try {
    await $fetch(`/api/exports/${exportId.value}`, {
      method: 'DELETE'
    })

    toast.add({
      title: 'Export deleted',
      icon: 'i-lucide-trash-2',
      color: 'neutral'
    })

    router.push('/exports')
  } catch (err) {
    console.error('[Export] Failed to delete export:', err)
    toast.add({
      title: 'Delete failed',
      description: 'Unable to delete the export.',
      color: 'error'
    })
  } finally {
    deleteConfirmOpen.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="export-view">
    <template #header>
      <UDashboardNavbar>
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #title>
          <template v-if="isEditingTitle">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted">
                Export |
              </span>
              <UInput
                v-model="editedTitle"
                size="sm"
                class="w-64"
                @keyup.enter="updateTitle"
                @keyup.escape="isEditingTitle = false"
              />
              <UButton
                color="primary"
                variant="soft"
                size="xs"
                icon="i-lucide-check"
                :loading="saving"
                @click="updateTitle"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-x"
                @click="isEditingTitle = false"
              />
            </div>
          </template>
          <template v-else>
            <div class="flex items-center gap-2">
              <span class="truncate max-w-[200px] sm:max-w-[400px]">
                Export | {{ currentExport?.title || 'Untitled export' }}
              </span>
              <UButton
                v-if="currentExport"
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-pencil"
                class="opacity-50 hover:opacity-100"
                @click="isEditingTitle = true; editedTitle = currentExport.title"
              />
            </div>
          </template>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="currentExport">
        <template #left>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-arrow-left"
            to="/exports"
          >
            Back to Exports
          </UButton>
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-clipboard"
              :disabled="!currentExport?.markdown_content"
              @click="copyToClipboard"
            >
              <span v-if="copied">Copied</span>
              <span v-else>Copy</span>
            </UButton>

            <UButton
              color="primary"
              variant="soft"
              size="xs"
              icon="i-lucide-file-down"
              :disabled="!currentExport?.markdown_content"
              :loading="pdfGenerating"
              @click="downloadPdf"
            >
              PDF
            </UButton>

            <USwitch
              v-model="showRendered"
              size="sm"
              label="Rendered"
            />

            <UDropdownMenu
              :items="[
                [{
                  label: 'Delete export',
                  icon: 'i-lucide-trash-2',
                  color: 'error',
                  onSelect: () => deleteConfirmOpen = true
                }]
              ]"
              :content="{ align: 'end' }"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-ellipsis-vertical"
              />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="status === 'pending'" class="flex items-center justify-center py-16">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>

      <!-- Error -->
      <div v-else-if="status === 'error' || !currentExport" class="flex flex-col items-center justify-center py-16 px-4">
        <UIcon name="i-lucide-file-x" class="size-12 text-error mb-4" />
        <p class="text-sm font-medium text-highlighted mb-1">Export not found</p>
        <p class="text-xs text-muted mb-4">{{ error?.message || 'This export may have been deleted.' }}</p>
        <UButton
          variant="soft"
          size="sm"
          icon="i-lucide-arrow-left"
          to="/exports"
        >
          Back to Exports
        </UButton>
      </div>

      <!-- Export content -->
      <div v-else class="p-4 sm:p-6">
        <div class="max-w-4xl mx-auto">
          <!-- Metadata chips -->
          <div class="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted">
            <div class="flex items-center gap-2">
              <UIcon
                :name="focusOptions[currentExport.focus]?.icon || 'i-lucide-file-text'"
                :class="['size-4', focusOptions[currentExport.focus]?.color || 'text-primary']"
              />
              <span>
                {{ focusOptions[currentExport.focus]?.label || currentExport.focus }}
              </span>
            </div>

            <span>
              · Created {{ formatDate(currentExport.created_at) }}
            </span>

            <span v-if="currentExport.metadata?.events_count || currentExport.metadata?.evidence_count">
              · {{ currentExport.metadata?.events_count || 0 }} events ·
              {{ currentExport.metadata?.evidence_count || 0 }} evidence
            </span>
          </div>

          <template v-if="!showRendered">
            <pre class="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-highlighted bg-subtle rounded-lg p-4">{{ currentExport.markdown_content }}</pre>
          </template>
          <template v-else>
            <div class="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-default">
              <MDC
                :value="currentExport.markdown_content"
                class="prose prose-sm dark:prose-invert max-w-none"
              />
            </div>
          </template>
        </div>
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
          Are you sure you want to delete "{{ currentExport?.title }}"? This action cannot be undone.
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


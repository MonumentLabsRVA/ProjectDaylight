<script setup lang="ts">
import type {
  EvidenceItem,
  EvidenceSourceType,
  TimelineEvent,
  EventType,
  SavedExport,
  ExportFocus,
  ExportMetadata
} from '~/types'

// Supabase session; data fetching uses cookie-based auth via useFetch
const session = useSupabaseSession()
const toast = useToast()

interface CaseRow {
  id: string
  title: string
  case_number: string | null
  jurisdiction_state: string | null
  jurisdiction_county: string | null
  court_name: string | null
  goals_summary: string | null
  children_summary: string | null
  parenting_schedule: string | null
  next_court_date: string | null
  risk_flags: string[] | null
  updated_at: string
  lawyer_name?: string | null
  lawyer_email?: string | null
}

interface CaseResponse {
  case: CaseRow | null
}

interface ExportsResponse {
  exports: SavedExport[]
}

// Fetch saved exports
const {
  data: exportsData,
  status: exportsStatus,
  refresh: refreshExports
} = await useFetch<ExportsResponse>('/api/exports', {
  headers: useRequestHeaders(['cookie'])
})

const savedExports = computed(() => exportsData.value?.exports || [])

// Data from API via SSR-aware useFetch and cookie-based auth
const {
  data: timelineData,
  status: timelineStatus,
  refresh: refreshTimeline
} = await useFetch<TimelineEvent[]>('/api/timeline', {
  headers: useRequestHeaders(['cookie'])
})

const {
  data: evidenceData,
  status: evidenceStatus,
  refresh: refreshEvidence
} = await useFetch<EvidenceItem[]>('/api/evidence', {
  headers: useRequestHeaders(['cookie'])
})

const {
  data: caseResponse,
  status: caseStatus,
  refresh: refreshCase
} = await useFetch<CaseResponse>('/api/case', {
  headers: useRequestHeaders(['cookie'])
})

const currentCase = ref<CaseRow | null>(null)

watch(caseResponse, (res) => {
  currentCase.value = res?.case ?? null
}, { immediate: true })

// Export form state
const exportFocus = ref<ExportFocus>('full-timeline')
const includeEvidenceIndex = ref(true)
const includeOverview = ref(true)
const includeAISummary = ref(true)

const caseTitle = ref('')
const courtName = ref('')
const recipient = ref('')
const overviewNotes = ref('')

const markdown = ref('')
const generating = ref(false)
const saving = ref(false)
const copied = ref(false)
const showRendered = ref(false)
const pdfGenerating = ref(false)
const viewMode = ref<'configure' | 'preview' | 'history'>('configure')
const lastGeneratedAt = ref<string | null>(null)
const aiSummary = ref<string | null>(null)
const summaryGenerating = ref(false)

// Currently viewing/editing export
const currentExportId = ref<string | null>(null)
const currentExportTitle = ref('')
const isEditingTitle = ref(false)
const deleteConfirmOpen = ref(false)
const exportToDelete = ref<SavedExport | null>(null)

const isLoadingData = computed(
  () =>
    timelineStatus.value === 'pending' ||
    evidenceStatus.value === 'pending' ||
    caseStatus.value === 'pending'
)

const exportFocusLabel = computed(() => {
  return exportFocusOptions.find(option => option.value === exportFocus.value)?.label || ''
})

const exportFocusOptions: { label: string; value: ExportFocus; description: string }[] = [{
  label: 'Full timeline',
  value: 'full-timeline',
  description: 'Everything in chronological order – good, bad, and neutral.'
}, {
  label: 'Incidents only',
  value: 'incidents-only',
  description: 'Only focus on documented incidents and concerning events.'
}, {
  label: 'Positive parenting',
  value: 'positive-parenting',
  description: 'Highlight your stability, routines, and positive involvement.'
}]

function applyCase(row: CaseRow | null) {
  if (!row) return

  if (!caseTitle.value.trim()) {
    caseTitle.value = row.title ?? ''
  }

  if (!courtName.value.trim()) {
    const pieces: string[] = []
    if (row.court_name) {
      pieces.push(row.court_name)
    } else if (row.jurisdiction_county || row.jurisdiction_state) {
      const locality = [row.jurisdiction_county, row.jurisdiction_state]
        .filter(Boolean)
        .join(', ')
      if (locality) {
        pieces.push(locality)
      }
    }
    courtName.value = pieces.join(' - ')
  }

  // Default "Prepared for" to the lawyer's name if available and not already set
  if (!recipient.value.trim() && row.lawyer_name) {
    recipient.value = row.lawyer_name
  }

  if (!overviewNotes.value.trim()) {
    const lines: string[] = []

    if (row.goals_summary) {
      lines.push(row.goals_summary.trim())
    }

    if (row.children_summary) {
      lines.push('')
      lines.push(`Children: ${row.children_summary.trim()}`)
    }

    if (row.parenting_schedule) {
      lines.push('')
      lines.push(`Current schedule: ${row.parenting_schedule.trim()}`)
    }

    if (row.next_court_date) {
      const date = new Date(row.next_court_date)
      if (!Number.isNaN(date.getTime())) {
        lines.push('')
        lines.push(
          `Next important court date: ${date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}`
        )
      }
    }

    if (row.risk_flags && row.risk_flags.length) {
      lines.push('')
      lines.push(`Key concerns: ${row.risk_flags.join(', ')}`)
    }

    if (lines.length) {
      overviewNotes.value = lines.join('\n')
    }
  }
}

watch(currentCase, (row) => {
  if (row) {
    applyCase(row)
  }
}, { immediate: true })

async function loadData() {
  await Promise.allSettled([
    refreshTimeline(),
    refreshEvidence(),
    refreshCase()
  ])
}

watch(session, (newSession) => {
  if (newSession?.access_token) {
    loadData()
  }
})

function formatDate(value?: string) {
  if (!value) return '—'

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatRelativeDate(value: string) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return 'Today'
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return `${diffDays} days ago`
  } else {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }
}

function formatEventType(type: EventType) {
  const map: Record<EventType, string> = {
    positive: 'Positive parenting',
    incident: 'Incident',
    medical: 'Medical',
    school: 'School',
    communication: 'Communication',
    legal: 'Legal / court'
  }

  return map[type] || type
}

const filteredEvents = computed(() => {
  let events = (timelineData.value || []) as TimelineEvent[]

  if (exportFocus.value === 'incidents-only') {
    events = events.filter(event => event.type === 'incident')
  } else if (exportFocus.value === 'positive-parenting') {
    events = events.filter(event => event.type === 'positive')
  }

  return events
})

function buildEvidenceSummaryForEvent(event: TimelineEvent): string | null {
  if (!event.evidenceIds?.length) return null
  const items = (evidenceData.value || []) as EvidenceItem[]
  if (!items.length) return null

  const counts: Record<EvidenceSourceType, number> = {
    text: 0,
    email: 0,
    photo: 0,
    document: 0
  }

  for (const evidenceId of event.evidenceIds) {
    const match = items.find((item) => item.id === evidenceId)
    if (!match) continue
    counts[match.sourceType] = (counts[match.sourceType] ?? 0) + 1
  }

  const parts: string[] = []

  const pushPart = (count: number, singular: string, plural: string) => {
    if (!count) return
    parts.push(`${count} ${count === 1 ? singular : plural}`)
  }

  pushPart(counts.photo, 'photo', 'photos')
  pushPart(counts.text, 'text message', 'text messages')
  pushPart(counts.email, 'email', 'emails')
  pushPart(counts.document, 'document', 'documents')

  if (!parts.length) return null
  return parts.join(', ')
}

function buildMarkdown() {
  const lines: string[] = []

  lines.push('# Custody case timeline & evidence summary', '')

  // Add AI Summary if available
  if (aiSummary.value) {
    lines.push('## Executive Summary', '')
    lines.push('_AI-generated analysis of key patterns and important developments:_', '')
    lines.push(aiSummary.value, '')
    lines.push('---', '')
  }

  if (caseTitle.value.trim()) {
    lines.push(`**Case:** ${caseTitle.value.trim()}`)
  }

  if (courtName.value.trim()) {
    lines.push(`**Court:** ${courtName.value.trim()}`)
  }

  if (recipient.value.trim()) {
    lines.push(`**Prepared for:** ${recipient.value.trim()}`)
  }

  lines.push(`**Generated on:** ${new Date().toLocaleString()}`, '')

  if (includeOverview.value) {
    lines.push('## 1. Overview', '')

    if (overviewNotes.value.trim()) {
      lines.push(overviewNotes.value.trim(), '')
    } else {
      lines.push(
        '_Use this section to briefly explain the current status of your case, upcoming court dates, and what you want the court or your attorney to understand._',
        ''
      )
    }
  }

  lines.push('## 2. Timeline of key events', '')

  const events = filteredEvents.value

  if (!events.length) {
    lines.push('_No events found for this export._', '')
  } else {
    events.forEach((event, index) => {
      lines.push(
        `${index + 1}. ${formatDate(event.timestamp)} — **${event.title}** (${formatEventType(event.type)})`
      )

      if (event.description) {
        lines.push(`   - Details: ${event.description}`)
      }

      if (event.location) {
        lines.push(`   - Location: ${event.location}`)
      }

      if (event.participants?.length) {
        lines.push(`   - Participants: ${event.participants.join(', ')}`)
      }

      const evidenceSummary = buildEvidenceSummaryForEvent(event)
      if (evidenceSummary) {
        lines.push(`   - Evidence: ${evidenceSummary}`)
      }

      lines.push('')
    })
  }

  if (includeEvidenceIndex.value) {
    lines.push('## 3. Evidence index', '')

    if (!evidenceData.value?.length) {
      lines.push('_No evidence items found for this export._', '')
    } else {
      ;(evidenceData.value || []).forEach((item, index) => {
        lines.push(
          `${index + 1}. [${formatDate(item.createdAt)}] **${item.originalName}** (${item.sourceType})`
        )

        if (item.summary) {
          lines.push(`   - Summary: ${item.summary}`)
        }

        if (item.tags?.length) {
          lines.push(`   - Tags: ${item.tags.join(', ')}`)
        }

        lines.push('')
      })
    }
  }

  lines.push(
    '---',
    '',
    '_This export is generated from your Project Daylight timeline and evidence. Share it with your attorney or attach it as a supporting document for court._'
  )

  return lines.join('\n')
}

async function generateAISummary() {
  summaryGenerating.value = true
  aiSummary.value = null

  try {
    const response = await $fetch('/api/export-summary', {
      method: 'POST',
      body: {
        timeline: timelineData.value || [],
        evidence: evidenceData.value || [],
        caseInfo: currentCase.value,
        exportFocus: exportFocus.value,
        userPreferences: {
          caseTitle: caseTitle.value,
          courtName: courtName.value,
          recipient: recipient.value,
          overviewNotes: overviewNotes.value
        }
      }
    })

    if (response?.summary) {
      aiSummary.value = response.summary
    }
  } catch (error) {
    console.error('[Export] Failed to generate AI summary:', error)
    toast.add({
      title: 'AI Summary Generation Failed',
      description: 'The export will be generated without the AI summary.',
      color: 'warning'
    })
  } finally {
    summaryGenerating.value = false
  }
}

async function saveExport(markdownContent: string) {
  saving.value = true

  try {
    const title = caseTitle.value.trim() || `Export - ${new Date().toLocaleDateString()}`
    const metadata: ExportMetadata = {
      case_title: caseTitle.value,
      court_name: courtName.value,
      recipient: recipient.value,
      overview_notes: overviewNotes.value,
      include_evidence_index: includeEvidenceIndex.value,
      include_overview: includeOverview.value,
      include_ai_summary: includeAISummary.value,
      events_count: filteredEvents.value.length,
      evidence_count: evidenceData.value?.length || 0,
      ai_summary_included: !!aiSummary.value
    }

    const response = await $fetch('/api/exports', {
      method: 'POST',
      body: {
        title,
        markdown_content: markdownContent,
        focus: exportFocus.value,
        metadata
      }
    })

    if (response?.export) {
      currentExportId.value = response.export.id
      currentExportTitle.value = response.export.title
      await refreshExports()

      toast.add({
        title: 'Export saved',
        description: 'Your export has been saved and can be accessed from your history.',
        icon: 'i-lucide-check',
        color: 'success'
      })
    }
  } catch (error) {
    console.error('[Export] Failed to save export:', error)
    toast.add({
      title: 'Save failed',
      description: 'Unable to save export. Please try again.',
      icon: 'i-lucide-triangle-alert',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function generateMarkdown() {
  generating.value = true
  copied.value = false
  currentExportId.value = null

  try {
    // Generate AI summary first if enabled (optional - won't block export if it fails)
    if (includeAISummary.value) {
      await generateAISummary()
    } else {
      aiSummary.value = null
    }
    
    markdown.value = buildMarkdown()
    lastGeneratedAt.value = new Date().toLocaleString()
    // After generating an export, default to the rendered view
    showRendered.value = true
    viewMode.value = 'preview'

    // Auto-save the export
    await saveExport(markdown.value)
  } finally {
    generating.value = false
  }
}

function startNewExport() {
  viewMode.value = 'configure'
  markdown.value = ''
  copied.value = false
  showRendered.value = false
  aiSummary.value = null
  currentExportId.value = null
  currentExportTitle.value = ''
  isEditingTitle.value = false
}

async function openSavedExport(exp: SavedExport) {
  try {
    const response = await $fetch(`/api/exports/${exp.id}`, {
      headers: useRequestHeaders(['cookie'])
    })

    if (response?.export) {
      const fullExport = response.export as SavedExport & { markdown_content: string }
      markdown.value = fullExport.markdown_content
      currentExportId.value = fullExport.id
      currentExportTitle.value = fullExport.title
      exportFocus.value = fullExport.focus
      lastGeneratedAt.value = new Date(fullExport.created_at).toLocaleString()
      
      // Restore metadata if available
      if (fullExport.metadata) {
        caseTitle.value = fullExport.metadata.case_title || ''
        courtName.value = fullExport.metadata.court_name || ''
        recipient.value = fullExport.metadata.recipient || ''
      }
      
      showRendered.value = true
      viewMode.value = 'preview'
    }
  } catch (error) {
    console.error('[Export] Failed to load export:', error)
    toast.add({
      title: 'Load failed',
      description: 'Unable to load the export. Please try again.',
      icon: 'i-lucide-triangle-alert',
      color: 'error'
    })
  }
}

async function updateExportTitle() {
  if (!currentExportId.value || !currentExportTitle.value.trim()) {
    isEditingTitle.value = false
    return
  }

  try {
    await $fetch(`/api/exports/${currentExportId.value}`, {
      method: 'PATCH',
      body: {
        title: currentExportTitle.value.trim()
      }
    })

    await refreshExports()
    isEditingTitle.value = false

    toast.add({
      title: 'Title updated',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (error) {
    console.error('[Export] Failed to update title:', error)
    toast.add({
      title: 'Update failed',
      description: 'Unable to update the title. Please try again.',
      color: 'error'
    })
  }
}

async function updateExportContent() {
  if (!currentExportId.value || !markdown.value) return

  saving.value = true

  try {
    await $fetch(`/api/exports/${currentExportId.value}`, {
      method: 'PATCH',
      body: {
        markdown_content: markdown.value
      }
    })

    toast.add({
      title: 'Export updated',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (error) {
    console.error('[Export] Failed to update export:', error)
    toast.add({
      title: 'Update failed',
      description: 'Unable to save changes. Please try again.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

function confirmDelete(exp: SavedExport) {
  exportToDelete.value = exp
  deleteConfirmOpen.value = true
}

async function deleteExport() {
  if (!exportToDelete.value) return

  try {
    await $fetch(`/api/exports/${exportToDelete.value.id}`, {
      method: 'DELETE'
    })

    await refreshExports()

    // If we just deleted the currently viewed export, go back to configure
    if (currentExportId.value === exportToDelete.value.id) {
      startNewExport()
    }

    toast.add({
      title: 'Export deleted',
      icon: 'i-lucide-trash-2',
      color: 'neutral'
    })
  } catch (error) {
    console.error('[Export] Failed to delete export:', error)
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

async function copyToClipboard() {
  if (!process.client || !markdown.value) return

  try {
    await navigator.clipboard.writeText(markdown.value)
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
      icon: 'i-lucide-clipboard-x',
      color: 'error'
    })
  }
}

async function downloadPdf() {
  if (!process.client) return

  // Ensure we have up-to-date markdown
  if (!markdown.value) {
    await generateMarkdown()
    if (!markdown.value) {
      return
    }
  }

  pdfGenerating.value = true

  try {
    const { jsPDF } = await import('jspdf')

    const doc = new jsPDF({
      unit: 'pt',
      format: 'letter'
    })

    const margin = 54 // 0.75 inch
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentWidth = pageWidth - margin * 2
    
    let cursorY = margin
    
    // Helper: Check for page break
    const ensureSpace = (height: number) => {
      if (cursorY + height > pageHeight - margin) {
        doc.addPage()
        cursorY = margin
        return true
      }
      return false
    }

    // --- HEADER ---
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('Custody case timeline & evidence summary', margin, cursorY)
    cursorY += 30

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    
    // Case Meta
    const metaLines = []
    if (caseTitle.value.trim()) metaLines.push({ label: 'Case:', value: caseTitle.value.trim() })
    if (courtName.value.trim()) metaLines.push({ label: 'Court:', value: courtName.value.trim() })
    if (recipient.value.trim()) metaLines.push({ label: 'Prepared for:', value: recipient.value.trim() })
    metaLines.push({ label: 'Generated on:', value: new Date().toLocaleString() })

    metaLines.forEach(meta => {
      doc.setFont('helvetica', 'bold')
      doc.text(meta.label, margin, cursorY)
      const labelWidth = doc.getTextWidth(meta.label)
      
      doc.setFont('helvetica', 'normal')
      doc.text(meta.value, margin + labelWidth + 5, cursorY)
      
      cursorY += 16
    })

    cursorY += 10
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
    cursorY += 25

    // --- SECTION 1: OVERVIEW ---
    if (includeOverview.value) {
      ensureSpace(100)
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('1. Overview', margin, cursorY)
      cursorY += 20
      
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      
      const overviewText = overviewNotes.value.trim() || 'Use this section to briefly explain the current status of your case, upcoming court dates, and what you want the court or your attorney to understand.'
      
      const splitOverview = doc.splitTextToSize(overviewText, contentWidth)
      
      if (ensureSpace(splitOverview.length * 14)) {
        // If page break happened, continue text
      }
      
      doc.text(splitOverview, margin, cursorY)
      cursorY += (splitOverview.length * 14) + 25
    }

    // --- SECTION 2: TIMELINE ---
    ensureSpace(50)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('2. Timeline of key events', margin, cursorY)
    cursorY += 20

    const events = filteredEvents.value
    
    if (!events.length) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(10)
      doc.text('No events found for this export.', margin, cursorY)
      cursorY += 20
    } else {
      events.forEach((event, index) => {
        const descLines = event.description ? doc.splitTextToSize(event.description, contentWidth - 15).length : 0
        const evidenceSummary = buildEvidenceSummaryForEvent(event)
        const metaCount =
          (event.location ? 1 : 0) + (event.participants?.length ? 1 : 0) + (evidenceSummary ? 1 : 0)
        const estimatedHeight = 20 + (descLines * 14) + (metaCount * 14) + 10
        
        ensureSpace(estimatedHeight)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(100, 100, 100)
        
        const dateStr = formatDate(event.timestamp)
        const dateWidth = doc.getTextWidth(dateStr)
        const numberStr = `${index + 1}. `
        
        doc.setTextColor(0, 0, 0)
        doc.text(numberStr, margin, cursorY)
        
        doc.setTextColor(80, 80, 80)
        doc.text(dateStr, margin + 15, cursorY)
        
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'bold')
        const titleX = margin + 15 + dateWidth + 10
        doc.text(event.title, titleX, cursorY)
        
        const titleWidth = doc.getTextWidth(event.title)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100, 100, 100)
        doc.text(`(${formatEventType(event.type)})`, titleX + titleWidth + 5, cursorY)
        
        cursorY += 16

        if (event.description) {
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(0, 0, 0)
          const splitDesc = doc.splitTextToSize(event.description, contentWidth - 15)
          doc.text(splitDesc, margin + 15, cursorY)
          cursorY += (splitDesc.length * 14) + 4
        }

        doc.setFontSize(9)
        doc.setTextColor(80, 80, 80)
        
        if (event.location) {
          doc.text(`Location: ${event.location}`, margin + 15, cursorY)
          cursorY += 12
        }
        
        if (event.participants?.length) {
          doc.text(`Participants: ${event.participants.join(', ')}`, margin + 15, cursorY)
          cursorY += 12
        }

        if (evidenceSummary) {
          doc.text(`Evidence: ${evidenceSummary}`, margin + 15, cursorY)
          cursorY += 12
        }

        cursorY += 10
      })
    }
    
    cursorY += 15

    // --- SECTION 3: EVIDENCE INDEX ---
    if (includeEvidenceIndex.value) {
      ensureSpace(50)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(0, 0, 0)
      doc.text('3. Evidence index', margin, cursorY)
      cursorY += 20

      const evidenceItems = (evidenceData.value || []) as EvidenceItem[]

      if (!evidenceItems.length) {
        doc.setFont('helvetica', 'italic')
        doc.setFontSize(10)
        doc.text('No evidence items found for this export.', margin, cursorY)
      } else {
        evidenceItems.forEach((item, index) => {
          const summaryLines = item.summary ? doc.splitTextToSize(item.summary, contentWidth - 15).length : 0
          const metaHeight = item.tags?.length ? 14 : 0
          const estimatedHeight = 20 + (summaryLines * 14) + metaHeight + 10
          
          ensureSpace(estimatedHeight)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(10)
          
          const numberStr = `${index + 1}. `
          doc.text(numberStr, margin, cursorY)
          
          const dateStr = `[${formatDate(item.createdAt)}] `
          doc.setTextColor(80, 80, 80)
          doc.text(dateStr, margin + 15, cursorY)
          const dateWidth = doc.getTextWidth(dateStr)
          
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text(item.originalName, margin + 15 + dateWidth, cursorY)
          const nameWidth = doc.getTextWidth(item.originalName)
          
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(100, 100, 100)
          doc.text(`(${item.sourceType})`, margin + 15 + dateWidth + nameWidth + 5, cursorY)
          
          cursorY += 16

          if (item.summary) {
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(0, 0, 0)
            const splitSummary = doc.splitTextToSize(item.summary, contentWidth - 15)
            doc.text(splitSummary, margin + 15, cursorY)
            cursorY += (splitSummary.length * 14) + 4
          }

          if (item.tags?.length) {
            doc.setFontSize(9)
            doc.setTextColor(80, 80, 80)
            doc.text(`Tags: ${item.tags.join(', ')}`, margin + 15, cursorY)
            cursorY += 12
          }
          
          cursorY += 10
        })
      }
    }
    
    // Footer - page numbering
    const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : doc.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Project Daylight - Page ${i} of ${pageCount}`, margin, pageHeight - 20)
    }

    doc.save('project-daylight-report.pdf')

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
      description: 'We were unable to generate the PDF. Please try again.',
      icon: 'i-lucide-triangle-alert',
      color: 'error'
    })
  } finally {
    pdfGenerating.value = false
  }
}

function getFocusIcon(focus: ExportFocus) {
  switch (focus) {
    case 'incidents-only':
      return 'i-lucide-alert-triangle'
    case 'positive-parenting':
      return 'i-lucide-heart'
    default:
      return 'i-lucide-file-text'
  }
}

function getFocusColor(focus: ExportFocus) {
  switch (focus) {
    case 'incidents-only':
      return 'text-warning'
    case 'positive-parenting':
      return 'text-success'
    default:
      return 'text-primary'
  }
}
</script>

<template>
  <UDashboardPanel id="export">
    <template #header>
      <UDashboardNavbar 
        :title="viewMode === 'configure' ? 'New export' : viewMode === 'history' ? 'Export history' : 'Export review'"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <div class="flex items-center gap-3">
            <UButton
              v-if="viewMode !== 'history'"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-history"
              :badge="savedExports.length > 0 ? savedExports.length : undefined"
              @click="viewMode = 'history'"
            >
              <span class="hidden sm:inline">History</span>
            </UButton>
            <UButton
              v-if="viewMode === 'history'"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-plus"
              @click="startNewExport"
            >
              New export
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- History view -->
      <div v-if="viewMode === 'history'" class="space-y-4">
        <div v-if="exportsStatus === 'pending'" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
        </div>

        <div v-else-if="!savedExports.length" class="flex flex-col items-center justify-center py-16 text-center">
          <UIcon name="i-lucide-file-text" class="size-12 text-muted/40 mb-4" />
          <p class="text-sm font-medium text-highlighted">No exports yet</p>
          <p class="text-xs text-muted mt-1">Generate your first export to see it here.</p>
          <UButton
            color="primary"
            variant="solid"
            size="sm"
            icon="i-lucide-plus"
            class="mt-4"
            @click="startNewExport"
          >
            Create export
          </UButton>
        </div>

        <div v-else class="grid gap-3 max-w-4xl">
          <UCard
            v-for="exp in savedExports"
            :key="exp.id"
            class="cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
            @click="openSavedExport(exp)"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3 min-w-0">
                <UIcon
                  :name="getFocusIcon(exp.focus)"
                  :class="['size-5 shrink-0 mt-0.5', getFocusColor(exp.focus)]"
                />
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted truncate">
                    {{ exp.title }}
                  </p>
                  <div class="flex items-center gap-2 mt-1 text-xs text-muted">
                    <span>{{ formatRelativeDate(exp.created_at) }}</span>
                    <span>·</span>
                    <span>{{ exportFocusOptions.find(o => o.value === exp.focus)?.label || exp.focus }}</span>
                    <template v-if="exp.metadata?.events_count">
                      <span>·</span>
                      <span>{{ exp.metadata.events_count }} events</span>
                    </template>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-trash-2"
                  @click.stop="confirmDelete(exp)"
                />
                <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Step 1: Configure export -->
      <div v-else-if="viewMode === 'configure'" class="space-y-6">
        <p class="max-w-3xl text-sm text-muted">
          Generate a plain‑text, court‑ready markdown summary you can paste into an email, document, or portal.
          We'll pull in details from your
          <code class="px-1 rounded bg-subtle text-xs text-muted border border-default">/api/timeline</code>
          and
          <code class="px-1 rounded bg-subtle text-xs text-muted border border-default">/api/evidence</code>
          data.
        </p>

        <UCard class="max-w-3xl">
          <div class="space-y-6">
            <!-- Case details -->
            <div class="space-y-3">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">
                  Case details
                </p>
                <p class="text-[11px] text-muted">
                  <span v-if="currentCase">
                    Using details from your
                    <NuxtLink to="/case" class="underline text-primary">Case</NuxtLink>
                    page. You can tweak them here just for this export.
                  </span>
                  <span v-else>
                    Optional. Fill out your
                    <NuxtLink to="/case" class="underline text-primary">Case</NuxtLink>
                    page to auto‑fill these fields.
                  </span>
                </p>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-1">
                  <p class="text-xs font-medium text-highlighted">
                    Case title
                  </p>
                  <UInput
                    v-model="caseTitle"
                    placeholder="Johnson v. Johnson – custody"
                    class="w-full"
                  />
                  <p class="text-[11px] text-muted">
                    Optional. For example: Johnson v. Johnson – custody.
                  </p>
                </div>

                <div class="space-y-1">
                  <p class="text-xs font-medium text-highlighted">
                    Court
                  </p>
                  <UInput
                    v-model="courtName"
                    placeholder="Richmond Circuit Court, VA"
                    class="w-full"
                  />
                  <p class="text-[11px] text-muted">
                    Optional. For example: Richmond Circuit Court, VA.
                  </p>
                </div>
              </div>

              <div class="space-y-1">
                <p class="text-xs font-medium text-highlighted">
                  Prepared for
                </p>
                <UInput
                  v-model="recipient"
                  placeholder="Attorney Smith / GAL / Court"
                  class="w-full"
                />
                <p class="text-[11px] text-muted">
                  Optional. Attorney, GAL, or court.
                </p>
              </div>
            </div>

            <!-- Focus -->
            <div class="space-y-3">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Focus
              </p>
              <div class="space-y-1">
                <p class="text-xs font-medium text-highlighted">
                  What do you want to highlight?
                </p>

                <USelect
                  v-model="exportFocus"
                  :items="exportFocusOptions"
                  value-attribute="value"
                  option-attribute="label"
                  class="w-full md:w-60"
                  :ui="{
                    trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
                  }"
                />

                <p class="mt-1 text-xs text-muted">
                  {{ exportFocusOptions.find(option => option.value === exportFocus)?.description }}
                </p>
              </div>
            </div>

            <!-- Advanced options -->
            <UCollapsible class="flex flex-col gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="justify-between group self-start"
                trailing-icon="i-lucide-chevron-down"
                :ui="{
                  trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
                }"
              >
                <span class="text-xs font-medium text-highlighted">
                  Advanced sections & notes
                </span>
              </UButton>

              <template #content>
                <div class="pt-1 space-y-4">
                  <!-- Sections -->
                  <div class="space-y-3">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Sections
                    </p>

                    <div class="space-y-2">
                      <USwitch
                        v-model="includeOverview"
                        label="Include overview section"
                        description="Short narrative at the top explaining what the reader should understand."
                      />

                      <USwitch
                        v-model="includeEvidenceIndex"
                        label="Include evidence index"
                        description="Numbered list of evidence items with summaries and tags."
                      />
                    </div>
                  </div>

                  <!-- Overview notes -->
                  <div v-if="includeOverview" class="space-y-1">
                    <p class="text-xs font-medium text-highlighted">
                      Overview notes (optional)
                    </p>
                    <UTextarea
                      v-model="overviewNotes"
                      placeholder="Example: This report covers the last 60 days leading up to the temporary custody hearing on..."
                      :rows="4"
                      autoresize
                      class="w-full"
                    />
                    <p class="text-[11px] text-muted">
                      If you leave this blank, we'll include a prompt you can fill in later.
                    </p>
                  </div>
                </div>
              </template>
            </UCollapsible>

            <!-- Actions -->
            <div class="pt-4 flex flex-col gap-3 border-t border-dashed border-default/60">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div class="flex items-center gap-2 text-xs text-muted">
                  <template v-if="summaryGenerating">
                    <UIcon name="i-lucide-sparkles" class="size-4 animate-pulse text-primary" />
                    <span>AI is analyzing your timeline and evidence...</span>
                  </template>
                  <template v-else-if="isLoadingData">
                    <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
                    <span>Loading timeline and evidence…</span>
                  </template>
                  <template v-else>
                    <UCheckbox
                      v-model="includeAISummary"
                      label="Include AI executive summary"
                      :ui="{ label: 'text-xs text-muted' }"
                    />
                    <UTooltip text="AI analyzes your timeline and evidence to highlight key patterns">
                      <UIcon name="i-lucide-info" class="size-3.5 text-muted/60" />
                    </UTooltip>
                  </template>
                </div>

                <div class="flex items-center gap-3">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    :disabled="isLoadingData"
                    @click="loadData"
                  >
                    Refresh data
                  </UButton>

                  <UButton
                    color="primary"
                    variant="solid"
                    icon="i-lucide-file-text"
                    :loading="generating || summaryGenerating"
                    :disabled="isLoadingData"
                    @click="generateMarkdown"
                  >
                    <span v-if="summaryGenerating">Generating...</span>
                    <span v-else>Generate export</span>
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Step 2: Full-width preview -->
      <div v-else class="flex flex-col gap-4 h-full">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <!-- Editable title -->
            <div class="flex items-center gap-2">
              <template v-if="isEditingTitle">
                <UInput
                  v-model="currentExportTitle"
                  size="sm"
                  class="w-64"
                  @keyup.enter="updateExportTitle"
                  @keyup.escape="isEditingTitle = false"
                />
                <UButton
                  color="primary"
                  variant="soft"
                  size="xs"
                  icon="i-lucide-check"
                  @click="updateExportTitle"
                />
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-x"
                  @click="isEditingTitle = false"
                />
              </template>
              <template v-else>
                <p class="text-sm font-medium text-highlighted">
                  {{ currentExportTitle || caseTitle || 'Untitled export' }}
                </p>
                <UButton
                  v-if="currentExportId"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  icon="i-lucide-pencil"
                  class="opacity-50 hover:opacity-100"
                  @click="isEditingTitle = true"
                />
              </template>
            </div>
            <p class="text-xs text-muted">
              {{ exportFocusLabel }}
              <span v-if="lastGeneratedAt" class="mx-1">·</span>
              <span v-if="lastGeneratedAt">
                Generated {{ lastGeneratedAt }}
              </span>
              <template v-if="currentExportId">
                <span class="mx-1">·</span>
                <span class="text-success">Saved</span>
              </template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <USwitch
              v-model="showRendered"
              size="sm"
              label="Rendered view"
            />

            <UButton
              color="neutral"
              variant="outline"
              size="xs"
              icon="i-lucide-clipboard"
              :disabled="!markdown"
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
              :disabled="!markdown"
              :loading="pdfGenerating"
              @click="downloadPdf"
            >
              PDF
            </UButton>

            <UButton
              color="primary"
              variant="solid"
              size="xs"
              icon="i-lucide-plus"
              @click="startNewExport"
            >
              New export
            </UButton>
          </div>
        </div>

        <UCard class="flex-1 min-h-[360px]">
          <div
            v-if="!markdown"
            class="flex h-full items-center justify-center text-sm text-muted"
          >
            Generate a new export to see the full preview.
          </div>

          <div
            v-else
            class="h-[min(72vh,calc(100vh-260px))] overflow-y-auto rounded-md bg-subtle p-4"
          >
            <template v-if="!showRendered">
              <pre class="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-highlighted">{{ markdown }}</pre>
            </template>
            <template v-else>
              <div class="bg-white dark:bg-gray-900 rounded-md p-6">
                <MDC
                  :value="markdown"
                  class="prose prose-sm dark:prose-invert max-w-none"
                />
              </div>
            </template>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete confirmation modal -->
  <UModal v-model:open="deleteConfirmOpen">
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

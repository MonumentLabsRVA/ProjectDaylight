<script setup lang="ts">
import type {
  EvidenceItem,
  EvidenceSourceType,
  TimelineEvent,
  EventType,
  ExtractionEventType,
  SavedExport,
  ExportFocus,
  ExportMetadata
} from '~/types'

interface FullEventDetail {
  id: string
  timestamp: string
  type: string
  extractionType?: string | null
  title: string
  description: string
  location?: string
  durationMinutes?: number
  childInvolved?: boolean
  agreementViolation?: boolean
  safetyConcern?: boolean
  welfareImpact?: string
  welfareCategory?: string | null
  welfareDirection?: string | null
  welfareSeverity?: string | null
  childStatements?: Array<{ statement: string; context?: string; concerning?: boolean }>
  coparentInteraction?: {
    your_tone?: string
    their_tone?: string
    your_response_appropriate?: boolean | null
  } | null
  participants: string[]
  evidenceDetails?: Array<{
    id: string
    sourceType: string
    originalName?: string
    summary?: string
  }>
  actionItems?: Array<{
    priority: string
    type: string
    description: string
    deadline?: string
    status: string
  }>
  communications?: Array<{
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

// Subscription check for feature gating
const { canExport, isFetched: subscriptionFetched } = useSubscription()

// Supabase session; data fetching uses cookie-based auth via useFetch
const session = useSupabaseSession()
const toast = useToast()

interface CaseRow {
  id: string
  title: string
  case_numbers: string[]
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
const includeOverview = ref(false)
const includeAISummary = ref(false)

const caseTitle = ref('')
const courtName = ref('')
const recipient = ref('')
const overviewNotes = ref('')

const fullEventsData = ref<FullEventDetail[]>([])
const fullEventsLoading = ref(false)

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
    caseStatus.value === 'pending' ||
    fullEventsLoading.value
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
}, {
  label: 'Complete record',
  value: 'complete-record',
  description: 'Every event with full details printed sequentially. Includes child statements, co-parent interactions, welfare impact, evidence, and action items.'
}]

const legacyToExtractionTypeMap: Record<EventType, ExtractionEventType> = {
  positive: 'parenting_time',
  incident: 'coparent_conflict',
  medical: 'medical',
  school: 'school',
  communication: 'communication',
  legal: 'legal'
}

function getExtractionType(event: TimelineEvent): ExtractionEventType {
  const fromApi = (event as any).extractionType as ExtractionEventType | null | undefined
  if (fromApi) {
    return fromApi
  }

  return legacyToExtractionTypeMap[event.type]
}

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

function formatEventType(type: EventType, extractionType?: ExtractionEventType | null) {
  const effective = extractionType || legacyToExtractionTypeMap[type]

  const map: Record<ExtractionEventType, string> = {
    parenting_time: 'Parenting time',
    caregiving: 'Caregiving',
    household: 'Household / chores',
    coparent_conflict: 'Co-parent conflict',
    gatekeeping: 'Gatekeeping',
    communication: 'Communication',
    medical: 'Medical',
    school: 'School',
    legal: 'Legal / court'
  }

  return map[effective] || effective
}

const filteredEvents = computed(() => {
  let events = (timelineData.value || []) as TimelineEvent[]

  if (exportFocus.value === 'incidents-only') {
    events = events.filter((event) => {
      const extractionType = getExtractionType(event)
      return extractionType === 'coparent_conflict' || extractionType === 'gatekeeping'
    })
  } else if (exportFocus.value === 'positive-parenting') {
    events = events.filter((event) => {
      const extractionType = getExtractionType(event)
      return extractionType === 'parenting_time' || extractionType === 'caregiving'
    })
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

async function fetchFullEvents() {
  fullEventsLoading.value = true
  try {
    const data = await $fetch<FullEventDetail[]>('/api/events-full', {
      headers: useRequestHeaders(['cookie'])
    })
    fullEventsData.value = data || []
  } catch (error) {
    console.error('[Export] Failed to fetch full events:', error)
    toast.add({
      title: 'Failed to load events',
      description: 'Could not fetch full event data for the complete record.',
      color: 'error'
    })
    fullEventsData.value = []
  } finally {
    fullEventsLoading.value = false
  }
}

function formatFullDate(value?: string) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function buildCompleteRecordMarkdown() {
  const lines: string[] = []

  lines.push('# Complete case record', '')

  if (aiSummary.value) {
    lines.push('## Executive Summary', '')
    lines.push('_AI-generated analysis of key patterns and important developments:_', '')
    lines.push(aiSummary.value, '')
    lines.push('---', '')
  }

  if (caseTitle.value.trim()) lines.push(`**Case:** ${caseTitle.value.trim()}`)
  if (courtName.value.trim()) lines.push(`**Court:** ${courtName.value.trim()}`)
  if (recipient.value.trim()) lines.push(`**Prepared for:** ${recipient.value.trim()}`)
  lines.push(`**Generated on:** ${new Date().toLocaleString()}`)
  lines.push(`**Total events:** ${fullEventsData.value.length}`, '')

  if (includeOverview.value) {
    lines.push('## Overview', '')
    if (overviewNotes.value.trim()) {
      lines.push(overviewNotes.value.trim(), '')
    } else {
      lines.push('_Use this section to briefly explain the current status of your case._', '')
    }
  }

  lines.push('---', '')
  lines.push('## Events', '')

  const events = fullEventsData.value

  if (!events.length) {
    lines.push('_No events recorded._', '')
  } else {
    events.forEach((event, index) => {
      const typeLabel = formatEventType(
        event.type as EventType,
        event.extractionType as ExtractionEventType | null | undefined
      )

      lines.push(`### ${index + 1}. ${event.title}`, '')
      lines.push(`**Date:** ${formatFullDate(event.timestamp)}`)
      lines.push(`**Type:** ${typeLabel}`)

      if (event.location) lines.push(`**Location:** ${event.location}`)
      if (event.participants?.length) lines.push(`**Participants:** ${event.participants.join(', ')}`)
      if (event.durationMinutes) lines.push(`**Duration:** ${event.durationMinutes} minutes`)

      // Flags
      const flags: string[] = []
      if (event.safetyConcern) flags.push('Safety Concern')
      if (event.agreementViolation) flags.push('Agreement Violation')
      if (event.childInvolved) flags.push('Child Involved')
      if (flags.length) lines.push(`**Flags:** ${flags.join(', ')}`)

      lines.push('')

      // Description
      if (event.description) {
        lines.push(event.description, '')
      }

      // Co-parent interaction
      if (event.coparentInteraction) {
        const ci = event.coparentInteraction
        const parts: string[] = []
        if (ci.your_tone) parts.push(`Your tone: ${ci.your_tone}`)
        if (ci.their_tone) parts.push(`Their tone: ${ci.their_tone}`)
        if (ci.your_response_appropriate !== null && ci.your_response_appropriate !== undefined) {
          parts.push(ci.your_response_appropriate ? 'Response was appropriate' : 'Response could improve')
        }
        if (parts.length) {
          lines.push('**Co-parent interaction:**', '')
          parts.forEach(p => lines.push(`- ${p}`))
          lines.push('')
        }
      }

      // Child statements
      if (event.childStatements?.length) {
        lines.push('**Child statements:**', '')
        event.childStatements.forEach(s => {
          const concern = s.concerning ? ' _(concerning)_' : ''
          lines.push(`> "${s.statement}"${concern}`)
          if (s.context) lines.push(`> _Context: ${s.context}_`)
          lines.push('')
        })
      }

      // Welfare impact
      if (event.welfareCategory || event.welfareDirection || event.welfareSeverity) {
        const wParts: string[] = []
        if (event.welfareCategory) wParts.push(`Category: ${event.welfareCategory}`)
        if (event.welfareDirection) wParts.push(`Direction: ${event.welfareDirection}`)
        if (event.welfareSeverity) wParts.push(`Severity: ${event.welfareSeverity}`)
        lines.push(`**Welfare impact:** ${wParts.join(' · ')}`, '')
      }

      // Evidence
      if (event.evidenceDetails?.length) {
        lines.push('**Evidence:**', '')
        event.evidenceDetails.forEach(e => {
          lines.push(`- ${e.originalName || 'Untitled'} (${e.sourceType})${e.summary ? ': ' + e.summary : ''}`)
        })
        lines.push('')
      }

      // Action items
      if (event.actionItems?.length) {
        lines.push('**Action items:**', '')
        event.actionItems.forEach(a => {
          const deadline = a.deadline ? ` (due ${formatDate(a.deadline)})` : ''
          lines.push(`- [${a.status}] ${a.description}${deadline} — ${a.priority} priority`)
        })
        lines.push('')
      }

      // Communications
      if (event.communications?.length) {
        lines.push('**Communications:**', '')
        event.communications.forEach(c => {
          const when = c.sentAt ? ` on ${formatDate(c.sentAt)}` : ''
          lines.push(`- ${c.direction} ${c.medium}${when}${c.subject ? ' — ' + c.subject : ''}: ${c.summary}`)
        })
        lines.push('')
      }

      lines.push('---', '')
    })
  }

  // Evidence index
  if (includeEvidenceIndex.value) {
    lines.push('## Evidence index', '')

    if (!evidenceData.value?.length) {
      lines.push('_No evidence items found._', '')
    } else {
      ;(evidenceData.value || []).forEach((item, index) => {
        lines.push(
          `${index + 1}. [${formatDate(item.createdAt)}] **${item.originalName}** (${item.sourceType})`
        )
        if (item.summary) lines.push(`   - Summary: ${item.summary}`)
        if (item.tags?.length) lines.push(`   - Tags: ${item.tags.join(', ')}`)
        lines.push('')
      })
    }
  }

  lines.push(
    '---',
    '',
    '_This complete record was generated from your Daylight timeline. Share it with your attorney or attach it as a supporting document for court. daylight.legal_'
  )

  return lines.join('\n')
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
        `${index + 1}. ${formatDate(event.timestamp)} — **${event.title}** (${formatEventType(event.type, (event as any).extractionType as ExtractionEventType | null | undefined)})`
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
    '_This export is generated from your Daylight timeline and evidence. Share it with your attorney or attach it as a supporting document for court. daylight.legal_'
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
      events_count: exportFocus.value === 'complete-record' ? fullEventsData.value.length : filteredEvents.value.length,
      evidence_count: evidenceData.value?.length || 0,
      ai_summary_included: !!aiSummary.value
    }

    const response = await $fetch<{ export: SavedExport }>('/api/exports', {
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
    // For complete record, fetch all events with full details
    if (exportFocus.value === 'complete-record') {
      await fetchFullEvents()
    }

    // AI summary generation is disabled for now - kept for future use
    aiSummary.value = null
    
    markdown.value = exportFocus.value === 'complete-record'
      ? buildCompleteRecordMarkdown()
      : buildMarkdown()
    lastGeneratedAt.value = new Date().toLocaleString()
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
    const response = await $fetch<{ export: SavedExport & { markdown_content: string } }>(`/api/exports/${exp.id}`, {
      headers: useRequestHeaders(['cookie'])
    })

    if (response?.export) {
      const fullExport = response.export
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

    const margin = 60
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const contentWidth = pageWidth - margin * 2
    const footerY = pageHeight - 36
    const bodyTop = margin + 8

    let cursorY = bodyTop

    const ensureSpace = (height: number) => {
      if (cursorY + height > footerY - 20) {
        doc.addPage()
        cursorY = bodyTop
        return true
      }
      return false
    }

    // Render the Daylight logo icon onto a canvas and convert to PNG data URL
    let logoDataUrl: string | null = null
    try {
      const logoSize = 80
      const canvas = document.createElement('canvas')
      canvas.width = logoSize
      canvas.height = logoSize
      const ctx = canvas.getContext('2d')!
      const img = new Image()
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${logoSize}" height="${logoSize}" viewBox="0 0 400 400" fill="none"><path d="M68 20 L380 20 Q400 20 400 68 L400 332 Q400 380 332 380 L68 380 Q20 380 20 332 L20 180 A160 160 0 0 0 180 20 Z" fill="#0ea5e9"/></svg>`
      await new Promise<void>((resolve) => {
        img.onload = () => { ctx.drawImage(img, 0, 0, logoSize, logoSize); resolve() }
        img.onerror = () => resolve()
        img.src = 'data:image/svg+xml;base64,' + btoa(svgStr)
      })
      logoDataUrl = canvas.toDataURL('image/png')
    } catch { /* logo is optional */ }

    const isCompleteRecord = exportFocus.value === 'complete-record'

    // --- HEADER ---
    doc.setFont('times', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(20, 20, 20)
    const pdfTitle = isCompleteRecord
      ? 'Complete Case Record'
      : 'Timeline & Evidence Summary'
    doc.text(pdfTitle, margin, cursorY)
    cursorY += 32

    // Meta block
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(90, 90, 90)

    const metaEntries: { label: string; value: string }[] = []
    if (caseTitle.value.trim()) metaEntries.push({ label: 'Case', value: caseTitle.value.trim() })
    if (courtName.value.trim()) metaEntries.push({ label: 'Court', value: courtName.value.trim() })
    if (recipient.value.trim()) metaEntries.push({ label: 'Prepared for', value: recipient.value.trim() })
    metaEntries.push({ label: 'Generated', value: new Date().toLocaleString() })
    if (isCompleteRecord) {
      metaEntries.push({ label: 'Total events', value: String(fullEventsData.value.length) })
    }

    metaEntries.forEach((meta) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(90, 90, 90)
      const labelStr = `${meta.label}:`
      doc.text(labelStr, margin, cursorY)
      const labelW = doc.getTextWidth(labelStr)

      doc.setFont('times', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(30, 30, 30)
      doc.text(meta.value, margin + labelW + 6, cursorY)
      cursorY += 15
    })

    cursorY += 6
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
    cursorY += 20

    // --- OVERVIEW ---
    if (includeOverview.value) {
      ensureSpace(80)

      doc.setFont('times', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(20, 20, 20)
      doc.text(isCompleteRecord ? 'Overview' : '1. Overview', margin, cursorY)
      cursorY += 18

      doc.setFont('times', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(40, 40, 40)

      const overviewText = overviewNotes.value.trim() || 'Use this section to briefly explain the current status of your case, upcoming court dates, and what you want the court or your attorney to understand.'
      const splitOverview = doc.splitTextToSize(overviewText, contentWidth)
      ensureSpace(splitOverview.length * 14)
      doc.text(splitOverview, margin, cursorY)
      cursorY += (splitOverview.length * 14) + 20
    }

    // --- EVENTS ---
    ensureSpace(40)
    doc.setFont('times', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(20, 20, 20)

    if (isCompleteRecord) {
      doc.text('Events', margin, cursorY)
      cursorY += 22

      const fullEvents = fullEventsData.value

      if (!fullEvents.length) {
        doc.setFont('times', 'italic')
        doc.setFontSize(10)
        doc.setTextColor(120, 120, 120)
        doc.text('No events recorded.', margin, cursorY)
        cursorY += 20
      } else {
        fullEvents.forEach((event, index) => {
          ensureSpace(70)

          // Event number + title
          doc.setFont('times', 'bold')
          doc.setFontSize(11)
          doc.setTextColor(20, 20, 20)
          const headerText = `${index + 1}.  ${event.title}`
          const splitHeader = doc.splitTextToSize(headerText, contentWidth)
          doc.text(splitHeader, margin, cursorY)
          cursorY += splitHeader.length * 15

          // Date, type, location on one line
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          const typeLabel = formatEventType(
            event.type as EventType,
            event.extractionType as ExtractionEventType | null | undefined
          )
          const dateParts = [formatFullDate(event.timestamp), typeLabel]
          if (event.location) dateParts.push(event.location)
          if (event.participants?.length) dateParts.push(event.participants.join(', '))
          if (event.durationMinutes) dateParts.push(`${event.durationMinutes} min`)
          const dateMetaStr = dateParts.join('   |   ')
          const splitDateMeta = doc.splitTextToSize(dateMetaStr, contentWidth)
          doc.text(splitDateMeta, margin, cursorY)
          cursorY += splitDateMeta.length * 11

          // Flags
          const flags: string[] = []
          if (event.safetyConcern) flags.push('SAFETY CONCERN')
          if (event.agreementViolation) flags.push('AGREEMENT VIOLATION')
          if (event.childInvolved) flags.push('CHILD INVOLVED')
          if (flags.length) {
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(7.5)
            doc.setTextColor(170, 50, 50)
            doc.text(flags.join('     '), margin, cursorY)
            cursorY += 11
          }

          cursorY += 4

          // Description
          if (event.description) {
            ensureSpace(24)
            doc.setFont('times', 'normal')
            doc.setFontSize(10)
            doc.setTextColor(40, 40, 40)
            const splitDesc = doc.splitTextToSize(event.description, contentWidth)
            doc.text(splitDesc, margin, cursorY)
            cursorY += (splitDesc.length * 13.5) + 6
          }

          // Co-parent interaction
          if (event.coparentInteraction) {
            ensureSpace(30)
            const ci = event.coparentInteraction
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(80, 80, 80)
            doc.text('Co-parent interaction', margin, cursorY)
            cursorY += 11
            doc.setFont('times', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(60, 60, 60)
            const ciParts: string[] = []
            if (ci.your_tone) ciParts.push(`Your tone: ${ci.your_tone}`)
            if (ci.their_tone) ciParts.push(`Their tone: ${ci.their_tone}`)
            if (ci.your_response_appropriate !== null && ci.your_response_appropriate !== undefined) {
              ciParts.push(ci.your_response_appropriate ? 'Response appropriate' : 'Response could improve')
            }
            if (ciParts.length) {
              doc.text(ciParts.join('   |   '), margin + 8, cursorY)
              cursorY += 12
            }
          }

          // Child statements
          if (event.childStatements?.length) {
            ensureSpace(28)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(80, 80, 80)
            doc.text('Child statements', margin, cursorY)
            cursorY += 11
            event.childStatements.forEach(s => {
              ensureSpace(18)
              doc.setFont('times', 'italic')
              doc.setFontSize(9)
              doc.setTextColor(50, 50, 50)
              const concern = s.concerning ? '  [CONCERNING]' : ''
              const stmtText = `\u201C${s.statement}\u201D${concern}`
              const splitStmt = doc.splitTextToSize(stmtText, contentWidth - 8)
              doc.text(splitStmt, margin + 8, cursorY)
              cursorY += splitStmt.length * 11
              if (s.context) {
                doc.setFont('times', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(100, 100, 100)
                doc.text(`Context: ${s.context}`, margin + 12, cursorY)
                cursorY += 10
              }
              cursorY += 3
            })
          }

          // Welfare impact
          if (event.welfareCategory || event.welfareDirection || event.welfareSeverity) {
            ensureSpace(16)
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(8)
            doc.setTextColor(110, 110, 110)
            const wParts: string[] = []
            if (event.welfareCategory) wParts.push(event.welfareCategory)
            if (event.welfareDirection) wParts.push(event.welfareDirection)
            if (event.welfareSeverity) wParts.push(`${event.welfareSeverity} severity`)
            doc.text(`Welfare impact: ${wParts.join(' / ')}`, margin, cursorY)
            cursorY += 11
          }

          // Evidence
          if (event.evidenceDetails?.length) {
            ensureSpace(20)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(80, 80, 80)
            doc.text('Evidence', margin, cursorY)
            cursorY += 11
            doc.setFont('times', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(50, 50, 50)
            event.evidenceDetails.forEach(e => {
              ensureSpace(12)
              const evidenceText = `\u2022  ${e.originalName || 'Untitled'} (${e.sourceType})${e.summary ? ' \u2014 ' + e.summary : ''}`
              const splitEvidence = doc.splitTextToSize(evidenceText, contentWidth - 8)
              doc.text(splitEvidence, margin + 8, cursorY)
              cursorY += splitEvidence.length * 11
            })
            cursorY += 3
          }

          // Action items
          if (event.actionItems?.length) {
            ensureSpace(20)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(80, 80, 80)
            doc.text('Action items', margin, cursorY)
            cursorY += 11
            doc.setFont('times', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(50, 50, 50)
            event.actionItems.forEach(a => {
              ensureSpace(12)
              const deadline = a.deadline ? ` (due ${formatDate(a.deadline)})` : ''
              const actionText = `\u2022  [${a.status}] ${a.description}${deadline} \u2014 ${a.priority} priority`
              const splitAction = doc.splitTextToSize(actionText, contentWidth - 8)
              doc.text(splitAction, margin + 8, cursorY)
              cursorY += splitAction.length * 11
            })
            cursorY += 3
          }

          // Communications
          if (event.communications?.length) {
            ensureSpace(20)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(80, 80, 80)
            doc.text('Communications', margin, cursorY)
            cursorY += 11
            doc.setFont('times', 'normal')
            doc.setFontSize(9)
            doc.setTextColor(50, 50, 50)
            event.communications.forEach(c => {
              ensureSpace(12)
              const when = c.sentAt ? ` on ${formatDate(c.sentAt)}` : ''
              const commText = `\u2022  ${c.direction} ${c.medium}${when}: ${c.summary}`
              const splitComm = doc.splitTextToSize(commText, contentWidth - 8)
              doc.text(splitComm, margin + 8, cursorY)
              cursorY += splitComm.length * 11
            })
            cursorY += 3
          }

          // Divider
          cursorY += 8
          doc.setDrawColor(210, 210, 210)
          doc.setLineWidth(0.4)
          doc.line(margin, cursorY, pageWidth - margin, cursorY)
          cursorY += 16
        })
      }
    } else {
      doc.text('2. Timeline of Key Events', margin, cursorY)
      cursorY += 22

      const events = filteredEvents.value

      if (!events.length) {
        doc.setFont('times', 'italic')
        doc.setFontSize(10)
        doc.setTextColor(120, 120, 120)
        doc.text('No events found for this export.', margin, cursorY)
        cursorY += 20
      } else {
        events.forEach((event, index) => {
          const descLines = event.description ? doc.splitTextToSize(event.description, contentWidth).length : 0
          const evidenceSummary = buildEvidenceSummaryForEvent(event)
          const metaCount = (event.location ? 1 : 0) + (event.participants?.length ? 1 : 0) + (evidenceSummary ? 1 : 0)
          const estimatedHeight = 20 + (descLines * 13.5) + (metaCount * 12) + 14

          ensureSpace(estimatedHeight)

          // Date badge + title + type on a single block
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          const dateStr = formatDate(event.timestamp)
          doc.text(`${index + 1}.`, margin, cursorY)

          doc.setFont('times', 'bold')
          doc.setFontSize(10.5)
          doc.setTextColor(20, 20, 20)
          doc.text(event.title, margin + 18, cursorY)

          const titleW = doc.getTextWidth(event.title)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(130, 130, 130)
          doc.text(`${formatEventType(event.type)}`, margin + 18 + titleW + 6, cursorY)

          cursorY += 13

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          const eventMeta = [dateStr]
          if (event.location) eventMeta.push(event.location)
          if (event.participants?.length) eventMeta.push(event.participants.join(', '))
          if (evidenceSummary) eventMeta.push(evidenceSummary)
          doc.text(eventMeta.join('   |   '), margin + 18, cursorY)
          cursorY += 12

          if (event.description) {
            doc.setFont('times', 'normal')
            doc.setFontSize(10)
            doc.setTextColor(40, 40, 40)
            const splitDesc = doc.splitTextToSize(event.description, contentWidth - 18)
            doc.text(splitDesc, margin + 18, cursorY)
            cursorY += (splitDesc.length * 13.5) + 4
          }

          cursorY += 10
        })
      }
    }

    cursorY += 12

    // --- EVIDENCE INDEX ---
    if (includeEvidenceIndex.value) {
      ensureSpace(40)
      doc.setFont('times', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(20, 20, 20)
      doc.text(isCompleteRecord ? 'Evidence Index' : '3. Evidence Index', margin, cursorY)
      cursorY += 22

      const evidenceItems = (evidenceData.value || []) as EvidenceItem[]

      if (!evidenceItems.length) {
        doc.setFont('times', 'italic')
        doc.setFontSize(10)
        doc.setTextColor(120, 120, 120)
        doc.text('No evidence items found for this export.', margin, cursorY)
      } else {
        evidenceItems.forEach((item, index) => {
          const summaryLines = item.summary ? doc.splitTextToSize(item.summary, contentWidth - 18).length : 0
          const estimatedHeight = 18 + (summaryLines * 13) + (item.tags?.length ? 12 : 0) + 10
          ensureSpace(estimatedHeight)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(110, 110, 110)
          doc.text(`${index + 1}.`, margin, cursorY)

          doc.setFont('times', 'bold')
          doc.setFontSize(10)
          doc.setTextColor(20, 20, 20)
          doc.text(item.originalName, margin + 18, cursorY)
          const nameW = doc.getTextWidth(item.originalName)

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(130, 130, 130)
          doc.text(`${item.sourceType}   |   ${formatDate(item.createdAt)}`, margin + 18 + nameW + 6, cursorY)
          cursorY += 14

          if (item.summary) {
            doc.setFont('times', 'normal')
            doc.setFontSize(9.5)
            doc.setTextColor(50, 50, 50)
            const splitSummary = doc.splitTextToSize(item.summary, contentWidth - 18)
            doc.text(splitSummary, margin + 18, cursorY)
            cursorY += (splitSummary.length * 13) + 3
          }

          if (item.tags?.length) {
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.5)
            doc.setTextColor(130, 130, 130)
            doc.text(`Tags: ${item.tags.join(', ')}`, margin + 18, cursorY)
            cursorY += 11
          }

          cursorY += 8
        })
      }
    }

    // --- FOOTER on every page: logo + daylight.legal + page number ---
    const pageCount = (doc as any).getNumberOfPages ? (doc as any).getNumberOfPages() : doc.internal.pages.length - 1
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)

      // Thin rule above footer
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.4)
      doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6)

      // Logo icon
      const logoX = margin
      const logoIconSize = 12
      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, 'PNG', logoX, footerY - 9, logoIconSize, logoIconSize)
        } catch { /* skip logo if addImage fails */ }
      }

      // Brand text
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(140, 140, 140)
      doc.text('daylight.legal', logoX + logoIconSize + 5, footerY)

      // Page number right-aligned
      const pageStr = `Page ${i} of ${pageCount}`
      const pageStrWidth = doc.getTextWidth(pageStr)
      doc.text(pageStr, pageWidth - margin - pageStrWidth, footerY)
    }

    doc.save('daylight-report.pdf')

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
    case 'complete-record':
      return 'i-lucide-book-open'
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
    case 'complete-record':
      return 'text-info'
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
      <!-- Feature gate: Pro-only -->
      <div v-if="subscriptionFetched && !canExport" class="max-w-2xl mx-auto py-8">
        <UpgradePrompt
          title="Exports are a Pro feature"
          description="Upgrade to Pro to generate court-ready PDF and markdown reports. Share professional documentation with your attorney or the court."
          variant="card"
        />
      </div>

      <!-- History view -->
      <div v-else-if="viewMode === 'history'" class="space-y-4">
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

            <!-- Actions -->
            <div class="pt-4 flex flex-col gap-3 border-t border-dashed border-default/60">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 text-xs text-muted">
                  <template v-if="isLoadingData">
                    <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
                    <span>Loading timeline and evidence…</span>
                  </template>
                  <template v-else>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-lucide-refresh-cw"
                      :disabled="isLoadingData"
                      @click="loadData"
                    >
                      Refresh data
                    </UButton>
                  </template>
                </div>

                <UButton
                  color="primary"
                  variant="solid"
                  :icon="exportFocus === 'complete-record' ? 'i-lucide-book-open' : 'i-lucide-file-text'"
                  :loading="generating || fullEventsLoading"
                  :disabled="isLoadingData"
                  @click="generateMarkdown"
                >
                  <span v-if="fullEventsLoading">Loading events...</span>
                  <span v-else-if="exportFocus === 'complete-record'">Generate complete record</span>
                  <span v-else>Generate export</span>
                </UButton>
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

<script setup lang="ts">
import type { EvidenceItem, TimelineEvent, EventType, ExtractionEventType, ExportFocus, ExportMetadata, SavedExport } from '~/types'

const session = useSupabaseSession()
const toast = useToast()
const router = useRouter()

// Subscription check for feature gating (exports are Pro-only)
const { canExport, isFree } = useSubscription()

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

const generating = ref(false)
const aiSummary = ref<string | null>(null)
const summaryGenerating = ref(false)

const isLoadingData = computed(
  () =>
    timelineStatus.value === 'pending' ||
    evidenceStatus.value === 'pending' ||
    caseStatus.value === 'pending'
)

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
    // Include conflict-oriented events: co-parent conflict and gatekeeping
    events = events.filter((event) => {
      const extractionType = getExtractionType(event)
      return extractionType === 'coparent_conflict' || extractionType === 'gatekeeping'
    })
  } else if (exportFocus.value === 'positive-parenting') {
    // Include positive parenting and caregiving events
    events = events.filter((event) => {
      const extractionType = getExtractionType(event)
      return extractionType === 'parenting_time' || extractionType === 'caregiving'
    })
  }

  return events
})

function buildMarkdown() {
  const lines: string[] = []

  lines.push('# Custody case timeline & evidence summary', '')

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

      if (event.evidenceIds?.length) {
        lines.push(`   - Linked evidence IDs: ${event.evidenceIds.join(', ')}`)
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

async function generateAndSaveExport() {
  generating.value = true

  try {
    // Generate AI summary first if enabled
    if (includeAISummary.value) {
      await generateAISummary()
    } else {
      aiSummary.value = null
    }
    
    const markdownContent = buildMarkdown()
    
    // Save the export
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
      toast.add({
        title: 'Export generated',
        description: 'Your export has been saved.',
        icon: 'i-lucide-check',
        color: 'success'
      })
      
      // Navigate to the saved export
      router.push(`/exports/${response.export.id}`)
    }
  } catch (error) {
    console.error('[Export] Failed to generate export:', error)
    toast.add({
      title: 'Generation failed',
      description: 'Unable to generate export. Please try again.',
      icon: 'i-lucide-triangle-alert',
      color: 'error'
    })
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="export-new">
    <template #header>
      <UDashboardNavbar title="New Export">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
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
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 sm:p-6">
        <!-- Feature gate: Exports are Pro-only -->
        <UpgradePrompt
          v-if="isFree && !canExport"
          title="Exports are a Pro feature"
          description="Create court-ready timeline documents, PDF exports, and shareable summaries for your attorney. Upgrade to Pro to unlock exports."
          variant="card"
          class="max-w-3xl"
        />

        <p v-else class="max-w-3xl text-sm text-muted">
          Generate a plain‑text, court‑ready markdown summary you can paste into an email, document, or portal.
          We'll pull in details from your timeline and evidence data.
        </p>

        <UCard v-if="!isFree || canExport" class="max-w-3xl">
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
                    @click="generateAndSaveExport"
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
    </template>
  </UDashboardPanel>
</template>

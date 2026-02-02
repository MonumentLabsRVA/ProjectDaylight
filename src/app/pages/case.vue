<script setup lang="ts">
import { formatForDateTimeLocalInput, parseDateTimeLocalToISO } from '~/composables/useTimezone'

const session = useSupabaseSession()
const toast = useToast()

interface CaseRow {
  id: string
  title: string
  case_numbers: string[]
  jurisdiction_state: string | null
  jurisdiction_county: string | null
  court_name: string | null
  case_type: string | null
  stage: string | null
  your_role: string | null
  opposing_party_name: string | null
  opposing_party_role: string | null
  children_count: number | null
  children_summary: string | null
  parenting_schedule: string | null
  goals_summary: string | null
  risk_flags: string[] | null
  notes: string | null
  next_court_date: string | null
  created_at: string
  updated_at: string
  lawyer_name: string | null
  lawyer_email: string | null
}

interface CaseResponse {
  case: CaseRow | null
}

interface CaseSaveResponse {
  case: CaseRow | null
}

const {
  data: caseResponse,
  status: loadStatus,
  error: loadError,
  refresh: refreshCase
} = await useFetch<CaseResponse>('/api/case', {
  headers: useRequestHeaders(['cookie'])
})

const loading = computed(() => loadStatus.value === 'pending')
const saving = ref(false)
const saveError = ref<any>(null)
const lastSavedAt = ref<string | null>(null)
const caseId = ref<string | null>(null)

const activeCaseTab = ref<'overview' | 'people' | 'goals'>('overview')

// Responsive tab labels
const isSmallScreen = ref(false)

function updateScreenSize() {
  isSmallScreen.value = window.innerWidth < 640
}

onMounted(() => {
  updateScreenSize()
  window.addEventListener('resize', updateScreenSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScreenSize)
})

const tabItems = computed(() => [
  {
    label: 'Basics',
    value: 'overview',
    icon: 'i-lucide-file-text'
  },
  {
    label: isSmallScreen.value ? 'People' : 'People & children',
    value: 'people',
    icon: 'i-lucide-users'
  },
  {
    label: isSmallScreen.value ? 'Goals' : 'Goals & risks',
    value: 'goals',
    icon: 'i-lucide-target'
  }
])

// Form state
const title = ref('')
const caseNumbers = ref<string[]>([])
const newCaseNumber = ref('')
const jurisdictionState = ref<string>('')
const jurisdictionCounty = ref('')
const courtName = ref('')
const caseType = ref('')
const stage = ref('')
const yourRole = ref<string>('')
const opposingPartyName = ref('')
const opposingPartyRole = ref('')
const childrenCount = ref<number | null>(null)
const childrenSummary = ref('')
const parentingSchedule = ref('')
const goalsSummary = ref('')
const riskFlags = ref<string[]>([])
const notes = ref('')
const nextCourtDate = ref<string | null>(null)
const lawyerName = ref('')
const lawyerEmail = ref('')

const stateOptions = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'District of Columbia',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming'
] as string[]

const roleOptions = [
  'Mother',
  'Father',
  'Other caregiver',
  'Grandparent',
  'Guardian ad litem',
  'Other'
] as string[]

const stageOptions = [
  'Thinking about filing',
  'Just filed',
  'Temporary orders',
  'Mediation',
  'Final hearing / trial',
  'Post-judgment',
  'Other'
] as string[]

const caseTypeOptions = [
  'Divorce with custody',
  'Custody only',
  'Child support only',
  'Modification',
  'Protection order',
  'Other'
] as string[]

const riskFlagOptions = [
  'Domestic violence / safety concerns',
  'Substance use concerns',
  'Mental health instability',
  'Neglect / unmet basic needs',
  'Interference with parenting time',
  'Relocation / move-away',
  'Financial control',
  'Other high-risk patterns'
] as string[]

function addCaseNumber() {
  const trimmed = newCaseNumber.value.trim()
  if (trimmed && !caseNumbers.value.includes(trimmed)) {
    caseNumbers.value.push(trimmed)
    newCaseNumber.value = ''
  }
}

function removeCaseNumber(idx: number) {
  caseNumbers.value.splice(idx, 1)
}

const hasLoadedOnce = ref(false)

const showSkeleton = computed(() => loadStatus.value === 'pending' && !hasLoadedOnce.value)

function formatTimestamp(value?: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function applyCase(current: CaseRow | null) {
  if (!current) {
    hasLoadedOnce.value = true
    return
  }

  caseId.value = current.id
  title.value = current.title ?? ''
  caseNumbers.value = current.case_numbers ?? []
  newCaseNumber.value = ''
  jurisdictionState.value = current.jurisdiction_state || ''
  jurisdictionCounty.value = current.jurisdiction_county ?? ''
  courtName.value = current.court_name ?? ''
  caseType.value = current.case_type ?? ''
  stage.value = current.stage ?? ''
    yourRole.value = current.your_role || ''
  opposingPartyName.value = current.opposing_party_name ?? ''
  opposingPartyRole.value = current.opposing_party_role ?? ''
  childrenCount.value = current.children_count
  childrenSummary.value = current.children_summary ?? ''
  parentingSchedule.value = current.parenting_schedule ?? ''
  goalsSummary.value = current.goals_summary ?? ''
  riskFlags.value = current.risk_flags ?? []
  notes.value = current.notes ?? ''
  // Convert ISO timestamp to datetime-local format (strips timezone suffix)
  nextCourtDate.value = formatForDateTimeLocalInput(current.next_court_date)
  lawyerName.value = current.lawyer_name ?? ''
  lawyerEmail.value = current.lawyer_email ?? ''
  lastSavedAt.value = current.updated_at
  hasLoadedOnce.value = true
}

async function loadCase() {
  await refreshCase()
  applyCase(caseResponse.value?.case ?? null)
}

watch(caseResponse, (res) => {
  if (!hasLoadedOnce.value && res) {
    applyCase(res.case ?? null)
  }
}, { immediate: true })

async function saveCase() {
  if (!title.value.trim()) {
    toast.add({
      title: 'Title required',
      description: 'Give your case a short name, like “Smith v. Smith – custody”.',
      color: 'warning',
      icon: 'i-lucide-alert-circle'
    })
    return
  }

  saving.value = true
  saveError.value = null

  try {
    const body = {
      id: caseId.value ?? undefined,
      title: title.value,
      caseNumbers: caseNumbers.value,
      jurisdictionState: jurisdictionState.value || null,
      jurisdictionCounty: jurisdictionCounty.value || null,
      courtName: courtName.value || null,
      caseType: caseType.value || null,
      stage: stage.value || null,
      yourRole: yourRole.value || null,
      opposingPartyName: opposingPartyName.value || null,
      opposingPartyRole: opposingPartyRole.value || null,
      childrenCount: childrenCount.value ?? null,
      childrenSummary: childrenSummary.value || null,
      parentingSchedule: parentingSchedule.value || null,
      goalsSummary: goalsSummary.value || null,
      riskFlags: riskFlags.value,
      notes: notes.value || null,
      // Convert datetime-local format back to ISO for storage
      nextCourtDate: parseDateTimeLocalToISO(nextCourtDate.value),
      lawyerName: lawyerName.value || null,
      lawyerEmail: lawyerEmail.value || null
    }

    const result = await $fetch<CaseSaveResponse>('/api/case', {
      method: 'POST',
      body
    })

    const saved = result.case

    if (saved) {
      caseId.value = saved.id
      lastSavedAt.value = saved.updated_at
    }

    toast.add({
      title: 'Case saved',
      description: 'Your case details have been updated.',
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('[Case] Failed to save:', e)
    saveError.value = e

    toast.add({
      title: 'Save failed',
      description: 'We could not save your case. Please try again.',
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadCase()
})

watch(session, (newSession) => {
  if (newSession?.access_token && !hasLoadedOnce.value) {
    loadCase()
  }
})
</script>

<template>
  <UDashboardPanel id="case">
    <template #header>
      <UDashboardNavbar title="Case overview">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-5xl space-y-6">
        <UCard>
          <template #header>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="font-medium text-highlighted">
                  Your case at a glance
                </p>
                <p class="text-sm text-muted">
                  Capture the key facts about your case, people involved, and risks so Daylight can organize everything
                  around what actually matters in court.
                </p>
              </div>

              <div class="flex flex-col items-start gap-1 text-xs text-muted sm:items-end">
                <p v-if="lastSavedAt">
                  Last updated:
                  <span class="font-medium text-highlighted">{{ formatTimestamp(lastSavedAt) }}</span>
                </p>
                <p v-else>
                  Not saved yet
                </p>
              </div>
            </div>
          </template>

          <div class="space-y-6">
            <!-- Tabs header (skeleton + real) -->
            <div v-if="showSkeleton" class="flex items-center justify-between">
              <div class="flex gap-4">
                <USkeleton class="h-7 w-20" />
                <USkeleton class="h-7 w-32" />
                <USkeleton class="h-7 w-28" />
              </div>
              <USkeleton class="h-7 w-20 hidden sm:block" />
            </div>
            <UTabs
              v-else
              v-model="activeCaseTab"
              :items="tabItems"
              color="primary"
              variant="link"
            />

            <!-- Skeleton form while loading -->
            <div v-if="showSkeleton" class="space-y-6">
              <div class="grid gap-6 md:grid-cols-2">
                <!-- Case basics skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-24" />
                  <div class="space-y-3">
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-20" />
                      <USkeleton class="h-9 w-full" />
                      <USkeleton class="h-3 w-40" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-40" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-20" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-16" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                  </div>
                </div>

                <!-- Jurisdiction & court skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-28" />
                  <div class="space-y-3">
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-14" />
                      <USkeleton class="h-9 w-full" />
                      <USkeleton class="h-3 w-56" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-40" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-28" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-56" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid gap-6 md:grid-cols-2">
                <!-- People involved skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-28" />
                  <div class="space-y-3">
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-16" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-40" />
                      <USkeleton class="h-9 w-full" />
                      <USkeleton class="h-3 w-52" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-32" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                  </div>
                </div>

                <!-- Children skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-16" />
                  <div class="space-y-3">
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-40" />
                      <USkeleton class="h-9 w-full" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-28" />
                      <USkeleton class="h-20 w-full" />
                      <USkeleton class="h-3 w-60" />
                    </div>
                    <div class="space-y-1">
                      <USkeleton class="h-3 w-44" />
                      <USkeleton class="h-20 w-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <!-- Goals skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-40" />
                  <div class="space-y-1">
                    <USkeleton class="h-3 w-full" />
                    <USkeleton class="h-24 w-full" />
                    <USkeleton class="h-3 w-64" />
                  </div>
                  <div class="space-y-1">
                    <USkeleton class="h-3 w-28" />
                    <USkeleton class="h-20 w-full" />
                  </div>
                </div>

                <!-- Risk flags skeleton -->
                <div class="space-y-3">
                  <USkeleton class="h-3 w-20" />
                  <div class="space-y-2">
                    <USkeleton class="h-3 w-56" />
                    <USkeleton class="h-9 w-full" />
                    <div class="flex flex-wrap gap-1 pt-1">
                      <USkeleton class="h-5 w-24" />
                      <USkeleton class="h-5 w-32" />
                      <USkeleton class="h-5 w-28" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Real form once data is loaded or user has started editing -->
            <template v-else>
              <!-- BASICS TAB -->
              <div
                v-if="activeCaseTab === 'overview'"
                class="space-y-6"
              >
                <div class="grid gap-6 md:grid-cols-2">
                  <!-- Case basics -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Case basics
                    </p>

                    <div class="space-y-2">
                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Case title</span>
                        <UInput
                          v-model="title"
                          placeholder="Smith v. Smith – custody"
                          class="w-full"
                        />
                        <span class="text-[11px] text-muted">
                          Short name you and your attorney recognize. This will also be used on exports.
                        </span>
                      </label>

                      <div class="space-y-1">
                        <span class="text-xs font-medium text-highlighted">Court case number(s) (optional)</span>
                        <div class="flex gap-2">
                          <UInput
                            v-model="newCaseNumber"
                            placeholder="CL24-1234"
                            class="flex-1"
                            @keydown.enter.prevent="addCaseNumber"
                          />
                          <UButton
                            color="neutral"
                            variant="soft"
                            icon="i-lucide-plus"
                            :disabled="!newCaseNumber.trim()"
                            @click="addCaseNumber"
                          />
                        </div>
                        <div
                          v-if="caseNumbers.length"
                          class="flex flex-wrap gap-1 pt-1"
                        >
                          <UBadge
                            v-for="(num, idx) in caseNumbers"
                            :key="idx"
                            color="primary"
                            variant="subtle"
                            size="sm"
                            class="gap-1"
                          >
                            {{ num }}
                            <UIcon
                              name="i-lucide-x"
                              class="size-3 cursor-pointer hover:text-highlighted"
                              @click="removeCaseNumber(idx)"
                            />
                          </UBadge>
                        </div>
                      </div>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Case type</span>
                        <USelectMenu
                          v-model="caseType"
                          :items="caseTypeOptions"
                          placeholder="Select type"
                          class="w-full"
                          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                        />
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Stage</span>
                        <USelectMenu
                          v-model="stage"
                          :items="stageOptions"
                          placeholder="Where are you in the process?"
                          class="w-full"
                          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                        />
                      </label>
                    </div>
                  </div>

                  <!-- Jurisdiction & court -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Jurisdiction & court
                    </p>

                    <div class="space-y-2">
                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">State</span>
                        <USelectMenu
                          v-model="jurisdictionState"
                          :items="stateOptions"
                          placeholder="Select state"
                          class="w-full"
                          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                        />
                        <span class="text-[11px] text-muted">
                          The state where your divorce or custody case is being handled.
                        </span>
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">County / locality (optional)</span>
                        <UInput
                          v-model="jurisdictionCounty"
                          placeholder="Richmond City"
                          class="w-full"
                        />
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Court (optional)</span>
                        <UInput
                          v-model="courtName"
                          placeholder="Richmond Circuit Court, VA"
                          class="w-full"
                        />
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Next important court date (optional)</span>
                        <UInput
                          v-model="nextCourtDate"
                          type="datetime-local"
                          class="w-full"
                        />
                        <span class="text-[11px] text-muted">
                          Used for reminders and to frame exports around upcoming hearings.
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- PEOPLE & CHILDREN TAB -->
              <div
                v-else-if="activeCaseTab === 'people'"
                class="space-y-6"
              >
                <div class="grid gap-6 md:grid-cols-2">
                  <!-- People involved -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      People involved
                    </p>

                    <div class="space-y-2">
                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Your role</span>
                        <USelectMenu
                          v-model="yourRole"
                          :items="roleOptions"
                          placeholder="How do you show up in this case?"
                          class="w-full"
                          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                        />
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Other parent / opposing party</span>
                        <UInput
                          v-model="opposingPartyName"
                          placeholder="Jordan Smith"
                          class="w-full"
                        />
                        <span class="text-[11px] text-muted">
                          The main other adult in the case. You can use initials if you prefer.
                        </span>
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Their role (optional)</span>
                        <UInput
                          v-model="opposingPartyRole"
                          placeholder="Co-parent / Respondent"
                          class="w-full"
                        />
                      </label>

                      <div class="pt-2 space-y-2">
                        <p class="text-[11px] font-medium uppercase tracking-wide text-muted">
                          Your lawyer (optional)
                        </p>

                        <label class="space-y-1 block">
                          <span class="text-xs font-medium text-highlighted">Lawyer name</span>
                          <UInput
                            v-model="lawyerName"
                            placeholder="Attorney Jordan Lee"
                            class="w-full"
                          />
                        </label>

                        <label class="space-y-1 block">
                          <span class="text-xs font-medium text-highlighted">Lawyer email</span>
                          <UInput
                            v-model="lawyerEmail"
                            type="email"
                            placeholder="jordan.lee@firm.com"
                            class="w-full"
                          />
                          <span class="text-[11px] text-muted">
                            Saved here so Daylight can help you email case summaries to your lawyer later.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Children -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Children
                    </p>

                    <div class="space-y-2">
                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Number of children in this case</span>
                        <UInput
                          v-model.number="childrenCount"
                          type="number"
                          min="0"
                          class="w-full"
                        />
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Children overview</span>
                        <UTextarea
                          v-model="childrenSummary"
                          :rows="3"
                          autoresize
                          placeholder="Example: Emma (7, 2nd grade) and Noah (4, preschool). Emma has asthma; both do best with consistent bedtime and school routines."
                          class="w-full"
                        />
                        <span class="text-[11px] text-muted">
                          High‑level details: names or initials, ages, grades, and any important needs.
                        </span>
                      </label>

                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">Current parenting schedule (optional)</span>
                        <UTextarea
                          v-model="parentingSchedule"
                          :rows="3"
                          autoresize
                          placeholder="Example: Week-on / week-off; exchanges Sunday at 6pm. Holidays follow standard Virginia guideline schedule."
                          class="w-full"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- GOALS & RISKS TAB -->
              <div
                v-else-if="activeCaseTab === 'goals'"
                class="space-y-6"
              >
                <div class="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <!-- Goals & story -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Goals & what you want understood
                    </p>

                    <label class="space-y-1 block">
                      <span class="text-xs font-medium text-highlighted">If the judge only remembered 2–3 things about your situation, what should they be?</span>
                      <UTextarea
                        v-model="goalsSummary"
                        :rows="5"
                        autoresize
                        placeholder="Example: I want a stable, consistent school-week routine, predictable exchanges, and a plan that keeps the kids out of adult conflict."
                        class="w-full"
                      />
                      <span class="text-[11px] text-muted">
                        This helps Daylight frame timelines and exports around your actual objectives.
                      </span>
                    </label>

                    <label class="space-y-1 block">
                      <span class="text-xs font-medium text-highlighted">Other notes (optional)</span>
                      <UTextarea
                        v-model="notes"
                        :rows="4"
                        autoresize
                        placeholder="Anything else about your case, attorneys, or context you want in one place."
                        class="w-full"
                      />
                    </label>
                  </div>

                  <!-- Risk flags -->
                  <div class="space-y-3 min-w-0">
                    <p class="text-xs font-medium uppercase tracking-wide text-muted">
                      Risk flags
                    </p>

                    <div class="space-y-2">
                      <label class="space-y-1 block">
                        <span class="text-xs font-medium text-highlighted">What kinds of issues show up in your case?</span>
                        <USelectMenu
                          v-model="riskFlags"
                          :items="riskFlagOptions"
                          multiple
                          placeholder="Select all that apply"
                          class="w-full"
                          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
                        />
                        <span class="text-[11px] text-muted">
                          These help group events and evidence around safety, stability, and other high‑impact patterns.
                        </span>
                      </label>

                      <div
                        v-if="riskFlags.length"
                        class="flex flex-wrap gap-1 pt-1"
                      >
                        <UBadge
                          v-for="flag in riskFlags"
                          :key="flag"
                          color="warning"
                          variant="subtle"
                          size="xs"
                        >
                          {{ flag }}
                        </UBadge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <div class="flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-2 text-xs text-muted">
                <UIcon
                  v-if="loading"
                  name="i-lucide-loader-2"
                  class="size-4 animate-spin"
                />
                <span v-if="loading">Loading case details…</span>
                <span v-else-if="loadError">
                  We could not load your case details. You can still enter info and save a new record.
                </span>
                <span v-else>
                  Case details are private to your account and stored in Supabase with row‑level security.
                </span>
              </div>

              <div class="flex items-center gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-rotate-ccw"
                  :disabled="loading"
                  @click="loadCase"
                >
                  Reload
                </UButton>

                <UButton
                  color="primary"
                  icon="i-lucide-save"
                  :loading="saving"
                  @click="saveCase"
                >
                  Save case
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>




<script setup lang="ts">
definePageMeta({
  layout: 'onboarding'
})

useSeoMeta({
  title: 'Get Started – Daylight',
  description: 'Set up your Daylight account and start documenting your case.'
})

const toast = useToast()
const router = useRouter()
const { updateProfile, fetchProfile } = useProfile()

// Current step in the wizard
const currentStep = ref(0)
const isSubmitting = ref(false)

// Form data
const formData = reactive({
  // About you
  yourRole: '' as string,
  yourRoleOther: '',
  
  // Children
  childrenCount: null as number | null,
  childrenSummary: '',
  
  // Other parent
  opposingPartyName: '',
  opposingPartyRole: '',
  
  // Your situation
  caseType: '',
  stage: '',
  jurisdictionState: '',
  
  // Goals
  goalsSummary: '',
  
  // Risk factors
  riskFlags: [] as string[]
})

// Step definitions
const steps = [
  { id: 'welcome', title: 'Welcome', icon: 'i-lucide-hand-heart' },
  { id: 'how-it-works', title: 'How it works', icon: 'i-lucide-lightbulb' },
  { id: 'about-you', title: 'About you', icon: 'i-lucide-user' },
  { id: 'children', title: 'Your children', icon: 'i-lucide-baby' },
  { id: 'other-parent', title: 'Other parent', icon: 'i-lucide-users' },
  { id: 'situation', title: 'Your situation', icon: 'i-lucide-scale' },
  { id: 'goals', title: 'Your goals', icon: 'i-lucide-target' },
  { id: 'risks', title: 'Risk factors', icon: 'i-lucide-shield-alert' },
  { id: 'complete', title: 'All set', icon: 'i-lucide-check-circle' }
]

// Options
const roleOptions = [
  { value: 'Mother', label: 'Mother', icon: 'i-lucide-user' },
  { value: 'Father', label: 'Father', icon: 'i-lucide-user' },
  { value: 'Grandparent', label: 'Grandparent', icon: 'i-lucide-users' },
  { value: 'Guardian', label: 'Guardian', icon: 'i-lucide-shield' },
  { value: 'Other', label: 'Other', icon: 'i-lucide-circle-user' }
]

const caseTypeOptions = [
  { value: 'Divorce with custody', label: 'Divorce with custody' },
  { value: 'Custody only', label: 'Custody only' },
  { value: 'Child support only', label: 'Child support only' },
  { value: 'Modification', label: 'Modification of existing order' },
  { value: 'Protection order', label: 'Protection order' },
  { value: 'Other', label: 'Other' }
]

const stageOptions = [
  { value: 'Thinking about filing', label: 'Thinking about filing', description: 'Haven\'t started yet' },
  { value: 'Just filed', label: 'Just filed', description: 'Paperwork submitted' },
  { value: 'Temporary orders', label: 'Temporary orders', description: 'Awaiting interim decisions' },
  { value: 'Mediation', label: 'Mediation', description: 'Working toward agreement' },
  { value: 'Final hearing / trial', label: 'Final hearing / trial', description: 'Preparing for court' },
  { value: 'Post-judgment', label: 'Post-judgment', description: 'Order already in place' }
]

const stateOptions = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming'
]

const riskFlagOptions = [
  { value: 'Domestic violence / safety concerns', icon: 'i-lucide-shield-alert', color: 'error' },
  { value: 'Substance use concerns', icon: 'i-lucide-wine', color: 'warning' },
  { value: 'Mental health instability', icon: 'i-lucide-brain', color: 'warning' },
  { value: 'Neglect / unmet basic needs', icon: 'i-lucide-home', color: 'error' },
  { value: 'Interference with parenting time', icon: 'i-lucide-calendar-x', color: 'warning' },
  { value: 'Relocation / move-away', icon: 'i-lucide-map-pin', color: 'info' },
  { value: 'Financial control', icon: 'i-lucide-wallet', color: 'warning' },
  { value: 'Other high-risk patterns', icon: 'i-lucide-alert-triangle', color: 'neutral' }
]

// Navigation
function nextStep() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
    // Scroll to top of content area
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function prevStep() {
  if (currentStep.value > 0) {
    currentStep.value--
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function goToStep(index: number) {
  if (index <= currentStep.value) {
    currentStep.value = index
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// Toggle risk flag
function toggleRiskFlag(flag: string) {
  const index = formData.riskFlags.indexOf(flag)
  if (index === -1) {
    formData.riskFlags.push(flag)
  } else {
    formData.riskFlags.splice(index, 1)
  }
}

// Computed: can proceed from current step
const canProceed = computed(() => {
  switch (steps[currentStep.value]?.id) {
    case 'about-you':
      return !!formData.yourRole && (formData.yourRole !== 'Other' || !!formData.yourRoleOther.trim())
    case 'children':
      return formData.childrenCount !== null && formData.childrenCount >= 0
    case 'other-parent':
      return true // Optional
    case 'situation':
      return !!formData.jurisdictionState
    case 'goals':
      return true // Optional but encouraged
    case 'risks':
      return true // Optional
    default:
      return true
  }
})

// Mark onboarding as complete
async function markOnboardingComplete() {
  await updateProfile({
    onboarding_completed_at: new Date().toISOString()
  })
  
  // Clear the cached profile data so it refetches on next navigation
  const nuxtApp = useNuxtApp()
  const user = useSupabaseUser()
  if (user.value) {
    delete nuxtApp.payload.data[`profile-${user.value.id}`]
  }
}

// Save to backend
async function saveOnboarding() {
  isSubmitting.value = true
  
  try {
    const body = {
      // We'll create a case record with this info
      title: 'My Case', // Default title
      yourRole: formData.yourRole === 'Other' ? formData.yourRoleOther : formData.yourRole,
      childrenCount: formData.childrenCount,
      childrenSummary: formData.childrenSummary || null,
      opposingPartyName: formData.opposingPartyName || null,
      opposingPartyRole: formData.opposingPartyRole || null,
      caseType: formData.caseType || null,
      stage: formData.stage || null,
      jurisdictionState: formData.jurisdictionState || null,
      goalsSummary: formData.goalsSummary || null,
      riskFlags: formData.riskFlags
    }
    
    // Save case data
    await $fetch('/api/case', {
      method: 'POST',
      body
    })
    
    // Mark onboarding as complete
    await markOnboardingComplete()
    
    toast.add({
      title: 'Setup complete',
      description: 'Your case is ready. Let\'s start documenting.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    
    // Redirect to home
    await router.push('/home')
    
  } catch (error: any) {
    console.error('[Onboarding] Failed to save:', error)
    toast.add({
      title: 'Something went wrong',
      description: 'We couldn\'t save your information. Please try again.',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  } finally {
    isSubmitting.value = false
  }
}

// Skip to home without saving case data, but mark onboarding as seen
async function skipToHome() {
  try {
    await markOnboardingComplete()
  } catch (error) {
    console.warn('[Onboarding] Failed to mark complete on skip:', error)
  }
  await router.push('/home')
}
</script>

<template>
  <div class="min-h-[calc(100vh-3.5rem)] flex flex-col">
    <!-- Progress bar -->
    <div class="sticky top-14 z-40 bg-default/80 backdrop-blur-md border-b border-default/30">
      <div class="max-w-4xl mx-auto px-4 py-3">
        <div class="flex items-center gap-2">
          <div
            v-for="(step, index) in steps"
            :key="step.id"
            class="flex items-center gap-2"
          >
            <!-- Step indicator -->
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs font-medium transition-all duration-200"
              :class="{
                'text-primary': index === currentStep,
                'text-success': index < currentStep,
                'text-muted cursor-default': index > currentStep,
                'cursor-pointer hover:text-primary': index < currentStep
              }"
              :disabled="index > currentStep"
              @click="goToStep(index)"
            >
              <div
                class="flex items-center justify-center size-6 rounded-full text-xs font-semibold transition-all"
                :class="{
                  'bg-primary text-white': index === currentStep,
                  'bg-success/20 text-success': index < currentStep,
                  'bg-muted/20 text-muted': index > currentStep
                }"
              >
                <UIcon
                  v-if="index < currentStep"
                  name="i-lucide-check"
                  class="size-3.5"
                />
                <span v-else>{{ index + 1 }}</span>
              </div>
              <span class="hidden sm:inline">{{ step.title }}</span>
            </button>
            
            <!-- Connector line -->
            <div
              v-if="index < steps.length - 1"
              class="flex-1 h-px min-w-4 max-w-8"
              :class="{
                'bg-success': index < currentStep,
                'bg-primary/30': index === currentStep,
                'bg-muted/20': index > currentStep
              }"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Main content area -->
    <div class="flex-1 py-8 sm:py-12">
      <div class="max-w-2xl mx-auto px-4">
        
        <!-- STEP: Welcome -->
        <div v-if="steps[currentStep]?.id === 'welcome'" class="space-y-8">
          <div class="text-center space-y-4">
            <div class="inline-flex items-center justify-center size-20 rounded-2xl bg-primary/10 mb-2">
              <UIcon name="i-lucide-sun" class="size-10 text-primary" />
            </div>
            <h1 class="text-3xl sm:text-4xl font-bold text-highlighted tracking-tight">
              Welcome to Daylight
            </h1>
            <p class="text-lg text-muted max-w-md mx-auto">
              Let's get you set up so Daylight can help organize your case. This takes about 3 minutes.
            </p>
          </div>

          <div class="bg-elevated/50 rounded-xl p-6 border border-default">
            <h3 class="font-semibold text-highlighted mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-info" class="size-4 text-primary" />
              What we'll cover
            </h3>
            <ul class="space-y-2 text-sm text-muted">
              <li class="flex items-center gap-2">
                <UIcon name="i-lucide-check" class="size-4 text-success" />
                How Daylight works
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-lucide-check" class="size-4 text-success" />
                Basic info about you and your children
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-lucide-check" class="size-4 text-success" />
                Your situation and goals
              </li>
              <li class="flex items-center gap-2">
                <UIcon name="i-lucide-check" class="size-4 text-success" />
                Any risk factors to watch for
              </li>
            </ul>
          </div>

          <p class="text-center text-sm text-dimmed">
            You can always update this information later in your case settings.
          </p>
        </div>

        <!-- STEP: How It Works -->
        <div v-else-if="steps[currentStep]?.id === 'how-it-works'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              Here's how Daylight works
            </h1>
            <p class="text-muted">
              Four simple concepts to know
            </p>
          </div>

          <div class="space-y-4">
            <!-- Step 1: Journal -->
            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-12 rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-mic" class="size-6" />
              </div>
              <div>
                <h3 class="font-semibold text-highlighted flex items-center gap-2">
                  <span class="text-xs font-mono text-primary">01</span>
                  Journal Entries
                </h3>
                <p class="text-sm text-muted mt-1">
                  Talk into your phone or type what happened. Don't worry about formatting—just get it down. Include screenshots or photos if you have them.
                </p>
              </div>
            </div>

            <!-- Step 2: Events -->
            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-12 rounded-xl bg-info/10 text-info">
                <UIcon name="i-lucide-sparkles" class="size-6" />
              </div>
              <div>
                <h3 class="font-semibold text-highlighted flex items-center gap-2">
                  <span class="text-xs font-mono text-info">02</span>
                  AI Extracts Events
                </h3>
                <p class="text-sm text-muted mt-1">
                  Our AI reads your journal entries and pulls out specific events with dates, times, and context. One rambling note can become multiple organized events.
                </p>
              </div>
            </div>

            <!-- Step 3: Timeline -->
            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-12 rounded-xl bg-success/10 text-success">
                <UIcon name="i-lucide-calendar-days" class="size-6" />
              </div>
              <div>
                <h3 class="font-semibold text-highlighted flex items-center gap-2">
                  <span class="text-xs font-mono text-success">03</span>
                  Timeline View
                </h3>
                <p class="text-sm text-muted mt-1">
                  All your events appear on a chronological timeline. Color-coded by type: incidents, positive moments, medical, school, communications, and legal events.
                </p>
              </div>
            </div>

            <!-- Step 4: Export -->
            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-12 rounded-xl bg-warning/10 text-warning">
                <UIcon name="i-lucide-file-text" class="size-6" />
              </div>
              <div>
                <h3 class="font-semibold text-highlighted flex items-center gap-2">
                  <span class="text-xs font-mono text-warning">04</span>
                  Court-Ready Exports
                </h3>
                <p class="text-sm text-muted mt-1">
                  Generate professional PDFs for your attorney. Filter by date range, event type, or specific patterns. Everything organized and cited.
                </p>
              </div>
            </div>
          </div>

          <div class="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <div class="flex gap-3">
              <UIcon name="i-lucide-lightbulb" class="size-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p class="font-medium text-highlighted text-sm">The key insight</p>
                <p class="text-sm text-muted mt-1">
                  You don't need to be organized. Just capture what's happening when it happens. Daylight handles the rest.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP: About You -->
        <div v-else-if="steps[currentStep]?.id === 'about-you'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              Tell us about you
            </h1>
            <p class="text-muted">
              This helps Daylight understand your perspective
            </p>
          </div>

          <div class="space-y-4">
            <label class="block text-sm font-medium text-highlighted">
              What's your role in this case?
            </label>
            
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                v-for="option in roleOptions"
                :key="option.value"
                type="button"
                class="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200"
                :class="{
                  'border-primary bg-primary/5 ring-2 ring-primary/20': formData.yourRole === option.value,
                  'border-default hover:border-primary/50 hover:bg-elevated/50': formData.yourRole !== option.value
                }"
                @click="formData.yourRole = option.value"
              >
                <UIcon
                  :name="option.icon"
                  class="size-6"
                  :class="formData.yourRole === option.value ? 'text-primary' : 'text-muted'"
                />
                <span
                  class="text-sm font-medium"
                  :class="formData.yourRole === option.value ? 'text-primary' : 'text-highlighted'"
                >
                  {{ option.label }}
                </span>
              </button>
            </div>

            <!-- Other role input -->
            <div v-if="formData.yourRole === 'Other'" class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Please specify
              </label>
              <UInput
                v-model="formData.yourRoleOther"
                placeholder="Your role in this case"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- STEP: Children -->
        <div v-else-if="steps[currentStep]?.id === 'children'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              About your children
            </h1>
            <p class="text-muted">
              This helps AI identify when children are mentioned in your notes
            </p>
          </div>

          <div class="space-y-6">
            <div class="space-y-3">
              <label class="block text-sm font-medium text-highlighted">
                How many children are involved in this case?
              </label>
              <div class="flex items-center gap-4">
                <UButton
                  color="neutral"
                  variant="soft"
                  size="lg"
                  icon="i-lucide-minus"
                  :disabled="!formData.childrenCount || formData.childrenCount <= 0"
                  @click="formData.childrenCount = Math.max(0, (formData.childrenCount ?? 1) - 1)"
                />
                <div class="w-20 text-center">
                  <span class="text-3xl font-bold text-highlighted">
                    {{ formData.childrenCount ?? 0 }}
                  </span>
                </div>
                <UButton
                  color="neutral"
                  variant="soft"
                  size="lg"
                  icon="i-lucide-plus"
                  @click="formData.childrenCount = (formData.childrenCount ?? 0) + 1"
                />
              </div>
            </div>

            <div v-if="formData.childrenCount && formData.childrenCount > 0" class="space-y-3">
              <label class="block text-sm font-medium text-highlighted">
                Tell us a bit about them
                <span class="text-muted font-normal">(optional but helpful)</span>
              </label>
              <UTextarea
                v-model="formData.childrenSummary"
                :rows="4"
                autoresize
                placeholder="Example: Emma (7, 2nd grade) and Noah (4, preschool). Emma has asthma and needs her inhaler at both houses. Noah is shy with new people."
                class="w-full"
              />
              <p class="text-xs text-dimmed">
                You can use initials or nicknames if you prefer. Include ages, grades, and any important needs or routines.
              </p>
            </div>
          </div>
        </div>

        <!-- STEP: Other Parent -->
        <div v-else-if="steps[currentStep]?.id === 'other-parent'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              The other parent
            </h1>
            <p class="text-muted">
              Helps AI recognize mentions in your notes
            </p>
          </div>

          <div class="space-y-6">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Their name or initials
              </label>
              <UInput
                v-model="formData.opposingPartyName"
                placeholder="Ex: Marcus, M.S., or 'the other parent'"
                class="w-full"
              />
              <p class="text-xs text-dimmed">
                Use whatever feels comfortable. You can say "Marcus," "M," or just "co-parent."
              </p>
            </div>

            <div class="space-y-2">
              <label class="block text-sm font-medium text-highlighted">
                Their role
                <span class="text-muted font-normal">(optional)</span>
              </label>
              <UInput
                v-model="formData.opposingPartyRole"
                placeholder="Ex: Father, Mother, Co-parent"
                class="w-full"
              />
            </div>
          </div>

          <div class="bg-info/5 border border-info/20 rounded-xl p-4">
            <div class="flex gap-3">
              <UIcon name="i-lucide-info" class="size-5 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-muted">
                  <strong class="text-highlighted">Privacy note:</strong> All information stays private to your account. We never share or sell your data.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP: Situation -->
        <div v-else-if="steps[currentStep]?.id === 'situation'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              Your situation
            </h1>
            <p class="text-muted">
              Helps tailor AI analysis and exports
            </p>
          </div>

          <div class="space-y-6">
            <div class="space-y-3">
              <label class="block text-sm font-medium text-highlighted">
                What state is your case in? <span class="text-error">*</span>
              </label>
              <USelectMenu
                v-model="formData.jurisdictionState"
                :items="stateOptions"
                placeholder="Select state"
                class="w-full"
                :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200' }"
              />
              <p class="text-xs text-dimmed">
                Family law varies by state. This helps us frame exports appropriately.
              </p>
            </div>

            <div class="space-y-3">
              <label class="block text-sm font-medium text-highlighted">
                Type of case
                <span class="text-muted font-normal">(optional)</span>
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  v-for="option in caseTypeOptions"
                  :key="option.value"
                  type="button"
                  class="flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200"
                  :class="{
                    'border-primary bg-primary/5': formData.caseType === option.value,
                    'border-default hover:border-primary/50': formData.caseType !== option.value
                  }"
                  @click="formData.caseType = option.value"
                >
                  <div
                    class="size-4 rounded-full border-2 flex items-center justify-center"
                    :class="formData.caseType === option.value ? 'border-primary' : 'border-muted'"
                  >
                    <div
                      v-if="formData.caseType === option.value"
                      class="size-2 rounded-full bg-primary"
                    />
                  </div>
                  <span
                    class="text-sm"
                    :class="formData.caseType === option.value ? 'text-primary font-medium' : 'text-highlighted'"
                  >
                    {{ option.label }}
                  </span>
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <label class="block text-sm font-medium text-highlighted">
                Where are you in the process?
                <span class="text-muted font-normal">(optional)</span>
              </label>
              <div class="space-y-2">
                <button
                  v-for="option in stageOptions"
                  :key="option.value"
                  type="button"
                  class="w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200"
                  :class="{
                    'border-primary bg-primary/5': formData.stage === option.value,
                    'border-default hover:border-primary/50': formData.stage !== option.value
                  }"
                  @click="formData.stage = option.value"
                >
                  <div
                    class="size-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    :class="formData.stage === option.value ? 'border-primary' : 'border-muted'"
                  >
                    <div
                      v-if="formData.stage === option.value"
                      class="size-2 rounded-full bg-primary"
                    />
                  </div>
                  <div>
                    <span
                      class="text-sm"
                      :class="formData.stage === option.value ? 'text-primary font-medium' : 'text-highlighted'"
                    >
                      {{ option.label }}
                    </span>
                    <span class="text-xs text-muted ml-2">{{ option.description }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP: Goals -->
        <div v-else-if="steps[currentStep]?.id === 'goals'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              What matters most to you?
            </h1>
            <p class="text-muted">
              Helps AI frame events around your objectives
            </p>
          </div>

          <div class="space-y-4">
            <label class="block text-sm font-medium text-highlighted">
              If the judge only remembered 2–3 things about your situation, what should they be?
            </label>
            <UTextarea
              v-model="formData.goalsSummary"
              :rows="5"
              autoresize
              placeholder="Example: I want a stable school-week routine for the kids, predictable exchanges without last-minute changes, and for the children to feel safe at both homes."
              class="w-full"
            />
            <p class="text-xs text-dimmed">
              This helps Daylight organize your timeline around what actually matters for your case.
            </p>
          </div>

          <div class="bg-success/5 border border-success/20 rounded-xl p-4">
            <div class="flex gap-3">
              <UIcon name="i-lucide-heart-handshake" class="size-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-muted">
                  <strong class="text-highlighted">Keep it child-focused.</strong> Courts respond best to goals framed around children's wellbeing, not "winning" against the other parent.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP: Risk Factors -->
        <div v-else-if="steps[currentStep]?.id === 'risks'" class="space-y-8">
          <div class="text-center space-y-3">
            <h1 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight">
              Any risk factors?
            </h1>
            <p class="text-muted">
              Helps AI flag related events automatically
            </p>
          </div>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Select any concerns that apply to your situation. This is optional, but helps AI identify patterns and flag important events.
            </p>

            <div class="grid grid-cols-1 gap-2">
              <button
                v-for="option in riskFlagOptions"
                :key="option.value"
                type="button"
                class="flex items-center gap-3 p-4 rounded-xl border text-left transition-all duration-200"
                :class="{
                  'border-primary bg-primary/5': formData.riskFlags.includes(option.value),
                  'border-default hover:border-primary/30 hover:bg-elevated/30': !formData.riskFlags.includes(option.value)
                }"
                @click="toggleRiskFlag(option.value)"
              >
                <div
                  class="size-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="formData.riskFlags.includes(option.value) ? 'border-primary bg-primary' : 'border-muted'"
                >
                  <UIcon
                    v-if="formData.riskFlags.includes(option.value)"
                    name="i-lucide-check"
                    class="size-3 text-white"
                  />
                </div>
                <UIcon
                  :name="option.icon"
                  class="size-5"
                  :class="{
                    'text-error': option.color === 'error',
                    'text-warning': option.color === 'warning',
                    'text-info': option.color === 'info',
                    'text-muted': option.color === 'neutral'
                  }"
                />
                <span class="text-sm text-highlighted">{{ option.value }}</span>
              </button>
            </div>
          </div>

          <div class="bg-warning/5 border border-warning/20 rounded-xl p-4">
            <div class="flex gap-3">
              <UIcon name="i-lucide-shield" class="size-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p class="text-sm text-muted">
                  <strong class="text-highlighted">If you're in immediate danger,</strong> please contact local authorities or the National Domestic Violence Hotline: 1-800-799-7233
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP: Complete -->
        <div v-else-if="steps[currentStep]?.id === 'complete'" class="space-y-8">
          <div class="text-center space-y-4">
            <div class="inline-flex items-center justify-center size-20 rounded-2xl bg-success/10 mb-2">
              <UIcon name="i-lucide-check-circle" class="size-10 text-success" />
            </div>
            <h1 class="text-3xl sm:text-4xl font-bold text-highlighted tracking-tight">
              You're all set!
            </h1>
            <p class="text-lg text-muted max-w-md mx-auto">
              Daylight is ready to help you document your case. Here's what to do next:
            </p>
          </div>

          <div class="space-y-4">
            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <span class="text-lg font-bold">1</span>
              </div>
              <div>
                <h3 class="font-semibold text-highlighted">Create your first journal entry</h3>
                <p class="text-sm text-muted mt-1">
                  Tap "New Journal Entry" and just talk. Describe something that happened recently—even something small.
                </p>
              </div>
            </div>

            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-10 rounded-lg bg-info/10 text-info">
                <span class="text-lg font-bold">2</span>
              </div>
              <div>
                <h3 class="font-semibold text-highlighted">Attach any evidence you have</h3>
                <p class="text-sm text-muted mt-1">
                  Screenshots of texts, photos, documents—anything that supports what you're describing.
                </p>
              </div>
            </div>

            <div class="bg-elevated/50 rounded-xl p-5 border border-default flex gap-4">
              <div class="flex-shrink-0 flex items-center justify-center size-10 rounded-lg bg-success/10 text-success">
                <span class="text-lg font-bold">3</span>
              </div>
              <div>
                <h3 class="font-semibold text-highlighted">Let AI do the organizing</h3>
                <p class="text-sm text-muted mt-1">
                  We'll extract events, build your timeline, and flag patterns. You focus on documenting—we handle the structure.
                </p>
              </div>
            </div>
          </div>

          <!-- Summary of what they told us -->
          <div class="bg-muted/30 rounded-xl p-5 border border-default">
            <h3 class="text-sm font-semibold text-highlighted mb-3 flex items-center gap-2">
              <UIcon name="i-lucide-clipboard-check" class="size-4 text-primary" />
              What you told us
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div v-if="formData.yourRole">
                <span class="text-dimmed">Your role:</span>
                <span class="text-highlighted ml-1">
                  {{ formData.yourRole === 'Other' ? formData.yourRoleOther : formData.yourRole }}
                </span>
              </div>
              <div v-if="formData.childrenCount">
                <span class="text-dimmed">Children:</span>
                <span class="text-highlighted ml-1">{{ formData.childrenCount }}</span>
              </div>
              <div v-if="formData.opposingPartyName">
                <span class="text-dimmed">Other parent:</span>
                <span class="text-highlighted ml-1">{{ formData.opposingPartyName }}</span>
              </div>
              <div v-if="formData.jurisdictionState">
                <span class="text-dimmed">State:</span>
                <span class="text-highlighted ml-1">{{ formData.jurisdictionState }}</span>
              </div>
              <div v-if="formData.caseType">
                <span class="text-dimmed">Case type:</span>
                <span class="text-highlighted ml-1">{{ formData.caseType }}</span>
              </div>
              <div v-if="formData.stage">
                <span class="text-dimmed">Stage:</span>
                <span class="text-highlighted ml-1">{{ formData.stage }}</span>
              </div>
            </div>
            <div v-if="formData.riskFlags.length" class="mt-3 pt-3 border-t border-default">
              <span class="text-dimmed text-sm">Risk factors:</span>
              <div class="flex flex-wrap gap-1.5 mt-2">
                <UBadge
                  v-for="flag in formData.riskFlags"
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
    </div>

    <!-- Footer navigation -->
    <div class="sticky bottom-0 bg-default/95 backdrop-blur-md border-t border-default">
      <div class="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
        <div>
          <UButton
            v-if="currentStep > 0"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="prevStep"
          >
            Back
          </UButton>
          <UButton
            v-else
            color="neutral"
            variant="ghost"
            @click="skipToHome"
          >
            Skip for now
          </UButton>
        </div>

        <div class="flex items-center gap-2">
          <UButton
            v-if="steps[currentStep]?.id !== 'complete'"
            color="primary"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Continue
            <template #trailing>
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </template>
          </UButton>
          <UButton
            v-else
            color="primary"
            size="lg"
            :loading="isSubmitting"
            @click="saveOnboarding"
          >
            Start documenting
            <template #trailing>
              <UIcon name="i-lucide-arrow-right" class="size-4" />
            </template>
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>


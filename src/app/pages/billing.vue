<script setup lang="ts">
import type { BillingInfo, BillingInterval, PricingPlan, PlanTier } from '~/types'

const toast = useToast()
const route = useRoute()
const config = useRuntimeConfig()

// Dev mode check - only on client to avoid hydration mismatch
const isDevMode = ref(false)
const isEmployee = ref(false)
const showTierSwitcher = computed(() => isDevMode.value || isEmployee.value)

onMounted(async () => {
  isDevMode.value = config.public.devMode === true
  
  // Check if user is an employee
  if (billingData.value?.subscription) {
    // Fetch employee status from profile
    try {
      const { data } = await useSupabaseClient()
        .from('profiles')
        .select('is_employee')
        .single()
      isEmployee.value = data?.is_employee === true
    } catch {
      // Ignore errors - just don't show tier switcher
    }
  }
})

// Subscription composable (for refreshing global state after tier changes)
const { 
  refresh: refreshSubscription,
  journalEntryCount,
  evidenceUploadCount,
  limits,
  isFree
} = useSubscription()

// Check for success/canceled from Stripe redirect
onMounted(() => {
  if (route.query.success === 'true') {
    toast.add({
      title: 'Subscription activated!',
      description: 'Welcome to Pro. Your subscription is now active.',
      color: 'success',
      icon: 'i-lucide-check-circle'
    })
    // Clean up URL
    navigateTo('/billing', { replace: true })
  } else if (route.query.canceled === 'true') {
    toast.add({
      title: 'Checkout canceled',
      description: 'No changes were made to your subscription.',
      color: 'neutral',
      icon: 'i-lucide-x-circle'
    })
    navigateTo('/billing', { replace: true })
  }
})

// Fetch billing info
const { data: billingData, status: fetchStatus, refresh } = await useFetch<BillingInfo & { stripeConfigured: boolean }>('/api/billing', {
  headers: useRequestHeaders(['cookie'])
})

const subscription = computed(() => billingData.value?.subscription ?? null)
const plans = computed(() => billingData.value?.plans ?? [])
const stripeConfigured = computed(() => billingData.value?.stripeConfigured ?? false)

// Local state
const selectedInterval = ref<BillingInterval>('month')
const isLoading = ref(false)

// Dev tier switching
const devTierOptions: { label: string; value: PlanTier }[] = [
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
  { label: 'Alpha', value: 'alpha' }
]
const devSelectedTier = ref<PlanTier>('free')
const devSwitching = ref(false)

// Update devSelectedTier when subscription loads
watch(subscription, (sub) => {
  if (sub?.planTier) {
    devSelectedTier.value = sub.planTier
  } else {
    devSelectedTier.value = 'free'
  }
}, { immediate: true })

async function devSetTier() {
  devSwitching.value = true
  
  try {
    const response = await $fetch<{ success: boolean; tier: string; message: string }>('/api/dev/set-tier', {
      method: 'POST',
      body: { tier: devSelectedTier.value }
    })

    toast.add({
      title: 'Tier updated',
      description: response.message,
      color: 'success',
      icon: 'i-lucide-check-circle'
    })

    // Refresh billing data and global subscription state
    await Promise.all([
      refresh(),
      refreshSubscription()
    ])

    // Force a page reload to ensure all components update
    window.location.reload()
  } catch (error: any) {
    toast.add({
      title: 'Failed to update tier',
      description: error?.data?.statusMessage || 'Something went wrong',
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
    devSwitching.value = false
  }
}

// Get current plan
const currentPlan = computed(() => {
  if (!subscription.value) return plans.value.find(p => p.tier === 'free') ?? null
  return plans.value.find(p => p.tier === subscription.value?.planTier) ?? null
})

const proPlan = computed(() => plans.value.find(p => p.tier === 'pro'))
const alphaPlan = computed(() => plans.value.find(p => p.tier === 'alpha'))

const isPro = computed(() => {
  return subscription.value?.planTier === 'pro' && subscription.value?.status === 'active'
})

const isAlpha = computed(() => {
  return subscription.value?.planTier === 'alpha' && subscription.value?.status === 'active'
})

// Alpha and Pro users have premium access
const hasPremiumAccess = computed(() => {
  return isPro.value || isAlpha.value
})

// Format price
function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `$${price.toFixed(2)}`
}

// Format date
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// Status badge color
function statusColor(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'success'
    case 'past_due':
    case 'unpaid':
      return 'warning'
    case 'canceled':
    case 'incomplete_expired':
      return 'error'
    case 'incomplete':
    case 'paused':
      return 'info'
    default:
      return 'neutral'
  }
}

// Redirect to Stripe Checkout
async function upgradeToPro() {
  isLoading.value = true

  try {
    const response = await $fetch<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      body: {
        interval: selectedInterval.value
      }
    })

    if (response.url) {
      window.location.href = response.url
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Please try again later.'
    toast.add({
      title: 'Checkout failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
    isLoading.value = false
  }
}

// Redirect to Stripe Customer Portal
async function manageBilling() {
  isLoading.value = true

  try {
    const response = await $fetch<{ url: string }>('/api/billing/portal', {
      method: 'POST'
    })

    if (response.url) {
      window.location.href = response.url
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Please try again later.'
    toast.add({
      title: 'Could not open billing portal',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
    isLoading.value = false
  }
}

// Transform plan for UPricingCard
function transformPlan(plan: PricingPlan, isCurrent: boolean) {
  const price = selectedInterval.value === 'year' ? plan.priceYearly : plan.priceMonthly

  return {
    title: plan.name,
    description: plan.description,
    price: plan.comingSoon ? 'Contact Us' : formatPrice(price),
    billingCycle: !plan.comingSoon && price > 0 ? `/${selectedInterval.value}` : undefined,
    billingPeriod: !plan.comingSoon && selectedInterval.value === 'year' && price > 0
      ? `${formatPrice(plan.priceYearly / 12)}/mo billed annually`
      : undefined,
    features: plan.features.map(f => ({
      title: f,
      icon: f.includes('Coming Soon') ? 'i-lucide-clock' : undefined
    })),
    badge: plan.comingSoon
      ? { label: 'Coming Soon', color: 'neutral' as const }
      : plan.highlighted
        ? { label: 'Recommended', color: 'primary' as const }
        : isCurrent
          ? { label: 'Current', color: 'success' as const }
          : undefined,
    highlight: plan.highlighted && !plan.comingSoon,
    variant: plan.comingSoon ? 'subtle' as const : 'outline' as const
  }
}
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <UDashboardNavbar title="Billing">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 sm:p-6 space-y-8 max-w-4xl mx-auto">
        <!-- Loading State -->
        <div v-if="fetchStatus === 'pending'" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
          <span class="ml-2 text-muted">Loading billing information...</span>
        </div>

        <template v-else>
          <!-- Current Subscription Status - Consolidated Card -->
          <UCard :class="isPro ? 'border-primary/20' : isAlpha ? 'border-success/20' : ''">
            <div class="space-y-4">
              <!-- Header row -->
              <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div :class="['p-2.5 rounded-lg shrink-0', isAlpha ? 'bg-success/10' : isPro ? 'bg-primary/10' : 'bg-muted']">
                    <UIcon
                      :name="isAlpha ? 'i-lucide-flag' : isPro ? 'i-lucide-crown' : 'i-lucide-user'"
                      :class="['w-6 h-6', isAlpha ? 'text-success' : isPro ? 'text-primary' : 'text-muted']"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2 mb-1">
                      <span class="text-lg sm:text-xl font-semibold text-highlighted">
                        {{ currentPlan?.name ?? 'Free' }} Plan
                      </span>
                      <UBadge
                        v-if="isAlpha"
                        color="success"
                        variant="subtle"
                        size="sm"
                      >
                        Early Access
                      </UBadge>
                      <UBadge
                        v-else-if="subscription"
                        :color="statusColor(subscription.status)"
                        variant="subtle"
                        size="sm"
                      >
                        {{ subscription.status }}
                      </UBadge>
                      <UBadge
                        v-if="subscription?.cancelAtPeriodEnd"
                        color="warning"
                        variant="subtle"
                        size="sm"
                      >
                        Canceling
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted">
                      <template v-if="isAlpha">
                        All features unlocked · Thank you for being an early partner
                      </template>
                      <template v-else-if="isPro && subscription">
                        {{ formatPrice(selectedInterval === 'year' ? (proPlan?.priceYearly ?? 0) : (proPlan?.priceMonthly ?? 0)) }}/{{ subscription.billingInterval }}
                        <span v-if="subscription.cancelAtPeriodEnd">
                          · Access until {{ formatDate(subscription.currentPeriodEnd) }}
                        </span>
                        <span v-else>
                          · Renews {{ formatDate(subscription.currentPeriodEnd) }}
                        </span>
                      </template>
                      <template v-else>
                        Free forever · Upgrade anytime
                      </template>
                    </p>
                  </div>
                </div>

                <UButton
                  v-if="isPro && subscription?.stripeCustomerId && !isAlpha"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :loading="isLoading"
                  class="shrink-0"
                  @click="manageBilling"
                >
                  <UIcon name="i-lucide-settings" class="w-4 h-4 mr-1" />
                  <span class="hidden sm:inline">Manage Billing</span>
                  <span class="sm:hidden">Manage</span>
                </UButton>
              </div>

              <!-- Pro/Alpha features inline -->
              <div v-if="isPro || isAlpha" class="flex flex-wrap gap-2 pt-2 border-t border-default">
                <template v-if="isAlpha">
                  <UBadge variant="subtle" color="success" size="sm">All Pro Features</UBadge>
                  <UBadge variant="subtle" color="success" size="sm">Unlimited Everything</UBadge>
                  <UBadge variant="subtle" color="success" size="sm">Priority Support</UBadge>
                </template>
                <template v-else-if="isPro">
                  <UBadge v-for="feature in proPlan?.features.slice(0, 4)" :key="feature" variant="subtle" color="primary" size="sm">
                    {{ feature }}
                  </UBadge>
                </template>
              </div>
            </div>
          </UCard>

          <!-- Usage Summary for Free Tier -->
          <UCard v-if="!hasPremiumAccess">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-gauge" class="w-5 h-5 text-primary" />
                <span class="font-medium text-highlighted">Current Usage</span>
              </div>
            </template>

            <div class="space-y-5">
              <!-- Journal Entries Usage -->
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-book-open" class="w-4 h-4 text-muted" />
                    <span class="text-highlighted">Journal Entries</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span :class="journalEntryCount > limits.journalEntries ? 'text-error font-medium' : 'text-muted'">
                      {{ journalEntryCount }} / {{ limits.journalEntries }}
                    </span>
                    <UBadge 
                      v-if="journalEntryCount >= limits.journalEntries" 
                      :color="journalEntryCount > limits.journalEntries ? 'error' : 'warning'" 
                      variant="subtle" 
                      size="xs"
                    >
                      {{ journalEntryCount > limits.journalEntries ? 'Over limit' : 'Limit reached' }}
                    </UBadge>
                  </div>
                </div>
                <UProgress 
                  :model-value="Math.min(journalEntryCount, limits.journalEntries)" 
                  :max="limits.journalEntries"
                  :color="journalEntryCount >= limits.journalEntries ? 'error' : journalEntryCount >= limits.journalEntries * 0.8 ? 'warning' : 'primary'"
                  size="sm"
                />
              </div>

              <!-- Evidence Uploads Usage -->
              <div class="space-y-2">
                <div class="flex items-center justify-between text-sm">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-muted" />
                    <span class="text-highlighted">Evidence Uploads</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span :class="evidenceUploadCount > limits.evidenceUploads ? 'text-error font-medium' : 'text-muted'">
                      {{ evidenceUploadCount }} / {{ limits.evidenceUploads }}
                    </span>
                    <UBadge 
                      v-if="evidenceUploadCount >= limits.evidenceUploads" 
                      :color="evidenceUploadCount > limits.evidenceUploads ? 'error' : 'warning'" 
                      variant="subtle" 
                      size="xs"
                    >
                      {{ evidenceUploadCount > limits.evidenceUploads ? 'Over limit' : 'Limit reached' }}
                    </UBadge>
                  </div>
                </div>
                <UProgress 
                  :model-value="Math.min(evidenceUploadCount, limits.evidenceUploads)" 
                  :max="limits.evidenceUploads"
                  color="primary"
                  size="sm"
                />
              </div>

              <!-- Over limit notice -->
              <UAlert
                v-if="journalEntryCount > limits.journalEntries || evidenceUploadCount > limits.evidenceUploads"
                color="warning"
                variant="subtle"
                icon="i-lucide-alert-triangle"
              >
                <template #title>You've exceeded your free plan limits</template>
                <template #description>
                  Some features may be restricted. Upgrade to Pro for unlimited access.
                </template>
              </UAlert>

              <!-- Locked features -->
              <div class="pt-2 border-t border-default">
                <p class="text-xs text-muted mb-2">Locked on Free plan:</p>
                <div class="flex flex-wrap gap-2">
                  <UBadge variant="subtle" color="neutral" size="sm">
                    <UIcon name="i-lucide-lock" class="w-3 h-3 mr-1" />
                    Court-ready Exports
                  </UBadge>
                  <UBadge variant="subtle" color="neutral" size="sm">
                    <UIcon name="i-lucide-lock" class="w-3 h-3 mr-1" />
                    AI Insights
                  </UBadge>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Upgrade Section (for free users) -->
          <template v-if="!hasPremiumAccess">
            <div class="text-center space-y-4">
              <h2 class="text-2xl font-bold text-highlighted">Upgrade to Pro</h2>
              <p class="text-muted max-w-lg mx-auto">
                Unlock unlimited journal entries, AI-powered features, and court-ready exports.
              </p>

              <!-- Billing Interval Toggle -->
              <div class="inline-flex items-center gap-2 p-1 rounded-lg bg-elevated border border-default">
                <button
                  :class="[
                    'px-4 py-2 text-sm font-medium rounded-md transition-all',
                    selectedInterval === 'month'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-highlighted'
                  ]"
                  @click="selectedInterval = 'month'"
                >
                  Monthly
                </button>
                <button
                  :class="[
                    'px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-1.5',
                    selectedInterval === 'year'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-highlighted'
                  ]"
                  @click="selectedInterval = 'year'"
                >
                  Yearly
                  <span class="text-xs px-1.5 py-0.5 rounded-full bg-success/20 text-success font-semibold">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>

            <!-- Pro Plan Card -->
            <div v-if="proPlan" class="max-w-md mx-auto">
              <UPricingPlan
                v-bind="transformPlan(proPlan, false)"
                highlight
                :button="{
                  label: stripeConfigured
                    ? `Subscribe for ${formatPrice(selectedInterval === 'year' ? proPlan.priceYearly : proPlan.priceMonthly)}/${selectedInterval}`
                    : 'Coming Soon',
                  loading: isLoading,
                  disabled: !stripeConfigured,
                  onClick: upgradeToPro
                }"
              />
            </div>

            <!-- Compare Plans -->
            <UAccordion
              :items="[{
                label: 'Compare all plans',
                icon: 'i-lucide-list',
                slot: 'compare'
              }]"
              class="mt-8"
            >
              <template #compare>
                <div class="grid md:grid-cols-2 gap-4 pt-4">
                  <UPricingPlan
                    v-for="plan in plans.filter(p => p.tier !== 'alpha')"
                    :key="plan.id"
                    v-bind="transformPlan(plan, plan.tier === (subscription?.planTier ?? 'free'))"
                    :class="{ 'opacity-60': plan.comingSoon }"
                  />
                </div>
              </template>
            </UAccordion>
          </template>

          <!-- Alpha celebration gif (keeping the fun element) -->
          <div v-if="isAlpha" class="flex justify-center">
            <img
              src="https://media.giphy.com/media/scftgIpdF1V3eFED52/giphy.gif"
              alt="Dancing celebration"
              class="w-32 h-32 rounded-lg object-cover"
            />
          </div>

          <!-- Billing Info -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-info" class="w-5 h-5 text-primary" />
                <span class="font-medium text-highlighted">Billing Information</span>
              </div>
            </template>

            <div class="space-y-4 text-sm text-muted">
              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-credit-card" class="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p class="font-medium text-highlighted">Secure Payments</p>
                  <p>All payments are processed securely through Stripe. We never store your card details.</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-shield-check" class="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p class="font-medium text-highlighted">Cancel Anytime</p>
                  <p>No long-term contracts. Cancel your subscription at any time from the billing portal.</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-mail" class="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p class="font-medium text-highlighted">Questions?</p>
                  <p>Contact us at <a href="mailto:hello@monumentlabs.io" class="text-primary hover:underline">hello@monumentlabs.io</a></p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Tier Switcher for employees/dev mode (client-only to avoid hydration mismatch) -->
          <ClientOnly>
            <UCard v-if="showTierSwitcher" class="border-dashed border-2 border-warning/50 bg-warning/5">
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-flask-conical" class="w-5 h-5 text-warning" />
                  <span class="font-medium text-highlighted">Tier Switcher</span>
                  <UBadge color="warning" variant="subtle" size="xs">{{ isEmployee ? 'EMPLOYEE' : 'DEV' }}</UBadge>
                </div>
              </template>

              <div class="space-y-4">
                <p class="text-sm text-muted">
                  Switch your subscription tier for testing. {{ isEmployee ? 'Available because you are an employee.' : 'Only available in development mode.' }}
                </p>

                <div class="flex flex-wrap items-end gap-3">
                  <div class="space-y-1">
                    <label class="text-xs font-medium text-muted">Select Tier</label>
                    <USelect
                      v-model="devSelectedTier"
                      :items="devTierOptions"
                      value-attribute="value"
                      option-attribute="label"
                      class="w-40"
                    />
                  </div>

                  <UButton
                    color="warning"
                    variant="solid"
                    :loading="devSwitching"
                    :disabled="devSwitching"
                    @click="devSetTier"
                  >
                    Apply Tier
                  </UButton>
                </div>

                <div class="text-xs text-muted/70 flex items-center gap-1.5">
                  <UIcon name="i-lucide-info" class="w-3.5 h-3.5" />
                  <span>Current: <strong>{{ subscription?.planTier || 'free' }}</strong> ({{ subscription?.status || 'no subscription' }})</span>
                </div>
              </div>
            </UCard>
          </ClientOnly>

          <!-- Development Notice -->
          <UAlert
            v-if="!stripeConfigured"
            color="warning"
            variant="subtle"
            icon="i-lucide-construction"
            title="Stripe Not Configured"
            description="Set STRIPE_SECRET_KEY and price IDs in your environment to enable billing."
            class="mt-4"
          />
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

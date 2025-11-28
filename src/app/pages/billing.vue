<script setup lang="ts">
import type { BillingInfo, BillingInterval, PricingPlan } from '~/types'

const toast = useToast()
const route = useRoute()

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

// Get current plan
const currentPlan = computed(() => {
  if (!subscription.value) return plans.value.find(p => p.tier === 'free') ?? null
  return plans.value.find(p => p.tier === subscription.value?.planTier) ?? null
})

const proPlan = computed(() => plans.value.find(p => p.tier === 'pro'))

const isPro = computed(() => {
  return subscription.value?.planTier === 'pro' && subscription.value?.status === 'active'
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
          <!-- Current Subscription Status -->
          <UCard>
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="space-y-2">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg bg-primary/10">
                    <UIcon
                      :name="isPro ? 'i-lucide-crown' : 'i-lucide-user'"
                      class="w-6 h-6 text-primary"
                    />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xl font-semibold text-highlighted">
                        {{ currentPlan?.name ?? 'Free' }} Plan
                      </span>
                      <UBadge
                        v-if="subscription"
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
                      <template v-if="isPro && subscription">
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
              </div>

              <div class="flex gap-2">
                <UButton
                  v-if="isPro && subscription?.stripeCustomerId"
                  color="neutral"
                  variant="soft"
                  :loading="isLoading"
                  @click="manageBilling"
                >
                  <UIcon name="i-lucide-settings" class="w-4 h-4 mr-1" />
                  Manage Billing
                </UButton>
              </div>
            </div>
          </UCard>

          <!-- Upgrade Section (for free users) -->
          <template v-if="!isPro">
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
                <div class="grid md:grid-cols-3 gap-4 pt-4">
                  <UPricingPlan
                    v-for="plan in plans"
                    :key="plan.id"
                    v-bind="transformPlan(plan, plan.tier === (subscription?.planTier ?? 'free'))"
                    :class="{ 'opacity-60': plan.comingSoon }"
                  />
                </div>
              </template>
            </UAccordion>
          </template>

          <!-- Already Pro -->
          <template v-else>
            <UCard variant="subtle" class="border-primary/20 bg-primary/5">
              <div class="flex items-start gap-4">
                <div class="p-3 rounded-full bg-primary/10">
                  <UIcon name="i-lucide-sparkles" class="w-6 h-6 text-primary" />
                </div>
                <div class="flex-1">
                  <h3 class="font-semibold text-highlighted">You're on Pro!</h3>
                  <p class="text-sm text-muted mt-1">
                    Enjoy unlimited journal entries, AI-powered features, and priority support.
                  </p>
                  <div class="flex flex-wrap gap-2 mt-4">
                    <UBadge v-for="feature in proPlan?.features.slice(0, 4)" :key="feature" variant="subtle" color="primary">
                      {{ feature }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>
          </template>

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
                  <p>Contact us at <a href="mailto:support@projectdaylight.com" class="text-primary hover:underline">support@projectdaylight.com</a></p>
                </div>
              </div>
            </div>
          </UCard>

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

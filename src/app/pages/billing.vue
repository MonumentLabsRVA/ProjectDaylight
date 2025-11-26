<script setup lang="ts">
import type { BillingInfo, PricingPlan, Subscription, BillingInterval, PlanTier } from '~/types'

const toast = useToast()

// Fetch billing info
const { data: billingData, status: fetchStatus, refresh } = await useFetch<BillingInfo>('/api/billing', {
  headers: useRequestHeaders(['cookie'])
})

const subscription = computed(() => billingData.value?.subscription ?? null)
const plans = computed(() => billingData.value?.plans ?? [])

// Local state
const selectedInterval = ref<BillingInterval>('month')
const isUpdating = ref(false)
const showCancelModal = ref(false)

// Get current plan
const currentPlan = computed(() => {
  if (!subscription.value) return null
  return plans.value.find(p => p.tier === subscription.value?.planTier) ?? null
})

// Format price
function formatPrice(price: number): string {
  if (price === 0) return 'Free'
  return `$${price.toFixed(2)}`
}

// Get price for selected interval
function getPriceForInterval(plan: PricingPlan): number {
  return selectedInterval.value === 'year' ? plan.priceYearly : plan.priceMonthly
}

// Format date
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

// Check if plan is current
function isCurrentPlan(plan: PricingPlan): boolean {
  return subscription.value?.planTier === plan.tier
}

// Check if plan is upgrade
function isUpgrade(plan: PricingPlan): boolean {
  if (!subscription.value) return true
  const tierOrder: PlanTier[] = ['free', 'starter', 'pro', 'enterprise']
  const currentIndex = tierOrder.indexOf(subscription.value.planTier)
  const planIndex = tierOrder.indexOf(plan.tier)
  return planIndex > currentIndex
}

// Subscribe or change plan
async function selectPlan(plan: PricingPlan) {
  if (isCurrentPlan(plan) && subscription.value?.billingInterval === selectedInterval.value) {
    return
  }

  isUpdating.value = true

  try {
    const response = await $fetch<{ subscription: Subscription }>('/api/billing', {
      method: 'POST',
      body: {
        planTier: plan.tier,
        billingInterval: selectedInterval.value
      }
    })

    if (response.subscription) {
      await refresh()
      
      toast.add({
        title: 'Subscription updated',
        description: `You are now on the ${plan.name} plan`,
        color: 'success',
        icon: 'i-lucide-check-circle'
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Please try again later.'
    toast.add({
      title: 'Failed to update subscription',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  } finally {
    isUpdating.value = false
  }
}

// Cancel subscription
async function cancelSubscription() {
  isUpdating.value = true
  showCancelModal.value = false

  try {
    const response = await $fetch<{ subscription: Subscription }>('/api/billing', {
      method: 'PATCH',
      body: {
        cancelAtPeriodEnd: true
      }
    })

    if (response.subscription) {
      await refresh()
      
      toast.add({
        title: 'Subscription canceled',
        description: 'Your subscription will remain active until the end of your billing period.',
        color: 'warning',
        icon: 'i-lucide-calendar-x'
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Please try again later.'
    toast.add({
      title: 'Failed to cancel subscription',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  } finally {
    isUpdating.value = false
  }
}

// Reactivate subscription
async function reactivateSubscription() {
  isUpdating.value = true

  try {
    const response = await $fetch<{ subscription: Subscription }>('/api/billing', {
      method: 'PATCH',
      body: {
        cancelAtPeriodEnd: false
      }
    })

    if (response.subscription) {
      await refresh()
      
      toast.add({
        title: 'Subscription reactivated',
        description: 'Your subscription will continue after your billing period.',
        color: 'success',
        icon: 'i-lucide-check-circle'
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Please try again later.'
    toast.add({
      title: 'Failed to reactivate subscription',
      description: message,
      color: 'error',
      icon: 'i-lucide-alert-circle'
    })
  } finally {
    isUpdating.value = false
  }
}

// Status badge color
function statusColor(status: Subscription['status']): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
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

// Get button label for a plan
function getButtonLabel(plan: PricingPlan): string {
  if (plan.comingSoon) return 'Coming Soon'
  if (isCurrentPlan(plan) && subscription.value?.billingInterval === selectedInterval.value) {
    return 'Current Plan'
  }
  if (isCurrentPlan(plan)) {
    return `Switch to ${selectedInterval.value === 'year' ? 'Yearly' : 'Monthly'}`
  }
  if (isUpgrade(plan)) {
    return `Upgrade to ${plan.name}`
  }
  return `Downgrade to ${plan.name}`
}

// Transform plans for UPricingPlans component
const pricingPlans = computed(() => {
  return plans.value.map(plan => {
    const price = getPriceForInterval(plan)
    const isCurrent = isCurrentPlan(plan) && subscription.value?.billingInterval === selectedInterval.value
    
    // Transform features to include icons for "Coming Soon" items
    const features = plan.features.map(feature => {
      if (feature.includes('Coming Soon')) {
        return { title: feature, icon: 'i-lucide-clock' }
      }
      return { title: feature }
    })

    return {
      title: plan.name,
      description: plan.description,
      price: plan.comingSoon ? 'Contact Us' : formatPrice(price),
      billingCycle: !plan.comingSoon && price > 0 ? `/${selectedInterval.value}` : undefined,
      billingPeriod: !plan.comingSoon && selectedInterval.value === 'year' && price > 0 
        ? `${formatPrice(plan.priceYearly / 12)}/mo billed annually` 
        : undefined,
      features,
      badge: plan.comingSoon 
        ? { label: 'Coming Soon', color: 'neutral' as const }
        : plan.highlighted 
          ? { label: 'Recommended', color: 'primary' as const }
          : undefined,
      highlight: plan.highlighted && !plan.comingSoon,
      scale: plan.highlighted && !plan.comingSoon,
      variant: plan.comingSoon ? 'subtle' as const : 'outline' as const,
      button: {
        label: getButtonLabel(plan),
        color: plan.comingSoon 
          ? 'neutral' as const 
          : isCurrent 
            ? 'neutral' as const 
            : plan.highlighted 
              ? 'primary' as const 
              : 'neutral' as const,
        variant: plan.comingSoon 
          ? 'outline' as const 
          : isCurrent 
            ? 'outline' as const 
            : plan.highlighted 
              ? 'solid' as const 
              : 'soft' as const,
        disabled: plan.comingSoon || isCurrent,
        loading: isUpdating.value,
        onClick: () => { if (!plan.comingSoon) selectPlan(plan) }
      }
    }
  })
})
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
      <div class="p-4 sm:p-6 space-y-8 max-w-6xl mx-auto">
        <!-- Loading State -->
        <div v-if="fetchStatus === 'pending'" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-muted" />
          <span class="ml-2 text-muted">Loading billing information...</span>
        </div>

        <template v-else>
          <!-- Current Subscription Card -->
          <div v-if="subscription" class="space-y-4">
            <h2 class="text-lg font-semibold text-highlighted">Current Subscription</h2>
            
            <UCard>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xl font-semibold text-highlighted">{{ currentPlan?.name ?? 'Unknown' }} Plan</span>
                    <UBadge :color="statusColor(subscription.status)" variant="subtle" size="sm">
                      {{ subscription.status }}
                    </UBadge>
                    <UBadge v-if="subscription.cancelAtPeriodEnd" color="warning" variant="subtle" size="sm">
                      Canceling
                    </UBadge>
                  </div>
                  
                  <p class="text-sm text-muted">
                    <span v-if="subscription.planTier === 'free'">
                      Free forever
                    </span>
                    <span v-else>
                      {{ formatPrice(getPriceForInterval(currentPlan!)) }}/{{ subscription.billingInterval }}
                    </span>
                  </p>
                  
                  <p v-if="subscription.planTier !== 'free'" class="text-xs text-muted">
                    <span v-if="subscription.cancelAtPeriodEnd">
                      Access until {{ formatDate(subscription.currentPeriodEnd) }}
                    </span>
                    <span v-else>
                      Renews on {{ formatDate(subscription.currentPeriodEnd) }}
                    </span>
                  </p>
                </div>

                <div class="flex gap-2">
                  <UButton
                    v-if="subscription.cancelAtPeriodEnd && subscription.planTier !== 'free'"
                    color="primary"
                    variant="soft"
                    :loading="isUpdating"
                    @click="reactivateSubscription"
                  >
                    Reactivate
                  </UButton>
                  
                  <UButton
                    v-else-if="subscription.planTier !== 'free'"
                    color="error"
                    variant="ghost"
                    :loading="isUpdating"
                    @click="showCancelModal = true"
                  >
                    Cancel Subscription
                  </UButton>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Billing Interval Toggle -->
          <div class="flex flex-col items-center space-y-4">
            <h2 class="text-lg font-semibold text-highlighted">
              {{ subscription ? 'Change Plan' : 'Choose a Plan' }}
            </h2>
            
            <div class="inline-flex items-center gap-2 p-1 rounded-lg bg-muted/10 border border-default">
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

          <!-- Pricing Plans using Nuxt UI -->
          <UPricingPlans :plans="pricingPlans" scale compact class="max-w-5xl mx-auto" />

          <!-- FAQ / Info Section -->
          <UCard class="mt-8">
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
                <UIcon name="i-lucide-calendar" class="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p class="font-medium text-highlighted">Flexible Billing</p>
                  <p>Switch between monthly and yearly billing at any time. Changes take effect immediately.</p>
                </div>
              </div>

              <div class="flex items-start gap-3">
                <UIcon name="i-lucide-shield-check" class="w-4 h-4 mt-0.5 text-primary" />
                <div>
                  <p class="font-medium text-highlighted">Cancel Anytime</p>
                  <p>No long-term contracts. Cancel your subscription at any time and keep access until the end of your billing period.</p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- Development Notice -->
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-construction"
            title="Development Mode"
            description="This billing page is in development mode. No actual charges will be made. Stripe integration coming soon."
            class="mt-4"
          />
        </template>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Cancel Confirmation Modal -->
  <UModal v-model:open="showCancelModal">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-warning" />
            <span class="font-semibold text-highlighted">Cancel Subscription?</span>
          </div>
        </template>

        <div class="space-y-4">
          <p class="text-sm text-muted">
            Are you sure you want to cancel your subscription? You'll continue to have access to {{ currentPlan?.name }} features until {{ subscription ? formatDate(subscription.currentPeriodEnd) : 'the end of your billing period' }}.
          </p>

          <div class="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p class="text-sm text-warning">
              After cancellation, you'll be downgraded to the Free plan with limited features.
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="showCancelModal = false"
            >
              Keep Subscription
            </UButton>
            <UButton
              color="error"
              :loading="isUpdating"
              @click="cancelSubscription"
            >
              Yes, Cancel
            </UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

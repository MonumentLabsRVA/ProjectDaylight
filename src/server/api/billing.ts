import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { PricingPlan, Subscription, BillingInfo, PlanTier } from '~/types'
import { isStripeConfigured } from '../utils/stripe'

// Define pricing plans
const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'plan_free',
    tier: 'free',
    name: 'Free',
    description: 'Get started documenting your case',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Up to 5 journal entries',
      'Basic timeline view',
      'Evidence uploads (up to 10)',
      'Email support'
    ]
  },
  {
    id: 'plan_pro',
    tier: 'pro',
    name: 'Pro',
    description: 'Everything you need to build your case',
    priceMonthly: 19.99,
    priceYearly: 199,
    features: [
      'Unlimited journal entries',
      'Unlimited evidence uploads',
      'AI-powered event extraction',
      'Court-ready report generation',
      'Pattern analysis & insights',
      'Priority support',
      'Chat with your case (Coming Soon)'
    ],
    highlighted: true,
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY
  },
  {
    id: 'plan_counsel',
    tier: 'enterprise',
    name: 'Counsel',
    description: 'For attorneys and legal professionals',
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      'Everything in Pro',
      'Multi-client management',
      'Team collaboration',
      'White-label exports',
      'API access',
      'Dedicated account manager'
    ],
    comingSoon: true
  }
]

interface SubscriptionRow {
  id: string
  user_id: string
  status: Subscription['status']
  plan_tier: PlanTier
  billing_interval: 'month' | 'year'
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string
  updated_at: string
}

function mapRowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    planTier: row.plan_tier,
    billingInterval: row.billing_interval,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export default eventHandler(async (event): Promise<BillingInfo & { stripeConfigured: boolean }> => {
  const supabase = await serverSupabaseClient(event)

  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Fetch user's subscription
  let subscription: Subscription | null = null

  try {
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      console.error('Supabase select subscription error:', error)
    } else if (data) {
      subscription = mapRowToSubscription(data as SubscriptionRow)
    }
  } catch (err) {
    console.warn('Could not fetch subscription:', err)
  }

  return {
    subscription,
    plans: PRICING_PLANS,
    stripeConfigured: isStripeConfigured()
  }
})

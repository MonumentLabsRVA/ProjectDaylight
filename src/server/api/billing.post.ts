import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Subscription, CreateSubscriptionPayload, PlanTier } from '~/types'

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

// Calculate period end based on billing interval
function calculatePeriodEnd(start: Date, interval: 'month' | 'year'): Date {
  const end = new Date(start)
  if (interval === 'year') {
    end.setFullYear(end.getFullYear() + 1)
  } else {
    end.setMonth(end.getMonth() + 1)
  }
  return end
}

// Generate a fake Stripe-like ID for development
function generateFakeStripeId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = prefix + '_'
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export default eventHandler(async (event): Promise<{ subscription: Subscription }> => {
  const supabase = await serverSupabaseServiceRole(event)

  // Resolve authenticated user
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  // Parse request body
  const body = await readBody<CreateSubscriptionPayload>(event)

  if (!body.planTier || !body.billingInterval) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required fields: planTier and billingInterval'
    })
  }

  const validTiers: PlanTier[] = ['free', 'starter', 'pro', 'enterprise']
  if (!validTiers.includes(body.planTier)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid plan tier'
    })
  }

  const validIntervals = ['month', 'year']
  if (!validIntervals.includes(body.billingInterval)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid billing interval'
    })
  }

  const now = new Date()
  const periodEnd = calculatePeriodEnd(now, body.billingInterval)

  // Check if user already has a subscription
  // Note: Using 'as any' because the subscriptions table type isn't generated yet
  // Once the migration is run and types are regenerated, this can be typed properly
  const { data: existingSubscription } = await (supabase as any)
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  let result

  if (existingSubscription) {
    // Update existing subscription
    // In real Stripe integration, this would:
    // 1. Call Stripe to update the subscription
    // 2. Handle proration
    // 3. Update local record based on Stripe webhook
    
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .update({
        plan_tier: body.planTier,
        billing_interval: body.billingInterval,
        status: 'active', // Would be 'incomplete' until payment confirmed in real Stripe
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        // In real integration, these would come from Stripe
        stripe_price_id: body.planTier !== 'free' ? generateFakeStripeId('price') : null
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Supabase update subscription error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update subscription.'
      })
    }

    result = data
  } else {
    // Create new subscription
    // In real Stripe integration, this would:
    // 1. Create Stripe customer if not exists
    // 2. Create Stripe subscription with payment method
    // 3. Store the Stripe IDs
    
    const { data, error } = await (supabase as any)
      .from('subscriptions')
      .insert({
        user_id: userId,
        plan_tier: body.planTier,
        billing_interval: body.billingInterval,
        status: 'active', // In real integration, might start as 'incomplete'
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        // Fake Stripe IDs for development - these would come from actual Stripe API
        stripe_customer_id: generateFakeStripeId('cus'),
        stripe_subscription_id: body.planTier !== 'free' ? generateFakeStripeId('sub') : null,
        stripe_price_id: body.planTier !== 'free' ? generateFakeStripeId('price') : null
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert subscription error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create subscription.'
      })
    }

    result = data
  }

  return {
    subscription: mapRowToSubscription(result as SubscriptionRow)
  }
})


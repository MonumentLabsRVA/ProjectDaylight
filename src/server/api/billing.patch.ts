import { serverSupabaseServiceRole, serverSupabaseUser } from '#supabase/server'
import type { Subscription, UpdateSubscriptionPayload, PlanTier } from '~/types'

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
  const body = await readBody<UpdateSubscriptionPayload>(event)

  // Validate inputs if provided
  if (body.planTier) {
    const validTiers: PlanTier[] = ['free', 'starter', 'pro', 'enterprise']
    if (!validTiers.includes(body.planTier)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid plan tier'
      })
    }
  }

  if (body.billingInterval) {
    const validIntervals = ['month', 'year']
    if (!validIntervals.includes(body.billingInterval)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid billing interval'
      })
    }
  }

  // Check if user has a subscription
  // Note: Using 'as any' because the subscriptions table type isn't generated yet
  // Once the migration is run and types are regenerated, this can be typed properly
  const { data: existingSubscription, error: fetchError } = await (supabase as any)
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (fetchError) {
    console.error('Supabase fetch subscription error:', fetchError)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch subscription.'
    })
  }

  if (!existingSubscription) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No subscription found. Please create one first.'
    })
  }

  // Build update object
  const updates: Record<string, unknown> = {}

  if (body.planTier !== undefined) {
    updates.plan_tier = body.planTier
  }

  if (body.billingInterval !== undefined) {
    updates.billing_interval = body.billingInterval
  }

  if (body.cancelAtPeriodEnd !== undefined) {
    updates.cancel_at_period_end = body.cancelAtPeriodEnd
    
    // In real Stripe integration:
    // - If canceling, call stripe.subscriptions.update with cancel_at_period_end: true
    // - If reactivating, call stripe.subscriptions.update with cancel_at_period_end: false
    
    // Update status if canceling
    if (body.cancelAtPeriodEnd) {
      // Keep status as active until period ends
      // Stripe would handle the actual cancellation at period end via webhook
    }
  }

  if (Object.keys(updates).length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No valid updates provided'
    })
  }

  // Update subscription
  const { data, error } = await (supabase as any)
    .from('subscriptions')
    .update(updates)
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

  return {
    subscription: mapRowToSubscription(data as SubscriptionRow)
  }
})


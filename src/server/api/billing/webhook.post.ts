import { getStripe, STRIPE_WEBHOOK_SECRET, getPlanTierFromPriceId, getBillingIntervalFromPriceId } from '../../utils/stripe'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesInsert, TablesUpdate } from '~/types/database.types'

// Use service role client for webhook (no user context)
function getServiceClient() {
  const config = useRuntimeConfig()

  // Get URL from environment (supabase module sets this)
  const supabaseUrl = process.env.SUPABASE_URL

  // Get service key from runtimeConfig with fallbacks
  const supabaseServiceKey = config.supabaseServiceKey
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (supabaseServiceKey)')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey)
}

export default defineEventHandler(async (event) => {
  const stripe = await getStripe()

  if (!stripe) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe is not configured'
    })
  }

  // Get the raw body for signature verification
  const body = await readRawBody(event)
  const signature = getHeader(event, 'stripe-signature')

  if (!body || !signature) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing body or signature'
    })
  }

  let stripeEvent: any

  try {
    stripeEvent = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err)
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid signature'
    })
  }

  const supabase = getServiceClient()

  console.log(`[Stripe Webhook] Processing event: ${stripeEvent.type}`)

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object
      await handleCheckoutCompleted(supabase, session)
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = stripeEvent.data.object
      await handleSubscriptionUpdated(supabase, subscription)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = stripeEvent.data.object
      await handleSubscriptionDeleted(supabase, subscription)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = stripeEvent.data.object
      await handlePaymentFailed(supabase, invoice)
      break
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event type: ${stripeEvent.type}`)
  }

  return { received: true }
})

async function handleCheckoutCompleted(supabase: SupabaseClient<Database>, session: any) {
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string
  
  // Try to get user ID from session metadata first
  let userId = session.metadata?.supabase_user_id as string | undefined

  // If not in session metadata, try to find by customer ID (we stored it when creating the customer)
  if (!userId && customerId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    
    userId = data?.user_id
  }

  if (!userId) {
    console.error('[Stripe Webhook] No user ID in checkout session metadata and could not find by customer ID')
    return
  }

  console.log(`[Stripe Webhook] Checkout completed for user ${userId}`)

  // The subscription.created event will handle the actual subscription record
  // Just ensure customer ID is stored
  const subscriptionRecord: TablesInsert<'subscriptions'> = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert(subscriptionRecord, {
      onConflict: 'user_id'
    })

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription:', error)
  }
}

async function handleSubscriptionUpdated(supabase: SupabaseClient<Database>, subscription: any) {
  const customerId = subscription.customer as string
  const userId = subscription.metadata?.supabase_user_id as string | undefined

  // If no user ID in metadata, try to find by customer ID
  let resolvedUserId = userId
  if (!resolvedUserId) {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()

    resolvedUserId = data?.user_id
  }

  if (!resolvedUserId) {
    console.error('[Stripe Webhook] Cannot find user for subscription:', subscription.id)
    return
  }

  // Get the price ID from the first item
  const priceId = subscription.items?.data?.[0]?.price?.id || ''
  const planTier = getPlanTierFromPriceId(priceId)
  const billingInterval = getBillingIntervalFromPriceId(priceId)

  // Safely convert timestamps (Stripe sends Unix timestamps in seconds)
  const periodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : new Date().toISOString()
  
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Default to 30 days

  const subscriptionRecord: TablesInsert<'subscriptions'> = {
    user_id: resolvedUserId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id as string,
    stripe_price_id: priceId,
    status: subscription.status as TablesInsert<'subscriptions'>['status'],
    plan_tier: planTier,
    billing_interval: billingInterval,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false
  }

  const { error } = await supabase
    .from('subscriptions')
    .upsert(subscriptionRecord, {
      onConflict: 'user_id'
    })

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription:', error)
  } else {
    console.log(`[Stripe Webhook] Updated subscription for user ${resolvedUserId}: ${planTier} (${subscription.status})`)
  }
}

async function handleSubscriptionDeleted(supabase: SupabaseClient<Database>, subscription: any) {
  const customerId = subscription.customer as string

  // Find user by customer ID
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!data?.user_id) {
    console.error('[Stripe Webhook] Cannot find user for deleted subscription')
    return
  }

  // Downgrade to free plan
  const subscriptionUpdate: TablesUpdate<'subscriptions'> = {
    status: 'canceled',
    plan_tier: 'free',
    stripe_subscription_id: null,
    stripe_price_id: null,
    cancel_at_period_end: false
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(subscriptionUpdate)
    .eq('user_id', data.user_id)

  if (error) {
    console.error('[Stripe Webhook] Error handling subscription deletion:', error)
  } else {
    console.log(`[Stripe Webhook] Subscription deleted for user ${data.user_id}, downgraded to free`)
  }
}

async function handlePaymentFailed(supabase: SupabaseClient<Database>, invoice: any) {
  const customerId = invoice.customer as string

  // Find user by customer ID
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()

  if (!data?.user_id) {
    console.warn('[Stripe Webhook] Cannot find user for failed payment')
    return
  }

  // Update status to past_due
  const subscriptionUpdate: TablesUpdate<'subscriptions'> = {
    status: 'past_due'
  }

  const { error } = await supabase
    .from('subscriptions')
    .update(subscriptionUpdate)
    .eq('user_id', data.user_id)

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription status:', error)
  } else {
    console.log(`[Stripe Webhook] Payment failed for user ${data.user_id}, marked as past_due`)
  }
}

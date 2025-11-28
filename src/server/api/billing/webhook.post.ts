import { getStripe, STRIPE_WEBHOOK_SECRET, getPlanTierFromPriceId, getBillingIntervalFromPriceId } from '../../utils/stripe'
import { createClient } from '@supabase/supabase-js'

// Use service role client for webhook (no user context)
function getServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
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

async function handleCheckoutCompleted(supabase: ReturnType<typeof createClient>, session: any) {
  const customerId = session.customer as string
  const subscriptionId = session.subscription as string
  const userId = session.metadata?.supabase_user_id || session.subscription_data?.metadata?.supabase_user_id

  if (!userId) {
    console.error('[Stripe Webhook] No user ID in checkout session metadata')
    return
  }

  console.log(`[Stripe Webhook] Checkout completed for user ${userId}`)

  // The subscription.created event will handle the actual subscription record
  // Just ensure customer ID is stored
  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId
    }, {
      onConflict: 'user_id'
    })

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription:', error)
  }
}

async function handleSubscriptionUpdated(supabase: ReturnType<typeof createClient>, subscription: any) {
  const customerId = subscription.customer as string
  const userId = subscription.metadata?.supabase_user_id

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
  const priceId = subscription.items.data[0]?.price.id || ''
  const planTier = getPlanTierFromPriceId(priceId)
  const billingInterval = getBillingIntervalFromPriceId(priceId)

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      user_id: resolvedUserId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      status: subscription.status,
      plan_tier: planTier,
      billing_interval: billingInterval,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end
    }, {
      onConflict: 'user_id'
    })

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription:', error)
  } else {
    console.log(`[Stripe Webhook] Updated subscription for user ${resolvedUserId}: ${planTier} (${subscription.status})`)
  }
}

async function handleSubscriptionDeleted(supabase: ReturnType<typeof createClient>, subscription: any) {
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
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      plan_tier: 'free',
      stripe_subscription_id: null,
      stripe_price_id: null,
      cancel_at_period_end: false
    })
    .eq('user_id', data.user_id)

  if (error) {
    console.error('[Stripe Webhook] Error handling subscription deletion:', error)
  } else {
    console.log(`[Stripe Webhook] Subscription deleted for user ${data.user_id}, downgraded to free`)
  }
}

async function handlePaymentFailed(supabase: ReturnType<typeof createClient>, invoice: any) {
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
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'past_due'
    })
    .eq('user_id', data.user_id)

  if (error) {
    console.error('[Stripe Webhook] Error updating subscription status:', error)
  } else {
    console.log(`[Stripe Webhook] Payment failed for user ${data.user_id}, marked as past_due`)
  }
}

import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getStripe, STRIPE_PRICES } from '../../utils/stripe'
import type { BillingInterval } from '~/types'

interface CheckoutRequest {
  priceId?: string
  interval?: BillingInterval
}

export default defineEventHandler(async (event) => {
  const stripe = await getStripe()

  if (!stripe) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Stripe is not configured. Please set STRIPE_SECRET_KEY and install the stripe package.'
    })
  }

  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const body = await readBody<CheckoutRequest>(event)

  // Determine which price to use
  let priceId = body.priceId
  if (!priceId && body.interval) {
    priceId = body.interval === 'year' ? STRIPE_PRICES.pro_yearly : STRIPE_PRICES.pro_monthly
  }
  if (!priceId) {
    priceId = STRIPE_PRICES.pro_monthly
  }

  if (!priceId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No price ID configured. Please set STRIPE_PRICE_PRO_MONTHLY or STRIPE_PRICE_PRO_YEARLY.'
    })
  }

  const supabase = await serverSupabaseClient(event)

  // Check if user already has a Stripe customer ID
  const { data: subscription } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  let customerId = subscription?.stripe_customer_id

  // If no customer exists, create one
  if (!customerId) {
    // Get user email from auth
    const userEmail = authUser?.email

    const customer = await stripe.customers.create({
      email: userEmail || undefined,
      metadata: {
        supabase_user_id: userId
      }
    })
    customerId = customer.id

    // Store the customer ID (create or update subscription record)
    if (subscription) {
      await (supabase as any)
        .from('subscriptions')
        .update({ stripe_customer_id: customerId })
        .eq('user_id', userId)
    } else {
      await (supabase as any)
        .from('subscriptions')
        .insert({
          user_id: userId,
          stripe_customer_id: customerId,
          plan_tier: 'free',
          status: 'active'
        })
    }
  }

  // Get the host for redirect URLs
  const host = getHeader(event, 'host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    success_url: `${baseUrl}/billing?success=true`,
    cancel_url: `${baseUrl}/billing?canceled=true`,
    subscription_data: {
      metadata: {
        supabase_user_id: userId
      }
    },
    allow_promotion_codes: true
  })

  return {
    url: session.url
  }
})

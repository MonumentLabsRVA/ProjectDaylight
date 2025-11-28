import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { getStripe } from '../../utils/stripe'

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

  const supabase = await serverSupabaseClient(event)

  // Get user's Stripe customer ID
  const { data: subscription } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!subscription?.stripe_customer_id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No billing account found. Please subscribe first.'
    })
  }

  // Get the host for redirect URL
  const host = getHeader(event, 'host')
  const protocol = host?.includes('localhost') ? 'http' : 'https'
  const baseUrl = `${protocol}://${host}`

  // Create Stripe Customer Portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${baseUrl}/billing`
  })

  return {
    url: session.url
  }
})

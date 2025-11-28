// Stripe client - dynamically imported to handle when package isn't installed
let stripeInstance: any = null
let stripeInitialized = false

// Price IDs - set these in your environment or define here after creating products in Stripe
export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || ''
}

// Webhook secret for verifying Stripe webhook signatures
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''

// Initialize Stripe lazily
async function initStripe() {
  if (stripeInitialized) return stripeInstance

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY

  if (!stripeSecretKey) {
    console.warn('[Stripe] STRIPE_SECRET_KEY not set - Stripe functionality will be disabled')
    stripeInitialized = true
    return null
  }

  try {
    const Stripe = (await import('stripe')).default
    stripeInstance = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia'
    })
    stripeInitialized = true
    return stripeInstance
  } catch (error) {
    console.warn('[Stripe] Failed to load stripe package - run npm install stripe')
    stripeInitialized = true
    return null
  }
}

// Get the Stripe instance (async)
export async function getStripe() {
  return await initStripe()
}

// Synchronous check if Stripe might be configured (doesn't guarantee package is installed)
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

// Calculate the plan tier from a Stripe price ID
export function getPlanTierFromPriceId(priceId: string): 'free' | 'pro' {
  if (priceId === STRIPE_PRICES.pro_monthly || priceId === STRIPE_PRICES.pro_yearly) {
    return 'pro'
  }
  return 'free'
}

// Get billing interval from price ID
export function getBillingIntervalFromPriceId(priceId: string): 'month' | 'year' {
  if (priceId === STRIPE_PRICES.pro_yearly) {
    return 'year'
  }
  return 'month'
}

import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Member {
  name: string
  username: string
  role: 'member' | 'owner'
  avatar: AvatarProps
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}

export type EventType = 'positive' | 'incident' | 'medical' | 'school' | 'communication' | 'legal'

export interface TimelineEvent {
  id: string
  timestamp: string
  type: EventType
  title: string
  description: string
  participants: string[]
  location?: string
  evidenceIds?: string[]
}

export type EvidenceSourceType = 'text' | 'email' | 'photo' | 'document'

export interface EvidenceItem {
  id: string
  sourceType: EvidenceSourceType
  originalName: string
  createdAt: string
  summary: string
  tags: string[]
  storagePath?: string
  mimeType?: string
}

export interface InsightItem {
  id: number
  query: string
  response: string
  createdAt: string
  evidenceIds: number[]
}

export type ExportFocus = 'full-timeline' | 'incidents-only' | 'positive-parenting'

// Billing / Subscription types (Stripe-ready structure)
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'
export type PlanTier = 'free' | 'alpha' | 'starter' | 'pro' | 'enterprise'
export type BillingInterval = 'month' | 'year'

export interface PricingPlan {
  id: string
  tier: PlanTier
  name: string
  description: string
  priceMonthly: number
  priceYearly: number
  features: string[]
  highlighted?: boolean
  comingSoon?: boolean // Plan is not yet available for purchase
  stripePriceIdMonthly?: string // Will be set when Stripe is integrated
  stripePriceIdYearly?: string
}

export interface Subscription {
  id: string
  userId: string
  status: SubscriptionStatus
  planTier: PlanTier
  billingInterval: BillingInterval
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
  createdAt: string
  updatedAt: string
}

export interface BillingInfo {
  subscription: Subscription | null
  plans: PricingPlan[]
  stripeConfigured?: boolean
}

export interface CreateSubscriptionPayload {
  planTier: PlanTier
  billingInterval: BillingInterval
}

export interface UpdateSubscriptionPayload {
  planTier?: PlanTier
  billingInterval?: BillingInterval
  cancelAtPeriodEnd?: boolean
}

export interface ExportMetadata {
  case_title?: string
  court_name?: string
  recipient?: string
  overview_notes?: string
  include_evidence_index?: boolean
  include_overview?: boolean
  include_ai_summary?: boolean
  events_count?: number
  evidence_count?: number
  ai_summary_included?: boolean
}

export interface SavedExport {
  id: string
  title: string
  markdown_content?: string
  focus: ExportFocus
  metadata: ExportMetadata
  created_at: string
  updated_at: string
}

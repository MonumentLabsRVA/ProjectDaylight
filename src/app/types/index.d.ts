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

// New extraction-focused event types used by the AI extraction system.
// These are more granular and custody-specific than the legacy UI types.
export type ExtractionEventType =
  | 'parenting_time'
  | 'caregiving'
  | 'household'
  | 'coparent_conflict'
  | 'gatekeeping'
  | 'communication'
  | 'medical'
  | 'school'
  | 'legal'

export interface TimelineEvent {
  id: string
  timestamp: string
  type: EventType
  /**
   * Granular extraction-focused event type written by the AI extraction system.
   * When present, this should be used for UI labels, icons, and filtering.
   * Falls back to a mapping from the legacy `type` when missing.
   */
  extractionType?: ExtractionEventType | null
  title: string
  description: string
  participants: string[]
  location?: string
  evidenceIds?: string[]
}

export interface TimelineMessage {
  id: string
  timestamp: string         // sent_at
  sender: string
  recipient: string
  subject: string | null
  bodyPreview: string       // first 240 chars
  threadId: string | null
  messageNumber: number | null
  evidenceId: string        // back to the source PDF
}

export type TimelineItem =
  | ({ kind: 'event' } & TimelineEvent)
  | ({ kind: 'message' } & TimelineMessage)

export type EvidenceSourceType = 'text' | 'email' | 'photo' | 'document' | 'ofw_export'

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

// Structured welfare impact used in AI extraction
export type WelfareImpactCategory =
  | 'routine'
  | 'emotional'
  | 'medical'
  | 'educational'
  | 'social'
  | 'safety'
  | 'none'

export type WelfareImpactDirection = 'positive' | 'negative' | 'neutral'
export type WelfareImpactSeverity = 'minimal' | 'moderate' | 'significant'

export interface WelfareImpact {
  category: WelfareImpactCategory
  direction: WelfareImpactDirection
  severity: WelfareImpactSeverity | null
}

export interface ChildStatement {
  statement: string
  context: string
  concerning: boolean
}

export type CoparentTone = 'neutral' | 'cooperative' | 'defensive' | 'hostile'

export interface CoparentInteraction {
  your_tone: CoparentTone | null
  their_tone: CoparentTone | null
  your_response_appropriate: boolean | null
}

export interface InsightItem {
  id: number
  query: string
  response: string
  createdAt: string
  evidenceIds: number[]
}

export type ExportFocus = 'full-timeline' | 'incidents-only' | 'positive-parenting' | 'complete-record'

// Background job types
// `pending_confirmation` is used by ofw-ingest to pause for user input when an
// upload's thread set drifts >50% from the case's existing threads.
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'pending_confirmation'
export type JobType = 'journal_extraction' | 'evidence_processing' | 'ofw_ingest'

export interface JobResultSummary {
  events_created: number
  evidence_processed: number
  action_items_created: number
  event_ids: string[]
}

export interface Job {
  id: string
  user_id: string
  type: JobType
  status: JobStatus
  journal_entry_id: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  result_summary: JobResultSummary | null
  created_at: string
  updated_at: string
}

// API response types
export interface JournalSubmitResponse {
  journalEntryId: string
  jobId: string
  message: string
}

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
  include_messages?: boolean
  events_count?: number
  evidence_count?: number
  messages_count?: number
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

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
}

export interface InsightItem {
  id: number
  query: string
  response: string
  createdAt: string
  evidenceIds: number[]
}

export type ExportStatus = 'pending' | 'completed' | 'failed'

export interface ExportPreset {
  id: string
  label: string
  description: string
  range: string
}

export interface ExportJob {
  id: string
  presetId: string
  label: string
  status: ExportStatus
  createdAt: string
  readyAt?: string
  downloadUrl?: string
}

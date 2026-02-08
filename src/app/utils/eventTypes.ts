import type { ExtractionEventType } from '~/types'

export type ExtractionEventColor = 'success' | 'error' | 'info' | 'warning' | 'neutral' | 'primary'

export interface ExtractionTypeOption {
  value: ExtractionEventType
  label: string
  icon: string
  color: ExtractionEventColor
}

/**
 * Canonical list of extraction event type options.
 * Single source of truth for icons, colors, and labels across the app.
 */
export const extractionTypeOptions: ExtractionTypeOption[] = [
  {
    value: 'parenting_time',
    label: 'Parenting Time',
    icon: 'i-lucide-calendar-heart',
    color: 'primary'
  },
  {
    value: 'caregiving',
    label: 'Caregiving',
    icon: 'i-lucide-heart-handshake',
    color: 'success'
  },
  {
    value: 'household',
    label: 'Household / Chores',
    icon: 'i-lucide-home',
    color: 'neutral'
  },
  {
    value: 'coparent_conflict',
    label: 'Co-parent Conflict',
    icon: 'i-lucide-swords',
    color: 'error'
  },
  {
    value: 'gatekeeping',
    label: 'Gatekeeping',
    icon: 'i-lucide-shield-ban',
    color: 'warning'
  },
  {
    value: 'medical',
    label: 'Medical',
    icon: 'i-lucide-stethoscope',
    color: 'info'
  },
  {
    value: 'school',
    label: 'School',
    icon: 'i-lucide-graduation-cap',
    color: 'warning'
  },
  {
    value: 'communication',
    label: 'Communication',
    icon: 'i-lucide-message-circle',
    color: 'primary'
  },
  {
    value: 'legal',
    label: 'Legal / Court',
    icon: 'i-lucide-gavel',
    color: 'neutral'
  }
]

/** Quick lookup: extraction type -> icon class */
export const extractionTypeIcons: Record<ExtractionEventType, string> = Object.fromEntries(
  extractionTypeOptions.map(o => [o.value, o.icon])
) as Record<ExtractionEventType, string>

/** Quick lookup: extraction type -> color */
export const extractionTypeColors: Record<ExtractionEventType, ExtractionEventColor> = Object.fromEntries(
  extractionTypeOptions.map(o => [o.value, o.color])
) as Record<ExtractionEventType, ExtractionEventColor>

/** Quick lookup: extraction type -> human-readable label */
export const extractionTypeLabels: Record<ExtractionEventType, string> = Object.fromEntries(
  extractionTypeOptions.map(o => [o.value, o.label])
) as Record<ExtractionEventType, string>

/** Format an extraction event type to a human-readable string */
export function formatExtractionEventType(type: ExtractionEventType): string {
  return extractionTypeLabels[type] || type
}

/** Get icon for an extraction event type */
export function getExtractionTypeIcon(type: ExtractionEventType): string {
  return extractionTypeIcons[type] || 'i-lucide-circle'
}

/** Get color for an extraction event type */
export function getExtractionTypeColor(type: ExtractionEventType): ExtractionEventColor {
  return extractionTypeColors[type] || 'neutral'
}

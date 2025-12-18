export interface StateGuidance {
  state: string
  statute: string
  standard: string
  keyFactors: string[]
  promptGuidance: string
}

export const STATE_CUSTODY_GUIDANCE: Record<string, StateGuidance> = {
  Virginia: {
    state: 'Virginia',
    statute: 'VA Code § 20-124.3',
    standard: 'best interests of the child',
    keyFactors: [
      "Each parent's role in caregiving (who handles daily care, medical appointments, school)",
      "Willingness to support the child's relationship with the other parent (including avoiding unreasonable denial of access or visitation)",
      'Ability to maintain a close and continuing relationship with the child',
      "Child's reasonable preference (if of appropriate age and maturity)",
      'History of family abuse or violence',
      "Each parent's ability to resolve disputes and cooperate in matters affecting the child",
      "Propensity of each parent to support the child's contact and relationship with the other parent"
    ],
    promptGuidance: `Virginia courts apply the "best interests of the child" standard under VA Code § 20-124.3.
Key factors weighted heavily include:
- Each parent's role in daily caregiving (who handles meals, bedtime, medical care, school involvement)
- Willingness to support the child's relationship with the other parent (evidence of gatekeeping or unreasonable denial of access is damaging)
- Ability to maintain a close and continuing relationship with the child
- Each parent's ability to resolve disputes without unnecessary conflict
- History of family abuse or violence (if applicable)

Document events that speak to these specific factors. Juvenile & Domestic Relations (J&DR) courts look for patterns of behavior over time, not just isolated incidents.`
  },

  California: {
    state: 'California',
    statute: 'Family Code § 3011',
    standard: 'best interest of the child',
    keyFactors: [
      'Health, safety, and welfare of the child',
      'Any history of abuse by a parent or person seeking custody',
      'Nature and amount of contact with both parents',
      'Habitual or continual use of alcohol or controlled substances by a parent'
    ],
    promptGuidance: `California courts apply Family Code § 3011 for custody determinations.
Key considerations include:
- Health, safety, and welfare of the child
- Any history of abuse by a parent or person seeking custody
- The nature and amount of contact the child has with both parents
- Any habitual or continual abuse of alcohol or use of controlled substances by either parent

Document events related to these factors specifically, especially anything that affects safety, stability, and the quality of the child's relationship with each parent.`
  },

  // Default/generic guidance when state is unknown or not yet implemented
  _default: {
    state: 'Unknown',
    statute: 'General family law principles',
    standard: 'best interests of the child',
    keyFactors: [
      "Each parent's caregiving role",
      'Stability and continuity in the child\'s life',
      "Parents' ability to co-parent and communicate effectively",
      "Child's physical and emotional needs and, when appropriate, preferences"
    ],
    promptGuidance: `Courts generally apply a "best interests of the child" standard.
Common factors include:
- Each parent's role in caregiving and meeting the child's daily needs
- Stability and continuity in the child's routines and living situation
- Parents' ability to co-parent effectively and support the child's relationship with the other parent
- Child's physical and emotional needs and, when appropriate, the child's expressed preferences

Document events that demonstrate your involvement and any concerning behaviors by the other party, with clear, factual descriptions.`
  }
}

const DEFAULT_KEY = '_default' as const

export function getStateGuidance(jurisdictionState: string | null | undefined): StateGuidance {
  if (!jurisdictionState) {
    return STATE_CUSTODY_GUIDANCE[DEFAULT_KEY]
  }

  const normalized = normalizeStateName(jurisdictionState)

  return STATE_CUSTODY_GUIDANCE[normalized] || STATE_CUSTODY_GUIDANCE[DEFAULT_KEY]
}

export function normalizeStateName(input: string): string {
  const abbrevMap: Record<string, string> = {
    VA: 'Virginia',
    CA: 'California',
    TX: 'Texas',
    NY: 'New York',
    FL: 'Florida',
    PA: 'Pennsylvania'
  }

  const trimmed = input.trim()
  const upper = trimmed.toUpperCase()

  if (abbrevMap[upper]) {
    return abbrevMap[upper]
  }

  // Title case the input for full state names
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

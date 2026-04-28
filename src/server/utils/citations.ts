import type { UIMessage } from 'ai'

export type CitationKind = 'event' | 'message' | 'journal'

export interface CitationToken {
  kind: CitationKind
  id: string
  raw: string
}

const TOKEN_PATTERN = /\[(event|message|journal):([0-9a-f-]{8,})\]/gi

const STRIPPED_NOTICE = '[citation removed: source not in retrieved context]'

/**
 * Extract every [type:id] citation token from a string.
 */
export function extractCitations(text: string): CitationToken[] {
  const tokens: CitationToken[] = []
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    tokens.push({
      kind: match[1]!.toLowerCase() as CitationKind,
      id: match[2]!.toLowerCase(),
      raw: match[0]!
    })
  }
  return tokens
}

/**
 * Replace any citation token whose id is not in `validIds` with a strip notice.
 * Anti-hallucination guardrail: agents will sometimes fabricate ids when they
 * "remember" a tool result they never actually got.
 */
export function stripUnknownCitations(text: string, validIds: Set<string>): string {
  return text.replace(TOKEN_PATTERN, (raw, _kind, id) => {
    return validIds.has(String(id).toLowerCase()) ? raw : STRIPPED_NOTICE
  })
}

/**
 * Walk a UIMessage's parts and rewrite every text part to drop hallucinated
 * citations. Returns the cleaned message; the original is not mutated.
 */
export function sanitizeMessageCitations(message: UIMessage, validIds: Set<string>): UIMessage {
  const parts = message.parts.map((part) => {
    if (part.type === 'text' && typeof (part as { text?: string }).text === 'string') {
      const text = (part as { text: string }).text
      const cleaned = stripUnknownCitations(text, validIds)
      if (cleaned === text) return part
      return { ...part, text: cleaned }
    }
    return part
  })

  return { ...message, parts } as UIMessage
}

/**
 * Collect every record id that the agent's tools surfaced during a turn.
 * The streaming endpoint accumulates these as tool calls finish, then passes
 * the set to sanitizeMessageCitations before persistence.
 */
export class CitationRegistry {
  private readonly ids = new Set<string>()

  record(id: string | null | undefined) {
    if (id) this.ids.add(String(id).toLowerCase())
  }

  recordMany(ids: ReadonlyArray<string | null | undefined>) {
    for (const id of ids) this.record(id)
  }

  /**
   * Walk a tool result object and pull every plausible id field. Most of our
   * tool outputs return arrays of records with `id` fields; this catches them
   * without each tool having to register manually.
   */
  recordFromOutput(output: unknown) {
    if (output === null || output === undefined) return
    if (Array.isArray(output)) {
      for (const item of output) this.recordFromOutput(item)
      return
    }
    if (typeof output === 'object') {
      for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
        if (key === 'id' && typeof value === 'string') {
          this.record(value)
        } else if (Array.isArray(value) || typeof value === 'object') {
          this.recordFromOutput(value)
        }
      }
    }
  }

  asSet(): Set<string> {
    return new Set(this.ids)
  }
}

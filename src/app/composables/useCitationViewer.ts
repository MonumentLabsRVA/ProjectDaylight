export type CitationKind = 'event' | 'message' | 'journal'

export interface CitationTarget {
  kind: CitationKind
  id: string
}

/**
 * Page-level singleton for the citation viewer slideover. MessageContent
 * components call `open()` from anywhere in the chat; the slideover lives
 * once at the page root.
 */
export function useCitationViewer() {
  const target = useState<CitationTarget | null>('citation-viewer-target', () => null)
  const open = useState<boolean>('citation-viewer-open', () => false)

  function show(t: CitationTarget) {
    target.value = t
    open.value = true
  }

  function close() {
    open.value = false
  }

  return { target, open, show, close }
}

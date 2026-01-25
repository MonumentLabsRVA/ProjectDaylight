export interface JournalEntryDetail {
  id: string
  eventText: string | null
  referenceDate: string | null
  referenceTimeDescription: string | null
  status: 'draft' | 'processing' | 'review' | 'completed' | 'cancelled' | 'failed'
  extractionRaw: any | null
  processingError: string | null
  createdAt: string
  updatedAt: string
  processedAt: string | null
  completedAt: string | null
  evidence: Array<{
    id: string
    sourceType: string
    storagePath: string | null
    originalFilename: string | null
    mimeType: string | null
    summary: string | null
    tags: string[]
    userAnnotation: string | null
    extractionRaw: any | null
    sortOrder: number
    isProcessed: boolean
    processedAt: string | null
  }>
  events: Array<{
    id: string
    type: string
    title: string | null
    description: string | null
    primaryTimestamp: string | null
  }>
}


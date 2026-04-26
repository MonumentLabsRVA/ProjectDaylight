import type { jsPDF } from 'jspdf'

// ─── Types ───────────────────────────────────────────────

export interface PdfEvent {
  title: string
  timestamp: string
  type: string
  description?: string
  location?: string
  participants?: string[]
  durationMinutes?: number
  evidenceSummary?: string | null
  safetyConcern?: boolean
  agreementViolation?: boolean
  childInvolved?: boolean
  coparentInteraction?: {
    your_tone?: string
    their_tone?: string
    your_response_appropriate?: boolean | null
  } | null
  childStatements?: Array<{ statement: string; context?: string; concerning?: boolean }>
  welfareCategory?: string | null
  welfareDirection?: string | null
  welfareSeverity?: string | null
  evidenceDetails?: Array<{
    id: string
    sourceType: string
    originalName?: string
    summary?: string
  }>
  actionItems?: Array<{
    priority: string
    type: string
    description: string
    deadline?: string
    status: string
  }>
  communications?: Array<{
    medium: string
    direction: string
    subject?: string
    summary: string
    sentAt?: string
  }>
}

export interface PdfExportOptions {
  caseTitle?: string
  courtName?: string
  recipient?: string
  overviewNotes?: string | null
  events: PdfEvent[]
  isCompleteRecord?: boolean
  aiSummary?: string | null
}

// ─── Design tokens ───────────────────────────────────────

const COLORS = {
  primary: [14, 76, 110] as const, // sky-900 — a lawyerly deep blue
  title: [15, 23, 42] as const, // slate-900
  body: [30, 41, 59] as const, // slate-800
  secondary: [100, 116, 139] as const, // slate-500
  muted: [148, 163, 184] as const, // slate-400
  rule: [203, 213, 225] as const, // slate-300
  ruleLight: [226, 232, 240] as const, // slate-200
  flag: [153, 27, 27] as const, // red-900
  flagBg: [254, 242, 242] as const, // red-50 approx
  white: [255, 255, 255] as const,
  labelBg: [241, 245, 249] as const, // slate-100
}

const MARGIN = 60
const FOOTER_HEIGHT = 44

// ─── Helpers ─────────────────────────────────────────────

function formatDate(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFullDate(value?: string) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

class PdfWriter {
  doc: jsPDF
  y: number
  pageWidth: number
  pageHeight: number
  contentWidth: number
  usableBottom: number

  constructor(doc: jsPDF) {
    this.doc = doc
    this.y = MARGIN
    this.pageWidth = doc.internal.pageSize.getWidth()
    this.pageHeight = doc.internal.pageSize.getHeight()
    this.contentWidth = this.pageWidth - MARGIN * 2
    this.usableBottom = this.pageHeight - MARGIN - FOOTER_HEIGHT
  }

  ensureSpace(height: number) {
    if (this.y + height > this.usableBottom) {
      this.doc.addPage()
      this.y = MARGIN
    }
  }

  gap(pts: number) {
    this.y += pts
  }

  rule(color: readonly [number, number, number] = COLORS.ruleLight, width = 0.5) {
    this.doc.setDrawColor(...color)
    this.doc.setLineWidth(width)
    this.doc.line(MARGIN, this.y, this.pageWidth - MARGIN, this.y)
    this.y += 1
  }

  text(
    str: string,
    opts: {
      font?: string
      style?: string
      size?: number
      color?: readonly [number, number, number]
      maxWidth?: number
      x?: number
      lineHeight?: number
    } = {},
  ) {
    const {
      font = 'times',
      style = 'normal',
      size = 10,
      color = COLORS.body,
      maxWidth = this.contentWidth,
      x = MARGIN,
      lineHeight = size * 1.45,
    } = opts

    this.doc.setFont(font, style)
    this.doc.setFontSize(size)
    this.doc.setTextColor(...color)
    const lines = this.doc.splitTextToSize(str, maxWidth) as string[]

    for (const line of lines) {
      this.ensureSpace(lineHeight)
      this.doc.text(line, x, this.y)
      this.y += lineHeight
    }
  }

  metaRow(label: string, value: string) {
    const labelWidth = 90
    this.ensureSpace(14)

    this.doc.setFont('helvetica', 'bold')
    this.doc.setFontSize(8.5)
    this.doc.setTextColor(...COLORS.secondary)
    this.doc.text(label.toUpperCase(), MARGIN, this.y)

    this.doc.setFont('times', 'normal')
    this.doc.setFontSize(10)
    this.doc.setTextColor(...COLORS.body)
    this.doc.text(value, MARGIN + labelWidth, this.y)
    this.y += 15
  }

  sectionHeading(title: string) {
    this.ensureSpace(50)
    this.y += 8

    this.doc.setFont('times', 'bold')
    this.doc.setFontSize(15)
    this.doc.setTextColor(...COLORS.primary)
    this.doc.text(title, MARGIN, this.y)
    this.y += 6
    this.doc.setDrawColor(...COLORS.primary)
    this.doc.setLineWidth(1.5)
    this.doc.line(MARGIN, this.y, MARGIN + this.doc.getTextWidth(title), this.y)
    this.y += 16
  }

  addFooters() {
    const pages = this.doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      this.doc.setPage(i)
      const footerY = this.pageHeight - MARGIN + 8

      this.doc.setDrawColor(...COLORS.ruleLight)
      this.doc.setLineWidth(0.4)
      this.doc.line(MARGIN, footerY - 14, this.pageWidth - MARGIN, footerY - 14)

      this.doc.setFont('helvetica', 'normal')
      this.doc.setFontSize(7.5)
      this.doc.setTextColor(...COLORS.muted)
      this.doc.text('daylight.legal', MARGIN, footerY)

      const pageStr = `Page ${i} of ${pages}`
      const w = this.doc.getTextWidth(pageStr)
      this.doc.text(pageStr, this.pageWidth - MARGIN - w, footerY)
    }
  }
}

// ─── Main export: structured data → PDF ──────────────────

export async function generateExportPdf(options: PdfExportOptions) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const w = new PdfWriter(doc)

  // ─── Title ───
  w.text(
    options.isCompleteRecord ? 'Complete Case Record' : 'Case Timeline Report',
    { font: 'times', style: 'bold', size: 22, color: COLORS.title },
  )
  w.gap(4)
  w.doc.setDrawColor(...COLORS.primary)
  w.doc.setLineWidth(2)
  w.doc.line(MARGIN, w.y, MARGIN + 120, w.y)
  w.gap(18)

  // ─── Meta block ───
  if (options.caseTitle) w.metaRow('Case', options.caseTitle)
  if (options.courtName) w.metaRow('Court', options.courtName)
  if (options.recipient) w.metaRow('Prepared for', options.recipient)
  w.metaRow('Generated', new Date().toLocaleString())
  if (options.isCompleteRecord) {
    w.metaRow('Total events', String(options.events.length))
  }

  w.gap(8)
  w.rule(COLORS.rule, 0.6)
  w.gap(12)

  // ─── AI Summary ───
  if (options.aiSummary) {
    w.sectionHeading('Executive Summary')
    w.text(options.aiSummary, { size: 10, color: COLORS.body, lineHeight: 15 })
    w.gap(12)
    w.rule()
    w.gap(12)
  }

  // ─── Overview ───
  if (options.overviewNotes) {
    w.sectionHeading('Overview')
    w.text(options.overviewNotes, { size: 10, color: COLORS.body, lineHeight: 15 })
    w.gap(12)
    w.rule()
    w.gap(12)
  }

  // ─── Events ───
  w.sectionHeading(options.isCompleteRecord ? 'Events' : 'Timeline')

  if (!options.events.length) {
    w.text('No events recorded.', {
      font: 'times',
      style: 'italic',
      size: 10,
      color: COLORS.muted,
    })
  } else if (options.isCompleteRecord) {
    renderFullEvents(w, options.events)
  } else {
    renderTimelineEvents(w, options.events)
  }

  // ─── Footer ───
  w.addFooters()

  doc.save('daylight-report.pdf')
}

// ─── Timeline (summary) events ───────────────────────────

function renderTimelineEvents(w: PdfWriter, events: PdfEvent[]) {
  const indent = 24

  events.forEach((event, idx) => {
    const descLines = event.description
      ? (w.doc.splitTextToSize(event.description, w.contentWidth - indent) as string[]).length
      : 0
    const estHeight = 36 + descLines * 14
    w.ensureSpace(Math.min(estHeight, 120))

    // Number
    w.doc.setFont('helvetica', 'bold')
    w.doc.setFontSize(9)
    w.doc.setTextColor(...COLORS.secondary)
    w.doc.text(`${idx + 1}`, MARGIN, w.y)

    // Title
    w.doc.setFont('times', 'bold')
    w.doc.setFontSize(11)
    w.doc.setTextColor(...COLORS.title)
    const titleLines = w.doc.splitTextToSize(event.title, w.contentWidth - indent - 10) as string[]
    w.doc.text(titleLines, MARGIN + indent, w.y)
    w.y += titleLines.length * 14

    // Meta line: date | type | location | participants
    const meta: string[] = [formatDate(event.timestamp)]
    if (event.type) meta.push(event.type)
    if (event.location) meta.push(event.location)
    if (event.participants?.length) meta.push(event.participants.join(', '))
    if (event.evidenceSummary) meta.push(event.evidenceSummary)

    w.doc.setFont('helvetica', 'normal')
    w.doc.setFontSize(8)
    w.doc.setTextColor(...COLORS.secondary)
    const metaStr = meta.join('  \u00B7  ')
    const metaLines = w.doc.splitTextToSize(metaStr, w.contentWidth - indent) as string[]
    w.doc.text(metaLines, MARGIN + indent, w.y)
    w.y += metaLines.length * 11

    // Flags
    const flags: string[] = []
    if (event.safetyConcern) flags.push('SAFETY CONCERN')
    if (event.agreementViolation) flags.push('AGREEMENT VIOLATION')
    if (event.childInvolved) flags.push('CHILD INVOLVED')
    if (flags.length) {
      w.gap(2)
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(7)
      w.doc.setTextColor(...COLORS.flag)
      w.doc.text(flags.join('     '), MARGIN + indent, w.y)
      w.y += 10
    }

    // Description
    if (event.description) {
      w.gap(4)
      w.text(event.description, {
        size: 9.5,
        color: COLORS.body,
        maxWidth: w.contentWidth - indent,
        x: MARGIN + indent,
        lineHeight: 13.5,
      })
    }

    w.gap(10)

    // Light separator between events (not after last)
    if (idx < events.length - 1) {
      w.doc.setDrawColor(...COLORS.ruleLight)
      w.doc.setLineWidth(0.3)
      w.doc.line(MARGIN + indent, w.y, w.pageWidth - MARGIN, w.y)
      w.gap(12)
    }
  })
}

// ─── Full (complete record) events ───────────────────────

function renderFullEvents(w: PdfWriter, events: PdfEvent[]) {
  const indent = 12

  events.forEach((event, idx) => {
    w.ensureSpace(80)

    // Event number + title
    w.doc.setFont('times', 'bold')
    w.doc.setFontSize(12)
    w.doc.setTextColor(...COLORS.title)
    const headerText = `${idx + 1}.  ${event.title}`
    const headerLines = w.doc.splitTextToSize(headerText, w.contentWidth) as string[]
    w.doc.text(headerLines, MARGIN, w.y)
    w.y += headerLines.length * 15

    // Date | type | location meta line
    const dateParts = [formatFullDate(event.timestamp), event.type]
    if (event.location) dateParts.push(event.location)
    if (event.participants?.length) dateParts.push(event.participants.join(', '))
    if (event.durationMinutes) dateParts.push(`${event.durationMinutes} min`)

    w.doc.setFont('helvetica', 'normal')
    w.doc.setFontSize(8)
    w.doc.setTextColor(...COLORS.secondary)
    const dateStr = dateParts.join('   |   ')
    const dateLines = w.doc.splitTextToSize(dateStr, w.contentWidth) as string[]
    w.doc.text(dateLines, MARGIN, w.y)
    w.y += dateLines.length * 11

    // Flags
    const flags: string[] = []
    if (event.safetyConcern) flags.push('SAFETY CONCERN')
    if (event.agreementViolation) flags.push('AGREEMENT VIOLATION')
    if (event.childInvolved) flags.push('CHILD INVOLVED')
    if (flags.length) {
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(7.5)
      w.doc.setTextColor(...COLORS.flag)
      w.doc.text(flags.join('     '), MARGIN, w.y)
      w.y += 11
    }

    w.gap(4)

    // Description
    if (event.description) {
      w.ensureSpace(24)
      w.text(event.description, {
        size: 10,
        color: COLORS.body,
        lineHeight: 13.5,
      })
      w.gap(4)
    }

    // Co-parent interaction
    if (event.coparentInteraction) {
      const ci = event.coparentInteraction
      const ciParts: string[] = []
      if (ci.your_tone) ciParts.push(`Your tone: ${ci.your_tone}`)
      if (ci.their_tone) ciParts.push(`Their tone: ${ci.their_tone}`)
      if (ci.your_response_appropriate !== null && ci.your_response_appropriate !== undefined) {
        ciParts.push(ci.your_response_appropriate ? 'Response appropriate' : 'Response could improve')
      }
      if (ciParts.length) {
        w.ensureSpace(26)
        w.doc.setFont('helvetica', 'bold')
        w.doc.setFontSize(8)
        w.doc.setTextColor(...COLORS.secondary)
        w.doc.text('Co-parent interaction', MARGIN + indent, w.y)
        w.y += 11
        w.doc.setFont('times', 'normal')
        w.doc.setFontSize(9)
        w.doc.setTextColor(...COLORS.body)
        w.doc.text(ciParts.join('   |   '), MARGIN + indent, w.y)
        w.y += 12
      }
    }

    // Child statements
    if (event.childStatements?.length) {
      w.ensureSpace(28)
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(8)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text('Child statements', MARGIN + indent, w.y)
      w.y += 11
      for (const s of event.childStatements) {
        w.ensureSpace(18)
        const concern = s.concerning ? '  [CONCERNING]' : ''
        const stmt = `\u201C${s.statement}\u201D${concern}`
        w.text(stmt, {
          font: 'times',
          style: 'italic',
          size: 9,
          color: COLORS.body,
          maxWidth: w.contentWidth - indent,
          x: MARGIN + indent,
          lineHeight: 11,
        })
        if (s.context) {
          w.text(`Context: ${s.context}`, {
            font: 'times',
            size: 8,
            color: COLORS.secondary,
            maxWidth: w.contentWidth - indent - 4,
            x: MARGIN + indent + 4,
            lineHeight: 10,
          })
        }
        w.gap(3)
      }
    }

    // Welfare impact
    if (event.welfareCategory || event.welfareDirection || event.welfareSeverity) {
      w.ensureSpace(16)
      const wParts: string[] = []
      if (event.welfareCategory) wParts.push(event.welfareCategory)
      if (event.welfareDirection) wParts.push(event.welfareDirection)
      if (event.welfareSeverity) wParts.push(`${event.welfareSeverity} severity`)
      w.doc.setFont('helvetica', 'normal')
      w.doc.setFontSize(8)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text(`Welfare impact: ${wParts.join(' / ')}`, MARGIN + indent, w.y)
      w.y += 11
    }

    // Evidence details
    if (event.evidenceDetails?.length) {
      w.ensureSpace(20)
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(8)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text('Evidence', MARGIN + indent, w.y)
      w.y += 11
      for (const e of event.evidenceDetails) {
        w.ensureSpace(12)
        const evidenceStr = `\u2022  ${e.originalName || 'Untitled'} (${e.sourceType})${e.summary ? ' \u2014 ' + e.summary : ''}`
        w.text(evidenceStr, {
          font: 'times',
          size: 9,
          color: COLORS.body,
          maxWidth: w.contentWidth - indent - 8,
          x: MARGIN + indent + 8,
          lineHeight: 11,
        })
      }
      w.gap(3)
    }

    // Action items
    if (event.actionItems?.length) {
      w.ensureSpace(20)
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(8)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text('Action items', MARGIN + indent, w.y)
      w.y += 11
      for (const a of event.actionItems) {
        w.ensureSpace(12)
        const deadline = a.deadline ? ` (due ${formatDate(a.deadline)})` : ''
        const actionStr = `\u2022  [${a.status}] ${a.description}${deadline} \u2014 ${a.priority} priority`
        w.text(actionStr, {
          font: 'times',
          size: 9,
          color: COLORS.body,
          maxWidth: w.contentWidth - indent - 8,
          x: MARGIN + indent + 8,
          lineHeight: 11,
        })
      }
      w.gap(3)
    }

    // Communications
    if (event.communications?.length) {
      w.ensureSpace(20)
      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(8)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text('Communications', MARGIN + indent, w.y)
      w.y += 11
      for (const c of event.communications) {
        w.ensureSpace(12)
        const when = c.sentAt ? ` on ${formatDate(c.sentAt)}` : ''
        const commStr = `\u2022  ${c.direction} ${c.medium}${when}: ${c.summary}`
        w.text(commStr, {
          font: 'times',
          size: 9,
          color: COLORS.body,
          maxWidth: w.contentWidth - indent - 8,
          x: MARGIN + indent + 8,
          lineHeight: 11,
        })
      }
      w.gap(3)
    }

    // Divider between events
    w.gap(8)
    w.rule(COLORS.ruleLight, 0.4)
    w.gap(14)
  })
}

// ─── Markdown → PDF (for saved exports) ──────────────────

export async function generateMarkdownPdf(markdown: string, filename: string) {
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const w = new PdfWriter(doc)

  const rawLines = markdown.split('\n')
  let lastWasHeading = false
  let lastWasBlank = false

  for (const raw of rawLines) {
    const line = raw.trimEnd()

    // Blank line
    if (!line.trim()) {
      if (!lastWasBlank && !lastWasHeading) w.gap(10)
      lastWasBlank = true
      continue
    }
    lastWasBlank = false

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (hMatch?.[1] && hMatch[2]) {
      const level = hMatch[1].length
      const text = stripInline(hMatch[2].trim())

      if (level === 1) {
        if (w.y > MARGIN + 10) w.gap(16)
        w.text(text, { font: 'times', style: 'bold', size: 22, color: COLORS.title })
        w.gap(4)
        w.doc.setDrawColor(...COLORS.primary)
        w.doc.setLineWidth(2)
        w.doc.line(MARGIN, w.y, MARGIN + 120, w.y)
        w.gap(16)
      } else if (level === 2) {
        w.sectionHeading(text)
      } else {
        if (w.y > MARGIN + 10) w.gap(10)
        w.text(text, { font: 'times', style: 'bold', size: 12, color: COLORS.title })
        w.gap(6)
      }

      lastWasHeading = true
      continue
    }
    lastWasHeading = false

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      w.gap(8)
      w.rule(COLORS.ruleLight, 0.6)
      w.gap(10)
      continue
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (olMatch?.[1] && olMatch[2]) {
      const num = olMatch[1]
      const text = stripInline(olMatch[2].trim())
      w.ensureSpace(18)

      w.doc.setFont('helvetica', 'bold')
      w.doc.setFontSize(8.5)
      w.doc.setTextColor(...COLORS.secondary)
      w.doc.text(`${num}`, MARGIN, w.y)

      w.text(text, {
        size: 10,
        maxWidth: w.contentWidth - 20,
        x: MARGIN + 20,
        lineHeight: 14,
      })
      w.gap(2)
      continue
    }

    // Sub-list item (indented with -)
    const subMatch = line.match(/^\s+[-*]\s+(.*)$/)
    if (subMatch?.[1]) {
      const text = stripInline(subMatch[1].trim())
      w.text(text, {
        font: 'times',
        size: 9.5,
        color: COLORS.body,
        maxWidth: w.contentWidth - 32,
        x: MARGIN + 32,
        lineHeight: 13,
      })
      w.gap(2)
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)$/)
    if (ulMatch?.[1]) {
      const text = stripInline(ulMatch[1].trim())
      w.ensureSpace(14)
      w.doc.setFillColor(...COLORS.secondary)
      w.doc.circle(MARGIN + 4, w.y - 3, 1.5, 'F')
      w.text(text, {
        size: 10,
        maxWidth: w.contentWidth - 16,
        x: MARGIN + 16,
        lineHeight: 14,
      })
      w.gap(2)
      continue
    }

    // Paragraph: detect bold/italic wrapping
    const isItalic =
      (line.trim().startsWith('_') && line.trim().endsWith('_')) ||
      (line.trim().startsWith('*') && line.trim().endsWith('*') && !line.trim().startsWith('**'))
    const isBold =
      (line.trim().startsWith('**') && line.trim().endsWith('**')) ||
      (line.trim().startsWith('__') && line.trim().endsWith('__'))

    // Check for "**Label:** value" pattern (metadata lines)
    const metaMatch = line.match(/^\*\*(.+?):\*\*\s*(.*)$/)
    if (metaMatch?.[1] && metaMatch[2]) {
      w.metaRow(metaMatch[1], metaMatch[2])
      continue
    }

    const cleaned = stripInline(line.trim())

    if (isItalic) {
      w.text(cleaned, { font: 'times', style: 'italic', size: 10, color: COLORS.secondary, lineHeight: 14 })
    } else if (isBold) {
      w.text(cleaned, { font: 'times', style: 'bold', size: 10, color: COLORS.title, lineHeight: 14 })
    } else {
      w.text(cleaned, { size: 10, lineHeight: 14 })
    }
    w.gap(2)
  }

  w.addFooters()

  const safeName = filename.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  doc.save(`${safeName}.pdf`)
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1')
}

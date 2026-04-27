/**
 * OFW (Our Family Wizard) Message Report PDF Parser
 *
 * Parses OFW "Message Report" PDFs into structured JSON.
 * Handles the thread-view format where each page shows the newest reply
 * at the top and full thread history below.
 *
 * Pipeline:
 *  1. Extract raw text from PDF via pdfjs-dist
 *  2. Clean: strip page headers, handle cross-page text duplication
 *  3. Parse all message headers (Sent/From/To/FirstViewed/Subject + body)
 *  4. Deduplicate by (sender, timestamp) keeping longest body
 *  5. Assign "Message X of Y" numbers to primary messages
 *  6. Group into threads by normalized subject
 *
 * Lifted verbatim from `Workspace/ofw-parser/server/utils/ofw-parser.ts`
 * (validated on a 1,271-message real case). Do not modify casually —
 * keep parity with the source so fixes flow back upstream.
 */

// ── Types ──

export interface OFWMessage {
  id: number
  messageNumber: number | null
  sent: string
  from: string
  to: string
  firstViewed: string | null
  subject: string
  body: string
  attachments?: string[]
  threadId: string | null
  wordCount: number
}

export interface OFWParseResult {
  metadata: {
    source: string
    extractedAt: string
    totalMessages: number
    reportExpected: number
    numberedMessages: number
    senders: string[]
    dateRange: { start: string; end: string }
    threadCount: number
  }
  messages: OFWMessage[]
}

// ── Regex patterns ──

// OFW exports vary by report settings: older/branded exports use "MM/DD/YYYY at h:mm AM",
// newer/header-stripped exports drop the literal "at". Accept both.
const SENT_RE = /^Sent:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2}\s+[AP]M)\s*$/
const FROM_RE = /^From:\s+(.+)$/
const TO_FV_RE = /^To:\s+(.+?)\(First Viewed:\s*(\d{2}\/\d{2}\/\d{4})\s+(?:at\s+)?(\d{1,2}:\d{2}\s+[AP]M)\)\s*$/
const TO_RE = /^To:\s+(.+)$/
const SUBJECT_RE = /^Subject:\s+(.*)$/
const PAGE_HDR_RE = /^\| Message Report Page \d+ of \d+$/
const MSG_MARKER_RE = /^Message (\d+) of (\d+)$/
const ATTACH_RE = /See Attachments:/
const PAGE_BREAK = '__PAGE_BREAK__'

// ── Internal types ──

interface ParsedHeader {
  sent: string
  from: string
  to: string
  firstViewed: string | null
  subject: string
  bodyLines: string[]
  attachments: string[]
  lineIndex: number
}

interface Message {
  sent: string
  from: string
  to: string
  firstViewed: string | null
  subject: string
  body: string
  attachments: string[]
  messageNumber: number | null
}

// ── Date parsing ──

function parseDate(dateStr: string, timeStr: string): string {
  const [month, day, year] = dateStr.split('/')
  const [rawTime, meridian] = timeStr.trim().split(' ')
  const [hStr, mStr] = rawTime!.split(':')
  let h = parseInt(hStr!, 10)
  const m = parseInt(mStr!, 10)
  if (meridian === 'PM' && h !== 12) h += 12
  if (meridian === 'AM' && h === 12) h = 0
  return `${year}-${month}-${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// ── Step 1: Extract raw text from PDF ──

export async function extractText(pdfData: Uint8Array): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true }).promise

  const lines: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''

    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round((item as { transform: number[] }).transform[5]!)
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        lines.push(line)
        line = ''
      }
      line += item.str
      lastY = y
    }
    if (line) lines.push(line)
    lines.push(PAGE_BREAK)
  }
  return lines.join('\n')
}

// ── Step 2: Clean text ──

function cleanText(raw: string): string[] {
  const lines = raw.split('\n')
  const out: string[] = []
  let lastContent: string | null = null
  let skipDups = 0

  for (const line of lines) {
    const t = line.trim()
    if (t === PAGE_BREAK) { skipDups = 2; continue }
    if (PAGE_HDR_RE.test(t)) continue
    if (skipDups > 0 && t) {
      if (lastContent && t === lastContent) { skipDups--; continue }
      skipDups = 0
    }
    out.push(line)
    if (t) lastContent = t
  }
  return out
}

// ── Step 3: Extract headers + bodies ──

function parseAttachments(line: string): string[] {
  const cleaned = line.replace(/See Attachments:\s*/g, '').replace(/\s*See Attachments:?/g, '').trim()
  if (!cleaned) return []
  return cleaned.split(',')
    .map(p => p.trim().replace(/\s*\(\d+\.?\d*\s*[KMGT]?B\)\s*$/i, '').trim())
    .filter(n => n.length > 0 && /\.\w{2,4}$/.test(n))
}

function extractHeaders(lines: string[]): ParsedHeader[] {
  const entries: ParsedHeader[] = []
  let i = 0

  while (i < lines.length) {
    const sentMatch = lines[i]!.trim().match(SENT_RE)
    if (!sentMatch) { i++; continue }
    const sent = parseDate(sentMatch[1]!, sentMatch[2]!)
    const start = i

    let j = i + 1
    while (j < lines.length && !lines[j]!.trim()) j++
    const fromMatch = lines[j]?.trim().match(FROM_RE)
    if (!fromMatch) { i++; continue }
    const from = fromMatch[1]!.trim()

    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    const toLine = lines[j]?.trim() || ''
    let to: string
    let firstViewed: string | null = null
    const toFvMatch = toLine.match(TO_FV_RE)
    if (toFvMatch) {
      to = toFvMatch[1]!.trim()
      firstViewed = parseDate(toFvMatch[2]!, toFvMatch[3]!)
    } else {
      const toMatch = toLine.match(TO_RE)
      if (!toMatch) { i++; continue }
      to = toMatch[1]!.trim()
    }

    j++
    while (j < lines.length && !lines[j]!.trim()) j++
    let subject = ''
    const subjLine = lines[j]?.trim() || ''
    const subjMatch = subjLine.match(SUBJECT_RE)
    if (subjMatch) { subject = subjMatch[1]?.trim() || ''; j++ }
    else if (/^Re:\s+/i.test(subjLine)) { subject = subjLine; j++ }

    const bodyLines: string[] = []
    const attachments: string[] = []
    while (j < lines.length) {
      const bt = lines[j]!.trim()
      if (SENT_RE.test(bt)) break
      if (MSG_MARKER_RE.test(bt)) { j++; break }
      if (ATTACH_RE.test(bt)) { attachments.push(...parseAttachments(bt)); j++; continue }
      if (bt === PAGE_BREAK) { j++; continue }
      if (!bodyLines.length && !bt) { j++; continue }
      if (!bodyLines.length && subject) {
        const sc = bt.replace(/^Subject:\s+/, '')
        if (sc === subject || bt === subject) { j++; continue }
      }
      bodyLines.push(lines[j]!)
      j++
    }
    while (bodyLines.length && !bodyLines.at(-1)!.trim()) bodyLines.pop()

    entries.push({ sent, from, to, firstViewed, subject, bodyLines, attachments, lineIndex: start })
    i = j
  }
  return entries
}

// ── Step 4: Deduplicate ──

function deduplicate(entries: ParsedHeader[]): Message[] {
  const map = new Map<string, Message>()
  for (const e of entries) {
    const body = e.bodyLines.join('\n').trim()
    const key = `${e.from}|${e.sent}`
    const prev = map.get(key)
    const msg: Message = {
      sent: e.sent, from: e.from, to: e.to, firstViewed: e.firstViewed,
      subject: e.subject || prev?.subject || '',
      body,
      attachments: e.attachments.length ? e.attachments : (prev?.attachments || []),
      messageNumber: null
    }
    if (!prev || body.length > prev.body.length) {
      if (!msg.subject && prev?.subject) msg.subject = prev.subject
      if (!msg.attachments.length && prev?.attachments?.length) msg.attachments = prev.attachments
      map.set(key, msg)
    } else {
      if (e.attachments.length && !prev.attachments.length) prev.attachments = e.attachments
      if (!prev.subject && e.subject) prev.subject = e.subject
    }
  }
  return Array.from(map.values())
}

// ── Step 5: Assign message numbers ──

function assignNumbers(lines: string[], messages: Message[]): number {
  const markers: { line: number; num: number; total: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.trim().match(MSG_MARKER_RE)
    if (m) markers.push({ line: i, num: +m[1]!, total: +m[2]! })
  }

  const lookup = new Map<string, Message>()
  for (const msg of messages) lookup.set(`${msg.from}|${msg.sent}`, msg)

  let total = 0
  for (let idx = 0; idx < markers.length; idx++) {
    const marker = markers[idx]!
    total = Math.max(total, marker.total)
    const regionStart = idx > 0 ? markers[idx - 1]!.line + 1 : 0
    const regionEnd = marker.line

    let newestTs = '', newestFrom = ''
    for (let k = regionStart; k < regionEnd; k++) {
      const sm = lines[k]!.trim().match(SENT_RE)
      if (!sm) continue
      const sent = parseDate(sm[1]!, sm[2]!)
      let from = ''
      for (let n = k + 1; n < regionEnd && n < k + 5; n++) {
        const fm = lines[n]!.trim().match(FROM_RE)
        if (fm) { from = fm[1]!.trim(); break }
      }
      if (sent > newestTs) { newestTs = sent; newestFrom = from }
    }

    if (newestFrom && newestTs) {
      const msg = lookup.get(`${newestFrom}|${newestTs}`)
      if (msg && msg.messageNumber === null) msg.messageNumber = marker.num
    }
  }
  return total
}

// ── Step 6: Thread grouping ──

function baseSubject(s: string): string {
  return s.replace(/^(Re:\s*)+/i, '').trim()
}

function slugify(s: string): string {
  return baseSubject(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
}

function buildThreads(messages: Message[]): Map<string, string> {
  const groups = new Map<string, Message[]>()
  for (const msg of messages) {
    const base = baseSubject(msg.subject).toLowerCase()
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base)!.push(msg)
  }

  const slugUsage = new Map<string, number>()
  const infos: { base: string; slug: string; oldest: string }[] = []
  for (const [base, msgs] of groups) {
    const slug = slugify(msgs[0]!.subject)
    const oldest = msgs.reduce((min, m) => m.sent < min ? m.sent : min, '￿')
    infos.push({ base, slug, oldest })
    slugUsage.set(slug, (slugUsage.get(slug) || 0) + 1)
  }
  infos.sort((a, b) => a.oldest.localeCompare(b.oldest))

  const baseToId = new Map<string, string>()
  const counter = new Map<string, number>()
  for (const info of infos) {
    const n = counter.get(info.slug) || 0
    counter.set(info.slug, n + 1)
    const needsSuffix = (slugUsage.get(info.slug) || 0) > 1
    baseToId.set(info.base, needsSuffix && n > 0 ? `${info.slug}-${n + 1}` : info.slug)
  }

  const result = new Map<string, string>()
  for (const msg of messages) {
    const key = `${msg.from}|${msg.sent}`
    const base = baseSubject(msg.subject).toLowerCase()
    result.set(key, baseToId.get(base) || slugify(msg.subject))
  }
  return result
}

// ── Public API ──

export async function parseOFWPdf(pdfData: Uint8Array, filename: string): Promise<OFWParseResult> {
  const raw = await extractText(pdfData)
  const lines = cleanText(raw)

  const headers = extractHeaders(lines)
  const messages = deduplicate(headers)
  messages.sort((a, b) => a.sent.localeCompare(b.sent))

  const expected = assignNumbers(lines, messages)
  const threads = buildThreads(messages)

  const output: OFWMessage[] = messages.map((msg, i) => ({
    id: i + 1,
    messageNumber: msg.messageNumber,
    sent: msg.sent,
    from: msg.from,
    to: msg.to,
    firstViewed: msg.firstViewed,
    subject: msg.subject,
    body: msg.body,
    attachments: msg.attachments.length ? msg.attachments : undefined,
    threadId: threads.get(`${msg.from}|${msg.sent}`) || null,
    wordCount: msg.body.split(/\s+/).filter(Boolean).length
  }))

  const senders = [...new Set(messages.map(m => m.from))]
  const times = messages.map(m => m.sent).sort()

  return {
    metadata: {
      source: filename,
      extractedAt: new Date().toISOString(),
      totalMessages: output.length,
      reportExpected: expected,
      numberedMessages: messages.filter(m => m.messageNumber !== null).length,
      senders,
      dateRange: { start: times[0]!, end: times.at(-1)! },
      threadCount: new Set(output.map(m => m.threadId)).size
    },
    messages: output
  }
}

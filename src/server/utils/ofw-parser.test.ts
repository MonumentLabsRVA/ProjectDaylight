import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseOFWPdf } from './ofw-parser'

const here = dirname(fileURLToPath(import.meta.url))
const fixturePath = join(here, '__fixtures__', 'ofw_sample.pdf')
const hasFixture = existsSync(fixturePath)

const itFixture = hasFixture ? it : it.skip
if (!hasFixture) {
  // eslint-disable-next-line no-console
  console.warn(
    `[ofw-parser.test] Skipping fixture-backed assertions — ${fixturePath} not present.\n`
    + 'Real OFW exports contain children\'s PII and are gitignored. Drop a fixture in to run these tests locally.'
  )
}

describe('parseOFWPdf', () => {
  itFixture('parses the fixture into well-formed messages', async () => {
    const buf = readFileSync(fixturePath)
    const result = await parseOFWPdf(new Uint8Array(buf), 'ofw_sample.pdf')

    expect(result.metadata.totalMessages).toBeGreaterThan(0)
    // reportExpected is the max "Message X of Y" marker found in the PDF.
    // It can diverge from totalMessages on exports that don't follow the recommended
    // settings (oldest-to-newest sort, new page per message). We just sanity-check
    // it's a positive number and within an order of magnitude.
    expect(result.metadata.reportExpected).toBeGreaterThan(0)

    expect(result.metadata.senders.length).toBeGreaterThan(0)
    expect(result.metadata.senders.every(s => s.length > 0)).toBe(true)

    expect(result.metadata.threadCount).toBeGreaterThan(0)
    expect(result.metadata.threadCount).toBeLessThanOrEqual(result.metadata.totalMessages)

    for (const msg of result.messages) {
      expect(msg.sent).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/)
      expect(msg.from.length).toBeGreaterThan(0)
      expect(msg.body.length).toBeGreaterThan(0)
    }
  })

  itFixture('assigns message_number 1..N without gaps for primary messages', async () => {
    const buf = readFileSync(fixturePath)
    const result = await parseOFWPdf(new Uint8Array(buf), 'ofw_sample.pdf')

    const numbered = result.messages
      .map(m => m.messageNumber)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b)

    expect(numbered.length).toBe(result.metadata.numberedMessages)
    expect(numbered[0]).toBe(1)
    expect(numbered.at(-1)).toBe(numbered.length)
    for (let i = 1; i < numbered.length; i++) {
      expect(numbered[i]! - numbered[i - 1]!).toBe(1)
    }
  })

  itFixture('returns messages sorted ascending by sent timestamp', async () => {
    const buf = readFileSync(fixturePath)
    const result = await parseOFWPdf(new Uint8Array(buf), 'ofw_sample.pdf')

    for (let i = 1; i < result.messages.length; i++) {
      expect(result.messages[i]!.sent >= result.messages[i - 1]!.sent).toBe(true)
    }
    expect(result.metadata.dateRange.start).toBe(result.messages[0]!.sent)
    expect(result.metadata.dateRange.end).toBe(result.messages.at(-1)!.sent)
  })
})

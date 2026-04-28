<script setup lang="ts">
import type { ToolUIPart, DynamicToolUIPart, UIMessage } from 'ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from 'ai'

const props = withDefaults(defineProps<{
  message: UIMessage
  collapsed?: boolean
}>(), {
  collapsed: false
})

type AnyToolPart = ToolUIPart | DynamicToolUIPart
const TERMINAL_STATES = ['output-available', 'output-error', 'output-denied']

function isAnyToolPart(part: { type: string }): boolean {
  return isToolUIPart(part as ToolUIPart) || part.type.startsWith('tool-')
}

function asToolPart(part: { type: string }): AnyToolPart {
  return part as AnyToolPart
}

function isPartStreaming(part: { state?: string }) {
  return part.state === 'streaming'
}

function isToolStreaming(part: AnyToolPart) {
  return !TERMINAL_STATES.includes(part.state)
}

function getToolDisplayText(part: AnyToolPart) {
  const name = getToolName(part)
  const streaming = isToolStreaming(part)
  const map: Record<string, [string, string]> = {
    search_events: ['Searching events…', 'Searched events'],
    get_event: ['Loading event…', 'Loaded event'],
    search_messages: ['Searching messages…', 'Searched messages'],
    get_message: ['Loading message…', 'Loaded message'],
    get_journal_entries: ['Searching journal…', 'Searched journal'],
    get_action_items: ['Listing action items…', 'Listed action items'],
    get_timeline_summary: ['Summarizing timeline…', 'Summarized timeline'],
    find_contradictions: ['Looking for related messages…', 'Surfaced candidates']
  }
  const entry = map[name]
  if (entry) return streaming ? entry[0] : entry[1]
  return streaming ? `Running ${name}…` : `Ran ${name}`
}

function getToolSuffix(part: AnyToolPart) {
  const input = part.input
  if (!input || typeof input !== 'object') return undefined
  const r = input as Record<string, unknown>
  if (typeof r.query === 'string') return r.query
  if (typeof r.id === 'string') return r.id
  if (typeof r.claim === 'string') return r.claim
  if (typeof r.sender === 'string') return r.sender
  if (typeof r.priority === 'string') return r.priority
  return undefined
}

function getToolIcon(part: AnyToolPart) {
  const name = getToolName(part)
  if (name === 'search_events' || name === 'get_event' || name === 'get_timeline_summary') return 'i-lucide-calendar-clock'
  if (name === 'search_messages' || name === 'get_message') return 'i-lucide-message-square-text'
  if (name === 'get_journal_entries') return 'i-lucide-book-open'
  if (name === 'get_action_items') return 'i-lucide-list-checks'
  if (name === 'find_contradictions') return 'i-lucide-search'
  return 'i-lucide-wrench'
}

function getToolOutputText(part: AnyToolPart) {
  if (part.state === 'output-error') return part.errorText
  if (part.state !== 'output-available' || part.output == null) return ''
  if (typeof part.output === 'string') return part.output
  return JSON.stringify(part.output, null, 2)
}

function isRenderablePart(part: { type: string }) {
  return part.type !== 'step-start' && part.type !== 'source-url'
}

const contentParts = computed(() => props.message.parts.filter(isRenderablePart))

const toolOpenOverrides = ref<Record<string, boolean>>({})
watch(() => props.collapsed, (now, was) => {
  if (now && !was) toolOpenOverrides.value = {}
})

function toolKey(i: number) {
  return `${props.message.id}-tool-${i}`
}
function getToolOpen(i: number): boolean | undefined {
  const k = toolKey(i)
  if (k in toolOpenOverrides.value) return toolOpenOverrides.value[k]
  if (props.collapsed) return false
  return undefined
}
function onToolToggle(i: number, value: boolean) {
  toolOpenOverrides.value[toolKey(i)] = value
}

/**
 * Convert [event:<id>], [message:<id>], [journal:<id>], [thread:<id>] tokens
 * in assistant markdown into inline links UEditor will render as <a> tags.
 * The container intercepts clicks and routes them through the citation
 * viewer slideover instead of letting the browser navigate. Scoped CSS
 * styles them as pills (see <style> block).
 */
const CITATION_RE = /\[(event|message|journal|thread):([0-9a-f-]{8,})\]/gi
const CITATION_LABELS: Record<string, string> = {
  event: 'event',
  message: 'message',
  journal: 'journal',
  thread: 'thread'
}

function citationPath(kind: string, id: string): string {
  if (kind === 'event') return `/event/${id}`
  if (kind === 'message') return `/messages/${id}`
  if (kind === 'journal') return `/journal/${id}`
  return `/messages?thread_citation=${id}`
}

function linkifyCitations(text: string): string {
  return text.replace(CITATION_RE, (_raw, kind: string, id: string) => {
    const k = kind.toLowerCase()
    const label = CITATION_LABELS[k] ?? k
    return `[${label}](${citationPath(k, id)}#cite=${k}:${id})`
  })
}

const { show: showCitation } = useCitationViewer()
const hoverState = useCitationHoverState()

function parseCiteHref(href: string | null): { kind: 'event' | 'message' | 'journal' | 'thread', id: string } | null {
  if (!href) return null
  const hashMatch = href.match(/#cite=(event|message|journal|thread):([0-9a-f-]{8,})/i)
  if (hashMatch) {
    return { kind: hashMatch[1]!.toLowerCase() as 'event' | 'message' | 'journal' | 'thread', id: hashMatch[2]! }
  }
  const eventMatch = href.match(/\/event\/([0-9a-f-]{8,})/i)
  if (eventMatch) return { kind: 'event', id: eventMatch[1]! }
  const msgMatch = href.match(/\/messages\/([0-9a-f-]{8,})/i)
  if (msgMatch) return { kind: 'message', id: msgMatch[1]! }
  const journalMatch = href.match(/\/journal\/([0-9a-f-]{8,})/i)
  if (journalMatch) return { kind: 'journal', id: journalMatch[1]! }
  return null
}

function onContainerClick(e: MouseEvent) {
  const a = (e.target as HTMLElement | null)?.closest('a')
  if (!a) return
  const cite = parseCiteHref(a.getAttribute('href'))
  if (!cite) return
  e.preventDefault()
  e.stopPropagation()
  hoverState.dismiss()
  showCitation({ kind: cite.kind, id: cite.id })
}

function onContainerMouseOver(e: MouseEvent) {
  const a = (e.target as HTMLElement | null)?.closest('a')
  if (!a) return
  const cite = parseCiteHref(a.getAttribute('href'))
  if (!cite) return
  hoverState.enterLink(cite.kind, cite.id, a.getBoundingClientRect())
}

function onContainerMouseOut(e: MouseEvent) {
  const a = (e.target as HTMLElement | null)?.closest('a')
  if (!a) return
  const cite = parseCiteHref(a.getAttribute('href'))
  if (!cite) return
  hoverState.leaveLink()
}
</script>

<template>
  <template
    v-for="(part, index) in contentParts"
    :key="`${message.id}-${part.type}-${index}`"
  >
    <UChatReasoning
      v-if="isReasoningUIPart(part)"
      :text="part.text"
      :streaming="isPartStreaming(part)"
      icon="i-lucide-brain"
      chevron="leading"
      :default-open="!collapsed"
    />

    <template v-else-if="isAnyToolPart(part)">
      <UChatTool
        :text="getToolDisplayText(asToolPart(part))"
        :suffix="getToolSuffix(asToolPart(part))"
        :streaming="isToolStreaming(asToolPart(part))"
        :icon="getToolIcon(asToolPart(part))"
        chevron="leading"
        :default-open="false"
        :open="getToolOpen(index)"
        @update:open="onToolToggle(index, $event)"
      >
        <pre
          v-if="getToolOutputText(asToolPart(part))"
          class="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-dimmed"
        >{{ getToolOutputText(asToolPart(part)) }}</pre>
      </UChatTool>
    </template>

    <template v-else-if="isTextUIPart(part)">
      <div
        v-if="message.role === 'assistant'"
        class="chat-citation-host"
        @click.capture="onContainerClick"
        @mouseover="onContainerMouseOver"
        @mouseout="onContainerMouseOut"
      >
        <UEditor
          :model-value="linkifyCitations(part.text)"
          content-type="markdown"
          :editable="false"
          class="min-h-0 border-0 bg-transparent p-0"
          :ui="{
            root: 'border-0 bg-transparent shadow-none ring-0',
            content: 'px-0 py-0 bg-transparent'
          }"
        />
      </div>
      <p
        v-else
        class="whitespace-pre-wrap"
      >
        {{ part.text }}
      </p>
    </template>
  </template>
</template>

<style scoped>
/* Tailwind v4 requires @reference in scoped Vue styles before @apply will
   resolve utility classes. Pointing at main.css picks up @nuxt/ui's primary
   palette (mapped from `primary: 'sky'` in app.config.ts). */
@reference "../../assets/css/main.css";

/* Render citation links as compact pills. UEditor produces plain <a> tags
   inside the markdown content; we identify ours by the #cite= fragment that
   linkifyCitations appends, then style via the kind in that fragment.
   Colors come from the Nuxt UI design tokens — the dark: variants flip the
   palette automatically. */
.chat-citation-host :deep(a[href*="#cite="]) {
  @apply inline-flex items-center gap-1 px-2 py-px mx-0.5 rounded-full text-xs font-medium leading-5 align-baseline whitespace-nowrap cursor-pointer border border-transparent no-underline transition-colors;
}
.chat-citation-host :deep(a[href*="#cite="]):hover {
  @apply no-underline;
}

/* Event / message / thread share the primary palette — they're all "case
   data" pointers and visually grouping them keeps prose readable. The
   leading icon (set via ::before) distinguishes the kinds. Journal keeps
   its own warm tone because it's a different shape of source: the user's
   own writing, not extracted records. */
.chat-citation-host :deep(a[href*="#cite=event"]),
.chat-citation-host :deep(a[href*="#cite=message"]),
.chat-citation-host :deep(a[href*="#cite=thread"]) {
  @apply bg-primary-100 text-primary-800 border-primary-300 dark:bg-primary-950 dark:text-primary-200 dark:border-primary-800;
}
.chat-citation-host :deep(a[href*="#cite=event"]):hover,
.chat-citation-host :deep(a[href*="#cite=message"]):hover,
.chat-citation-host :deep(a[href*="#cite=thread"]):hover {
  @apply bg-primary-200 border-primary-400 dark:bg-primary-900 dark:border-primary-700;
}

.chat-citation-host :deep(a[href*="#cite=journal"]) {
  @apply bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800;
}
.chat-citation-host :deep(a[href*="#cite=journal"]):hover {
  @apply bg-yellow-200 border-yellow-400 dark:bg-yellow-900 dark:border-yellow-700;
}

/* Tiny leading icon via ::before so we don't have to round-trip through
   markdown. Glyphs are unicode so they work without an icon font. */
.chat-citation-host :deep(a[href*="#cite=event"])::before { content: "\1F4C5"; }     /* 📅 */
.chat-citation-host :deep(a[href*="#cite=message"])::before { content: "\2709";     /* ✉ */ font-size: 0.85em; }
.chat-citation-host :deep(a[href*="#cite=journal"])::before { content: "\1F4D6"; }   /* 📖 */
.chat-citation-host :deep(a[href*="#cite=thread"])::before { content: "\1F9F5"; }    /* 🧵 */
</style>

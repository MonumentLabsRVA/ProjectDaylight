/**
 * Hover-card state machine for citation chips.
 *
 * Why hand-rolled instead of UPopover/HoverCard: the hover triggers are
 * <a> tags rendered inside UEditor's markdown output, not Vue components,
 * so we can't bind a Reka HoverCard trigger to them. We replicate the same
 * "two surfaces, single open state" behavior here.
 *
 * The trick is that the popover stays open while the cursor is on EITHER the
 * link or the popover itself. We track those two flags independently and the
 * popover only closes after a short delay during which BOTH are false.
 */

interface HoverTarget {
  kind: string
  id: string
  x: number   // viewport X of the link's center
  y: number   // viewport Y of the link's bottom (preview anchors here)
}

const OPEN_DELAY = 200
const CLOSE_DELAY = 200

export function useCitationHoverState() {
  // Page-level singletons. useState ensures the same state across the
  // hover preview component, the chip-host event handlers, and any chip
  // component we may later render inline.
  const target = useState<HoverTarget | null>('chat-citation-hover-target', () => null)
  const linkHovered = useState<boolean>('chat-citation-hover-link', () => false)
  const previewHovered = useState<boolean>('chat-citation-hover-preview', () => false)

  // Timers held in module scope so they survive HMR / re-renders. Using a
  // ref-of-array as a portable handle.
  const timers = useState<{
    openTimer: ReturnType<typeof setTimeout> | null
    closeTimer: ReturnType<typeof setTimeout> | null
    pendingTarget: HoverTarget | null
  }>('chat-citation-hover-timers', () => ({
    openTimer: null,
    closeTimer: null,
    pendingTarget: null
  }))

  function clearOpenTimer() {
    if (timers.value.openTimer) {
      clearTimeout(timers.value.openTimer)
      timers.value.openTimer = null
    }
    timers.value.pendingTarget = null
  }

  function clearCloseTimer() {
    if (timers.value.closeTimer) {
      clearTimeout(timers.value.closeTimer)
      timers.value.closeTimer = null
    }
  }

  function enterLink(kind: string, id: string, rect: DOMRect) {
    linkHovered.value = true
    clearCloseTimer()

    const next: HoverTarget = {
      kind,
      id,
      x: rect.left + rect.width / 2,
      y: rect.bottom
    }

    // If the same target is already open (e.g. user mouses out and back in),
    // just keep it.
    if (target.value && target.value.kind === kind && target.value.id === id) {
      return
    }

    // If a different chip was open, swap immediately — no flicker.
    if (target.value) {
      target.value = next
      return
    }

    // First-time open: schedule after a small delay so casual cursor sweeps
    // don't trigger a flood of popovers.
    clearOpenTimer()
    timers.value.pendingTarget = next
    timers.value.openTimer = setTimeout(() => {
      if (timers.value.pendingTarget) {
        target.value = timers.value.pendingTarget
        timers.value.pendingTarget = null
        timers.value.openTimer = null
      }
    }, OPEN_DELAY)
  }

  function leaveLink() {
    linkHovered.value = false
    clearOpenTimer()
    scheduleClose()
  }

  function enterPreview() {
    previewHovered.value = true
    clearCloseTimer()
  }

  function leavePreview() {
    previewHovered.value = false
    scheduleClose()
  }

  function scheduleClose() {
    clearCloseTimer()
    timers.value.closeTimer = setTimeout(() => {
      if (!linkHovered.value && !previewHovered.value) {
        target.value = null
      }
      timers.value.closeTimer = null
    }, CLOSE_DELAY)
  }

  function dismiss() {
    clearOpenTimer()
    clearCloseTimer()
    linkHovered.value = false
    previewHovered.value = false
    target.value = null
  }

  return {
    target,
    enterLink,
    leaveLink,
    enterPreview,
    leavePreview,
    dismiss
  }
}

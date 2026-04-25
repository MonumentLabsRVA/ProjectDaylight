interface AnalyticsContext {
  route?: string
  userAgent?: string
  userId?: string
  caseId?: string
  journalEntryId?: string
  evidenceId?: string
  exportId?: string
  [key: string]: unknown
}

interface LogEventOptions {
  context?: Record<string, unknown>
  skip?: boolean
}

export function useAnalytics() {
  const route = useRoute()
  const user = useSupabaseUser()

  function getDefaultContext(): AnalyticsContext {
    const ctx: AnalyticsContext = {}

    if (import.meta.client) {
      ctx.route = route.fullPath
      ctx.userAgent = window.navigator.userAgent
    }

    if (user.value?.id) {
      ctx.userId = user.value.id
    }

    return ctx
  }

  async function logEvent(
    eventType: string,
    payload: Record<string, unknown> = {},
    options: LogEventOptions = {}
  ): Promise<void> {
    if (options.skip) return
    if (import.meta.server) return

    const context: AnalyticsContext = {
      ...getDefaultContext(),
      ...(options.context ?? {})
    }

    $fetch('/api/analytics', {
      method: 'POST',
      body: {
        event_type: eventType,
        payload,
        context
      }
    }).catch((err) => {
      if (import.meta.dev) {
        console.warn('[analytics] failed to log event:', eventType, err)
      }
    })
  }

  function scopedLogger(baseContext: Record<string, unknown>) {
    return (eventType: string, payload: Record<string, unknown> = {}) => {
      logEvent(eventType, payload, { context: baseContext })
    }
  }

  return {
    logEvent,
    scopedLogger
  }
}

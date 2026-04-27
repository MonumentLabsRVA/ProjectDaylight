/**
 * Composable for tracking background job status with Realtime subscriptions.
 *
 * Features:
 * - Tracks active jobs with toast notifications on completion
 * - Uses Supabase Realtime for push updates
 * - Module-level state persists across navigation
 * - Timeout protection for stuck jobs (auto-cleanup after 10 minutes)
 * - Recovery mechanism to re-track jobs on app mount
 */

import type { Job, JobResultSummary, JobType } from '~/types'

// Per-job-type rendering for completion toasts. Add an entry here when wiring
// a new job type into the global tracker.
type CompletionToast = { title: string, description: string, href?: string }
const completionToastByType: Record<JobType, (job: Job) => CompletionToast> = {
  journal_extraction: (job) => {
    const s = job.result_summary as JobResultSummary | null
    return {
      title: 'Journal entry ready!',
      description: s?.events_created
        ? `${s.events_created} event${s.events_created !== 1 ? 's' : ''} extracted`
        : 'Processing complete',
      href: job.journal_entry_id ? `/journal/${job.journal_entry_id}` : undefined
    }
  },
  ofw_ingest: (job) => {
    const s = job.result_summary as { messages_inserted?: number, messages_parsed?: number } | null
    const inserted = s?.messages_inserted ?? 0
    return {
      title: 'OFW import complete',
      description: inserted
        ? `Imported ${inserted} message${inserted !== 1 ? 's' : ''}`
        : 'No new messages — already imported.',
      href: '/messages'
    }
  },
  evidence_processing: () => ({
    title: 'Evidence processed',
    description: 'Processing complete'
  })
}

type SupabaseRealtimeChannel = ReturnType<ReturnType<typeof useSupabaseClient>['channel']>

// Module-level state (persists across page navigation)
const activeJobs = ref<Map<string, Job>>(new Map())
const channels = ref<Map<string, SupabaseRealtimeChannel>>(new Map())
const timeouts = ref<Map<string, ReturnType<typeof setTimeout>>>(new Map())
const hasRecovered = ref(false)

// Timeout for stuck jobs (10 minutes)
const JOB_TIMEOUT_MS = 10 * 60 * 1000

export function useJobs() {
  const supabase = useSupabaseClient()
  const toast = useToast()

  /**
   * Start tracking a job for completion/failure notifications.
   * Subscribes to Realtime updates and shows toast when job finishes.
   * Includes timeout protection to auto-cleanup stuck jobs.
   */
  function trackJob(
    job: Pick<Job, 'id' | 'type'> & Partial<Pick<Job, 'journal_entry_id' | 'status'>>,
    options?: { silent?: boolean }
  ) {
    // Don't double-track
    if (activeJobs.value.has(job.id)) return

    // Store job in active tracking
    activeJobs.value.set(job.id, {
      journal_entry_id: null,
      ...job,
      user_id: '',
      status: job.status || 'pending',
      started_at: null,
      completed_at: null,
      error_message: null,
      result_summary: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as Job)

    // Subscribe to Realtime updates for this job
    const channel = supabase
      .channel(`job-${job.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${job.id}`
      }, (payload) => {
        const updated = payload.new as Job
        activeJobs.value.set(job.id, updated)
        handleJobUpdate(updated, options)
      })
      .subscribe()

    channels.value.set(job.id, channel)

    // Set timeout to auto-cleanup stuck jobs
    const timeout = setTimeout(() => {
      const currentJob = activeJobs.value.get(job.id)
      if (currentJob && (currentJob.status === 'pending' || currentJob.status === 'processing')) {
        console.warn(`[useJobs] Job ${job.id} timed out after ${JOB_TIMEOUT_MS / 1000}s`)
        // Don't show toast for timeout - the job might still complete
        // Just cleanup tracking to prevent memory leaks
        cleanup(job.id)
      }
    }, JOB_TIMEOUT_MS)

    timeouts.value.set(job.id, timeout)
  }

  /**
   * Handle job status updates - show toast on completion or failure
   */
  function handleJobUpdate(job: Job, options?: { silent?: boolean }) {
    if (job.status === 'completed') {
      if (!options?.silent) {
        const render = completionToastByType[job.type] ?? completionToastByType.journal_extraction
        const { title, description, href } = render(job)
        toast.add({
          title,
          description,
          icon: 'i-lucide-check-circle',
          color: 'success',
          actions: href
            ? [{
                label: 'View',
                onClick: (event) => {
                  event?.stopPropagation()
                  navigateTo(href)
                }
              }]
            : undefined
        })
      }
      cleanup(job.id)
    } else if (job.status === 'failed') {
      if (!options?.silent) {
        toast.add({
          title: 'Processing failed',
          description: job.error_message || 'Please try again',
          icon: 'i-lucide-alert-circle',
          color: 'error'
        })
      }
      cleanup(job.id)
    }
  }

  /**
   * Clean up a tracked job - remove from state, unsubscribe from Realtime, and clear timeout
   */
  function cleanup(jobId: string) {
    // Clear timeout
    const timeout = timeouts.value.get(jobId)
    if (timeout) {
      clearTimeout(timeout)
      timeouts.value.delete(jobId)
    }

    // Unsubscribe from Realtime
    const channel = channels.value.get(jobId)
    if (channel) {
      supabase.removeChannel(channel as any)
      channels.value.delete(jobId)
    }

    // Remove from active jobs
    activeJobs.value.delete(jobId)
  }

  /**
   * Clean up all tracked jobs (useful for logout)
   */
  function cleanupAll() {
    // Clear all timeouts
    for (const timeout of timeouts.value.values()) {
      clearTimeout(timeout)
    }
    timeouts.value.clear()

    // Unsubscribe from all channels
    for (const channel of channels.value.values()) {
      supabase.removeChannel(channel as any)
    }
    channels.value.clear()

    // Clear active jobs
    activeJobs.value.clear()

    // Reset recovery flag
    hasRecovered.value = false
  }

  /**
   * Recover and re-track any pending/processing jobs for the current user.
   * Called on app mount to ensure users get notifications for jobs started
   * before a page refresh.
   */
  async function recoverJobs(userId: string) {
    // Only recover once per session
    if (hasRecovered.value) return
    hasRecovered.value = true

    try {
      const { data: pendingJobs, error } = await supabase
        .from('jobs')
        .select('id, type, journal_entry_id, status')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('[useJobs] Failed to recover jobs:', error)
        return
      }

      // Re-track each pending job (silently - don't show "submitted" toast again)
      for (const job of pendingJobs || []) {
        trackJob({
          id: job.id,
          type: job.type as JobType,
          journal_entry_id: job.journal_entry_id,
          status: job.status as Job['status']
        }, { silent: false }) // Will still show completion toast
      }

      if (pendingJobs && pendingJobs.length > 0) {
        console.log(`[useJobs] Recovered ${pendingJobs.length} pending job(s)`)
      }
    } catch (err) {
      console.error('[useJobs] Error recovering jobs:', err)
    }
  }

  // Computed: check if there are any active (pending/processing) jobs
  const hasActiveJobs = computed(() =>
    Array.from(activeJobs.value.values()).some(j =>
      j.status === 'pending' || j.status === 'processing'
    )
  )

  // Computed: get count of active jobs
  const activeJobCount = computed(() =>
    Array.from(activeJobs.value.values()).filter(j =>
      j.status === 'pending' || j.status === 'processing'
    ).length
  )

  // Get a specific job's status
  function getJobStatus(jobId: string): Job['status'] | null {
    const job = activeJobs.value.get(jobId)
    return job?.status || null
  }

  // Reactive list of active jobs of a given type — for per-feature status banners.
  function activeJobsOfType(type: JobType) {
    return computed(() => Array.from(activeJobs.value.values()).filter(j => j.type === type))
  }

  return {
    // State
    activeJobs: computed(() => activeJobs.value),
    hasActiveJobs,
    activeJobCount,

    // Actions
    trackJob,
    cleanup,
    cleanupAll,
    getJobStatus,
    activeJobsOfType,
    recoverJobs
  }
}

/**
 * Composable for tracking background job status with Realtime subscriptions.
 * 
 * Features:
 * - Tracks active jobs with toast notifications on completion
 * - Uses Supabase Realtime for push updates
 * - Module-level state persists across navigation
 */

import type { Job, JobResultSummary } from '~/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Module-level state (persists across page navigation)
const activeJobs = ref<Map<string, Job>>(new Map())
const channels = ref<Map<string, RealtimeChannel>>(new Map())

export function useJobs() {
  const supabase = useSupabaseClient()
  const toast = useToast()

  /**
   * Start tracking a job for completion/failure notifications.
   * Subscribes to Realtime updates and shows toast when job finishes.
   */
  function trackJob(job: Pick<Job, 'id' | 'journal_entry_id'> & { status?: Job['status'] }) {
    // Don't double-track
    if (activeJobs.value.has(job.id)) return

    // Store job in active tracking
    activeJobs.value.set(job.id, {
      ...job,
      user_id: '',
      type: 'journal_extraction',
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
        handleJobUpdate(updated)
      })
      .subscribe()

    channels.value.set(job.id, channel)
  }

  /**
   * Handle job status updates - show toast on completion or failure
   */
  function handleJobUpdate(job: Job) {
    if (job.status === 'completed') {
      const summary = job.result_summary as JobResultSummary | null
      toast.add({
        title: 'Journal entry ready!',
        description: summary?.events_created
          ? `${summary.events_created} event${summary.events_created !== 1 ? 's' : ''} extracted`
          : 'Processing complete',
        icon: 'i-lucide-check-circle',
        color: 'success',
        actions: job.journal_entry_id ? [{
          label: 'View',
          click: () => navigateTo(`/journal/${job.journal_entry_id}`)
        }] : undefined
      })
      cleanup(job.id)
    } else if (job.status === 'failed') {
      toast.add({
        title: 'Processing failed',
        description: job.error_message || 'Please try again',
        icon: 'i-lucide-alert-circle',
        color: 'error'
      })
      cleanup(job.id)
    }
  }

  /**
   * Clean up a tracked job - remove from state and unsubscribe from Realtime
   */
  function cleanup(jobId: string) {
    const channel = channels.value.get(jobId)
    if (channel) {
      supabase.removeChannel(channel)
      channels.value.delete(jobId)
    }
    activeJobs.value.delete(jobId)
  }

  /**
   * Clean up all tracked jobs (useful for logout)
   */
  function cleanupAll() {
    for (const [jobId, channel] of channels.value.entries()) {
      supabase.removeChannel(channel)
      channels.value.delete(jobId)
      activeJobs.value.delete(jobId)
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

  return {
    // State
    activeJobs: computed(() => activeJobs.value),
    hasActiveJobs,
    activeJobCount,

    // Actions
    trackJob,
    cleanup,
    cleanupAll,
    getJobStatus
  }
}


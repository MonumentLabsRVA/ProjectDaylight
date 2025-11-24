import { sub } from 'date-fns'
import { serverSupabaseUser } from '#supabase/server'
import type { ExportJob, ExportPreset } from '~/types'

const presets: ExportPreset[] = [{
  id: 'last-30-days',
  label: 'Last 30 days timeline',
  description: 'Chronological timeline of all events from the last 30 days.',
  range: 'Last 30 days'
}, {
  id: 'incidents-summary',
  label: 'Incident summary',
  description: 'Focused report of incident-type events with linked evidence.',
  range: 'Last 90 days'
}, {
  id: 'positive-parenting',
  label: 'Positive parenting narrative',
  description: 'Highlights of your positive involvement, routines, and stability.',
  range: 'Last 60 days'
}]

const recentJobs: ExportJob[] = [{
  id: 'exp_001',
  presetId: 'last-30-days',
  label: 'Last 30 days for attorney consult',
  status: 'completed',
  createdAt: sub(new Date(), { days: 1, hours: 2 }).toISOString(),
  readyAt: sub(new Date(), { days: 1, hours: 1, minutes: 45 }).toISOString(),
  downloadUrl: '#'
}, {
  id: 'exp_002',
  presetId: 'incidents-summary',
  label: 'Incident packet for temporary hearing',
  status: 'completed',
  createdAt: sub(new Date(), { days: 3 }).toISOString(),
  readyAt: sub(new Date(), { days: 3, minutes: 10 }).toISOString(),
  downloadUrl: '#'
}, {
  id: 'exp_003',
  presetId: 'positive-parenting',
  label: 'Positive parenting examples for GAL',
  status: 'pending',
  createdAt: sub(new Date(), { hours: 1 }).toISOString()
}]

export default eventHandler(async (event) => {
  // Protect exports behind authenticated sessions (cookie/JWT based)
  const user = await serverSupabaseUser(event)
  const userId = user?.sub || user?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  return {
    presets,
    recentJobs
  }
})



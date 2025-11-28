import type { TimelineEvent } from '~/types'
import type { Tables } from '~/types/database.types'
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { 
  isValidTimezone, 
  getStartOfDayInTimezone, 
  getDaysAgoInTimezone,
  getTimezoneFromRequest 
} from '../utils/timezone'

type EventRow = Tables<'events'>

interface HomeSummary {
  todayEvents: number
  incidentsThisWeek: number
  positiveThisWeek: number
  totalEvents: number
  totalEvidence: number
  totalCommunications: number
  nextCourtDate?: string
  lastCaptureAt?: string
}

interface HomeResponse {
  summary: HomeSummary
  recentEvents: TimelineEvent[]
}

function mapEventToTimelineEvent(row: EventRow): TimelineEvent {
  return {
    id: row.id,
    timestamp: (row.primary_timestamp as string | null) ?? (row.created_at as string),
    type: row.type as TimelineEvent['type'],
    title: row.title,
    description: row.description,
    participants: ['You'],
    location: row.location ?? undefined,
    evidenceIds: undefined
  }
}

export default eventHandler(async (event): Promise<HomeResponse> => {
  // Get the authenticated user from cookies
  const user = await serverSupabaseUser(event)
  
  // The user ID is in the 'sub' field (subject) of the JWT token
  const userId = user?.sub || user?.id
  
  if (!userId) {
    throw createError({ 
      statusCode: 401, 
      statusMessage: 'Unauthorized - Please log in' 
    })
  }

  // Get the Supabase client with the user's session
  const supabase = await serverSupabaseClient(event)
  
  // Get user's timezone from request header or query param
  let userTimezone = getTimezoneFromRequest(event)
  
  // If no timezone from request, try to get from profiles table
  if (userTimezone === 'UTC') {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single()
    
    if (profileData?.timezone && isValidTimezone(profileData.timezone)) {
      userTimezone = profileData.timezone
    }
  }

  try {

    const [
      { data: eventsRows, error: eventsError },
      { data: evidenceRows, error: evidenceError },
      { data: communicationsRows, error: communicationsError }
    ] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, type, title, description, primary_timestamp, location, created_at'
        )
        .eq('user_id', userId)
        .order('primary_timestamp', { ascending: false, nullsFirst: false }),
      supabase
        .from('evidence')
        .select('id')
        .eq('user_id', userId),
      supabase
        .from('communications')
        .select('id')
        .eq('user_id', userId)
    ])

    if (eventsError) {
      // eslint-disable-next-line no-console
      console.error('Supabase select events error (home):', eventsError)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to load home data.'
      })
    }

    if (evidenceError) {
      // eslint-disable-next-line no-console
      console.error('Supabase select evidence error (home):', evidenceError)
    }

    if (communicationsError) {
      // eslint-disable-next-line no-console
      console.error('Supabase select communications error (home):', communicationsError)
    }

    const events = (eventsRows ?? []) as EventRow[]
    const now = new Date()
    
    // Calculate start of today and week ago in the user's timezone
    const startOfToday = getStartOfDayInTimezone(now, userTimezone)
    const weekAgo = getDaysAgoInTimezone(7, userTimezone)

    let todayEvents = 0
    let incidentsThisWeek = 0
    let positiveThisWeek = 0
    let lastCaptureAt: string | undefined
    let nextCourtDate: string | undefined

    for (const row of events) {
      // Use primary_timestamp for the event's actual occurrence time
      const eventTimestampStr = (row.primary_timestamp as string | null) ?? (row.created_at as string)
      const eventTimestamp = new Date(eventTimestampStr)
      
      // Use created_at for when the event was captured
      const capturedAtStr = row.created_at as string
      const capturedAt = new Date(capturedAtStr)

      if (!Number.isNaN(eventTimestamp.getTime())) {
        // Track the most recent capture time
        if (!lastCaptureAt || capturedAt > new Date(lastCaptureAt)) {
          lastCaptureAt = capturedAt.toISOString()
        }

        // Count events CAPTURED today (use created_at, not primary_timestamp)
        // Compare in user's timezone
        if (capturedAt >= startOfToday) {
          todayEvents++
        }

        // For weekly stats, use the event's actual timestamp
        if (eventTimestamp >= weekAgo) {
          if (row.type === 'incident') {
            incidentsThisWeek++
          } else if (row.type === 'positive') {
            positiveThisWeek++
          }
        }

        // For court dates, use the event's actual timestamp
        if (row.type === 'legal' && eventTimestamp >= now) {
          if (!nextCourtDate || eventTimestamp < new Date(nextCourtDate)) {
            nextCourtDate = eventTimestamp.toISOString()
          }
        }
      }
    }

    const summary: HomeSummary = {
      todayEvents,
      incidentsThisWeek,
      positiveThisWeek,
      totalEvents: events.length,
      totalEvidence: (evidenceRows ?? []).length,
      totalCommunications: (communicationsRows ?? []).length,
      nextCourtDate,
      lastCaptureAt
    }

    const recentEvents = events.slice(0, 5).map(mapEventToTimelineEvent)

    return {
      summary,
      recentEvents
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[home] error', err)
    if (err?.statusCode) {
      throw err
    }
    throw createError({ statusCode: 500, statusMessage: err?.message || 'Failed to load home data' })
  }
})



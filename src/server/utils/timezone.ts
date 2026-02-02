/**
 * Server-side timezone utilities for date calculations
 */

/**
 * Validate that a string is a valid IANA timezone
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Get the date string (YYYY-MM-DD) in a specific timezone
 */
export function getDateStringInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/**
 * Get the start of day in a specific timezone as a Date object.
 * This returns the moment when the day starts in the given timezone.
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  // Get the date string in the target timezone
  const dateStr = getDateStringInTimezone(date, timezone) // YYYY-MM-DD
  
  // Create a Date representing midnight in that timezone
  // We need to find what UTC time corresponds to midnight in the target timezone
  const midnight = new Date(`${dateStr}T00:00:00`)
  
  // Get the offset by comparing representations
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  // Parse the formatted date to find the actual time
  const parts = formatter.formatToParts(midnight)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0'
  
  const tzYear = parseInt(getPart('year'))
  const tzMonth = parseInt(getPart('month')) - 1
  const tzDay = parseInt(getPart('day'))
  const tzHour = parseInt(getPart('hour'))
  const tzMinute = parseInt(getPart('minute'))
  
  // If the formatted time is not midnight, we need to adjust
  // Calculate how far off we are from midnight
  const hoursOff = tzHour + tzMinute / 60
  
  // Adjust the date to get actual midnight in the timezone
  return new Date(midnight.getTime() - hoursOff * 60 * 60 * 1000)
}

/**
 * Get the end of day in a specific timezone as a Date object.
 * Returns 23:59:59.999 in that timezone.
 */
export function getEndOfDayInTimezone(date: Date, timezone: string): Date {
  const startOfDay = getStartOfDayInTimezone(date, timezone)
  // Add 24 hours minus 1 millisecond
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1)
}

/**
 * Get start of week (Sunday) in a specific timezone
 */
export function getStartOfWeekInTimezone(date: Date, timezone: string): Date {
  const dateStr = getDateStringInTimezone(date, timezone)
  const [year, month, day] = dateStr.split('-').map(Number)
  
  // Create a date object for that day in UTC, then find the day of week
  const tempDate = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = tempDate.getUTCDay() // 0 = Sunday
  
  // Go back to Sunday
  const sundayDate = new Date(tempDate)
  sundayDate.setUTCDate(sundayDate.getUTCDate() - dayOfWeek)
  
  // Now get start of that Sunday in the target timezone
  return getStartOfDayInTimezone(sundayDate, timezone)
}

/**
 * Get start of month in a specific timezone
 */
export function getStartOfMonthInTimezone(date: Date, timezone: string): Date {
  const dateStr = getDateStringInTimezone(date, timezone)
  const [year, month] = dateStr.split('-').map(Number)
  
  // First day of month
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  return getStartOfDayInTimezone(firstOfMonth, timezone)
}

/**
 * Get a date N days ago in a specific timezone
 */
export function getDaysAgoInTimezone(days: number, timezone: string): Date {
  const now = new Date()
  const todayStr = getDateStringInTimezone(now, timezone)
  const [year, month, day] = todayStr.split('-').map(Number)
  
  const targetDate = new Date(Date.UTC(year, month - 1, day - days))
  return getStartOfDayInTimezone(targetDate, timezone)
}

/**
 * Check if a timestamp is "today" in the given timezone
 */
export function isToday(timestamp: Date | string, timezone: string): boolean {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const now = new Date()
  
  const dateStr = getDateStringInTimezone(date, timezone)
  const todayStr = getDateStringInTimezone(now, timezone)
  
  return dateStr === todayStr
}

/**
 * Check if a timestamp is within the last N days in the given timezone
 */
export function isWithinDays(timestamp: Date | string, days: number, timezone: string): boolean {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const startOfRange = getDaysAgoInTimezone(days, timezone)
  
  return date >= startOfRange
}

/**
 * Extract timezone from request headers or use default
 * Checks for common timezone headers that might be set by CDNs or proxies
 */
export function getTimezoneFromRequest(event: any): string {
  const headers = getHeaders(event)
  
  // Check for timezone header (can be set by client or proxy)
  const tzHeader = headers['x-timezone'] || headers['x-user-timezone']
  if (tzHeader && isValidTimezone(tzHeader)) {
    return tzHeader
  }
  
  // Check query params
  const query = getQuery(event)
  if (query.timezone && typeof query.timezone === 'string' && isValidTimezone(query.timezone)) {
    return query.timezone
  }
  
  // Default to UTC
  return 'UTC'
}

/**
 * Try to infer timezone from CloudFlare headers (if available)
 * CloudFlare provides CF-IPCountry which we could use as a hint,
 * but accurate timezone requires client-side detection.
 */
export function inferTimezoneFromHeaders(event: any): string | null {
  const headers = getHeaders(event)
  
  // CloudFlare timezone header (if configured)
  const cfTimezone = headers['cf-timezone']
  if (cfTimezone && isValidTimezone(cfTimezone as string)) {
    return cfTimezone as string
  }
  
  // Vercel/Netlify don't provide timezone directly
  // Would need geolocation API or client-side detection
  
  return null
}

/**
 * Get timezone with profile fallback.
 * 
 * This is the preferred method for API endpoints that have access to supabase
 * and a user ID. It will:
 * 1. Check request headers for X-Timezone
 * 2. Check query params for timezone
 * 3. Fall back to the user's profile timezone
 * 4. Default to UTC if nothing is found
 * 
 * @param event - The H3 event object
 * @param supabase - Supabase client instance
 * @param userId - The authenticated user's ID
 */
export async function getTimezoneWithProfileFallback(
  event: any,
  supabase: any,
  userId: string
): Promise<string> {
  // First try request headers/query params
  const requestTimezone = getTimezoneFromRequest(event)
  
  // If we got a specific timezone from the request, use it
  if (requestTimezone !== 'UTC') {
    return requestTimezone
  }
  
  // Fall back to profile timezone
  try {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single()
    
    if (profileData?.timezone && isValidTimezone(profileData.timezone)) {
      return profileData.timezone
    }
  } catch {
    // Profile lookup failed, fall through to UTC
  }
  
  return 'UTC'
}
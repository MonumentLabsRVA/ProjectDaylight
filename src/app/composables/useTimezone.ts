/**
 * Composable for managing user timezone throughout the application.
 * 
 * Features:
 * - Auto-detects browser timezone on first visit
 * - Syncs timezone to profiles table (not raw_user_meta_data)
 * - Provides timezone-aware date utilities
 * - Persists timezone preference
 */

// Common timezone options for the settings UI
export const TIMEZONE_OPTIONS = [
  { label: 'Eastern Time (New York)', value: 'America/New_York' },
  { label: 'Central Time (Chicago)', value: 'America/Chicago' },
  { label: 'Mountain Time (Denver)', value: 'America/Denver' },
  { label: 'Pacific Time (Los Angeles)', value: 'America/Los_Angeles' },
  { label: 'Alaska Time', value: 'America/Anchorage' },
  { label: 'Hawaii Time', value: 'Pacific/Honolulu' },
  { label: 'Arizona (No DST)', value: 'America/Phoenix' },
  { label: 'UTC', value: 'UTC' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
  { label: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' }
] as const

// Get all IANA timezones for a comprehensive list
export function getAllTimezones(): { label: string; value: string }[] {
  try {
    // Use Intl API to get supported timezones
    const timezones = Intl.supportedValuesOf('timeZone')
    return timezones.map(tz => ({
      label: tz.replace(/_/g, ' ').replace(/\//g, ' / '),
      value: tz
    }))
  } catch {
    // Fallback to common timezones
    return [...TIMEZONE_OPTIONS]
  }
}

// Detect browser timezone
export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

// Validate timezone string
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Get the start of day in a specific timezone
 * Returns an ISO string representing midnight in that timezone
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const dateStr = formatter.format(date) // YYYY-MM-DD format
  // Create a date at midnight in that timezone by parsing as local
  const [year, month, day] = dateStr.split('-').map(Number)
  
  // Get the offset for that timezone at midnight
  const tempDate = new Date(`${dateStr}T00:00:00`)
  const utcDate = new Date(tempDate.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(tempDate.toLocaleString('en-US', { timeZone: timezone }))
  const offset = (utcDate.getTime() - tzDate.getTime())
  
  return new Date(tempDate.getTime() + offset).toISOString()
}

/**
 * Get the end of day in a specific timezone
 * Returns an ISO string representing 23:59:59.999 in that timezone
 */
export function getEndOfDayInTimezone(date: Date, timezone: string): string {
  const startOfDay = new Date(getStartOfDayInTimezone(date, timezone))
  // Add 24 hours minus 1 millisecond
  return new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
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
 * Format a date for display in the user's timezone
 */
export function formatDateInTimezone(
  date: Date | string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    timeZone: timezone,
    ...options
  })
}

export function useTimezone() {
  const user = useSupabaseUser()
  const { profile, isFetched, updateProfile, isLoading: profileLoading } = useProfile()
  
  // Reactive timezone state - initialized from profile or browser detection
  const userTimezone = useState<string>('user-timezone', () => detectBrowserTimezone())
  const isLoading = ref(false)
  const isSynced = ref(false)

  // Save timezone to profiles table
  async function saveTimezone(timezone: string): Promise<boolean> {
    if (!user.value?.id) return false
    if (!isValidTimezone(timezone)) {
      console.error('[useTimezone] Invalid timezone:', timezone)
      return false
    }

    isLoading.value = true
    try {
      await updateProfile({ timezone })
      userTimezone.value = timezone
      isSynced.value = true
      return true
    } catch (err) {
      console.error('[useTimezone] Error saving timezone:', err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Sync timezone from profile when it's fetched
  watch([profile, isFetched], async ([profileData, fetched]) => {
    if (!user.value?.id) {
      // Reset to browser timezone when logged out
      userTimezone.value = detectBrowserTimezone()
      isSynced.value = false
      return
    }

    if (fetched && profileData) {
      const savedTimezone = profileData.timezone
      if (savedTimezone && isValidTimezone(savedTimezone)) {
        userTimezone.value = savedTimezone
        isSynced.value = true
      } else if (!savedTimezone) {
        // No timezone saved, auto-detect and save
        await saveTimezone(detectBrowserTimezone())
      }
    }
  }, { immediate: true })

  // Helper: Get "today" boundaries in user's timezone
  function getTodayBounds() {
    const now = new Date()
    return {
      start: getStartOfDayInTimezone(now, userTimezone.value),
      end: getEndOfDayInTimezone(now, userTimezone.value)
    }
  }

  // Helper: Get date string for today in user's timezone
  function getTodayDateString(): string {
    return getDateStringInTimezone(new Date(), userTimezone.value)
  }

  // Helper: Format a date for display
  function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
    return formatDateInTimezone(date, userTimezone.value, options)
  }

  // Helper: Check if a timestamp is "today" in user's timezone
  function isToday(timestamp: string | Date): boolean {
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
    const todayStr = getTodayDateString()
    const dateStr = getDateStringInTimezone(d, userTimezone.value)
    return dateStr === todayStr
  }

  return {
    // State
    timezone: userTimezone,
    isLoading: readonly(isLoading),
    isSynced: readonly(isSynced),
    
    // Actions
    saveTimezone,
    
    // Utilities
    getTodayBounds,
    getTodayDateString,
    formatDate,
    isToday,
    
    // Static utilities (for non-reactive usage)
    detectBrowserTimezone,
    isValidTimezone,
    getStartOfDayInTimezone,
    getEndOfDayInTimezone,
    getDateStringInTimezone,
    formatDateInTimezone
  }
}


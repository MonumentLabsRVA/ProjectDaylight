import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/**
 * Hard-deletes a test user and all of their data.
 *
 * Caller is responsible for confirming the target is actually a test user
 * (profiles.is_test_user = true). This util does not re-check.
 *
 * Most user-scoped tables in Daylight cascade from auth.users via ON DELETE CASCADE
 * (profiles, cases, events, evidence, journal_entries, messages, chats, etc.).
 * The `jobs` table is the only known exception — its user_id FK has no cascade,
 * so we delete it manually first.
 */
export async function deleteTestUserCascade(
  serviceClient: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  // 1. Manual cleanup for tables without ON DELETE CASCADE on user_id.
  const { error: jobsError } = await serviceClient
    .from('jobs')
    .delete()
    .eq('user_id', userId)

  if (jobsError) {
    console.error('[test-user-deletion] jobs cleanup failed:', jobsError)
    throw new Error(`Failed to delete jobs for user ${userId}: ${jobsError.message}`)
  }

  // 2. Delete the auth user. profiles cascades from auth.users(id);
  //    everything else cascades from profiles or auth.users.
  const { error: authError } = await serviceClient.auth.admin.deleteUser(userId)

  if (authError) {
    console.error('[test-user-deletion] auth.admin.deleteUser failed:', authError)
    throw new Error(`Failed to delete auth user ${userId}: ${authError.message}`)
  }
}

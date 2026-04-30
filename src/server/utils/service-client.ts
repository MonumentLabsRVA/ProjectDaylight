import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

export function getServiceClient(): SupabaseClient<Database> {
  const config = useRuntimeConfig()
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = config.supabaseServiceKey
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY (supabaseServiceKey)')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey)
}
